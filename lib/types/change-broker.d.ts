/** Session-isolated revision history, long polling, and focus acknowledgements. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioActiveContext, LabelStudioActiveTarget, LabelStudioBrowserEvent, LabelStudioChangeReason, LabelStudioContextLeaseId, LabelStudioFocusCorrelationId, LabelStudioTargetReservation, LabelStudioTaskId } from 'dsh-label-studio-workbench/protocol';
import { type LabelStudioContextRegistry } from './context-registry.ts';
/** Host-only event suffix returned before the RPC layer adds current context. */
export interface LabelStudioBrokerBatch {
    readonly events: readonly LabelStudioBrowserEvent[];
    readonly latestRevision: number;
    readonly resetRequired: boolean;
}
/** Maintains the browser event stream and focus receipt for each DSH Session. */
export declare class LabelStudioChangeBroker {
    private readonly registry;
    private readonly historySize;
    private readonly states;
    private readonly unsubscribeLeaseEnded;
    private disposed;
    /**
     * Create a broker and subscribe to authoritative lease removal.
     * @param registry - context registry committing focus targets.
     * @param historySize - positive bounded event count retained per Session.
     */
    constructor(registry: LabelStudioContextRegistry, historySize: number);
    /**
     * Publish a successful task mutation.
     * @param sessionId - Session whose controlled task changed.
     * @param taskId - changed Label Studio task.
     * @param reason - stable mutation reason.
     * @returns the immutable published event.
     */
    publishTaskChanged(sessionId: SessionId, taskId: LabelStudioTaskId, reason: LabelStudioChangeReason): Extract<LabelStudioBrowserEvent, {
        kind: 'task-changed';
    }>;
    /**
     * Read the current event cursor without modifying the Session.
     * @param sessionId - DSH Session identity.
     * @returns current revision, or zero before the first event.
     */
    latestRevision(sessionId: SessionId): number;
    /**
     * Retire the current focus receipt after a newer successful reservation.
     * @param sessionId - Session whose old receipt is superseded.
     */
    retireFocus(sessionId: SessionId): void;
    /**
     * Delete all event and pending state for a Session.
     * @param sessionId - persistent Session identity.
     */
    deleteSession(sessionId: SessionId): void;
    /**
     * Publish one focus request and await its matching browser ACK.
     * @param sessionId - Session owning the browser lease.
     * @param correlationId - Host-generated idempotency key.
     * @param reservation - registry focus reservation.
     * @param target - target the browser must apply.
     * @param timeoutMs - positive ACK deadline duration.
     * @param signal - caller/package cancellation.
     * @returns committed active context after ACK.
     */
    requestFocus(sessionId: SessionId, correlationId: LabelStudioFocusCorrelationId, reservation: LabelStudioTargetReservation, target: LabelStudioActiveTarget, timeoutMs: number, signal: AbortSignal): Promise<LabelStudioActiveContext>;
    /**
     * Wait for events after a Session cursor.
     * @param sessionId - DSH Session identity.
     * @param afterRevision - last continuously observed event revision.
     * @param timeoutMs - positive long-poll deadline duration.
     * @param signal - cancellation signal.
     * @returns missing event suffix or an empty timeout batch.
     */
    wait(sessionId: SessionId, afterRevision: number, timeoutMs: number, signal: AbortSignal): Promise<LabelStudioBrokerBatch>;
    /**
     * Commit or recover the exact matching focus ACK.
     * @param leaseId - current browser lease id.
     * @param generation - current lease generation.
     * @param correlationId - focus request identity.
     * @param targetRevision - reserved target revision.
     * @param target - browser-applied target.
     * @returns committed active context.
     */
    acknowledgeFocus(leaseId: LabelStudioContextLeaseId, generation: number, correlationId: LabelStudioFocusCorrelationId, targetRevision: number, target: LabelStudioActiveTarget): LabelStudioActiveContext;
    /** Unsubscribe, reject pending work, and clear all event histories. */
    dispose(): Promise<void>;
    private state;
    private assertUsable;
    private nextRevision;
    private append;
    private wake;
    private snapshot;
    private cancelPending;
}
//# sourceMappingURL=change-broker.d.ts.map