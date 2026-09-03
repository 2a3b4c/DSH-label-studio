/** Authenticated Connection RPC handlers for browser context synchronization. */
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import { type LabelStudioCurrentPageBroker } from './current-page-broker.ts';
import { type LabelStudioContextRegistry } from './context-registry.ts';
import { type LabelStudioOperationGate } from './lifecycle.ts';
import type { LabelStudioSessionIdentity } from './session-context-spec.ts';
import { type LabelStudioSessionContextStore } from './session-context-store.ts';
/** Long-poll configuration captured by one RPC registrar. */
export interface LabelStudioContextRpcOptions {
    /** Positive duration of one event wait. */
    readonly eventWaitTimeoutMs: number;
}
/**
 * Register the Label Studio channel on Connection's loopback trust policy.
 * @param ctx - Host context carrying Connection, Session, and persistence services.
 * @param registry - synchronous lease and target state.
 * @param broker - Session event history and focus acknowledgements.
 * @param sessionContexts - durable page state for exact Session lifecycles.
 * @param operations - shared package operation gate.
 * @param options - bounded long-poll settings.
 * @param currentPages - optional one-shot page broker during staged assembly.
 * @returns asynchronous disposer that closes the route before removing it.
 */
export declare function registerLabelStudioContextRpc(ctx: Context, registry: LabelStudioContextRegistry, broker: LabelStudioChangeBroker, sessionContexts: LabelStudioSessionContextStore, operations: LabelStudioOperationGate, options: LabelStudioContextRpcOptions, currentPages?: LabelStudioCurrentPageBroker): () => Promise<void>;
/**
 * Resolve one current or persisted Session to its exact lifecycle identity.
 * @param ctx - Session services used for live and persisted lookup.
 * @param sessionId - verified opaque Session id.
 * @param signal - cancellation for persistence lookup.
 * @param registry - lease registry cleared when the Session no longer exists.
 * @param broker - event state cleared when the Session no longer exists.
 * @param sessionContexts - durable plugin state cleared for a missing Session.
 * @returns the exact Session id and creation time.
 */
export declare function resolvePersistentSessionIdentity(ctx: Context, sessionId: SessionId, signal: AbortSignal, registry: LabelStudioContextRegistry, broker: LabelStudioChangeBroker, sessionContexts: LabelStudioSessionContextStore): Promise<LabelStudioSessionIdentity>;
//# sourceMappingURL=context-rpc.d.ts.map