import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol';
/** Browser-local panel facts. */
export interface LabelStudioPanelSnapshot {
    open: boolean;
    mounted: boolean;
    reloadRevision: number;
    navigationRevision: number;
    targetUrl?: string;
}
/** Owns one browser page's workbench visibility and iframe identity. */
export declare class LabelStudioPanelController {
    private readonly frameBaseUrl;
    private readonly externalBaseUrl;
    /** Observable browser-local panel state. */
    readonly store: SnapshotStore<LabelStudioPanelSnapshot>;
    private readonly pending;
    private frameWindow;
    /**
     * @param frameBaseUrl - isolated proxy endpoint used by the iframe.
     * @param externalBaseUrl - direct Label Studio endpoint used outside DSH.
     */
    constructor(frameBaseUrl: string, externalBaseUrl?: string);
    /**
     * Set workbench visibility while retaining any mounted iframe.
     * @param open - requested visibility; opening permanently latches mounted.
     */
    setOpen(open: boolean): void;
    /** Hide the workbench without unmounting a previously created iframe. */
    close(): void;
    /** Replace the iframe element while retaining visibility state. */
    reload(): void;
    /**
     * Mount if needed, stage a controlled page URL, and wait for the matching iframe src.
     * @param page - structured Label Studio page.
     * @returns promise resolved by {@link confirmApplied}.
     */
    applyPage(page: LabelStudioPageContext): Promise<void>;
    /**
     * Confirm that React committed one staged URL to the iframe node.
     * @param navigationRevision - revision observed by the panel layout effect.
     */
    confirmApplied(navigationRevision: number): void;
    /** Clear the controlled URL and reject every uncommitted navigation. */
    clearPage(): void;
    /** Reload only a currently controlled page. */
    reloadPage(): void;
    /** Record the currently mounted iframe window for one-shot inspection. */
    attachFrame(frame: HTMLIFrameElement | null): void;
    /** Return the currently mounted iframe window without querying the DOM. */
    currentFrameWindow(): WindowProxy | undefined;
    /** Open the controlled target, or the neutral endpoint, outside the dock. */
    openExternal(): void;
    /** Reject outstanding DOM confirmations during plugin teardown. */
    dispose(): void;
    private rejectPending;
}
//# sourceMappingURL=panel-state.d.ts.map