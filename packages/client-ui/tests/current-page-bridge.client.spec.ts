// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { LabelStudioInspectPageEvent } from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioCurrentPageBridge } from '../src/client/current-page-bridge.ts'

const protocol = 'dsh-label-studio-page/v1' as const
const capability = 'frame-capability'
const lease = {
  leaseId: '10000000-0000-4000-8000-000000000001', generation: 2, expiresAt: 10_000,
}
const event: LabelStudioInspectPageEvent = {
  kind: 'inspect-current-page', inspectionId: '20000000-0000-4000-8000-000000000002' as never,
  deadlineAt: 5_000, eventRevision: 8,
}

function harness(clock: () => number = () => 1_000) {
  const frame = { postMessage: vi.fn() } as unknown as WindowProxy
  const rpc = { commitInspection: vi.fn(async () => ({ accepted: true })) }
  const bridge = new LabelStudioCurrentPageBridge(
    rpc as never,
    () => frame,
    'http://127.0.0.1:4000',
    protocol,
    capability,
    clock,
  )
  return { bridge, frame, rpc }
}

function response(source: WindowProxy, data: unknown, origin = 'http://127.0.0.1:4000'): void {
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }))
}

describe('LabelStudioCurrentPageBridge', () => {
  it('accepts one exact iframe response and submits the current lease once', async () => {
    const value = harness()
    const pending = value.bridge.inspect(event, lease as never, new AbortController().signal)
    expect(value.frame.postMessage).toHaveBeenCalledWith({
      protocol, capability, kind: 'inspect-current-page', inspectionId: event.inspectionId,
    }, 'http://127.0.0.1:4000')
    const data = {
      protocol, kind: 'current-page', inspectionId: event.inspectionId,
      outcome: { kind: 'page', page: { view: 'task', projectId: 7, taskId: 11, annotationId: 13 } },
    }
    response(value.frame, data)
    await expect(pending).resolves.toBe('ready')
    expect(value.rpc.commitInspection).toHaveBeenCalledWith(
      lease,
      event.inspectionId,
      data.outcome,
      expect.any(AbortSignal),
    )
    response(value.frame, data)
    expect(value.rpc.commitInspection).toHaveBeenCalledOnce()
  })

  it('ignores wrong source, origin, protocol, id, malformed page, and stale epoch', async () => {
    const value = harness()
    const pending = value.bridge.inspect(event, lease as never, new AbortController().signal)
    const valid = {
      protocol, kind: 'current-page', inspectionId: event.inspectionId,
      outcome: { kind: 'page', page: { view: 'project', projectId: 7 } },
    }
    response({} as WindowProxy, valid)
    response(value.frame, valid, 'http://127.0.0.1:4999')
    response(value.frame, { ...valid, protocol: 'wrong' })
    response(value.frame, { ...valid, inspectionId: 'wrong' })
    response(value.frame, { ...valid, outcome: { kind: 'page', page: { view: 'task', projectId: 7 } } })
    expect(value.rpc.commitInspection).not.toHaveBeenCalled()
    value.bridge.cancel()
    response(value.frame, valid)
    await expect(pending).rejects.toThrow('cancelled')
    expect(value.rpc.commitInspection).not.toHaveBeenCalled()
  })

  it('forwards unsupported, rejects unavailable frames, deadline, abort, and dispose', async () => {
    const unsupported = harness()
    const first = unsupported.bridge.inspect(event, lease as never, new AbortController().signal)
    response(unsupported.frame, {
      protocol, kind: 'current-page', inspectionId: event.inspectionId, outcome: { kind: 'unsupported' },
    })
    await expect(first).resolves.toBe('unsupported')
    expect(unsupported.rpc.commitInspection).toHaveBeenCalledWith(
      lease, event.inspectionId, { kind: 'unsupported' }, expect.any(AbortSignal),
    )

    const missingRpc = { commitInspection: vi.fn(async () => ({ accepted: true })) }
    const missing = new LabelStudioCurrentPageBridge(
      missingRpc as never, () => undefined, 'http://127.0.0.1:4000', protocol, capability, () => 1_000,
    )
    await expect(missing.inspect(event, lease as never, new AbortController().signal)).resolves.toBe('unavailable')
    expect(missingRpc.commitInspection).toHaveBeenCalledWith(
      lease, event.inspectionId, { kind: 'unavailable' }, expect.any(AbortSignal),
    )

    const expired = harness(() => 5_000)
    await expect(expired.bridge.inspect(event, lease as never, new AbortController().signal))
      .rejects.toThrow('expired')

    const aborted = harness()
    const abort = new AbortController()
    const byAbort = aborted.bridge.inspect(event, lease as never, abort.signal)
    abort.abort(new Error('caller stopped'))
    await expect(byAbort).rejects.toThrow('caller stopped')

    const disposed = harness()
    const byDispose = disposed.bridge.inspect(event, lease as never, new AbortController().signal)
    disposed.bridge.dispose()
    await expect(byDispose).rejects.toThrow('disposed')
  })

  it('bounds an unanswered iframe request by the event deadline', async () => {
    vi.useFakeTimers()
    try {
      const value = harness(() => Date.now())
      const pending = value.bridge.inspect(
        { ...event, deadlineAt: Date.now() + 20 }, lease as never, new AbortController().signal,
      )
      const rejected = expect(pending).rejects.toThrow('expired')
      await vi.advanceTimersByTimeAsync(20)
      await rejected
      expect(value.rpc.commitInspection).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
