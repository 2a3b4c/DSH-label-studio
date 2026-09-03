import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { buildLabelStudioPageUrl } from "./page-url.js";
/** Owns one browser page's workbench visibility and iframe identity. */
export class LabelStudioPanelController {
    frameBaseUrl;
    externalBaseUrl;
    /** Observable browser-local panel state. */
    store = createSnapshotStore({
        open: false, mounted: false, reloadRevision: 0, navigationRevision: 0,
    });
    pending = new Map();
    frameWindow;
    /**
     * @param frameBaseUrl - isolated proxy endpoint used by the iframe.
     * @param externalBaseUrl - direct Label Studio endpoint used outside DSH.
     */
    constructor(frameBaseUrl, externalBaseUrl = frameBaseUrl) {
        this.frameBaseUrl = frameBaseUrl;
        this.externalBaseUrl = externalBaseUrl;
    }
    /**
     * Set workbench visibility while retaining any mounted iframe.
     * @param open - requested visibility; opening permanently latches mounted.
     */
    setOpen(open) {
        const current = this.store.getSnapshot();
        const mounted = current.mounted || open;
        if (current.open === open && current.mounted === mounted)
            return;
        this.store.set({ ...current, open, mounted });
    }
    /** Hide the workbench without unmounting a previously created iframe. */
    close() { this.setOpen(false); }
    /** Replace the iframe element while retaining visibility state. */
    reload() {
        const current = this.store.getSnapshot();
        this.store.set({ ...current, reloadRevision: current.reloadRevision + 1 });
    }
    /**
     * Mount if needed, stage a controlled page URL, and wait for the matching iframe src.
     * @param page - structured Label Studio page.
     * @returns promise resolved by {@link confirmApplied}.
     */
    applyPage(page) {
        this.rejectPending('label-studio panel: navigation superseded');
        const current = this.store.getSnapshot();
        const navigationRevision = current.navigationRevision + 1;
        this.store.set({
            ...current,
            mounted: true,
            navigationRevision,
            targetUrl: buildLabelStudioPageUrl(this.frameBaseUrl, page),
        });
        return new Promise((resolve, reject) => {
            this.pending.set(navigationRevision, { resolve, reject });
        });
    }
    /**
     * Confirm that React committed one staged URL to the iframe node.
     * @param navigationRevision - revision observed by the panel layout effect.
     */
    confirmApplied(navigationRevision) {
        const pending = this.pending.get(navigationRevision);
        if (pending === undefined)
            return;
        this.pending.delete(navigationRevision);
        pending.resolve();
    }
    /** Clear the controlled URL and reject every uncommitted navigation. */
    clearPage() {
        this.rejectPending('label-studio panel: navigation cleared');
        const current = this.store.getSnapshot();
        this.store.set({
            open: current.open,
            mounted: current.mounted,
            reloadRevision: current.reloadRevision,
            navigationRevision: current.navigationRevision + 1,
        });
    }
    /** Reload only a currently controlled page. */
    reloadPage() {
        if (this.store.getSnapshot().targetUrl !== undefined)
            this.reload();
    }
    /** Record the currently mounted iframe window for one-shot inspection. */
    attachFrame(frame) {
        this.frameWindow = frame?.contentWindow ?? undefined;
    }
    /** Return the currently mounted iframe window without querying the DOM. */
    currentFrameWindow() { return this.frameWindow; }
    /** Open the controlled target, or the neutral endpoint, outside the dock. */
    openExternal() {
        const targetUrl = this.store.getSnapshot().targetUrl;
        const url = targetUrl === undefined
            ? this.externalBaseUrl
            : (() => {
                const target = new URL(targetUrl);
                return new URL(`${target.pathname}${target.search}${target.hash}`, `${this.externalBaseUrl}/`).href;
            })();
        window.open(url, '_blank', 'noopener,noreferrer');
    }
    /** Reject outstanding DOM confirmations during plugin teardown. */
    dispose() {
        this.frameWindow = undefined;
        this.rejectPending('label-studio panel: disposed');
    }
    rejectPending(message) {
        for (const pending of this.pending.values())
            pending.reject(new Error(message));
        this.pending.clear();
    }
}
//# sourceMappingURL=panel-state.js.map