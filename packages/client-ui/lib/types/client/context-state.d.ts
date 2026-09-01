/** Browser state machine for Session-bound controlled Label Studio pages. */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioActiveTarget, LabelStudioBrowserEvent, LabelStudioContextSourceId, LabelStudioLeaseSnapshot, LabelStudioNavigationSequence } from 'dsh-label-studio-workbench/protocol';
import { type LabelStudioContextBridge } from './context-bridge.ts';
/** Controlled iframe operations owned by the panel controller. */
export interface LabelStudioControlledPage {
    setOpen(open: boolean): void;
    applyTarget(target: LabelStudioActiveTarget): Promise<void>;
    clearTarget(): void;
    reloadTarget(): void;
}
/** User-visible synchronization phase. */
export type LabelStudioSyncStatus = 'no-session' | 'no-task' | 'leasing' | 'lease-active' | 'lease-conflict' | 'lease-expired' | 'syncing' | 'reconciling' | 'synced' | 'error';
/** Observable browser synchronization facts. */
export interface LabelStudioContextSnapshot {
    readonly sessionId?: SessionId | undefined;
    readonly sourceId: LabelStudioContextSourceId;
    readonly lease?: LabelStudioLeaseSnapshot | undefined;
    readonly navigationSequence: LabelStudioNavigationSequence;
    readonly targetRevision: number;
    readonly eventRevision: number;
    readonly observedEventRevision: number;
    readonly bufferedEventCount: number;
    readonly target?: LabelStudioActiveTarget | undefined;
    readonly status: LabelStudioSyncStatus;
    readonly error?: string | undefined;
}
interface ControllerOptions {
    readonly contextOpenRetryMs: number;
    readonly contextCloseTimeoutMs: number;
    readonly eventHistorySize: number;
}
/** Owns the current Session lease, target mutation queue, and event cursors. */
export declare class LabelStudioContextController {
    private readonly bridge;
    private readonly page;
    private readonly options;
    private readonly clock;
    /** Observable synchronization state. */
    readonly store: SnapshotStore<LabelStudioContextSnapshot>;
    private readonly offHost;
    private disposed;
    private sessionEpoch;
    private connectionEpoch;
    private navigationEpoch;
    private waitAbort;
    private openAbort;
    private mutationAbort;
    private retryTimer;
    private openInFlight;
    private events;
    private navigationQueue;
    private pendingManual;
    /**
     * @param bridge - typed Connection caller.
     * @param page - controlled iframe operations.
     * @param sourceId - stable id for this browser page.
     * @param options - retry, close, and buffer limits.
     * @param clock - wall clock used for lease and focus deadlines.
     */
    constructor(bridge: LabelStudioContextBridge, page: LabelStudioControlledPage, sourceId: LabelStudioContextSourceId, options: ControllerOptions, clock?: () => number);
    /**
     * Bind the page to the selected DSH Session. This method schedules RPC work and never blocks React.
     * @param sessionId - selected Session, or absent selection.
     */
    bindSession(sessionId: SessionId | undefined): void;
    /**
     * Reserve, apply, and publish a user-selected target through the serial navigation queue.
     * @param target - parsed controlled target.
     * @returns completion after a deterministic commit or reconciliation.
     */
    selectTarget(target: LabelStudioActiveTarget): Promise<void>;
    /**
     * Apply one focus event through the same serial queue as manual navigation.
     * @param event - Host focus request.
     */
    applyFocus(event: Extract<LabelStudioBrowserEvent, {
        kind: 'focus-task';
    }>): Promise<void>;
    /** Reload the current controlled task only. */
    reload(): void;
    /** Stop listeners and requests before returning; lease closure remains best effort. */
    dispose(): Promise<void>;
    private epoch;
    private current;
    private hostChanged;
    private startOpen;
    private startWait;
    private acceptBatch;
    private processEvents;
    private performFocus;
    private performSelection;
    private applyAndPublish;
    private reconcileManual;
    private mergeContext;
    private commitEvent;
    private rebuildAfterOverflow;
    private expireLease;
    private currentNavigation;
    private generationSignal;
    private bestEffortClose;
    private cancelGeneration;
    private schedule;
    private clearRetry;
    private rejectPendingManual;
    private patch;
}
export {};
//# sourceMappingURL=context-state.d.ts.map
