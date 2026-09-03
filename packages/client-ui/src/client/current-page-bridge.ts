/** Parent-page half of the one-shot Label Studio iframe inspection protocol. */

import type {
  LabelStudioInspectPageEvent,
  LabelStudioInspectPageResponse,
  LabelStudioLeaseSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'

type InspectionOutcome = LabelStudioInspectPageResponse['outcome']
type InspectionStatus = 'ready' | 'unsupported' | 'unavailable'

/** Minimal RPC operation required by the iframe bridge. */
export interface LabelStudioInspectionRpc {
  commitInspection(
    lease: LabelStudioLeaseSnapshot,
    inspectionId: LabelStudioInspectPageEvent['inspectionId'],
    outcome: InspectionOutcome,
    signal?: AbortSignal,
  ): Promise<{ readonly accepted: true }>
}

interface PendingInspection {
  readonly event: LabelStudioInspectPageEvent
  readonly lease: LabelStudioLeaseSnapshot
  readonly frame: WindowProxy
  readonly abort: AbortController
  readonly signal: AbortSignal
  readonly cleanup: () => void
  readonly resolve: (status: InspectionStatus) => void
  readonly reject: (reason: unknown) => void
}

/** Validates iframe responses and submits exactly one matching Host receipt. */
export class LabelStudioCurrentPageBridge {
  private pending: PendingInspection | undefined
  private disposed = false

  /**
   * @param rpc - typed Connection RPC caller.
   * @param frame - current iframe window supplier.
   * @param frameOrigin - exact isolated proxy origin.
   * @param protocol - fixed parent/iframe protocol.
   * @param capability - ephemeral proxy capability.
   * @param clock - epoch-millisecond clock for deterministic deadlines.
   */
  constructor(
    private readonly rpc: LabelStudioInspectionRpc,
    private readonly frame: () => WindowProxy | undefined,
    private readonly frameOrigin: string,
    private readonly protocol: LabelStudioInspectPageResponse['protocol'],
    private readonly capability: string,
    private readonly clock: () => number = Date.now,
  ) {}

  /**
   * Inspect the current iframe once and forward its exact structured outcome.
   * @param event - Host request from the Session event stream.
   * @param lease - current browser lease.
   * @param signal - current Session/Connection generation cancellation.
   * @returns final inspection status after the Host accepts the response.
   */
  async inspect(
    event: LabelStudioInspectPageEvent,
    lease: LabelStudioLeaseSnapshot,
    signal: AbortSignal,
  ): Promise<InspectionStatus> {
    if (this.disposed) throw new Error('label-studio client: current-page bridge disposed')
    signal.throwIfAborted()
    if (this.clock() >= event.deadlineAt) throw new Error('label-studio client: inspection expired')
    if (this.pending !== undefined) throw new Error('label-studio client: inspection already active')
    const frame = this.frame()
    if (frame === undefined) {
      await this.rpc.commitInspection(lease, event.inspectionId, { kind: 'unavailable' }, signal)
      return 'unavailable'
    }
    return new Promise<InspectionStatus>((resolve, reject) => {
      const abort = new AbortController()
      const onAbort = () => { this.rejectPending(signal.reason instanceof Error ? signal.reason : new Error('label-studio client: inspection cancelled')) }
      const remaining = Math.max(1, event.deadlineAt - this.clock())
      const timer = setTimeout(() => {
        this.rejectPending(new Error('label-studio client: inspection expired'))
      }, remaining)
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        window.removeEventListener('message', this.onMessage)
      }
      this.pending = { event, lease, frame, abort, signal, cleanup, resolve, reject }
      signal.addEventListener('abort', onAbort, { once: true })
      window.addEventListener('message', this.onMessage)
      try {
        frame.postMessage({
          protocol: this.protocol,
          capability: this.capability,
          kind: 'inspect-current-page',
          inspectionId: event.inspectionId,
        }, this.frameOrigin)
      } catch {
        const pending = this.takePending()
        if (pending === undefined) return
        void this.rpc.commitInspection(
          lease, event.inspectionId, { kind: 'unavailable' }, signal,
        ).then(() => { pending.resolve('unavailable') }, pending.reject)
      }
    })
  }

  /** Cancel the current Session or Connection generation. */
  cancel(): void { this.rejectPending(new Error('label-studio client: inspection cancelled')) }

  /** Remove listeners and permanently reject later work. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.rejectPending(new Error('label-studio client: current-page bridge disposed'))
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    const pending = this.pending
    if (pending === undefined || event.source !== pending.frame || event.origin !== this.frameOrigin) return
    const outcome = parseResponse(event.data, this.protocol, String(pending.event.inspectionId))
    if (outcome === undefined) return
    const accepted = this.takePending()
    if (accepted === undefined) return
    void this.rpc.commitInspection(
      accepted.lease,
      accepted.event.inspectionId,
      outcome,
      AbortSignal.any([accepted.signal, accepted.abort.signal]),
    ).then(() => { accepted.resolve(inspectionStatus(outcome)) }, accepted.reject)
  }

  private rejectPending(reason: unknown): void {
    const pending = this.takePending()
    if (pending !== undefined) {
      pending.abort.abort(reason)
      pending.reject(reason)
    }
  }

  private takePending(): PendingInspection | undefined {
    const pending = this.pending
    if (pending === undefined) return undefined
    this.pending = undefined
    pending.cleanup()
    return pending
  }
}

function inspectionStatus(outcome: InspectionOutcome): InspectionStatus {
  return outcome.kind === 'page' ? 'ready' : outcome.kind
}

function parseResponse(
  value: unknown,
  protocol: LabelStudioInspectPageResponse['protocol'],
  inspectionId: string,
): InspectionOutcome | undefined {
  if (!record(value)
    || value.protocol !== protocol
    || value.kind !== 'current-page'
    || value.inspectionId !== inspectionId
    || !record(value.outcome)) return undefined
  if (value.outcome.kind === 'unsupported') return { kind: 'unsupported' }
  if (value.outcome.kind === 'unavailable') return { kind: 'unavailable' }
  if (value.outcome.kind !== 'page') return undefined
  const page = parsePage(value.outcome.page)
  return page === undefined ? undefined : { kind: 'page', page }
}

function parsePage(value: unknown): Extract<InspectionOutcome, { kind: 'page' }>['page'] | undefined {
  if (!record(value)) return undefined
  if (value.view === 'projects' && exactKeys(value, ['view'])) return { view: 'projects' }
  if (value.view === 'project' && exactKeys(value, ['view', 'projectId']) && positive(value.projectId)) {
    return { view: 'project', projectId: value.projectId as never }
  }
  if (value.view !== 'task'
    || !exactKeys(value, value.annotationId === undefined
      ? ['view', 'projectId', 'taskId']
      : ['view', 'projectId', 'taskId', 'annotationId'])
    || !positive(value.projectId) || !positive(value.taskId)
    || (value.annotationId !== undefined && !positive(value.annotationId))) return undefined
  return {
    view: 'task', projectId: value.projectId as never, taskId: value.taskId as never,
    ...(value.annotationId === undefined ? {} : { annotationId: value.annotationId as never }),
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
