/** Session-scoped ownership and target state for the Label Studio browser surface. */
import type { LabelStudioActiveContext, LabelStudioActiveTarget, LabelStudioContextLeaseId, LabelStudioContextSourceId, LabelStudioFocusCorrelationId, LabelStudioLeaseOpenResult, LabelStudioLeaseSnapshot, LabelStudioNavigationSequence, LabelStudioTargetReservation, LabelStudioTargetState } from '@deepseek-ai/dsh-label-studio-protocol';
type SessionId = LabelStudioActiveContext['sessionId'];
/** Stable failure categories mapped to RPC outcomes by the transport layer. */
export type LabelStudioContextErrorCode = 'invalid-request' | 'session-not-found' | 'lease-conflict' | 'lease-expired' | 'stale-generation' | 'stale-revision' | 'future-revision' | 'focus-conflict' | 'focus-not-found';
/** Domain failure raised by the synchronous context state machine. */
export declare class LabelStudioContextError extends Error {
    readonly code: LabelStudioContextErrorCode;
    readonly retryAfterMs?: number | undefined;
    /**
     * Create a stable context failure.
     * @param code - machine-readable failure category.
     * @param message - operator-facing explanation without request data.
     * @param retryAfterMs - exact remaining lease duration for a conflict.
     */
    constructor(code: LabelStudioContextErrorCode, message: string, retryAfterMs?: number | undefined);
}
/** Host-only association between a Session, source, lease, and target state. */
export interface LabelStudioLeaseBinding {
    readonly sessionId: SessionId;
    readonly sourceId: LabelStudioContextSourceId;
    readonly lease: LabelStudioLeaseSnapshot;
    readonly context: LabelStudioTargetState;
}
/** Owns one expiring Label Studio browser lease per DSH Session. */
export declare class LabelStudioContextRegistry {
    private readonly leaseTtlMs;
    private readonly clock;
    private readonly bySession;
    private readonly byLease;
    private readonly lastGeneration;
    private readonly listeners;
    private readonly deletingSessions;
    private disposed;
    /**
     * Create an empty registry.
     * @param leaseTtlMs - positive safe-integer lifetime applied by open and renew.
     * @param clock - epoch-millisecond clock used for deterministic expiry.
     */
    constructor(leaseTtlMs: number, clock?: () => number);
    /**
     * Open a new Session lease or idempotently recover the current source's lease.
     * @param sessionId - persistent DSH Session identity already verified by the caller.
     * @param sourceId - browser page UUID.
     * @param replayBaseline - broker revision captured before creating the lease.
     * @returns the immutable lease and its original replay baseline.
     */
    openLease(sessionId: SessionId, sourceId: LabelStudioContextSourceId, replayBaseline: number): Pick<LabelStudioLeaseOpenResult, 'lease' | 'replayBaseline'>;
    /**
     * Reserve the next target revision for a browser navigation.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @param navigationSequence - browser-monotonic navigation sequence.
     * @param expectedTargetRevision - compare-and-swap revision observed by the browser.
     * @returns the immutable reservation receipt.
     */
    reserveBrowserTarget(leaseId: LabelStudioContextLeaseId, generation: number, navigationSequence: LabelStudioNavigationSequence, expectedTargetRevision: number): LabelStudioTargetReservation;
    /**
     * Replace the current target with vacant state for a browser navigation.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @param navigationSequence - browser-monotonic navigation sequence.
     * @param expectedTargetRevision - compare-and-swap revision observed before clearing.
     * @returns the immutable vacant state, including the incremented target revision.
     */
    clearBrowserTarget(leaseId: LabelStudioContextLeaseId, generation: number, navigationSequence: LabelStudioNavigationSequence, expectedTargetRevision: number): LabelStudioTargetState;
    /**
     * Reserve the next target revision for a Host focus request.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @param correlationId - Host-issued idempotency key.
     * @returns the immutable reservation receipt.
     */
    reserveFocusTarget(leaseId: LabelStudioContextLeaseId, generation: number, correlationId: LabelStudioFocusCorrelationId): LabelStudioTargetReservation;
    /**
     * Convert the current reservation into a committed target.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @param targetRevision - revision returned by the reservation operation.
     * @param target - validated Label Studio identifiers to commit.
     * @returns the immutable active context.
     */
    publishTarget(leaseId: LabelStudioContextLeaseId, generation: number, targetRevision: number, target: LabelStudioActiveTarget): LabelStudioActiveContext;
    /**
     * Retire the exact pending focus without advancing the target revision.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @param correlationId - focus id to retire.
     * @returns the resulting immutable target state.
     */
    retireFocusTarget(leaseId: LabelStudioContextLeaseId, generation: number, correlationId: LabelStudioFocusCorrelationId): LabelStudioTargetState;
    /**
     * Inspect the current lease without extending its expiry.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @returns the immutable Host-only binding.
     */
    inspectLease(leaseId: LabelStudioContextLeaseId, generation: number): LabelStudioLeaseBinding;
    /**
     * Extend the current lease from the current clock value.
     * @param leaseId - current Host-issued lease id.
     * @param generation - current lease generation.
     * @returns the renewed immutable Host-only binding.
     */
    renew(leaseId: LabelStudioContextLeaseId, generation: number): LabelStudioLeaseBinding;
    /**
     * Close only the exact active lease generation.
     * @param leaseId - Host-issued lease id.
     * @param generation - lease generation to close.
     * @returns true when this call removed the active lease; false when it was already absent.
     */
    closeLease(leaseId: LabelStudioContextLeaseId, generation: number): boolean;
    /**
     * Read a Session's current lease, including a vacant or reserved target.
     * @param sessionId - persistent DSH Session identity.
     * @returns the immutable binding, or undefined after close or expiry.
     */
    getLease(sessionId: SessionId): LabelStudioLeaseBinding | undefined;
    /**
     * Read a Session's committed target while its lease remains live.
     * @param sessionId - persistent DSH Session identity.
     * @returns the immutable active context, or undefined without a committed target.
     */
    getLive(sessionId: SessionId): LabelStudioActiveContext | undefined;
    /** Return every current, unexpired Session lease id. */
    sessionIds(): readonly SessionId[];
    /**
     * Subscribe to authoritative lease removal.
     * @param listener - callback isolated from cleanup and sibling callbacks.
     * @returns an idempotent unsubscribe function.
     */
    onLeaseEnded(listener: (sessionId: SessionId) => void): () => void;
    /**
     * Remove all context state for a deleted persistent Session.
     * @param sessionId - deleted DSH Session identity.
     */
    deleteSession(sessionId: SessionId): void;
    /** Remove every lease and listener, permanently rejecting later mutations. */
    dispose(): void;
    private assertUsable;
    private nextRevision;
    private recordForSession;
    private recordForLease;
    private requireLease;
    private remove;
    private notifyEnded;
    private leaseSnapshot;
    private openSnapshot;
    private reservationSnapshot;
    private bindingSnapshot;
    private activeSnapshot;
}
export {};
//# sourceMappingURL=context-registry.d.ts.map