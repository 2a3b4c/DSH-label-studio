/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module @deepseek-ai/dsh-label-studio
 */
import { LabelStudioApi } from "./api.js";
import { injectLabelStudioBootConfig } from "./boot-config.js";
import { LabelStudioChangeBroker } from "./change-broker.js";
import { resolveConfig } from "./config.js";
import { LabelStudioContextRegistry } from "./context-registry.js";
import { registerLabelStudioContextRpc } from "./context-rpc.js";
import { disposeLabelStudioResources, LabelStudioOperationGate } from "./lifecycle.js";
import { LabelStudioRuntime } from "./runtime.js";
import { LabelStudioSessionContextStore } from "./session-context-store.js";
import { registerLabelStudioTools } from "./tools.js";
export { LabelStudioApi } from "./api.js";
export { LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError } from "./api.js";
export { validateSelectedTask } from "./api.js";
export { injectLabelStudioBootConfig } from "./boot-config.js";
export { LabelStudioChangeBroker } from "./change-broker.js";
export { labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, } from "./context-types.js";
export { LabelStudioContextError, LabelStudioContextRegistry } from "./context-registry.js";
export { registerLabelStudioContextRpc } from "./context-rpc.js";
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_PYTHON_EXECUTABLE, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_RECENT_PROJECT_LIMIT, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, resolveConfig, } from "./config.js";
export { labelStudioPageContextSchema, labelStudioSessionContextDomainSpec, labelStudioSessionContextRecordSchema, } from "./session-context-spec.js";
export { LabelStudioSessionContextError, LabelStudioSessionContextStore, } from "./session-context-store.js";
export { disposeLabelStudioResources, LabelStudioOperationClosedError, LabelStudioOperationGate, } from "./lifecycle.js";
export { LabelStudioRuntime } from "./runtime.js";
export { registerLabelStudioTools } from "./tools.js";
/** Cordis plugin name. */
export const name = 'label-studio';
/** Required Host services for process ownership, REST authentication, and tools. */
export const inject = ['tools', 'subprocess', 'credentials', 'storageDomain'];
/**
 * Start or adopt Label Studio, register the REST tools, and expose its URL to
 * the optional browser carrier.
 * @param ctx - Host context carrying the required capability services.
 * @param config - validated or programmatically supplied plugin config.
 */
export async function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const operations = new LabelStudioOperationGate();
    const sessionContexts = await LabelStudioSessionContextStore.open(ctx, {
        recentProjectLimit: resolved.recentProjectLimit,
    });
    const runtime = new LabelStudioRuntime(ctx.subprocess, resolved);
    try {
        await runtime.start();
    }
    catch (error) {
        await sessionContexts.close();
        throw error;
    }
    const api = new LabelStudioApi(resolved.baseUrl, resolved.refreshTokenCredential, ctx.credentials, resolved.restResponseMaxBytes);
    const contexts = new LabelStudioContextRegistry(resolved.contextLeaseTtlMs);
    const changes = new LabelStudioChangeBroker(contexts, resolved.eventHistorySize, sessionContexts);
    const disposeTools = registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, {
        activeTaskMaxBytes: resolved.activeTaskMaxBytes,
        focusAckTimeoutMs: resolved.focusAckTimeoutMs,
    });
    let activeBrowserDisposer;
    ctx.inject(['connection', 'sessions', 'sessionPersistence', 'webServer'], (browserCtx) => {
        browserCtx.effect(() => {
            const removeBootConfig = browserCtx.webServer.tapIndex(html => injectLabelStudioBootConfig(html, {
                baseUrl: resolved.baseUrl,
                contextOpenRetryMs: resolved.contextOpenRetryMs,
                contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
                eventHistorySize: resolved.eventHistorySize,
            }));
            const removeRpc = registerLabelStudioContextRpc(browserCtx, contexts, changes, sessionContexts, operations, { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs });
            let disposed = false;
            const disposeBrowser = async () => {
                if (disposed)
                    return;
                disposed = true;
                await removeRpc();
                removeBootConfig();
                if (activeBrowserDisposer === disposeBrowser)
                    activeBrowserDisposer = undefined;
            };
            activeBrowserDisposer = disposeBrowser;
            return disposeBrowser;
        }, 'label-studio: browser context channel');
    });
    ctx.effect(() => async () => {
        await disposeLabelStudioResources({
            operations,
            disposeTools,
            ...(activeBrowserDisposer === undefined ? {} : { disposeBrowser: activeBrowserDisposer }),
            disposeBroker: () => changes.dispose(),
            disposeRegistry: () => { contexts.dispose(); },
            disposeRuntime: () => runtime.dispose(),
            disposeStore: () => sessionContexts.close(),
        });
    }, 'label-studio: ordered package shutdown');
}
//# sourceMappingURL=index.js.map