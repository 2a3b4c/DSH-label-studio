/** Shared cancellation and quiescence gate for Label Studio tools and RPC. */

const CLOSING_MESSAGE = 'label-studio: operation gate is closing'

/** Stable rejection for work attempted after package shutdown begins. */
export class LabelStudioOperationClosedError extends Error {
  constructor() {
    super(CLOSING_MESSAGE)
    this.name = 'LabelStudioOperationClosedError'
  }
}

/** Owns package cancellation and tracks operations that entered before close. */
export class LabelStudioOperationGate {
  private readonly lifetime = new AbortController()
  private readonly inFlight = new Set<Promise<unknown>>()
  private closing = false
  private closingSnapshot: readonly Promise<unknown>[] = []

  /**
   * Run one operation with caller and package cancellation combined.
   * @param callerSignal - cancellation owned by the caller.
   * @param operation - asynchronous work using the combined signal.
   * @returns the operation result.
   */
  run<T>(
    callerSignal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.closing) return Promise.reject(new LabelStudioOperationClosedError())
    const signal = AbortSignal.any([callerSignal, this.lifetime.signal])
    const pending = Promise.resolve().then(() => {
      signal.throwIfAborted()
      return operation(signal)
    })
    this.inFlight.add(pending)
    void pending.finally(() => { this.inFlight.delete(pending) }).catch(() => undefined)
    return pending
  }

  /** Reject new operations and abort every operation that already entered. */
  beginClose(): void {
    if (this.closing) return
    this.closing = true
    this.closingSnapshot = [...this.inFlight]
    this.lifetime.abort(new LabelStudioOperationClosedError())
  }

  /** Wait until the operations captured by {@link beginClose} have settled. */
  async drain(): Promise<void> {
    const pending = this.closing ? this.closingSnapshot : [...this.inFlight]
    await Promise.allSettled(pending)
  }
}

/** Resources participating in the package's ordered asynchronous shutdown. */
export interface LabelStudioShutdownResources {
  readonly operations: LabelStudioOperationGate
  readonly disposeTools: () => void
  readonly disposeBrowser?: () => Promise<void>
  readonly disposeBroker: () => Promise<void>
  readonly disposeRegistry: () => void
  readonly disposeRuntime: () => Promise<void>
  readonly disposeStore: () => Promise<void>
}

/**
 * Close ingress, quiesce work, and then release stateful resources in order.
 * @param resources - resource-specific disposal callbacks owned by one plugin instance.
 */
export async function disposeLabelStudioResources(resources: LabelStudioShutdownResources): Promise<void> {
  resources.operations.beginClose()
  resources.disposeTools()
  await resources.disposeBrowser?.()
  await resources.operations.drain()
  await resources.disposeBroker()
  resources.disposeRegistry()
  try {
    await resources.disposeRuntime()
  } finally {
    await resources.disposeStore()
  }
}
