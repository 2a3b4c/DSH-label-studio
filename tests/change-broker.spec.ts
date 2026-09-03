import type {
  LabelStudioActiveContext,
  LabelStudioPageCommit,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { describe, expect, it, vi } from 'vitest'
import { LabelStudioChangeBroker } from '../src/change-broker.ts'
import { LabelStudioContextRegistry } from '../src/context-registry.ts'
import {
  labelStudioContextSourceId,
  labelStudioFocusCorrelationId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'
import type { LabelStudioSessionIdentity } from '../src/session-context-spec.ts'
import type { LabelStudioSessionContextStore } from '../src/session-context-store.ts'

const SESSION = 'broker-session' as LabelStudioActiveContext['sessionId']
const OTHER_SESSION = 'other-session' as LabelStudioActiveContext['sessionId']
const SOURCE = labelStudioContextSourceId('a4ad396e-aa61-49c9-872c-51a681166264')
const CORRELATION = labelStudioFocusCorrelationId('bd585a61-c9e9-42ec-8b2e-54e9e531ce0d')
const TARGET = Object.freeze({ projectId: labelStudioProjectId(228), taskId: labelStudioTaskId(486) })
const IDENTITY: LabelStudioSessionIdentity = { sessionId: SESSION, createdAt: 100 }

function contextStore() {
  let snapshot: LabelStudioSessionContextSnapshot = {
    page: { view: 'projects' }, recentProjects: [], revision: 0,
  }
  const commit = vi.fn(async (_identity: LabelStudioSessionIdentity, request: LabelStudioPageCommit) => {
    snapshot = { page: request.page, recentProjects: [], revision: snapshot.revision + 1 }
    return snapshot
  })
  return {
    commit,
    store: {
      read: vi.fn(() => snapshot),
      commit,
    } as unknown as LabelStudioSessionContextStore,
  }
}

describe('LabelStudioChangeBroker', () => {
  it('keeps isolated monotonic bounded histories and identifies reset/future cursors', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const broker = new LabelStudioChangeBroker(registry, 2, contextStore().store)
    expect(broker.publishTaskChanged(SESSION, labelStudioTaskId(1), 'prediction-created').eventRevision).toBe(1)
    broker.publishTaskChanged(OTHER_SESSION, labelStudioTaskId(8), 'prediction-created')
    broker.publishTaskChanged(SESSION, labelStudioTaskId(2), 'prediction-created')
    broker.publishTaskChanged(SESSION, labelStudioTaskId(3), 'prediction-created')

    expect(await broker.wait(SESSION, 1, 10, new AbortController().signal)).toMatchObject({
      latestRevision: 3,
      resetRequired: false,
      events: [{ eventRevision: 2 }, { eventRevision: 3 }],
    })
    expect(await broker.wait(SESSION, 0, 10, new AbortController().signal)).toEqual({
      latestRevision: 3, resetRequired: true, events: [],
    })
    await expect(broker.wait(SESSION, 4, 10, new AbortController().signal))
      .rejects.toMatchObject({ code: 'future-revision' })
    expect(broker.latestRevision(OTHER_SESSION)).toBe(1)
    await broker.dispose()
  })

  it('wakes waits, returns empty on timeout, and rejects cancellation', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const broker = new LabelStudioChangeBroker(registry, 4, contextStore().store)
    const waiting = broker.wait(SESSION, 0, 1_000, new AbortController().signal)
    broker.publishTaskChanged(SESSION, labelStudioTaskId(9), 'prediction-created')
    await expect(waiting).resolves.toMatchObject({ latestRevision: 1, events: [{ taskId: 9 }] })
    await expect(broker.wait(SESSION, 1, 1, new AbortController().signal)).resolves.toEqual({
      latestRevision: 1, resetRequired: false, events: [],
    })
    const cancelled = new AbortController()
    const pending = broker.wait(SESSION, 1, 1_000, cancelled.signal)
    const reason = new Error('cancel wait')
    cancelled.abort(reason)
    await expect(pending).rejects.toBe(reason)
    await broker.dispose()
  })

  it('commits one focus ACK idempotently and retires cancellation to vacant', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const durable = contextStore()
    const broker = new LabelStudioChangeBroker(registry, 8, durable.store)
    const { lease } = registry.openLease(SESSION, SOURCE, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, CORRELATION)
    const pending = broker.requestFocus(
      IDENTITY, CORRELATION, reservation, TARGET, 1_000, new AbortController().signal,
    )
    const batch = await broker.wait(SESSION, 0, 10, new AbortController().signal)
    expect(batch.events).toMatchObject([{
      kind: 'focus-task', correlationId: CORRELATION, targetRevision: 1, committed: false,
      expectedSessionContextRevision: 0,
    }])
    const committed = await broker.acknowledgeFocus(
      lease.leaseId, lease.generation, CORRELATION, reservation.targetRevision, TARGET,
    )
    await expect(pending).resolves.toEqual(committed)
    await expect(broker.acknowledgeFocus(
      lease.leaseId, lease.generation, CORRELATION, reservation.targetRevision, TARGET,
    )).resolves.toEqual(committed)
    expect(durable.commit).toHaveBeenCalledTimes(1)
    expect((await broker.wait(SESSION, 0, 10, new AbortController().signal)).events)
      .toMatchObject([{ committed: true }])

    const nextCorrelation = labelStudioFocusCorrelationId('61740eb7-3568-4eea-bc6c-0ba8f3513277')
    const next = registry.reserveFocusTarget(lease.leaseId, lease.generation, nextCorrelation)
    const cancelled = new AbortController()
    const cancelledFocus = broker.requestFocus(IDENTITY, nextCorrelation, next, TARGET, 1_000, cancelled.signal)
    cancelled.abort(new Error('cancel focus'))
    await expect(cancelledFocus).rejects.toThrow('cancel focus')
    expect(registry.inspectLease(lease.leaseId, lease.generation).context).toEqual({
      phase: 'vacant', targetRevision: 2,
    })
    await broker.dispose()
  })

  it('deletes history and pending work when the lease ends or broker disposes', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const broker = new LabelStudioChangeBroker(registry, 4, contextStore().store)
    const { lease } = registry.openLease(SESSION, SOURCE, 0)
    broker.publishTaskChanged(SESSION, labelStudioTaskId(1), 'prediction-created')
    registry.closeLease(lease.leaseId, lease.generation)
    expect(broker.latestRevision(SESSION)).toBe(0)

    const wait = broker.wait(SESSION, 0, 10_000, new AbortController().signal)
    await broker.dispose()
    await expect(wait).rejects.toThrow('disposed')
    registry.openLease(SESSION, SOURCE, 0)
    registry.closeLease(registry.getLease(SESSION)!.lease.leaseId, 2)
  })

  it('retires a timed-out focus and filters its event while advancing the cursor', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const broker = new LabelStudioChangeBroker(registry, 4, contextStore().store)
    const { lease } = registry.openLease(SESSION, SOURCE, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, CORRELATION)
    await expect(broker.requestFocus(
      IDENTITY, CORRELATION, reservation, TARGET, 1, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'focus-not-found' })
    expect(await broker.wait(SESSION, 0, 10, new AbortController().signal)).toEqual({
      events: [], latestRevision: 1, resetRequired: false,
    })
    expect(registry.inspectLease(lease.leaseId, lease.generation).context).toEqual({
      phase: 'vacant', targetRevision: 1,
    })
    await broker.dispose()
  })

  it('does not publish a focus target before its durable page commit succeeds', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const durable = contextStore()
    const landing = Promise.withResolvers<LabelStudioSessionContextSnapshot>()
    durable.commit.mockImplementationOnce(async () => landing.promise)
    const broker = new LabelStudioChangeBroker(registry, 4, durable.store)
    const { lease } = registry.openLease(SESSION, SOURCE, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, CORRELATION)
    const pending = broker.requestFocus(
      IDENTITY, CORRELATION, reservation, TARGET, 1_000, new AbortController().signal,
    )
    const acknowledging = broker.acknowledgeFocus(
      lease.leaseId, lease.generation, CORRELATION, reservation.targetRevision, TARGET,
    )

    await Promise.resolve()
    expect(registry.getLive(SESSION)).toBeUndefined()
    landing.resolve({
      page: { view: 'task', projectId: TARGET.projectId, taskId: TARGET.taskId },
      recentProjects: [],
      revision: 1,
    })
    await expect(acknowledging).resolves.toMatchObject({ target: TARGET })
    await expect(pending).resolves.toMatchObject({ target: TARGET })
    expect(registry.getLive(SESSION)?.target).toEqual(TARGET)
    await broker.dispose()
  })

  it('keeps a focus target unreadable when durable commit fails', async () => {
    const registry = new LabelStudioContextRegistry(30_000)
    const durable = contextStore()
    durable.commit.mockRejectedValueOnce(new Error('DO_NOT_ECHO_STORAGE_BODY'))
    const broker = new LabelStudioChangeBroker(registry, 4, durable.store)
    const { lease } = registry.openLease(SESSION, SOURCE, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, CORRELATION)
    const cancelled = new AbortController()
    const pending = broker.requestFocus(
      IDENTITY, CORRELATION, reservation, TARGET, 1_000, cancelled.signal,
    )

    await expect(broker.acknowledgeFocus(
      lease.leaseId, lease.generation, CORRELATION, reservation.targetRevision, TARGET,
    )).rejects.toThrow('DO_NOT_ECHO_STORAGE_BODY')
    expect(registry.getLive(SESSION)).toBeUndefined()
    cancelled.abort(new Error('test cleanup'))
    await expect(pending).rejects.toThrow('test cleanup')
    await broker.dispose()
  })
})
