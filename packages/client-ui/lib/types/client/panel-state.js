import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { buildLabelStudioPageUrl } from "./page-url.js";
/** Owns one browser page's workbench visibility and iframe identity. */
export class LabelStudioPanelController {
    baseUrl;
    /** Observable browser-local panel state. */
    store = createSnapshotStore({
        open: false, mounted: false, reloadRevision: 0, navigationRevision: 0,
    });
    pending = new Map();
    /** @param baseUrl - Host-validated neutral Label Studio page. */
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    /**
     * Set workbench visibility while permanently latching the first mount.
     * @param open - requested visibility; the first open permanently latches mounted.
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
     * Stage a controlled page URL and wait until React commits the matching iframe src.
     * @param page - structured Label Studio page.
     * @returns promise resolved by {@link confirmApplied}.
     */
    applyPage(page) {
        this.rejectPending('label-studio panel: navigation superseded');
        const current = this.store.getSnapshot();
        const navigationRevision = current.navigationRevision + 1;
        this.store.set({
            ...current,
            navigationRevision,
            targetUrl: buildLabelStudioPageUrl(this.baseUrl, page),
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
    /** Open the controlled target, or the neutral endpoint, outside the dock. */
    openExternal() {
        window.open(this.store.getSnapshot().targetUrl ?? this.baseUrl, '_blank', 'noopener,noreferrer');
    }
    /** Reject outstanding DOM confirmations during plugin teardown. */
    dispose() { this.rejectPending('label-studio panel: disposed'); }
    rejectPending(message) {
        for (const pending of this.pending.values())
            pending.reject(new Error(message));
        this.pending.clear();
    }
}
//# sourceMappingURL=panel-state.js.map