/** Safe mapping from Label Studio Webhooks to existing Session bindings. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import type { LabelStudioCurrentPageBroker } from './current-page-broker.ts';
import type { LabelStudioSessionContextStore } from './session-context-store.ts';
import type { LabelStudioSessionIdentity } from './session-context-spec.ts';
import type { LabelStudioWebhookEvent } from './webhook-payload.ts';
/** Result of matching or reconciling one authenticated Webhook. */
export type LabelStudioWebhookBindingOutcome = {
    readonly kind: 'matched-existing';
    readonly sessionIds: readonly SessionId[];
} | {
    readonly kind: 'bound-from-live-page';
    readonly sessionId: SessionId;
} | {
    readonly kind: 'reconciled-deletion';
    readonly affectedSessionIds: readonly SessionId[];
} | {
    readonly kind: 'unassigned';
    readonly reason: 'no-matching-binding';
};
type Store = Pick<LabelStudioSessionContextStore, 'listBindings' | 'readBinding' | 'commitBinding' | 'reconcileProjectDeleted' | 'reconcileTasksDeleted'>;
type Broker = Pick<LabelStudioChangeBroker, 'publishBindingChanged' | 'publishWebhookUnassigned'>;
/** Live-browser dependencies used only to attribute an otherwise unbound event. */
export interface LabelStudioWebhookLivePageOptions {
    /** Return every current DSH Session iframe lease. */
    readonly sessionIds: () => readonly SessionId[];
    /** Resolve one current lease to its exact durable Session lifecycle. */
    readonly resolveIdentity: (sessionId: SessionId, signal: AbortSignal) => Promise<LabelStudioSessionIdentity>;
    /** Perform the existing one-shot iframe page inspection. */
    readonly currentPages: Pick<LabelStudioCurrentPageBroker, 'request'>;
    /** Positive deadline for each concurrent iframe inspection. */
    readonly timeoutMs: number;
}
/** Applies deletion events and otherwise confirms only pre-existing exact bindings. */
export declare class LabelStudioWebhookBindingCoordinator {
    private readonly store;
    private readonly broker;
    private readonly livePages?;
    /**
     * @param store - durable binding reader and deletion reconciler.
     * @param broker - browser status publisher.
     */
    constructor(store: Store, broker: Broker, livePages?: LabelStudioWebhookLivePageOptions | undefined);
    /**
     * Synchronize one finite authenticated event.
     * @param event - identifier-only Webhook event.
     * @returns matching or deletion outcome without creating a binding.
     */
    accept(event: LabelStudioWebhookEvent, signal?: AbortSignal): Promise<LabelStudioWebhookBindingOutcome>;
    private match;
    private matchingSessionIds;
    private bindAnnotationFromLivePage;
    private unassigned;
    private publishChanges;
}
export {};
//# sourceMappingURL=webhook-binding.d.ts.map