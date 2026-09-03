/** One-shot current-page requests carried by the existing browser event channel. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioBindingErrorCode, LabelStudioInspectPageCommit, LabelStudioPageContext } from '@deepseek-ai/dsh-label-studio-protocol';
import type { LabelStudioChangeBroker } from './change-broker.ts';
import type { LabelStudioContextRegistry } from './context-registry.ts';
import type { LabelStudioSessionIdentity } from './session-context-spec.ts';
type CurrentPageErrorCode = Extract<LabelStudioBindingErrorCode, 'current-page-unavailable' | 'current-page-timeout' | 'current-page-unsupported'>;
/** Stable failure from one on-demand iframe inspection. */
export declare class LabelStudioCurrentPageError extends Error {
    readonly code: CurrentPageErrorCode;
    /**
     * @param code - model-independent failure category.
     * @param message - sanitized operator-facing explanation.
     */
    constructor(code: CurrentPageErrorCode, message: string);
}
/** Coordinates one concurrent current-page inspection per DSH Session. */
export declare class LabelStudioCurrentPageBroker {
    private readonly registry;
    private readonly changes;
    private readonly clock;
    private readonly states;
    private readonly unsubscribeLeaseEnded;
    private disposed;
    /**
     * @param registry - authoritative live browser leases.
     * @param changes - existing per-Session browser event stream.
     * @param clock - epoch-millisecond clock for deterministic deadlines.
     */
    constructor(registry: LabelStudioContextRegistry, changes: Pick<LabelStudioChangeBroker, 'publishCurrentPageInspection'>, clock?: () => number);
    /**
     * Ask the current Session iframe for its structured Label Studio route.
     * @param identity - exact persistent Session lifecycle selected by the tool.
     * @param timeoutMs - positive one-shot response deadline.
     * @param signal - caller and plugin cancellation.
     * @returns current structured page without writing a binding.
     */
    request(identity: LabelStudioSessionIdentity, timeoutMs: number, signal: AbortSignal): Promise<LabelStudioPageContext>;
    /**
     * Accept an exact browser receipt or recover an already accepted receipt.
     * @param commit - validated lease, inspection identity, and structured outcome.
     * @param identity - currently authoritative persistent Session lifecycle.
     * @returns idempotent acceptance receipt.
     */
    commit(commit: LabelStudioInspectPageCommit, identity: LabelStudioSessionIdentity): {
        readonly accepted: true;
    };
    /** Cancel a Session's pending request and idempotency receipt. */
    cancelSession(sessionId: SessionId): void;
    /** Cancel all requests and permanently reject new work. */
    dispose(): void;
    private finish;
}
export {};
//# sourceMappingURL=current-page-broker.d.ts.map