/** Model-facing Label Studio status, project, task-import, and prediction tools. */
import type { Context } from '@deepseek-ai/cordis';
import type { LabelStudioApi } from './api.ts';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import type { LabelStudioContextRegistry } from './context-registry.ts';
import type { LabelStudioOperationGate } from './lifecycle.ts';
import type { LabelStudioOperationContextResolver } from './operation-context.ts';
import type { LabelStudioRuntime } from './runtime.ts';
import type { ResolvedConfig } from './config.ts';
import type { LabelStudioSessionContextStore } from './session-context-store.ts';
/**
 * Register all Label Studio model tools for one runtime and REST client.
 * @param ctx - Host context carrying the model tool registry.
 * @param runtime - local service status provider.
 * @param api - authenticated Label Studio REST client.
 * @param contexts - Session context registry reserved for context-aware tools.
 * @param changes - browser event broker reserved for mutation notifications.
 * @param operations - shared package cancellation and quiescence gate.
 * @param resolver - shared explicit, binding, and current-page target resolver.
 * @param bindings - binding revision reader used before target-free project creation.
 * @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
 * @returns disposer unregistering every tool in reverse order.
 */
export declare function registerLabelStudioTools(ctx: Context, runtime: LabelStudioRuntime, api: LabelStudioApi, contexts: LabelStudioContextRegistry, changes: LabelStudioChangeBroker, operations: LabelStudioOperationGate, resolver: LabelStudioOperationContextResolver, bindings: Pick<LabelStudioSessionContextStore, 'readBinding'>, policy: Pick<ResolvedConfig, 'activeTaskMaxBytes' | 'focusAckTimeoutMs'> & {
    readonly ensureWebhook?: (signal: AbortSignal) => Promise<void>;
}): () => void;
//# sourceMappingURL=tools.d.ts.map