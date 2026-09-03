/**
 * Type-only declarations shared by the Label Studio Host and browser plugins.
 * @module @deepseek-ai/dsh-label-studio-protocol
 */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
declare const LABEL_STUDIO_ID: unique symbol;
/** Positive Label Studio project identifier. */
export type LabelStudioProjectId = number & {
    readonly [LABEL_STUDIO_ID]: 'project';
};
/** Positive Label Studio task identifier. */
export type LabelStudioTaskId = number & {
    readonly [LABEL_STUDIO_ID]: 'task';
};
/** Positive Label Studio annotation identifier. */
export type LabelStudioAnnotationId = number & {
    readonly [LABEL_STUDIO_ID]: 'annotation';
};
/** Positive Label Studio prediction identifier. */
export type LabelStudioPredictionId = number & {
    readonly [LABEL_STUDIO_ID]: 'prediction';
};
/** Browser page identity used to arbitrate one Session lease. */
export type LabelStudioContextSourceId = Branded<'LabelStudioContextSourceId'>;
/** Host-generated identity for one Session lease generation. */
export type LabelStudioContextLeaseId = Branded<'LabelStudioContextLeaseId'>;
/** Host-generated identity for one requested browser focus operation. */
export type LabelStudioFocusCorrelationId = Branded<'LabelStudioFocusCorrelationId'>;
/** Monotonic browser navigation sequence within one lease generation. */
export type LabelStudioNavigationSequence = number & {
    readonly [LABEL_STUDIO_ID]: 'navigation-sequence';
};
/** Label Studio ids selected by the controlled-task browser surface. */
export interface LabelStudioActiveTarget {
    readonly projectId: LabelStudioProjectId;
    readonly taskId: LabelStudioTaskId;
    readonly annotationId?: LabelStudioAnnotationId;
}
/** JSON representation of a browser-selected Label Studio target. */
export interface LabelStudioActiveTargetWire {
    readonly projectId: number;
    readonly taskId: number;
    readonly annotationId?: number;
}
/** Durable Label Studio page selected by one DSH Session. */
export type LabelStudioPageContext = {
    readonly view: 'projects';
} | {
    readonly view: 'project';
    readonly projectId: LabelStudioProjectId;
} | {
    readonly view: 'task';
    readonly projectId: LabelStudioProjectId;
    readonly taskId: LabelStudioTaskId;
    readonly annotationId?: LabelStudioAnnotationId;
};
/** JSON representation of a durable Label Studio page. */
export type LabelStudioPageContextWire = {
    readonly view: 'projects';
} | {
    readonly view: 'project';
    readonly projectId: number;
} | {
    readonly view: 'task';
    readonly projectId: number;
    readonly taskId: number;
    readonly annotationId?: number;
};
/** Whether a recently visited Label Studio project still exists. */
export type LabelStudioProjectAvailability = 'available' | 'deleted';
/** Most recently visited state retained for one Label Studio project. */
export interface LabelStudioRecentProject {
    readonly projectId: LabelStudioProjectId;
    readonly lastTaskId?: LabelStudioTaskId;
    readonly lastVisitedAt: number;
    readonly availability: LabelStudioProjectAvailability;
}
/** Durable Label Studio navigation state projected for one DSH Session. */
export interface LabelStudioSessionContextSnapshot {
    readonly page: LabelStudioPageContext;
    readonly recentProjects: readonly LabelStudioRecentProject[];
    readonly revision: number;
}
/** Browser request to commit a Label Studio page for its current Session lease. */
export interface LabelStudioPageCommitRequest {
    readonly leaseId: string;
    readonly generation: number;
    readonly navigationSequence: number;
    readonly expectedSessionContextRevision: number;
    readonly page: LabelStudioPageContextWire;
}
/** Validated Host representation of a Label Studio page commit. */
export interface LabelStudioPageCommit {
    readonly leaseId: LabelStudioContextLeaseId;
    readonly generation: number;
    readonly navigationSequence: LabelStudioNavigationSequence;
    readonly expectedSessionContextRevision: number;
    readonly page: LabelStudioPageContext;
}
/** Current lease identity and server expiry. */
export interface LabelStudioLeaseSnapshot {
    readonly leaseId: LabelStudioContextLeaseId;
    readonly generation: number;
    readonly expiresAt: number;
}
/** Result of opening or idempotently recovering a Session lease. */
export interface LabelStudioLeaseOpenResult {
    readonly lease: LabelStudioLeaseSnapshot;
    readonly replayBaseline: number;
    readonly sessionContext: LabelStudioSessionContextSnapshot;
}
/** Reservation issued before the controlled browser publishes a target. */
export interface LabelStudioTargetReservation {
    readonly lease: LabelStudioLeaseSnapshot;
    readonly targetRevision: number;
    readonly navigationSequence?: LabelStudioNavigationSequence;
}
/** Authoritative target state for one lease generation. */
export type LabelStudioTargetState = {
    readonly phase: 'vacant';
    readonly targetRevision: number;
} | {
    readonly phase: 'reserved';
    readonly targetRevision: number;
    readonly reservation: {
        readonly kind: 'browser';
        readonly navigationSequence: LabelStudioNavigationSequence;
    } | {
        readonly kind: 'focus';
        readonly correlationId: LabelStudioFocusCorrelationId;
    };
} | {
    readonly phase: 'committed';
    readonly targetRevision: number;
    readonly target: LabelStudioActiveTarget;
};
/** Committed target associated with one live Session lease. */
export interface LabelStudioActiveContext {
    readonly sessionId: SessionId;
    readonly sourceId: LabelStudioContextSourceId;
    readonly leaseId: LabelStudioContextLeaseId;
    readonly generation: number;
    readonly targetRevision: number;
    readonly expiresAt: number;
    readonly target: LabelStudioActiveTarget;
}
/** Stable reasons that make a controlled task stale in the browser. */
export type LabelStudioChangeReason = 'prediction-created';
/** Host-originated browser event carried by the revision stream. */
export type LabelStudioBrowserEvent = {
    readonly kind: 'focus-task';
    readonly eventRevision: number;
    readonly correlationId: LabelStudioFocusCorrelationId;
    readonly targetRevision: number;
    readonly target: LabelStudioActiveTarget;
    readonly expectedSessionContextRevision: number;
    readonly deadlineAt: number;
    readonly committed: boolean;
} | {
    readonly kind: 'task-changed';
    readonly eventRevision: number;
    readonly taskId: LabelStudioTaskId;
    readonly reason: LabelStudioChangeReason;
};
/** One long-poll result with the current lease and target state. */
export interface LabelStudioEventBatch {
    readonly lease: LabelStudioLeaseSnapshot;
    readonly context: LabelStudioTargetState;
    readonly events: readonly LabelStudioBrowserEvent[];
    readonly latestRevision: number;
    readonly resetRequired: boolean;
}
/** Request payloads owned by the Label Studio Connection channel. */
export interface LabelStudioRpcRequestMap {
    readonly 'lease/open': {
        readonly sessionId: string;
        readonly sourceId: string;
    };
    readonly 'lease/close': {
        readonly leaseId: string;
        readonly generation: number;
    };
    readonly 'context/reserve': {
        readonly leaseId: string;
        readonly generation: number;
        readonly navigationSequence: number;
        readonly expectedTargetRevision: number;
    };
    readonly 'context/publish': {
        readonly leaseId: string;
        readonly generation: number;
        readonly targetRevision: number;
        readonly target: LabelStudioActiveTargetWire;
    };
    readonly 'events/wait': {
        readonly leaseId: string;
        readonly generation: number;
        readonly afterRevision: number;
    };
    readonly 'focus/ack': {
        readonly leaseId: string;
        readonly generation: number;
        readonly correlationId: string;
        readonly targetRevision: number;
        readonly target: LabelStudioActiveTargetWire;
    };
    readonly 'page/commit': LabelStudioPageCommitRequest;
}
/** Successful result values owned by each Label Studio endpoint. */
export interface LabelStudioRpcResultMap {
    readonly 'lease/open': LabelStudioLeaseOpenResult;
    readonly 'lease/close': {
        readonly closed: boolean;
    };
    readonly 'context/reserve': LabelStudioTargetReservation;
    readonly 'context/publish': LabelStudioActiveContext;
    readonly 'events/wait': LabelStudioEventBatch;
    readonly 'focus/ack': LabelStudioActiveContext;
    readonly 'page/commit': LabelStudioSessionContextSnapshot;
}
/** Stable durable Session-context failures returned by Label Studio RPC. */
export type LabelStudioSessionContextErrorCode = 'session-context-conflict' | 'session-context-unavailable';
/** Stable Label Studio failures nested inside the transport RPC result. */
export type LabelStudioRpcErrorCode = 'invalid-request' | 'session-not-found' | 'lease-conflict' | 'lease-expired' | 'stale-generation' | 'stale-revision' | 'future-revision' | 'focus-conflict' | 'focus-not-found' | LabelStudioSessionContextErrorCode;
/** Sanitized plugin error returned without request or response bodies. */
export type LabelStudioRpcError = {
    readonly code: 'lease-conflict';
    readonly message: string;
    readonly details: {
        readonly retryAfterMs: number;
    };
} | {
    readonly code: Exclude<LabelStudioRpcErrorCode, 'lease-conflict'>;
    readonly message: string;
    readonly details: Record<string, never>;
};
/** Plugin business outcome nested inside Connection's framework result. */
export type LabelStudioRpcOutcome<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: LabelStudioRpcError;
};
export {};
//# sourceMappingURL=index.d.ts.map