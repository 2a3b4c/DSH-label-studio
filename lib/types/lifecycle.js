/** Shared cancellation and quiescence gate for Label Studio tools and RPC. */
const CLOSING_MESSAGE = 'label-studio: operation gate is closing';
/** Stable rejection for work attempted after package shutdown begins. */
export class LabelStudioOperationClosedError extends Error {
    constructor() {
        super(CLOSING_MESSAGE);
        this.name = 'LabelStudioOperationClosedError';
    }
}
/** Owns package cancellation and tracks operations that entered before close. */
export class LabelStudioOperationGate {
    lifetime = new AbortController();
    inFlight = new Set();
    closing = false;
    closingSnapshot = [];
    /**
     * Run one operation with caller and package cancellation combined.
     * @param callerSignal - cancellation owned by the caller.
     * @param operation - asynchronous work using the combined signal.
     * @returns the operation result.
     */
    run(callerSignal, operation) {
        if (this.closing)
            return Promise.reject(new LabelStudioOperationClosedError());
        const signal = AbortSignal.any([callerSignal, this.lifetime.signal]);
        const pending = Promise.resolve().then(() => {
            signal.throwIfAborted();
            return operation(signal);
        });
        this.inFlight.add(pending);
        void pending.finally(() => { this.inFlight.delete(pending); }).catch(() => undefined);
        return pending;
    }
    /** Reject new operations and abort every operation that already entered. */
    beginClose() {
        if (this.closing)
            return;
        this.closing = true;
        this.closingSnapshot = [...this.inFlight];
        this.lifetime.abort(new LabelStudioOperationClosedError());
    }
    /** Wait until the operations captured by {@link beginClose} have settled. */
    async drain() {
        const pending = this.closing ? this.closingSnapshot : [...this.inFlight];
        await Promise.allSettled(pending);
    }
}
/**
 * Close ingress, quiesce work, and then release stateful resources in order.
 * @param resources - resource-specific disposal callbacks owned by one plugin instance.
 */
export async function disposeLabelStudioResources(resources) {
    resources.operations.beginClose();
    const errors = [];
    attemptSync(() => resources.disposeTools(), errors);
    attemptSync(() => resources.disposeWebhookIngress?.(), errors);
    await attempt(() => resources.disposeBrowser?.(), errors);
    await attempt(() => resources.disposeWebhookRegistration?.(), errors);
    await attempt(() => resources.operations.drain(), errors);
    attemptSync(() => resources.disposeCurrentPages?.(), errors);
    await attempt(() => resources.disposeFrameProxy?.(), errors);
    await attempt(() => resources.disposeBroker(), errors);
    attemptSync(() => resources.disposeRegistry(), errors);
    await attempt(() => resources.disposeRuntime(), errors);
    await attempt(() => resources.disposeStore(), errors);
    if (errors.length === 1)
        throw errors[0];
    if (errors.length > 1)
        throw new AggregateError(errors, 'label-studio: resource shutdown failed');
}
async function attempt(operation, errors) {
    try {
        await operation();
    }
    catch (error) {
        errors.push(error);
    }
}
function attemptSync(operation, errors) {
    try {
        operation();
    }
    catch (error) {
        errors.push(error);
    }
}
//# sourceMappingURL=lifecycle.js.map