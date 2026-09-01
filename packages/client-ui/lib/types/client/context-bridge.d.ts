/** Typed browser caller for the Label Studio Connection channel. */
import type { ConnectionHandle, HostDescription, RpcError } from '@deepseek-ai/dsh-client-connection/client';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { LabelStudioActiveContext, LabelStudioActiveTarget, LabelStudioEventBatch, LabelStudioFocusCorrelationId, LabelStudioContextSourceId, LabelStudioLeaseOpenResult, LabelStudioLeaseSnapshot, LabelStudioNavigationSequence, LabelStudioRpcError, LabelStudioTargetReservation } from 'dsh-label-studio-workbench/protocol';
/** Browser dependencies for one logical Label Studio channel. */
export interface LabelStudioBridgeClientOptions {
    readonly connection: Pick<ConnectionHandle, 'rpc' | 'hostDescription'>;
    readonly channel: '/label-studio';
}
/** Deterministic failure returned by the Connection framework. */
export declare class LabelStudioFrameworkFailure extends Error {
    readonly error: RpcError;
    /** Stable failure category. */
    readonly kind = "framework";
    /** @param error - sanitized Connection failure. */
    constructor(error: RpcError);
}
/** Deterministic failure returned by the Label Studio plugin. */
export declare class LabelStudioPluginFailure extends Error {
    readonly error: LabelStudioRpcError;
    /** Stable failure category. */
    readonly kind = "plugin";
    /** @param error - sanitized plugin failure. */
    constructor(error: LabelStudioRpcError);
}
/** Dispatched request whose commit outcome cannot be inferred. */
export declare class LabelStudioTransportUnknown extends Error {
    readonly cause: unknown;
    /** Stable failure category. */
    readonly kind = "transport-unknown";
    /** @param cause - transport or response-validation failure. */
    constructor(cause: unknown);
}
/** Request cancelled before dispatch, or a cancelled read-only wait. */
export declare class LabelStudioCancellationFailure extends Error {
    /** Stable failure category. */
    readonly kind = "cancelled";
    constructor();
}
/** Classified Label Studio browser channel failure. */
export type LabelStudioBridgeFailure = LabelStudioFrameworkFailure | LabelStudioPluginFailure | LabelStudioTransportUnknown | LabelStudioCancellationFailure;
/**
 * Identify failures classified by the browser RPC bridge.
 * @param error - caught value.
 * @returns whether it is a classified bridge failure.
 */
export declare function isLabelStudioBridgeFailure(error: unknown): error is LabelStudioBridgeFailure;
/**
 * Identify a dispatched request whose commit outcome is unknown.
 * @param error - caught value.
 * @returns whether the dispatched outcome is unknown.
 */
export declare function isLabelStudioTransportUnknown(error: unknown): error is LabelStudioTransportUnknown;
/**
 * Identify a deterministic rejection from the Label Studio Host plugin.
 * @param error - caught value.
 * @returns whether the plugin rejected the request.
 */
export declare function isLabelStudioPluginFailure(error: unknown): error is LabelStudioPluginFailure;
/** Calls and validates the plugin's six fixed RPC endpoints. */
export declare class LabelStudioContextBridge {
    private readonly connection;
    private readonly channel;
    /** @param options - Connection source and fixed plugin channel. */
    constructor(options: LabelStudioBridgeClientOptions);
    /**
     * Read the current connected Host generation.
     * @returns connected Host description, or absence during disconnection.
     */
    currentHost(): HostDescription | undefined;
    /**
     * Subscribe to Host generation replacement and loss.
     * @param listener - generation-change callback.
     * @returns listener disposer.
     */
    onHostChanged(listener: () => void): () => void;
    /**
     * Open the selected Session for this browser page.
     * @param sessionId - selected DSH Session.
     * @param sourceId - browser page id.
     * @param signal - cancellation.
     * @returns opened lease and event replay baseline.
     */
    openLease(sessionId: SessionId, sourceId: LabelStudioContextSourceId, signal?: AbortSignal): Promise<LabelStudioLeaseOpenResult>;
    /**
     * Close an active browser lease without assuming the outcome after dispatch failure.
     * @param lease - active lease.
     * @param signal - cancellation.
     * @returns whether the Host closed that lease.
     */
    closeLease(lease: LabelStudioLeaseSnapshot, signal?: AbortSignal): Promise<boolean>;
    /**
     * Reserve the next controlled target revision.
     * @param lease - active lease.
     * @param navigationSequence - monotonic page sequence.
     * @param expectedTargetRevision - CAS revision.
     * @param signal - cancellation.
     * @returns Host reservation.
     */
    reserveTarget(lease: LabelStudioLeaseSnapshot, navigationSequence: LabelStudioNavigationSequence, expectedTargetRevision: number, signal?: AbortSignal): Promise<LabelStudioTargetReservation>;
    /**
     * Publish a target after its URL has committed in the browser.
     * @param lease - active lease.
     * @param targetRevision - reserved revision.
     * @param target - controlled target.
     * @param signal - cancellation.
     * @returns committed context.
     */
    publishTarget(lease: LabelStudioLeaseSnapshot, targetRevision: number, target: LabelStudioActiveTarget, signal?: AbortSignal): Promise<LabelStudioActiveContext>;
    /**
     * Wait for events after the observed revision.
     * @param lease - active lease.
     * @param afterRevision - observed event cursor.
     * @param signal - required wait cancellation.
     * @returns next event batch.
     */
    waitEvents(lease: LabelStudioLeaseSnapshot, afterRevision: number, signal: AbortSignal): Promise<LabelStudioEventBatch>;
    /**
     * Confirm a Host focus request after its URL has committed in the browser.
     * @param lease - active lease.
     * @param correlationId - focus receipt.
     * @param targetRevision - focus reservation revision.
     * @param target - applied target.
     * @param signal - cancellation.
     * @returns committed context.
     */
    acknowledgeFocus(lease: LabelStudioLeaseSnapshot, correlationId: LabelStudioFocusCorrelationId, targetRevision: number, target: LabelStudioActiveTarget, signal?: AbortSignal): Promise<LabelStudioActiveContext>;
    private mutate;
    private call;
}
//# sourceMappingURL=context-bridge.d.ts.map