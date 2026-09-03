/** Durable per-Session Label Studio page store. */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioPageCommit, LabelStudioProjectId, LabelStudioSessionContextSnapshot, LabelStudioSessionContextErrorCode } from '@deepseek-ai/dsh-label-studio-protocol';
import { type LabelStudioSessionIdentity } from './session-context-spec.ts';
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
/** Persists Label Studio navigation independently for each DSH Session. */
export declare class LabelStudioSessionContextStore {
    private readonly domain;
    private readonly recentProjectLimit;
    private readonly clock;
    private readonly table;
    private readonly tails;
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
     * Commit a browser page under revision compare-and-swap semantics.
     * @param identity - Session lifecycle receiving the page.
     * @param request - Validated lease request and expected context revision.
     * @returns the committed context snapshot.
     */
    commit(identity: LabelStudioSessionIdentity, request: LabelStudioPageCommit): Promise<LabelStudioSessionContextSnapshot>;
    /**
     * Mark one known project deleted and clear it if it is the current page.
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
    private matchingRecord;
    private enqueue;
}
//# sourceMappingURL=session-context-store.d.ts.map