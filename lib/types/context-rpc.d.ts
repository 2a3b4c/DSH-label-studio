/** Loopback-only Connection RPC handlers for browser context synchronization. */
import type { Context } from '@deepseek-ai/cordis';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import { type LabelStudioContextRegistry } from './context-registry.ts';
import { type LabelStudioOperationGate } from './lifecycle.ts';
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
 * @param operations - shared package operation gate.
 * @param options - bounded long-poll settings.
 * @returns asynchronous disposer that closes the route before removing it.
 */
export declare function registerLabelStudioContextRpc(ctx: Context, registry: LabelStudioContextRegistry, broker: LabelStudioChangeBroker, operations: LabelStudioOperationGate, options: LabelStudioContextRpcOptions): () => Promise<void>;
//# sourceMappingURL=context-rpc.d.ts.map