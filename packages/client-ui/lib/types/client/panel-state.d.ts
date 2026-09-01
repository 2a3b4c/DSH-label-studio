import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { LabelStudioActiveTarget } from 'dsh-label-studio-workbench/protocol';
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
    private readonly baseUrl;
    /** Observable browser-local panel state. */
    readonly store: SnapshotStore<LabelStudioPanelSnapshot>;
    private readonly pending;
    /** @param baseUrl - Host-validated neutral Label Studio page. */
    constructor(baseUrl: string);
    /**
     * Set workbench visibility while permanently latching the first mount.
     * @param open - requested visibility; the first open permanently latches mounted.
     */
    setOpen(open: boolean): void;
    /** Hide the workbench without unmounting a previously created iframe. */
    close(): void;
    /** Replace the iframe element while retaining visibility state. */
    reload(): void;
    /**
     * Stage a controlled task URL and wait until React commits the matching iframe src.
     * @param target - Host-reserved target.
     * @returns promise resolved by {@link confirmApplied}.
     */
    applyTarget(target: LabelStudioActiveTarget): Promise<void>;
    /**
     * Confirm that React committed one staged URL to the iframe node.
     * @param navigationRevision - revision observed by the panel layout effect.
     */
    confirmApplied(navigationRevision: number): void;
    /** Clear the controlled URL and reject every uncommitted navigation. */
    clearTarget(): void;
    /** Reload only a currently controlled target. */
    reloadTarget(): void;
    /** Open the controlled target, or the neutral endpoint, outside the dock. */
    openExternal(): void;
    /** Reject outstanding DOM confirmations during plugin teardown. */
    dispose(): void;
    private rejectPending;
}
//# sourceMappingURL=panel-state.d.ts.map
