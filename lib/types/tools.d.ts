/** Model-facing Label Studio status, project, task-import, and prediction tools. */
import type { Context } from '@deepseek-ai/cordis';
import type { LabelStudioApi } from './api.ts';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import type { LabelStudioContextRegistry } from './context-registry.ts';
import type { LabelStudioOperationGate } from './lifecycle.ts';
import type { LabelStudioRuntime } from './runtime.ts';
import type { ResolvedConfig } from './config.ts';
/**
 * Register all Label Studio model tools for one runtime and REST client.
 * @param ctx - Host context carrying the model tool registry.
 * @param runtime - local service status provider.
 * @param api - authenticated Label Studio REST client.
 * @param contexts - Session context registry reserved for context-aware tools.
 * @param changes - browser event broker reserved for mutation notifications.
 * @param operations - shared package cancellation and quiescence gate.
 * @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
 * @returns disposer unregistering every tool in reverse order.
 */
export declare function registerLabelStudioTools(ctx: Context, runtime: LabelStudioRuntime, api: LabelStudioApi, contexts: LabelStudioContextRegistry, changes: LabelStudioChangeBroker, operations: LabelStudioOperationGate, policy: Pick<ResolvedConfig, 'activeTaskMaxBytes' | 'focusAckTimeoutMs'>): () => void;
//# sourceMappingURL=tools.d.ts.map