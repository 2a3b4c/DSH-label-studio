import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Session, SessionId as createSessionId } from '@deepseek-ai/dsh-session'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  LabelStudioPageCommit,
  LabelStudioPageContext,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { describe, expect, it, vi } from 'vitest'
import type {
  LabelStudioSessionContextRecord,
  LabelStudioSessionIdentity,
} from '../src/session-context-spec.ts'
import { labelStudioSessionContextDomainSpec } from '../src/session-context-spec.ts'
import {
  LabelStudioSessionContextError,
  LabelStudioSessionContextStore,
} from '../src/session-context-store.ts'
import {
  labelStudioAnnotationId,
  labelStudioContextLeaseId,
  labelStudioNavigationSequence,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'

const sessionId = 'session-a' as SessionId
const identity: LabelStudioSessionIdentity = { sessionId, createdAt: 100 }

interface Harness {
  readonly records: Map<SessionId, LabelStudioSessionContextRecord>
  readonly table: KvTable<SessionId, LabelStudioSessionContextRecord>
  readonly close: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly store: LabelStudioSessionContextStore
}

async function harness(options: {
  recentProjectLimit?: number
  now?: number
  records?: Map<SessionId, LabelStudioSessionContextRecord>
} = {}): Promise<Harness> {
  const records = options.records ?? new Map<SessionId, LabelStudioSessionContextRecord>()
  const table: KvTable<SessionId, LabelStudioSessionContextRecord> = {
    get: key => records.get(key),
    entries: () => new Map(records).entries(),
    keys: () => new Map(records).keys(),
    get size() { return records.size },
    put: vi.fn(async (key, value) => { records.set(key, value) }),
    delete: vi.fn(async key => records.delete(key)),
    update: vi.fn(async (key, transform) => {
      const current = records.get(key)
      if (current === undefined) throw new Error('missing key')
      const next = transform(current)
      records.set(key, next)
      return next
    }),
  }
  const close = vi.fn(async () => {})
  const domain = { name: 'label_studio_context', table: () => table, close } as unknown as Domain<typeof labelStudioSessionContextDomainSpec>
  const open = vi.fn(async () => domain)
  const store = await LabelStudioSessionContextStore.open(
    { storageDomain: { open } } as unknown as Pick<Context, 'storageDomain'>,
    { recentProjectLimit: options.recentProjectLimit ?? 2, clock: () => options.now ?? 1000 },
  )
  return { records, table, close, open, store }
}

function commit(
  page: LabelStudioPageContext,
  expectedSessionContextRevision: number,
  sequence: number,
): LabelStudioPageCommit {
  return {
    leaseId: labelStudioContextLeaseId('123e4567-e89b-42d3-a456-426614174000'),
    generation: 1,
    navigationSequence: labelStudioNavigationSequence(sequence),
    expectedSessionContextRevision,
    page,
  }
}

function plain(snapshot: LabelStudioSessionContextSnapshot): unknown {
  return JSON.parse(JSON.stringify(snapshot))
}

describe('LabelStudioSessionContextStore', () => {
  it('opens the declared domain and closes its owned handle', async () => {
    const value = await harness()
    expect(value.open).toHaveBeenCalledWith(labelStudioSessionContextDomainSpec)
    await value.store.close()
    await value.store.close()
    expect(value.close).toHaveBeenCalledTimes(1)
  })

  it('reads the empty context without writing for missing or recycled Sessions', async () => {
    const value = await harness()
    expect(plain(value.store.read(identity))).toEqual({ page: { view: 'projects' }, recentProjects: [], revision: 0 })
    value.records.set(sessionId, {
      sessionCreatedAt: 99,
      page: { view: 'project', projectId: labelStudioProjectId(7) },
      recentProjects: [],
      revision: 4,
    })
    expect(plain(value.store.read(identity))).toEqual({ page: { view: 'projects' }, recentProjects: [], revision: 0 })
    expect(value.table.put).not.toHaveBeenCalled()
  })

  it('orders recent projects, records tasks, and enforces the configured limit', async () => {
    const value = await harness({ recentProjectLimit: 2, now: 1000 })
    await value.store.commit(identity, commit({ view: 'project', projectId: labelStudioProjectId(7) }, 0, 1))
    await value.store.commit(identity, commit({ view: 'task', projectId: labelStudioProjectId(8), taskId: labelStudioTaskId(80) }, 1, 2))
    await value.store.commit(identity, commit({ view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(70) }, 2, 3))
    expect(plain(value.store.read(identity))).toEqual({
      page: { view: 'task', projectId: 7, taskId: 70 },
      recentProjects: [
        { projectId: 7, lastTaskId: 70, lastVisitedAt: 1000, availability: 'available' },
        { projectId: 8, lastTaskId: 80, lastVisitedAt: 1000, availability: 'available' },
      ],
      revision: 3,
    })
  })

  it('does not write or grow the revision when restoring the same page', async () => {
    const value = await harness()
    const page = { view: 'project', projectId: labelStudioProjectId(7) } as const
    await value.store.commit(identity, commit(page, 0, 1))
    const writes = vi.mocked(value.table.put).mock.calls.length
    expect(plain(await value.store.commit(identity, commit(page, 1, 2)))).toMatchObject({ revision: 1 })
    expect(value.table.put).toHaveBeenCalledTimes(writes)
  })

  it('rejects stale revisions and serializes commits for one Session', async () => {
    const value = await harness()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    vi.mocked(value.table.put).mockImplementationOnce(async (key, record) => {
      await blocked
      value.records.set(key, record)
    })
    const first = value.store.commit(identity, commit({ view: 'project', projectId: labelStudioProjectId(7) }, 0, 1))
    const second = value.store.commit(identity, commit({ view: 'project', projectId: labelStudioProjectId(8) }, 0, 2))
    release()
    await expect(first).resolves.toMatchObject({ revision: 1 })
    await expect(second).rejects.toMatchObject({
      code: 'session-context-conflict' satisfies LabelStudioSessionContextError['code'],
    })
    expect(value.store.read(identity).page).toEqual({ view: 'project', projectId: 7 })
  })

  it('returns an exact lost-response retry and rejects changed retry fields', async () => {
    const value = await harness()
    const request = commit({ view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11) }, 0, 1)
    const first = await value.store.commit(identity, request)
    const writes = vi.mocked(value.table.put).mock.calls.length
    expect(plain(await value.store.commit(identity, request))).toEqual(plain(first))
    expect(value.table.put).toHaveBeenCalledTimes(writes)
    await expect(value.store.commit(identity, { ...request, generation: 2 })).rejects.toThrow(/revision conflict/)
    await expect(value.store.commit(identity, { ...request, page: { view: 'project', projectId: labelStudioProjectId(7) } })).rejects.toThrow(/revision conflict/)
  })

  it('marks a project deleted, falls back to projects, and never selects another history item', async () => {
    const value = await harness()
    await value.store.commit(identity, commit({ view: 'project', projectId: labelStudioProjectId(8) }, 0, 1))
    await value.store.commit(identity, commit({
      view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11), annotationId: labelStudioAnnotationId(13),
    }, 1, 2))
    expect(plain(await value.store.markProjectDeleted(identity, labelStudioProjectId(7)))).toEqual({
      page: { view: 'projects' },
      recentProjects: [
        { projectId: 7, lastTaskId: 11, lastVisitedAt: 1000, availability: 'deleted' },
        { projectId: 8, lastVisitedAt: 1000, availability: 'available' },
      ],
      revision: 3,
    })
  })

  it('restores independent text and image Session pages after store close and reopen', async () => {
    const records = new Map<SessionId, LabelStudioSessionContextRecord>()
    const sessionB = 'session-b' as SessionId
    const identityB: LabelStudioSessionIdentity = { sessionId: sessionB, createdAt: 200 }
    const first = await harness({ records, recentProjectLimit: 10 })
    await first.store.commit(identity, commit({
      view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11),
    }, 0, 1))
    await first.store.commit(identityB, commit({
      view: 'task', projectId: labelStudioProjectId(8), taskId: labelStudioTaskId(80),
    }, 0, 1))
    await first.store.close()

    const reopened = await harness({ records, recentProjectLimit: 10 })
    expect(plain(reopened.store.read(identity))).toMatchObject({
      page: { view: 'task', projectId: 7, taskId: 11 }, revision: 1,
    })
    expect(plain(reopened.store.read(identityB))).toMatchObject({
      page: { view: 'task', projectId: 8, taskId: 80 }, revision: 1,
    })
  })

  it('keeps Session event types and derived messages unchanged across page navigation and unload', async () => {
    const session = Session.create(createSessionId('prompt-isolation'))
    session.append('turn/start', { turn: 1 })
    const eventTypes = session.events.map(event => event.type)
    const messages = session.deriveMessages()
    const value = await harness()

    await value.store.commit(identity, commit({
      view: 'task', projectId: labelStudioProjectId(7), taskId: labelStudioTaskId(11),
    }, 0, 1))
    await value.store.close()

    expect(session.events.map(event => event.type)).toEqual(eventTypes)
    expect(session.deriveMessages()).toEqual(messages)
  })

  it('deletes only the named Session record', async () => {
    const value = await harness()
    await value.store.commit(identity, commit({ view: 'project', projectId: labelStudioProjectId(7) }, 0, 1))
    expect(await value.store.delete(sessionId)).toBe(true)
    expect(await value.store.delete(sessionId)).toBe(false)
    expect(plain(value.store.read(identity))).toEqual({ page: { view: 'projects' }, recentProjects: [], revision: 0 })
  })
})
