// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { LabelStudioActiveTarget, LabelStudioEventBatch } from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioContextController } from '../src/client/context-state.ts'

const lease = { leaseId: '10000000-0000-4000-8000-000000000001', generation: 1, expiresAt: 8_000_000_000_000 }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function harness(clock: () => number = Date.now) {
  const wait = deferred<LabelStudioEventBatch>()
  let durable = { page: { view: 'projects' } as const, recentProjects: [], revision: 0 }
  const host = { value: { version: 'one' } as object | undefined, listeners: new Set<() => void>() }
  const bridge = {
    currentHost: () => host.value,
    onHostChanged: (listener: () => void) => { host.listeners.add(listener); return () => { host.listeners.delete(listener) } },
    openLease: vi.fn(async () => ({ lease, replayBaseline: 7, sessionContext: durable })),
    closeLease: vi.fn(async (_lease: unknown, _signal?: AbortSignal) => true),
    waitEvents: vi.fn(() => wait.promise),
    reserveTarget: vi.fn(async () => ({ lease, targetRevision: 1, navigationSequence: 1 })),
    publishTarget: vi.fn(async (_lease: unknown, _revision: unknown, target: LabelStudioActiveTarget) => ({
      sessionId: 'session-a', sourceId: 'source', ...lease, targetRevision: 1, target,
    })),
    commitPage: vi.fn(async (_lease: unknown, _sequence: unknown, revision: number, page: never) => {
      durable = {
        page,
        recentProjects: [],
        revision: page.view === 'projects' ? revision : revision + 1,
      }
      return durable
    }),
    acknowledgeFocus: vi.fn(),
  }
  const page = {
    setOpen: vi.fn(), applyPage: vi.fn(async () => {}), clearPage: vi.fn(), reloadPage: vi.fn(),
  }
  const controller = new LabelStudioContextController(bridge as never, page, 'source' as never, {
    contextOpenRetryMs: 1000, contextCloseTimeoutMs: 100, eventHistorySize: 4,
  }, clock)
  return { bridge, page, controller, host }
}

function eventHarness(eventHistorySize = 4) {
  const waits: Array<{ resolve: (value: LabelStudioEventBatch) => void }> = []
  const host = { value: { version: 'one' } as object | undefined, listeners: new Set<() => void>() }
  const bridge = {
    currentHost: () => host.value,
    onHostChanged: (listener: () => void) => { host.listeners.add(listener); return () => { host.listeners.delete(listener) } },
    openLease: vi.fn(async () => ({ lease, replayBaseline: 7, sessionContext: {
      page: { view: 'projects' }, recentProjects: [], revision: 0,
    } })),
    closeLease: vi.fn(async (_lease: unknown, _signal?: AbortSignal) => true),
    waitEvents: vi.fn((_lease: unknown, _after: unknown, signal: AbortSignal) => new Promise<LabelStudioEventBatch>((resolve, reject) => {
      waits.push({ resolve: resolve })
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('cancelled'), { kind: 'cancelled' as const }))
      }, { once: true })
    })),
    reserveTarget: vi.fn(), publishTarget: vi.fn(), commitPage: vi.fn(),
    acknowledgeFocus: vi.fn(async (
      _lease: unknown,
      _correlation: unknown,
      revision: number,
      target: LabelStudioActiveTarget,
    ) => ({
      sessionId: 'session-a', sourceId: 'source', ...lease, targetRevision: revision, target,
    })),
  }
  const page = {
    setOpen: vi.fn(), applyPage: vi.fn(async () => {}), clearPage: vi.fn(), reloadPage: vi.fn(),
  }
  const controller = new LabelStudioContextController(bridge as never, page, 'source' as never, {
    contextOpenRetryMs: 1000, contextCloseTimeoutMs: 100, eventHistorySize,
  })
  return { bridge, page, controller, host, waits }
}

