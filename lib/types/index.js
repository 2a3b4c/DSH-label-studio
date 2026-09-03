/**
 * Label Studio plugin: managed local process, authenticated REST tools, and
 * browser workbench boot configuration.
 * @module @deepseek-ai/dsh-label-studio
 */
import { randomBytes } from 'node:crypto';
import { LabelStudioApi } from "./api.js";
import { injectLabelStudioBootConfig } from "./boot-config.js";
import { LabelStudioChangeBroker } from "./change-broker.js";
import { resolveConfig } from "./config.js";
import { LabelStudioContextRegistry } from "./context-registry.js";
import { registerLabelStudioContextRpc, resolvePersistentSessionIdentity } from "./context-rpc.js";
import { LabelStudioCurrentPageBroker } from "./current-page-broker.js";
import { LabelStudioFrameProxy } from "./frame-proxy.js";
import { disposeLabelStudioResources, LabelStudioOperationGate } from "./lifecycle.js";
import { LabelStudioOperationContextResolver } from "./operation-context.js";
import { LabelStudioRuntime } from "./runtime.js";
import { LabelStudioSessionContextStore } from "./session-context-store.js";
import { registerLabelStudioTools } from "./tools.js";
import { LabelStudioWebhookBindingCoordinator } from "./webhook-binding.js";
import { createLabelStudioWebhookHandler } from "./webhook-ingress.js";
import { LabelStudioWebhookRegistrar } from "./webhook-registration.js";
const LABEL_STUDIO_INSPECTION_PROTOCOL = 'dsh-label-studio-page/v1';
export { LabelStudioApi } from "./api.js";
export { LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError } from "./api.js";
export { validateSelectedTask } from "./api.js";
export { injectLabelStudioBootConfig } from "./boot-config.js";
export { LabelStudioChangeBroker } from "./change-broker.js";
export { labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPageInspectionId, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, } from "./context-types.js";
export { LabelStudioContextError, LabelStudioContextRegistry } from "./context-registry.js";
export { registerLabelStudioContextRpc, resolvePersistentSessionIdentity } from "./context-rpc.js";
export { LabelStudioCurrentPageBroker, LabelStudioCurrentPageError } from "./current-page-broker.js";
export { LABEL_STUDIO_FRAME_BRIDGE_PATH, LabelStudioFrameProxy } from "./frame-proxy.js";
export { LabelStudioOperationContextError, LabelStudioOperationContextResolver, } from "./operation-context.js";
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_CURRENT_PAGE_TIMEOUT_MS, DEFAULT_FRAME_PROXY_HTML_MAX_BYTES, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_PYTHON_EXECUTABLE, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_RECENT_PROJECT_LIMIT, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, DEFAULT_MANAGED_WEBHOOK_TIMEOUT_SECONDS, DEFAULT_WEBHOOK_MAX_BODY_BYTES, DEFAULT_WEBHOOK_MODE, DEFAULT_WEBHOOK_PATH, resolveConfig, } from "./config.js";
export { labelStudioPageContextSchema, labelStudioSessionContextDomainSpec, labelStudioSessionContextRecordSchema, } from "./session-context-spec.js";
export { LabelStudioSessionContextError, LabelStudioSessionContextStore, } from "./session-context-store.js";
export { disposeLabelStudioResources, LabelStudioOperationClosedError, LabelStudioOperationGate, } from "./lifecycle.js";
export { LabelStudioRuntime } from "./runtime.js";
export { registerLabelStudioTools } from "./tools.js";
export { LabelStudioWebhookBindingCoordinator } from "./webhook-binding.js";
export { createLabelStudioWebhookHandler, encodeWebhookSecret } from "./webhook-ingress.js";
export { LabelStudioWebhookRegistrar } from "./webhook-registration.js";
export { LABEL_STUDIO_WEBHOOK_ACTIONS, parseLabelStudioWebhook } from "./webhook-payload.js";
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
    const frameProxy = new LabelStudioFrameProxy({
        upstreamBaseUrl: resolved.baseUrl,
        inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
        htmlMaxBytes: resolved.frameProxyHtmlMaxBytes,
    });
    let frameAddress;
    try {
        frameAddress = await frameProxy.start();
    }
    catch (error) {
        await Promise.allSettled([runtime.dispose(), sessionContexts.close()]);
        throw error;
    }
    const api = new LabelStudioApi(resolved.baseUrl, resolved.refreshTokenCredential, ctx.credentials, resolved.restResponseMaxBytes);
    const contexts = new LabelStudioContextRegistry(resolved.contextLeaseTtlMs);
    const changes = new LabelStudioChangeBroker(contexts, resolved.eventHistorySize, sessionContexts);
    const currentPages = new LabelStudioCurrentPageBroker(contexts, changes);
    const resolver = new LabelStudioOperationContextResolver(sessionContexts, currentPages, api, resolved.currentPageTimeoutMs);
    const webhookRegistrar = new LabelStudioWebhookRegistrar(api, sessionContexts);
    let webhookStatus = resolved.webhookMode === 'off'
        ? 'disabled'
        : 'unavailable';
    let ensureWebhook;
    const disposeTools = registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, resolver, sessionContexts, {
        activeTaskMaxBytes: resolved.activeTaskMaxBytes,
        focusAckTimeoutMs: resolved.focusAckTimeoutMs,
        ensureWebhook: async (signal) => {
            if (ensureWebhook === undefined)
                return;
            try {
                await ensureWebhook(signal);
                webhookStatus = 'ready';
                changes.publishWebhookStatus('ready');
            }
            catch (error) {
                webhookStatus = 'unavailable';
                changes.publishWebhookStatus('unavailable');
                if (resolved.webhookMode === 'required')
                    throw error;
            }
        },
    });
    let activeBrowserDisposer;
    ctx.inject(['connection', 'sessions', 'sessionPersistence', 'webServer'], (browserCtx) => {
        browserCtx.effect(async () => {
            let removeWebhookIngress;
            if (resolved.webhookMode !== 'off') {
                const webhookCoordinator = new LabelStudioWebhookBindingCoordinator(sessionContexts, changes, {
                    sessionIds: () => contexts.sessionIds(),
                    resolveIdentity: (sessionId, signal) => resolvePersistentSessionIdentity(browserCtx, sessionId, signal, contexts, changes, sessionContexts),
                    currentPages,
                    timeoutMs: resolved.currentPageTimeoutMs,
                });
                const secret = randomBytes(32);
                removeWebhookIngress = browserCtx.webServer.register({
                    kind: 'exact',
                    path: resolved.webhookPath,
                    handler: createLabelStudioWebhookHandler(webhookCoordinator, {
                        path: resolved.webhookPath,
                        maxBodyBytes: resolved.webhookMaxBodyBytes,
                        secret,
                    }),
                });
                const callbackUrl = `http://127.0.0.1:${browserCtx.webServer.port}${resolved.webhookPath}`;
                ensureWebhook = signal => webhookRegistrar.ensureInstalled(callbackUrl, secret, signal).then(() => undefined);
                try {
                    await ensureWebhook(new AbortController().signal);
                    webhookStatus = 'ready';
                }
                catch (error) {
                    webhookStatus = 'unavailable';
                    if (resolved.webhookMode === 'required') {
                        ensureWebhook = undefined;
                        removeWebhookIngress();
                        throw error;
                    }
                }
            }
            const removeBootConfig = browserCtx.webServer.tapIndex(html => injectLabelStudioBootConfig(html, {
                baseUrl: resolved.baseUrl,
                frameBaseUrl: frameAddress.baseUrl,
                frameCapability: frameAddress.capability,
                inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
                currentPageTimeoutMs: resolved.currentPageTimeoutMs,
                contextOpenRetryMs: resolved.contextOpenRetryMs,
                contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
                eventHistorySize: resolved.eventHistorySize,
                webhookStatus,
            }));
            const removeRpc = registerLabelStudioContextRpc(browserCtx, contexts, changes, sessionContexts, operations, { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs }, currentPages);
            let disposed = false;
            const disposeBrowser = async () => {
                if (disposed)
                    return;
                disposed = true;
                ensureWebhook = undefined;
                removeWebhookIngress?.();
                const results = await Promise.allSettled([webhookRegistrar.dispose(), removeRpc()]);
                removeBootConfig();
                if (activeBrowserDisposer === disposeBrowser)
                    activeBrowserDisposer = undefined;
                const failures = results.filter(result => result.status === 'rejected');
                if (failures.length === 1)
                    throw failures[0].reason;
                if (failures.length > 1)
                    throw new AggregateError(failures.map(result => result.reason));
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
            disposeCurrentPages: () => { currentPages.dispose(); },
            disposeFrameProxy: () => frameProxy.close(),
            disposeBroker: () => changes.dispose(),
            disposeRegistry: () => { contexts.dispose(); },
            disposeRuntime: () => runtime.dispose(),
            disposeStore: () => sessionContexts.close(),
        });
    }, 'label-studio: ordered package shutdown');
}
//# sourceMappingURL=index.js.map