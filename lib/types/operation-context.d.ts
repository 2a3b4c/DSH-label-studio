/** Resolve one Label Studio operation target from explicit ids, Session state, or the current iframe page. */
import type { LabelStudioAnnotationId, LabelStudioBindingCommitOutcome, LabelStudioBindingErrorCode, LabelStudioBindingSource, LabelStudioBindingTarget, LabelStudioPageContext, LabelStudioProjectId, LabelStudioTaskId } from '@deepseek-ai/dsh-label-studio-protocol';
import type { LabelStudioApi } from './api.ts';
import type { LabelStudioSessionIdentity } from './session-context-spec.ts';
import type { LabelStudioSessionContextStore } from './session-context-store.ts';
/** Label Studio operation categories that share Session target selection. */
export type LabelStudioOperationKind = 'create-project' | 'import-tasks' | 'create-prediction' | 'update-label-config' | 'read-active-task' | 'focus-task';
/** Minimum Label Studio resource level required by one operation. */
export type LabelStudioTargetRequirement = 'none' | 'project' | 'task';
/** Caller-selected source for resolving one Label Studio resource. */
export type LabelStudioTargetSelector = {
    readonly mode: 'explicit';
    readonly projectId?: LabelStudioProjectId;
    readonly taskId?: LabelStudioTaskId;
    readonly annotationId?: LabelStudioAnnotationId;
} | {
    readonly mode: 'binding';
} | {
    readonly mode: 'current-page';
};
/** Verified target candidate and the binding revision observed before resolution. */
export interface LabelStudioResolvedOperationContext {
    readonly identity: LabelStudioSessionIdentity;
    readonly target: LabelStudioBindingTarget;
    readonly source: 'explicit' | 'binding' | 'current-page';
    readonly expectedBindingRevision: number;
}
/** Current-page dependency implemented by the Host browser broker. */
export interface LabelStudioCurrentPageReader {
    /**
     * Inspect the current Label Studio iframe route once.
     * @param identity - exact DSH Session lifecycle requesting inspection.
     * @param timeoutMs - positive inspection deadline.
     * @param signal - caller cancellation.
     * @returns structured Label Studio page at response time.
     */
    request(identity: LabelStudioSessionIdentity, timeoutMs: number, signal: AbortSignal): Promise<LabelStudioPageContext>;
}
type BindingStore = Pick<LabelStudioSessionContextStore, 'readBinding' | 'commitBinding'>;
type VerificationApi = Pick<LabelStudioApi, 'getProject' | 'getTask'>;
type OperationContextErrorCode = Extract<LabelStudioBindingErrorCode, 'binding-missing' | 'binding-target-mismatch'>;
/** Stable failure raised when no verified resource satisfies an operation. */
export declare class LabelStudioOperationContextError extends Error {
    readonly code: OperationContextErrorCode;
    /**
     * @param code - stable binding selection failure.
     * @param message - sanitized operator-facing explanation.
     */
    constructor(code: OperationContextErrorCode, message: string);
}
/** Applies the shared target precedence and commits bindings only after caller-confirmed success. */
export declare class LabelStudioOperationContextResolver {
    private readonly store;
    private readonly currentPages;
    private readonly api;
    private readonly currentPageTimeoutMs;
    /**
     * @param store - durable per-Session binding store.
     * @param currentPages - one-shot current iframe reader.
     * @param api - authoritative project and task reader.
     * @param currentPageTimeoutMs - positive one-shot inspection deadline.
     */
    constructor(store: BindingStore, currentPages: LabelStudioCurrentPageReader, api: VerificationApi, currentPageTimeoutMs: number);
    /**
     * Resolve and verify one target without changing durable Session state.
     * @param identity - exact DSH Session lifecycle receiving the operation.
     * @param requirement - minimum resource level required by the operation.
     * @param selector - explicit, bound, or current-page target source.
     * @param signal - caller cancellation passed to browser and REST reads.
     * @returns verified target and the binding revision to use after business success.
     */
    resolve(identity: LabelStudioSessionIdentity, requirement: Exclude<LabelStudioTargetRequirement, 'none'>, selector: LabelStudioTargetSelector, signal: AbortSignal): Promise<LabelStudioResolvedOperationContext>;
    /**
     * Persist a verified target after its business operation has succeeded.
     * @param identity - exact DSH Session lifecycle receiving the binding.
     * @param target - target established by the successful operation.
     * @param source - actor that established the target.
     * @param expectedBindingRevision - revision observed before the business operation.
     * @returns committed snapshot or a newer conflicting snapshot without retrying business work.
     */
    commitSuccessfulResult(identity: LabelStudioSessionIdentity, target: LabelStudioBindingTarget, source: LabelStudioBindingSource, expectedBindingRevision: number): Promise<LabelStudioBindingCommitOutcome>;
    private resolveExplicit;
    private resolveCurrentPage;
    private verifyTarget;
}
export {};
//# sourceMappingURL=operation-context.d.ts.map