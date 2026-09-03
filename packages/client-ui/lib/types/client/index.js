import { LabelStudioAction } from "./LabelStudioAction.js";
import { LabelStudioPanelController } from "./panel-state.js";
import { LabelStudioContextBridge } from "./context-bridge.js";
import { LabelStudioContextController } from "./context-state.js";
import { parseLabelStudioTargetInput } from "./page-url.js";
import { en, NS, zh } from "./locales.js";
import { LabelStudioRoot } from "./layout/LabelStudioRoot.js";
import { createLabelStudioLayoutStore } from "./layout/store.js";
import { LabelStudioLayoutController } from "./layout/service.js";
import { LabelStudioThemePresenter } from "./layout/theme-presenter.js";
export { LabelStudioLayoutController } from "./layout/service.js";
export { isLabelStudioBridgeFailure, isLabelStudioPluginFailure, isLabelStudioTransportUnknown, LabelStudioContextBridge, } from "./context-bridge.js";
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
    for (const field of ['contextOpenRetryMs', 'contextCloseTimeoutMs', 'eventHistorySize']) {
        if (!Number.isSafeInteger(config[field]) || config[field] <= 0) {
            throw new Error(`label-studio client: invalid browser boot ${field}`);
        }
    }
    return config;
}
/**
 * Provide the compatible layout, replace the root, and add one Session action.
 * @param ctx - browser root context.
 */
export function apply(ctx) {
    const boot = readBootConfig();
    const baseUrl = boot.baseUrl;
    const layout = new LabelStudioLayoutController();
    const panel = new LabelStudioPanelController(baseUrl);
    const setOpen = (open) => {
        if (panel.store.getSnapshot().open === open)
            return;
        panel.setOpen(open);
        if (open)
            layout.openWorkbench();
        else
            layout.closeWorkbench();
    };
    const connection = ctx.get('connection');
    const bridge = new LabelStudioContextBridge({ connection, channel: '/label-studio' });
    const sourceId = globalThis.crypto.randomUUID();
    const contexts = new LabelStudioContextController(bridge, {
        setOpen,
        applyPage: page => panel.applyPage(page),
        clearPage: () => { panel.clearPage(); },
        reloadPage: () => { panel.reloadPage(); },
    }, sourceId, {
        contextOpenRetryMs: boot.contextOpenRetryMs,
        contextCloseTimeoutMs: boot.contextCloseTimeoutMs,
        eventHistorySize: boot.eventHistorySize,
    });
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
                    bindSession: (sessionId) => { contexts.bindSession(sessionId); },
                    confirmApplied: (revision) => { panel.confirmApplied(revision); },
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
        panel.dispose();
    }, 'label-studio: browser context lifecycle');
}
//# sourceMappingURL=index.js.map