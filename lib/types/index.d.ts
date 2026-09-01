/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module dsh-label-studio-workbench
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.ts';
export { LabelStudioApi } from './api.ts';
export type { CreatePredictionInput, CreateProjectInput, CreatedPrediction, CreatedProject, ImportedTasks, LabelStudioAnnotationView, LabelStudioPredictionView, LabelStudioProjectView, LabelStudioSelectedTaskView, LabelStudioTask, LabelStudioTaskView, } from './api.ts';
export { validateSelectedTask } from './api.ts';
export { injectLabelStudioBootConfig } from './boot-config.ts';
export { LabelStudioChangeBroker } from './change-broker.ts';
export { labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, } from './context-types.ts';
export { LabelStudioContextError, LabelStudioContextRegistry } from './context-registry.ts';
export type { LabelStudioContextErrorCode, LabelStudioLeaseBinding, } from './context-registry.ts';
export { registerLabelStudioContextRpc } from './context-rpc.ts';
export type { LabelStudioContextRpcOptions } from './context-rpc.ts';
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONDA_ENVIRONMENT, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_EXECUTABLE, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, resolveConfig, } from './config.ts';
export type { LabelStudioLaunchMode, ResolvedConfig } from './config.ts';
export { disposeLabelStudioResources, LabelStudioOperationClosedError, LabelStudioOperationGate, } from './lifecycle.ts';
export type { LabelStudioShutdownResources } from './lifecycle.ts';
export { LabelStudioRuntime } from './runtime.ts';
export type { LabelStudioStatus } from './runtime.ts';
export { registerLabelStudioTools } from './tools.ts';
/** Cordis plugin name. */
export declare const name = "label-studio";
/** Required Host services for process ownership, REST authentication, and tools. */
export declare const inject: string[];
/**
 * Start or adopt Label Studio, register the REST tools, and expose its URL to
 * the optional browser carrier.
 * @param ctx - Host context carrying the required capability services.
 * @param config - validated or programmatically supplied plugin config.
 */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map