describe('Label Studio context controller', () => {
  it('opens one lease for the bound Session and uses the replay baseline', async () => {
    const { bridge, controller } = harness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().sessionContextStatus).toBe('ready') })
    expect(controller.store.getSnapshot()).toMatchObject({
      sessionId: 'session-a', lease, eventRevision: 7, observedEventRevision: 7,
      sessionContextStatus: 'ready', status: 'no-task',
    })
    expect(bridge.waitEvents).toHaveBeenCalledWith(lease, 7, expect.any(AbortSignal))
  })

  it('serializes reserve, DOM application, and publish for a manual target', async () => {
    const { bridge, page, controller } = harness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(bridge.waitEvents).toHaveBeenCalled() })
    const target = { projectId: 228, taskId: 486 }
    await controller.selectPage({ view: 'task', ...target } as never)
    expect(bridge.reserveTarget).toHaveBeenCalledWith(lease, 1, 0, expect.any(AbortSignal))
    expect(page.applyPage).toHaveBeenCalledWith({ view: 'task', ...target })
    expect(bridge.publishTarget).toHaveBeenCalledWith(lease, 1, target, expect.any(AbortSignal))
    expect(controller.store.getSnapshot()).toMatchObject({ target, targetRevision: 1, status: 'synced' })
  })

  it('cancels the old generation and closes without waiting when Session changes', async () => {
    const { bridge, controller } = harness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(bridge.waitEvents).toHaveBeenCalled() })
    controller.bindSession('session-b' as never)
    expect(bridge.closeLease).toHaveBeenCalledWith(lease, expect.any(AbortSignal))
    await vi.waitFor(() => { expect(bridge.openLease).toHaveBeenCalledTimes(2) })
  })

  it('reopens an expired lease from its replay baseline and republishes the controlled target', async () => {
    let now = 0
    const { bridge, page, controller, host } = harness(() => now)
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(bridge.waitEvents).toHaveBeenCalledOnce() })
    await controller.selectPage({ view: 'task', projectId: 228, taskId: 486 } as never)
    host.value = undefined; for (const listener of host.listeners) listener()
    now = lease.expiresAt + 1
    host.value = { version: 'two' }; for (const listener of host.listeners) listener()
    await vi.waitFor(() => { expect(bridge.openLease).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(bridge.reserveTarget).toHaveBeenCalledTimes(2) })
    expect(page.applyPage).toHaveBeenCalledWith({ view: 'task', projectId: 228, taskId: 486 })
    expect(controller.store.getSnapshot()).toMatchObject({ eventRevision: 7, observedEventRevision: 7 })
  })

  it('unsubscribes the Host listener before dispose and never reopens afterward', async () => {
    const { bridge, controller, host } = harness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(bridge.openLease).toHaveBeenCalledOnce() })
    await controller.dispose()
    host.value = { version: 'two' }; for (const listener of host.listeners) listener()
    expect(bridge.openLease).toHaveBeenCalledOnce()
    expect(host.listeners.size).toBe(0)
  })

  it('applies a focus URL before ACK and commits its event cursor afterward', async () => {
    const { bridge, page, controller, waits } = eventHarness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(1) })
    waits[0]?.resolve({
      lease,
      context: {
        phase: 'reserved', targetRevision: 1,
        reservation: { kind: 'focus', correlationId: '30000000-0000-4000-8000-000000000003' },
      },
      events: [{
        kind: 'focus-task', eventRevision: 8,
        correlationId: '30000000-0000-4000-8000-000000000003', targetRevision: 1,
        target: { projectId: 228, taskId: 486 }, deadlineAt: 8_000_000_000_000, committed: false,
      }],
      latestRevision: 8, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().status).toBe('synced') })
    expect(page.applyPage.mock.invocationCallOrder[0]).toBeLessThan(bridge.acknowledgeFocus.mock.invocationCallOrder[0] ?? 0)
    expect(controller.store.getSnapshot()).toMatchObject({
      target: { projectId: 228, taskId: 486 }, targetRevision: 1,
      eventRevision: 8, observedEventRevision: 8, status: 'synced',
    })
  })

  it('keeps a focus receipt pending after an unknown ACK and reconciles from the next wait', async () => {
    const { bridge, controller, waits } = eventHarness()
    bridge.acknowledgeFocus.mockRejectedValueOnce(
      Object.assign(new Error('lost'), { kind: 'transport-unknown' as const }),
    )
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(1) })
    const target = { projectId: 228, taskId: 486 }
    waits[0]?.resolve({
      lease,
      context: {
        phase: 'reserved', targetRevision: 1,
        reservation: { kind: 'focus', correlationId: '30000000-0000-4000-8000-000000000003' },
      },
      events: [{
        kind: 'focus-task', eventRevision: 8,
        correlationId: '30000000-0000-4000-8000-000000000003', targetRevision: 1,
        target, deadlineAt: 8_000_000_000_000, committed: false,
      }],
      latestRevision: 8, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(2) })
    expect(bridge.waitEvents.mock.calls[1]?.[1]).toBe(8)
    expect(controller.store.getSnapshot()).toMatchObject({ eventRevision: 7, observedEventRevision: 8 })
    waits[1]?.resolve({
      lease, context: { phase: 'committed', targetRevision: 1, target },
      events: [], latestRevision: 8, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().eventRevision).toBe(8) })
    expect(bridge.acknowledgeFocus).toHaveBeenCalledOnce()
  })

  it('reloads only matching task changes and fences waits across Host generations', async () => {
    const { bridge, page, controller, host, waits } = eventHarness()
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(1) })
    waits[0]?.resolve({
      lease,
      context: { phase: 'committed', targetRevision: 1, target: { projectId: 228, taskId: 486 } },
      events: [], latestRevision: 7, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(2) })
    waits[1]?.resolve({
      lease,
      context: { phase: 'committed', targetRevision: 1, target: { projectId: 228, taskId: 486 } },
      events: [
        { kind: 'task-changed', eventRevision: 8, taskId: 999, reason: 'prediction-created' },
        { kind: 'task-changed', eventRevision: 9, taskId: 486, reason: 'prediction-created' },
      ],
      latestRevision: 9, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(controller.store.getSnapshot().eventRevision).toBe(9) })
    expect(page.reloadPage).toHaveBeenCalledOnce()
    host.value = undefined; for (const listener of host.listeners) listener()
    host.value = { version: 'two' }; for (const listener of host.listeners) listener()
    await vi.waitFor(() => { expect(bridge.waitEvents).toHaveBeenCalledTimes(4) })
    expect(bridge.waitEvents.mock.calls[3]?.[1]).toBe(9)
  })

  it('bounds the event buffer and rebuilds instead of crossing an unresolved prefix', async () => {
    const { bridge, page, controller, waits } = eventHarness(2)
    controller.bindSession('session-a' as never)
    await vi.waitFor(() => { expect(waits).toHaveLength(1) })
    waits[0]?.resolve({
      lease, context: { phase: 'vacant', targetRevision: 0 },
      events: [1, 2, 3].map(eventRevision => ({
        kind: 'task-changed', eventRevision: eventRevision + 7, taskId: 486, reason: 'prediction-created',
      })),
      latestRevision: 10, resetRequired: false,
    } as never)
    await vi.waitFor(() => { expect(bridge.closeLease).toHaveBeenCalled() })
    expect(page.clearPage).toHaveBeenCalled()
    await vi.waitFor(() => { expect(bridge.openLease).toHaveBeenCalledTimes(2) })
    expect(controller.store.getSnapshot().bufferedEventCount).toBe(0)
  })

  it('uses one cancellable timer for an open whose dispatched outcome is unknown', async () => {
    vi.useFakeTimers()
    try {
      const listeners = new Set<() => void>()
      const bridge = {
        currentHost: () => ({ version: 'one' }),
        onHostChanged: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        openLease: vi.fn(async () => { throw { kind: 'transport-unknown', cause: new Error('lost') } }),
        closeLease: vi.fn(), waitEvents: vi.fn(), reserveTarget: vi.fn(), publishTarget: vi.fn(), commitPage: vi.fn(), acknowledgeFocus: vi.fn(),
      }
      const page = { setOpen: vi.fn(), applyPage: vi.fn(), clearPage: vi.fn(), reloadPage: vi.fn() }
      const controller = new LabelStudioContextController(bridge as never, page, 'source' as never, {
        contextOpenRetryMs: 1000, contextCloseTimeoutMs: 100, eventHistorySize: 4,
      })
      controller.bindSession('session-a' as never)
      await Promise.resolve(); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(999); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledTimes(2)
      await controller.dispose()
      vi.advanceTimersByTime(10_000); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries a conflicting lease at the Host-provided interval and cancels retry on dispose', async () => {
    vi.useFakeTimers()
    try {
      const listeners = new Set<() => void>()
      const conflict = Object.assign(new Error('owned'), {
        kind: 'plugin' as const,
        error: { code: 'lease-conflict' as const, message: 'owned', details: { retryAfterMs: 750 } },
      })
      const bridge = {
        currentHost: () => ({ version: 'one' }),
        onHostChanged: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        openLease: vi.fn(async () => { throw conflict }),
        closeLease: vi.fn(), waitEvents: vi.fn(), reserveTarget: vi.fn(), publishTarget: vi.fn(), commitPage: vi.fn(), acknowledgeFocus: vi.fn(),
      }
      const page = { setOpen: vi.fn(), applyPage: vi.fn(), clearPage: vi.fn(), reloadPage: vi.fn() }
      const controller = new LabelStudioContextController(bridge as never, page, 'source' as never, {
        contextOpenRetryMs: 1000, contextCloseTimeoutMs: 100, eventHistorySize: 4,
      })
      controller.bindSession('session-a' as never)
      await Promise.resolve(); await Promise.resolve()
      expect(controller.store.getSnapshot().status).toBe('lease-conflict')
      vi.advanceTimersByTime(749); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledOnce()
      vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledTimes(2)
      await controller.dispose()
      vi.advanceTimersByTime(10_000); await Promise.resolve()
      expect(bridge.openLease).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not wait for lease close and aborts its request at the configured deadline', async () => {
    const { bridge, controller } = harness()
    let closeSignal: AbortSignal | undefined
    bridge.closeLease.mockImplementation((_lease: unknown, signal?: AbortSignal) => {
      closeSignal = signal
      return new Promise<boolean>(() => {})
    })
    controller.bindSession('session-a' as never)
    await Promise.resolve(); await Promise.resolve()
    controller.bindSession('session-b' as never)
    expect(closeSignal?.aborted).toBe(false)
    expect(bridge.openLease).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => { expect(closeSignal?.aborted).toBe(true) })
    await controller.dispose()
  })
})
