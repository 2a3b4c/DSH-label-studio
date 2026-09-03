import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioInspectPageCommit,
  LabelStudioInspectPageEvent,
  LabelStudioPageContext,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioCurrentPageBroker } from '../src/current-page-broker.ts'

const sessionId = 'session-a' as SessionId
const identity = { sessionId, createdAt: 100 }
const lease = {
  leaseId: '10000000-0000-4000-8000-000000000001',
  generation: 2,
  expiresAt: 10_000,
}

function harness(clock: () => number = () => 1_000) {
  let ended: ((sessionId: SessionId) => void) | undefined
  const registry = {
    getLease: vi.fn(() => ({ sessionId, sourceId: 'source', lease, context: { phase: 'vacant', targetRevision: 0 } })),
    inspectLease: vi.fn(() => ({ sessionId, sourceId: 'source', lease, context: { phase: 'vacant', targetRevision: 0 } })),
    onLeaseEnded: vi.fn((listener: (value: SessionId) => void) => { ended = listener; return vi.fn() }),
  }
  const changes = {
    publishCurrentPageInspection: vi.fn((_sessionId, inspectionId, deadlineAt) => ({
      kind: 'inspect-current-page', inspectionId, deadlineAt, eventRevision: 1,
    })),
  }
  const broker = new LabelStudioCurrentPageBroker(registry as never, changes as never, clock)
  return { broker, changes, registry, endLease: () => { ended?.(sessionId) } }
}

function publishedEvent(changes: { publishCurrentPageInspection: ReturnType<typeof vi.fn> }): LabelStudioInspectPageEvent {
  const event = changes.publishCurrentPageInspection.mock.results[0]?.value
  if (event === undefined) throw new Error('inspection event was not published')
  return event as LabelStudioInspectPageEvent
}

function commitOf(event: LabelStudioInspectPageEvent, page: LabelStudioPageContext): LabelStudioInspectPageCommit {
  return {
    leaseId: lease.leaseId as never,
    generation: lease.generation,
    inspectionId: event.inspectionId,
    outcome: { kind: 'page', page },
  }
}

describe('LabelStudioCurrentPageBroker', () => {
  it('publishes one opaque inspection and resolves only its exact lease response', async () => {
    const value = harness()
    const pending = value.broker.request(identity, 500, new AbortController().signal)
    const event = publishedEvent(value.changes)
    expect(String(event.inspectionId)).toMatch(/^[0-9a-f-]{36}$/)
    expect(event.deadlineAt).toBe(1_500)
    value.broker.commit(commitOf(event, { view: 'task', projectId: 7, taskId: 11 } as never), identity)
    await expect(pending).resolves.toEqual({ view: 'task', projectId: 7, taskId: 11 })
  })

  it('rejects a second request, stale lease response, and unsupported route deterministically', async () => {
    const value = harness()
    const first = value.broker.request(identity, 500, new AbortController().signal)
    await expect(value.broker.request(identity, 500, new AbortController().signal))
      .rejects.toMatchObject({ code: 'current-page-unavailable' })
    const event = publishedEvent(value.changes)
    expect(() => value.broker.commit({
      ...commitOf(event, { view: 'projects' }), generation: lease.generation + 1,
    }, identity)).toThrow()
    value.broker.commit({
      leaseId: lease.leaseId as never,
      generation: lease.generation,
      inspectionId: event.inspectionId,
      outcome: { kind: 'unsupported' },
    }, identity)
    await expect(first).rejects.toMatchObject({ code: 'current-page-unsupported' })
  })

  it('accepts an exact duplicate commit as an idempotent recovery', async () => {
    const value = harness()
    const pending = value.broker.request(identity, 500, new AbortController().signal)
    const event = publishedEvent(value.changes)
    const commit = commitOf(event, { view: 'project', projectId: 7 } as never)
    expect(value.broker.commit(commit, identity)).toEqual({ accepted: true })
    await expect(pending).resolves.toEqual({ view: 'project', projectId: 7 })
    expect(value.broker.commit(commit, identity)).toEqual({ accepted: true })
  })

  it('rejects a receipt from a replaced persistent Session lifecycle', async () => {
    const value = harness()
    const pending = value.broker.request(identity, 500, new AbortController().signal)
    const event = publishedEvent(value.changes)
    const commit = commitOf(event, { view: 'projects' })
    expect(() => value.broker.commit(commit, { ...identity, createdAt: identity.createdAt + 1 }))
      .toThrow('pending request')
    value.broker.commit(commit, identity)
    await expect(pending).resolves.toEqual({ view: 'projects' })
  })

  it('cancels pending work on caller abort, lease end, Session cancellation, and dispose', async () => {
    const aborted = harness()
    const controller = new AbortController()
    const byCaller = aborted.broker.request(identity, 500, controller.signal)
    const reason = new Error('caller stopped')
    controller.abort(reason)
    await expect(byCaller).rejects.toBe(reason)

    const expired = harness()
    const byLease = expired.broker.request(identity, 500, new AbortController().signal)
    expired.endLease()
    await expect(byLease).rejects.toMatchObject({ code: 'current-page-unavailable' })

    const cancelled = harness()
    const bySession = cancelled.broker.request(identity, 500, new AbortController().signal)
    cancelled.broker.cancelSession(sessionId)
    await expect(bySession).rejects.toMatchObject({ code: 'current-page-unavailable' })

    const disposed = harness()
    const byDispose = disposed.broker.request(identity, 500, new AbortController().signal)
    disposed.broker.dispose()
    await expect(byDispose).rejects.toMatchObject({ code: 'current-page-unavailable' })
    await expect(disposed.broker.request(identity, 500, new AbortController().signal))
      .rejects.toMatchObject({ code: 'current-page-unavailable' })
  })

  it('uses a bounded timer for deadline expiry', async () => {
    vi.useFakeTimers()
    try {
      const value = harness(() => Date.now())
      const pending = value.broker.request(identity, 20, new AbortController().signal)
      const rejected = expect(pending).rejects.toMatchObject({ code: 'current-page-timeout' })
      await vi.advanceTimersByTimeAsync(20)
      await rejected
    } finally {
      vi.useRealTimers()
    }
  })
})
