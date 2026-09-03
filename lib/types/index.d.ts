/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module @deepseek-ai/dsh-label-studio
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.ts';
export { LabelStudioApi } from './api.ts';
export { LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError } from './api.ts';
export type { CreatePredictionInput, CreateProjectInput, CreatedPrediction, CreatedProject, ImportedTasks, LabelStudioAnnotationView, LabelStudioPredictionView, LabelStudioProjectView, LabelStudioSelectedTaskView, LabelStudioTask, LabelStudioTaskView, LabelStudioWebhookRegistration, UpdatedProjectLabelConfig, } from './api.ts';
export { validateSelectedTask } from './api.ts';
export { injectLabelStudioBootConfig } from './boot-config.ts';
export { LabelStudioChangeBroker } from './change-broker.ts';
export { labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPageInspectionId, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, } from './context-types.ts';
export { LabelStudioContextError, LabelStudioContextRegistry } from './context-registry.ts';
export type { LabelStudioContextErrorCode, LabelStudioLeaseBinding, } from './context-registry.ts';
export { registerLabelStudioContextRpc, resolvePersistentSessionIdentity } from './context-rpc.ts';
export type { LabelStudioContextRpcOptions } from './context-rpc.ts';
export { LabelStudioCurrentPageBroker, LabelStudioCurrentPageError } from './current-page-broker.ts';
export { LABEL_STUDIO_FRAME_BRIDGE_PATH, LabelStudioFrameProxy } from './frame-proxy.ts';
export type { LabelStudioFrameProxyAddress, LabelStudioFrameProxyOptions } from './frame-proxy.ts';
export { LabelStudioOperationContextError, LabelStudioOperationContextResolver, } from './operation-context.ts';
export type { LabelStudioCurrentPageReader, LabelStudioOperationKind, LabelStudioResolvedOperationContext, LabelStudioTargetRequirement, LabelStudioTargetSelector, } from './operation-context.ts';
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_CURRENT_PAGE_TIMEOUT_MS, DEFAULT_FRAME_PROXY_HTML_MAX_BYTES, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_PYTHON_EXECUTABLE, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_RECENT_PROJECT_LIMIT, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, DEFAULT_MANAGED_WEBHOOK_TIMEOUT_SECONDS, DEFAULT_WEBHOOK_MAX_BODY_BYTES, DEFAULT_WEBHOOK_MODE, DEFAULT_WEBHOOK_PATH, resolveConfig, } from './config.ts';
export type { LabelStudioLaunchMode, LabelStudioWebhookMode, ResolvedConfig } from './config.ts';
export { labelStudioPageContextSchema, labelStudioSessionContextDomainSpec, labelStudioSessionContextRecordSchema, } from './session-context-spec.ts';
export type { LabelStudioPageCommitReceipt, LabelStudioSessionContextRecord, LabelStudioSessionIdentity, } from './session-context-spec.ts';
export { LabelStudioSessionContextError, LabelStudioSessionContextStore, } from './session-context-store.ts';
export type { LabelStudioSessionContextStoreOptions } from './session-context-store.ts';
export { disposeLabelStudioResources, LabelStudioOperationClosedError, LabelStudioOperationGate, } from './lifecycle.ts';
export type { LabelStudioShutdownResources } from './lifecycle.ts';
export { LabelStudioRuntime } from './runtime.ts';
export type { LabelStudioStatus } from './runtime.ts';
export { registerLabelStudioTools } from './tools.ts';
export { LabelStudioWebhookBindingCoordinator } from './webhook-binding.ts';
export type { LabelStudioWebhookBindingOutcome } from './webhook-binding.ts';
export { createLabelStudioWebhookHandler, encodeWebhookSecret } from './webhook-ingress.ts';
export type { LabelStudioWebhookIngressOptions } from './webhook-ingress.ts';
export { LabelStudioWebhookRegistrar } from './webhook-registration.ts';
export type { CreateWebhookInput } from './webhook-registration.ts';
export { LABEL_STUDIO_WEBHOOK_ACTIONS, parseLabelStudioWebhook } from './webhook-payload.ts';
export type { LabelStudioWebhookEvent } from './webhook-payload.ts';
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