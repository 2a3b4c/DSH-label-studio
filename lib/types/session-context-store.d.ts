/** Durable per-Session Label Studio page and operation-binding store. */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioBindingCommitOutcome, LabelStudioBindingSnapshot, LabelStudioPageCommit, LabelStudioProjectId, LabelStudioSessionContextSnapshot, LabelStudioSessionContextErrorCode, LabelStudioTaskId } from '@deepseek-ai/dsh-label-studio-protocol';
import { type LabelStudioBindingCommit, type LabelStudioSessionBindingChange, type LabelStudioSessionIdentity } from './session-context-spec.ts';
/** Construction options for the durable Session page store. */
export interface LabelStudioSessionContextStoreOptions {
    readonly recentProjectLimit: number;
    readonly clock?: () => number;
}
/** Stable failure raised when a durable Session page cannot accept a commit. */
export declare class LabelStudioSessionContextError extends Error {
    readonly code: LabelStudioSessionContextErrorCode;
    /**
     * Create a sanitized Session-context failure.
     * @param code - stable RPC-facing failure category.
     */
    constructor(code: LabelStudioSessionContextErrorCode);
}
/** Persists Label Studio navigation and operation bindings independently for each DSH Session. */
export declare class LabelStudioSessionContextStore {
    private readonly domain;
    private readonly recentProjectLimit;
    private readonly clock;
    private readonly table;
    private readonly ownerTable;
    private readonly tails;
    private ownerTail;
    private closing;
    private closePromise?;
    private constructor();
    /**
     * Open the plugin-owned storage domain.
     * @param ctx - Host context providing the storage-domain service.
     * @param options - History limit and optional Host clock.
     * @returns an open Session context store.
     */
    static open(ctx: Pick<Context, 'storageDomain'>, options: LabelStudioSessionContextStoreOptions): Promise<LabelStudioSessionContextStore>;
    /**
     * Read the context for one exact Session lifecycle without I/O.
     * @param identity - Session id and creation time.
     * @returns an immutable snapshot, or the empty context when no matching record exists.
     */
    read(identity: LabelStudioSessionIdentity): LabelStudioSessionContextSnapshot;
    /**
     * Read the binding for one exact Session lifecycle without I/O.
     * @param identity - Session id and creation time.
     * @returns an immutable empty or bound snapshot.
     */
    readBinding(identity: LabelStudioSessionIdentity): LabelStudioBindingSnapshot;
    /**
     * List every durable non-empty binding without creating or changing a Session record.
     * @returns immutable Session ids and binding snapshots in table iteration order.
     */
    listBindings(): readonly {
        readonly sessionId: SessionId;
        readonly binding: LabelStudioBindingSnapshot;
    }[];
    /**
     * Commit a browser page under revision compare-and-swap semantics.
     * @param identity - Session lifecycle receiving the page.
     * @param request - Validated lease request and expected context revision.
     * @returns the committed context snapshot.
     */
    commit(identity: LabelStudioSessionIdentity, request: LabelStudioPageCommit): Promise<LabelStudioSessionContextSnapshot>;
    /**
     * Commit an operation binding with an independent revision.
     * @param identity - Session lifecycle receiving the binding.
     * @param request - Expected binding revision and optional new target.
     * @returns the committed snapshot or the newer conflicting snapshot.
     */
    commitBinding(identity: LabelStudioSessionIdentity, request: LabelStudioBindingCommit): Promise<LabelStudioBindingCommitOutcome>;
    /**
     * Clear or update every binding that refers to a deleted project.
     * @param projectId - Confirmed deleted Label Studio project.
     * @returns changed Session bindings in table iteration order.
     */
    reconcileProjectDeleted(projectId: LabelStudioProjectId): Promise<readonly LabelStudioSessionBindingChange[]>;
    /**
     * Downgrade bindings whose exact task was deleted.
     * @param projectId - Project that owned the deleted tasks.
     * @param taskIds - Confirmed deleted task identifiers.
     * @returns changed Session bindings in table iteration order.
     */
    reconcileTasksDeleted(projectId: LabelStudioProjectId, taskIds: readonly LabelStudioTaskId[]): Promise<readonly LabelStudioSessionBindingChange[]>;
    /**
     * Persist the first generated Webhook owner id and return it thereafter.
     * @param candidate - Non-empty owner identity proposed by this process.
     * @returns the durable first owner identity.
     */
    ensureWebhookOwnerId(candidate: string): Promise<string>;
    /**
     * Mark one known project deleted in page recovery state and the Session binding.
     * @param identity - Session lifecycle owning the history.
     * @param projectId - Confirmed deleted Label Studio project.
     * @returns the resulting context snapshot.
     */
    markProjectDeleted(identity: LabelStudioSessionIdentity, projectId: LabelStudioProjectId): Promise<LabelStudioSessionContextSnapshot>;
    /**
     * Delete one Session's durable Label Studio context.
     * @param sessionId - Session record key to remove.
     * @returns whether a record existed.
     */
    delete(sessionId: SessionId): Promise<boolean>;
    /**
     * Drain queued operations and close the owned domain handle once.
     * @returns resolution after storage shutdown.
     */
    close(): Promise<void>;
    private runClose;
    private reconcileRecords;
    private matchingRecord;
    private enqueue;
}
//# sourceMappingURL=session-context-store.d.ts.map