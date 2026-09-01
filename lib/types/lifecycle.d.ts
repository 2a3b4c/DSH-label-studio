/** Shared cancellation and quiescence gate for Label Studio tools and RPC. */
/** Stable rejection for work attempted after package shutdown begins. */
export declare class LabelStudioOperationClosedError extends Error {
    constructor();
}
/** Owns package cancellation and tracks operations that entered before close. */
export declare class LabelStudioOperationGate {
    private readonly lifetime;
    private readonly inFlight;
    private closing;
    private closingSnapshot;
    /**
     * Run one operation with caller and package cancellation combined.
     * @param callerSignal - cancellation owned by the caller.
     * @param operation - asynchronous work using the combined signal.
     * @returns the operation result.
     */
    run<T>(callerSignal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T>;
    /** Reject new operations and abort every operation that already entered. */
    beginClose(): void;
    /** Wait until the operations captured by {@link beginClose} have settled. */
    drain(): Promise<void>;
}
/** Resources participating in the package's ordered asynchronous shutdown. */
export interface LabelStudioShutdownResources {
    readonly operations: LabelStudioOperationGate;
    readonly disposeTools: () => void;
    readonly disposeBrowser?: () => Promise<void>;
    readonly disposeBroker: () => Promise<void>;
    readonly disposeRegistry: () => void;
    readonly disposeRuntime: () => Promise<void>;
}
/**
 * Close ingress, quiesce work, and then release stateful resources in order.
 * @param resources - resource-specific disposal callbacks owned by one plugin instance.
 */
export declare function disposeLabelStudioResources(resources: LabelStudioShutdownResources): Promise<void>;
//# sourceMappingURL=lifecycle.d.ts.map