/** Authenticated bounded HTTP ingress for Label Studio Webhooks. */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { LabelStudioWebhookBindingCoordinator } from './webhook-binding.ts';
/** HTTP route limits and in-memory authentication value. */
export interface LabelStudioWebhookIngressOptions {
    readonly path: string;
    readonly maxBodyBytes: number;
    readonly secret: Uint8Array;
}
/** Convert secret bytes to the exact opaque header value installed in Label Studio. */
export declare function encodeWebhookSecret(secret: Uint8Array): string;
/**
 * Create an exact-route handler that authenticates before parsing or synchronizing an event.
 * @param coordinator - durable binding synchronization owner.
 * @param options - request limit, route path, and ephemeral secret.
 * @returns Node HTTP handler owning every response.
 */
export declare function createLabelStudioWebhookHandler(coordinator: LabelStudioWebhookBindingCoordinator, options: LabelStudioWebhookIngressOptions): WebRoute['handler'];
//# sourceMappingURL=webhook-ingress.d.ts.map