import { LabelStudioAction } from "./LabelStudioAction.js";
import { LabelStudioPanelController } from "./panel-state.js";
import { LabelStudioContextBridge } from "./context-bridge.js";
import { LabelStudioCurrentPageBridge } from "./current-page-bridge.js";
import { LabelStudioContextController } from "./context-state.js";
import { parseLabelStudioTargetInput } from "./page-url.js";
import { en, NS, zh } from "./locales.js";
import { LabelStudioRoot } from "./layout/LabelStudioRoot.js";
import { createLabelStudioLayoutStore } from "./layout/store.js";
import { LabelStudioLayoutController } from "./layout/service.js";
import { LabelStudioThemePresenter } from "./layout/theme-presenter.js";
export { LabelStudioLayoutController } from "./layout/service.js";
export { isLabelStudioBridgeFailure, isLabelStudioPluginFailure, isLabelStudioTransportUnknown, LabelStudioContextBridge, } from "./context-bridge.js";
export { LabelStudioCurrentPageBridge } from "./current-page-bridge.js";
export { LabelStudioContextController } from "./context-state.js";
export { buildLabelStudioPageUrl, parseLabelStudioTargetInput } from "./page-url.js";
export const inject = ['slots', 'locale', 'theme', 'connection'];
function readBootConfig() {
    const config = window.__DSH_LABEL_STUDIO__;
    if (config === undefined || config.baseUrl === '')
        throw new Error('label-studio client: missing browser boot config');
    try {
        new URL(config.baseUrl);
    }
    catch {
        throw new Error('label-studio client: invalid browser boot baseUrl');
    }
    for (const field of [
        'contextOpenRetryMs', 'contextCloseTimeoutMs', 'eventHistorySize', 'currentPageTimeoutMs',
    ]) {
        if (!Number.isSafeInteger(config[field]) || config[field] <= 0) {
            throw new Error(`label-studio client: invalid browser boot ${field}`);
        }
    }
    if (config.frameBaseUrl === '' || config.frameCapability === ''
        || config.inspectionProtocol !== 'dsh-label-studio-page/v1') {
        throw new Error('label-studio client: invalid frame boot config');
    }
    try {
        new URL(config.frameBaseUrl);
    }
    catch {
        throw new Error('label-studio client: invalid frame boot baseUrl');
    }
    return config;
}
/**
 * Provide the compatible layout, replace the root, and add one Session action.
 * @param ctx - browser root context.
 */
export function apply(ctx) {
    const boot = readBootConfig();
    const baseUrl = boot.frameBaseUrl;
    const layout = new LabelStudioLayoutController();
    const panel = new LabelStudioPanelController(boot.frameBaseUrl, boot.baseUrl);
    let activeSessionId;
    const sessionVisibility = new Map();
    const applyVisibility = (open) => {
        if (panel.store.getSnapshot().open === open)
            return;
        panel.setOpen(open);
        if (open)
            layout.openWorkbench();
        else
            layout.closeWorkbench();
    };
    const setOpen = (open) => {
        if (activeSessionId !== undefined)
            sessionVisibility.set(activeSessionId, open);
        applyVisibility(open);
    };
    const connection = ctx.get('connection');
    const bridge = new LabelStudioContextBridge({ connection, channel: '/label-studio' });
    const currentPages = new LabelStudioCurrentPageBridge(bridge, () => panel.currentFrameWindow(), new URL(boot.frameBaseUrl).origin, boot.inspectionProtocol, boot.frameCapability);
    const sourceId = globalThis.crypto.randomUUID();
    const contexts = new LabelStudioContextController(bridge, {
        setOpen,
        applyPage: page => panel.applyPage(page),
        clearPage: () => { panel.clearPage(); },
        reloadPage: () => { panel.reloadPage(); },
        inspectCurrentPage: (event, lease, signal) => currentPages.inspect(event, lease, signal),
    }, sourceId, {
        contextOpenRetryMs: boot.contextOpenRetryMs,
        contextCloseTimeoutMs: boot.contextCloseTimeoutMs,
        eventHistorySize: boot.eventHistorySize,
        ...(boot.webhookStatus === undefined ? {} : { webhookStatus: boot.webhookStatus }),
    });
    const bindSession = (sessionId) => {
        if (activeSessionId !== sessionId) {
            activeSessionId = sessionId;
            applyVisibility(sessionId !== undefined && sessionVisibility.get(sessionId) === true);
        }
        contexts.bindSession(sessionId);
    };
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'label-studio: dictionaries');
    ctx.effect(() => {
        const disposeService = ctx.reflect.provide('layout', layout);
        const disposeRoot = ctx.slots.register({
            name: 'root',
            children: {
                'sidebar': { kind: 'single', scope: 'root' },
                'conversation': { kind: 'single', scope: 'session-maybe' },
                'details': { kind: 'single', scope: 'session' },
                'shell.overlay': { kind: 'list', scope: 'root' },
            },
            store: createLabelStudioLayoutStore,
            locale: NS,
            inject: (actions) => {
                layout.attachPanels(actions);
                return {
                    hooks: { labelStudioPanel: panel.store, labelStudioContext: contexts.store },
                    baseUrl,
                    bindSession,
                    confirmApplied: (revision) => { panel.confirmApplied(revision); },
                    attachFrame: (frame) => {
                        currentPages.cancel();
                        panel.attachFrame(frame);
                    },
                    selectTarget: input => contexts.selectPage(parseLabelStudioTargetInput(input)),
                    selectPage: page => contexts.selectPage(page),
                    close: () => { setOpen(false); },
                    reload: () => { contexts.reload(); },
                    openExternal: () => { panel.openExternal(); },
                };
            },
        }, LabelStudioRoot);
        return () => {
            setOpen(false);
            disposeRoot();
            void disposeService();
        };
    }, 'label-studio: compatible layout + replacement root');
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'label-studio',
        order: 40,
        locale: NS,
        inject: () => ({
            hooks: { labelStudioPanel: panel.store },
            toggle: () => { setOpen(!panel.store.getSnapshot().open); },
        }),
    }, LabelStudioAction));
    ctx.effect(() => {
        const presenter = new LabelStudioThemePresenter();
        presenter.apply(ctx.theme.getTheme());
        const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot); });
        return () => { off(); presenter.dispose(); };
    }, 'label-studio: theme presenter');
    ctx.effect(() => async () => {
        await contexts.dispose();
        currentPages.dispose();
        panel.dispose();
    }, 'label-studio: browser context lifecycle');
}
//# sourceMappingURL=index.js.map