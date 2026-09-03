// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  isLabelStudioPluginFailure,
  isLabelStudioTransportUnknown,
  LabelStudioContextBridge,
} from '../src/client/context-bridge.ts'

const lease = { leaseId: '10000000-0000-4000-8000-000000000001', generation: 1, expiresAt: 1000 }
const sessionContext = {
  page: { view: 'projects' },
  recentProjects: [],
  revision: 0,
  binding: { recentProjects: [], revision: 0 },
}

function connection(result: unknown) {
  const listeners = new Set<() => void>()
  let host: object | undefined = { version: 'test' }
  const call = vi.fn<(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ) => Promise<unknown>>(async () => result)
  return {
    call,
    source: {
      rpc: { call },
      generation: {
        getSnapshot: () => host,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    },
    replaceHost(next: object | undefined) { host = next; for (const listener of listeners) listener() },
  }
}

describe('Label Studio browser RPC bridge', () => {
  it('calls the fixed channel and unwraps the framework and plugin outcomes', async () => {
    const fixture = connection({
      ok: true, value: { ok: true, value: { lease, replayBaseline: 4, sessionContext } },
    })
    const bridge = new LabelStudioContextBridge({ connection: fixture.source as never, channel: '/label-studio' })
    await expect(bridge.openLease('session-a' as never, '20000000-0000-4000-8000-000000000002' as never))
      .resolves.toEqual({ lease, replayBaseline: 4, sessionContext })
    expect(fixture.call).toHaveBeenCalledWith('/label-studio', 'lease/open', {
      sessionId: 'session-a', sourceId: '20000000-0000-4000-8000-000000000002',
    }, undefined)
  })

  it('encodes and validates all eight endpoint payloads and results', async () => {
    const active = {
      sessionId: 'session-a', sourceId: '20000000-0000-4000-8000-000000000002',
      ...lease, targetRevision: 1, target: { projectId: 228, taskId: 486 },
    }
    const fixture = connection(undefined)
    fixture.call.mockImplementation(async (_channel, endpoint) => ({
      ok: true,
      value: { ok: true, value: {
        'lease/close': { closed: true },
        'context/reserve': { lease, targetRevision: 1, navigationSequence: 1 },
        'context/publish': active,
        'events/wait': {
          lease, context: { phase: 'committed', targetRevision: 1, target: active.target },
          events: [
            {
              kind: 'inspect-current-page', eventRevision: 3,
              inspectionId: '30000000-0000-4000-8000-000000000003', deadlineAt: 5000,
            },
            { kind: 'webhook-unassigned', eventRevision: 4, reason: 'no-matching-binding' },
            { kind: 'webhook-status', eventRevision: 5, status: 'ready' },
            { kind: 'binding-changed', eventRevision: 6, binding: { recentProjects: [], revision: 2 } },
          ], latestRevision: 6, resetRequired: false,
        },
        'focus/ack': active,
        'page/commit': {
          page: { view: 'task', projectId: 228, taskId: 486 },
          recentProjects: [],
          revision: 1,
          binding: { recentProjects: [], revision: 0 },
        },
        'inspection/commit': { accepted: true },
      }[endpoint] },
    }))
    const bridge = new LabelStudioContextBridge({ connection: fixture.source as never, channel: '/label-studio' })
    await expect(bridge.closeLease(lease as never)).resolves.toBe(true)
    await expect(bridge.reserveTarget(lease as never, 1 as never, 0)).resolves.toMatchObject({ targetRevision: 1 })
    await expect(bridge.publishTarget(lease as never, 1, active.target as never)).resolves.toMatchObject(active)
    await expect(bridge.commitPage(
      lease as never, 1 as never, 0, { view: 'task', projectId: 228, taskId: 486 } as never,
    )).resolves.toMatchObject({ revision: 1 })
    await expect(bridge.waitEvents(lease as never, 2, new AbortController().signal)).resolves.toMatchObject({
      latestRevision: 6,
      events: [
        expect.objectContaining({ kind: 'inspect-current-page' }),
        { kind: 'webhook-unassigned', eventRevision: 4, reason: 'no-matching-binding' },
        { kind: 'webhook-status', eventRevision: 5, status: 'ready' },
        { kind: 'binding-changed', eventRevision: 6, binding: { recentProjects: [], revision: 2 } },
      ],
    })
    await expect(bridge.acknowledgeFocus(
      lease as never, '30000000-0000-4000-8000-000000000003' as never, 1, active.target as never,
    )).resolves.toMatchObject(active)
    await expect(bridge.commitInspection(
      lease as never,
      '30000000-0000-4000-8000-000000000003' as never,
      { kind: 'page', page: { view: 'project', projectId: 228 } as never },
    )).resolves.toEqual({ accepted: true })
    expect(fixture.call.mock.calls.map(call => call[1])).toEqual([
      'lease/close', 'context/reserve', 'context/publish', 'page/commit', 'events/wait', 'focus/ack',
      'inspection/commit',
    ])
  })

  it('rejects a binding whose source is present without a target', async () => {
    const fixture = connection({
      ok: true,
      value: { ok: true, value: {
        lease,
        replayBaseline: 0,
        sessionContext: {
          ...sessionContext,
          binding: { source: 'tool-result', recentProjects: [], revision: 1 },
        },
      } },
    })
    const bridge = new LabelStudioContextBridge({ connection: fixture.source as never, channel: '/label-studio' })
    await bridge.openLease(
      'session-a' as never,
      '20000000-0000-4000-8000-000000000002' as never,
    ).catch((error: unknown) => {
      expect(isLabelStudioTransportUnknown(error)).toBe(true)
    })
  })

  it('separates plugin rejection, framework rejection, cancellation, and dispatched unknown', async () => {
    const plugin = connection({ ok: true, value: { ok: false, error: { code: 'lease-expired', message: 'expired', details: {} } } })
    const pluginBridge = new LabelStudioContextBridge({ connection: plugin.source as never, channel: '/label-studio' })
    await pluginBridge.closeLease(lease as never).catch((error: unknown) => { expect(isLabelStudioPluginFailure(error)).toBe(true) })

    const framework = connection({ ok: false, error: { code: 'internal', message: 'no', details: {} } })
    await new LabelStudioContextBridge({ connection: framework.source as never, channel: '/label-studio' })
      .closeLease(lease as never).catch((error: unknown) => { expect(error).toMatchObject({ kind: 'framework' }) })

    const abort = new AbortController(); abort.abort()
    await new LabelStudioContextBridge({ connection: plugin.source as never, channel: '/label-studio' })
      .closeLease(lease as never, abort.signal).catch((error: unknown) => {
        expect(error).toMatchObject({ kind: 'cancelled' })
      })

    const unknown = connection(undefined)
    unknown.call.mockImplementation(async () => { throw new DOMException('lost', 'AbortError') })
    await new LabelStudioContextBridge({ connection: unknown.source as never, channel: '/label-studio' })
      .closeLease(lease as never).catch((error: unknown) => { expect(isLabelStudioTransportUnknown(error)).toBe(true) })
  })

  it('subscribes to Host loss and replacement and disposes the listener', () => {
    const fixture = connection({ ok: true, value: { ok: true, value: { closed: true } } })
    const bridge = new LabelStudioContextBridge({ connection: fixture.source as never, channel: '/label-studio' })
    const listener = vi.fn(); const off = bridge.onHostChanged(listener)
    fixture.replaceHost(undefined); fixture.replaceHost({ version: 'next' })
    expect(listener).toHaveBeenCalledTimes(2)
    off(); fixture.replaceHost(undefined)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
