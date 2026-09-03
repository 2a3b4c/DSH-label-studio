/** Reconciled ownership of Label Studio project Webhooks. */
import type { LabelStudioApi, LabelStudioWebhookRegistration } from './api.ts';
import type { LabelStudioSessionContextStore } from './session-context-store.ts';
import type { LabelStudioWebhookEvent } from './webhook-payload.ts';
/** Explicit fields sent when creating the plugin-owned organization Webhook. */
export interface CreateWebhookInput {
    readonly url: string;
    readonly actions: readonly LabelStudioWebhookEvent['action'][];
    readonly headers: Readonly<Record<string, string>>;
    readonly is_active: true;
    readonly project: LabelStudioWebhookRegistration['projectId'];
    readonly send_for_all_actions: false;
    readonly send_payload: true;
}
/** Header identifying registrations owned by one durable plugin installation. */
export declare const LABEL_STUDIO_WEBHOOK_OWNER_HEADER = "X-DSH-Label-Studio-Owner";
/** Header authenticating deliveries from the plugin-created registration. */
export declare const LABEL_STUDIO_WEBHOOK_SECRET_HEADER = "X-DSH-Label-Studio-Webhook";
type Api = Pick<LabelStudioApi, 'listProjectIds' | 'listWebhookActions' | 'listWebhooks' | 'createWebhook' | 'deleteWebhook'>;
type Store = Pick<LabelStudioSessionContextStore, 'ensureWebhookOwnerId'>;
/** Maintains one plugin-owned Webhook for each existing Label Studio project. */
export declare class LabelStudioWebhookRegistrar {
    private readonly api;
    private readonly store;
    private readonly ownerCandidate;
    private installed;
    private installing;
    /**
     * @param api - authenticated Webhook REST operations.
     * @param store - persistent singleton owner storage.
     * @param ownerCandidate - UUID generator used only when no durable owner exists.
     */
    constructor(api: Api, store: Store, ownerCandidate?: () => string);
    /**
     * Reconcile stale owned registrations and install one current registration.
     * @param callbackUrl - DSH WebServer callback URL.
     * @param secret - in-memory delivery authentication value.
     * @param signal - package or caller cancellation.
     * @returns the exact installed registrations.
     */
    ensureInstalled(callbackUrl: string, secret: Uint8Array, signal: AbortSignal): Promise<readonly LabelStudioWebhookRegistration[]>;
    /** Delete only the exact registrations installed by this process. */
    dispose(signal?: AbortSignal): Promise<void>;
    private install;
    private removeOwned;
}
export {};
//# sourceMappingURL=webhook-registration.d.ts.map