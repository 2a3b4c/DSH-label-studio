/**
 * Type-only declarations shared by the Label Studio Host and browser plugins.
 * @module @deepseek-ai/dsh-label-studio-protocol
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare const LABEL_STUDIO_ID: unique symbol

/** Positive Label Studio project identifier. */
export type LabelStudioProjectId = number & { readonly [LABEL_STUDIO_ID]: 'project' }
/** Positive Label Studio task identifier. */
export type LabelStudioTaskId = number & { readonly [LABEL_STUDIO_ID]: 'task' }
/** Positive Label Studio annotation identifier. */
export type LabelStudioAnnotationId = number & { readonly [LABEL_STUDIO_ID]: 'annotation' }
/** Positive Label Studio prediction identifier. */
export type LabelStudioPredictionId = number & { readonly [LABEL_STUDIO_ID]: 'prediction' }
/** Browser page identity used to arbitrate one Session lease. */
export type LabelStudioContextSourceId = Branded<'LabelStudioContextSourceId'>
/** Host-generated identity for one Session lease generation. */
export type LabelStudioContextLeaseId = Branded<'LabelStudioContextLeaseId'>
/** Host-generated identity for one requested browser focus operation. */
export type LabelStudioFocusCorrelationId = Branded<'LabelStudioFocusCorrelationId'>
/** Monotonic browser navigation sequence within one lease generation. */
export type LabelStudioNavigationSequence = number & { readonly [LABEL_STUDIO_ID]: 'navigation-sequence' }
/** Host-generated identity for one requested current-page inspection. */
export type LabelStudioPageInspectionId = Branded<'LabelStudioPageInspectionId'>
/** Fixed protocol used between the DSH parent page and the proxied iframe. */
export type LabelStudioInspectionProtocol = 'dsh-label-studio-page/v1'

/** Label Studio ids selected by the controlled-task browser surface. */
export interface LabelStudioActiveTarget {
  readonly projectId: LabelStudioProjectId
  readonly taskId: LabelStudioTaskId
  readonly annotationId?: LabelStudioAnnotationId
}

/** JSON representation of a browser-selected Label Studio target. */
export interface LabelStudioActiveTargetWire {
  readonly projectId: number
  readonly taskId: number
  readonly annotationId?: number
}

/** Durable Label Studio page selected by one DSH Session. */
export type LabelStudioPageContext =
  | { readonly view: 'projects' }
  | { readonly view: 'project'; readonly projectId: LabelStudioProjectId }
  | {
    readonly view: 'task'
    readonly projectId: LabelStudioProjectId
    readonly taskId: LabelStudioTaskId
    readonly annotationId?: LabelStudioAnnotationId
  }

/** JSON representation of a durable Label Studio page. */
export type LabelStudioPageContextWire =
  | { readonly view: 'projects' }
  | { readonly view: 'project'; readonly projectId: number }
  | {
    readonly view: 'task'
    readonly projectId: number
    readonly taskId: number
    readonly annotationId?: number
  }

/** Whether a recently visited Label Studio project still exists. */
export type LabelStudioProjectAvailability = 'available' | 'deleted'

/** Most recently visited state retained for one Label Studio project. */
export interface LabelStudioRecentProject {
  readonly projectId: LabelStudioProjectId
  readonly lastTaskId?: LabelStudioTaskId
  readonly lastVisitedAt: number
  readonly availability: LabelStudioProjectAvailability
}

/** Actor whose confirmed operation established a Session binding. */
export type LabelStudioBindingSource = 'tool-result' | 'webhook' | 'current-page'

/** Label Studio resource selected for subsequent operations in one Session. */
export type LabelStudioBindingTarget =
  | {
    readonly kind: 'project'
    readonly projectId: LabelStudioProjectId
  }
  | {
    readonly kind: 'task'
    readonly projectId: LabelStudioProjectId
    readonly taskId: LabelStudioTaskId
    readonly annotationId?: LabelStudioAnnotationId
  }

interface LabelStudioBindingSnapshotFields {
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
}

/** Durable operation target selected for one DSH Session. */
export type LabelStudioBindingSnapshot = LabelStudioBindingSnapshotFields & (
  | {
    readonly target?: never
    readonly source?: never
    readonly boundAt?: never
  }
  | {
    readonly target: LabelStudioBindingTarget
    readonly source: LabelStudioBindingSource
    readonly boundAt: number
  }
)

/** Result of a compare-and-set binding commit after a business operation. */
export type LabelStudioBindingCommitOutcome =
  | {
    readonly kind: 'committed'
    readonly snapshot: LabelStudioBindingSnapshot
  }
  | {
    readonly kind: 'conflict'
    readonly current: LabelStudioBindingSnapshot
  }

/** Durable Label Studio navigation state projected for one DSH Session. */
export interface LabelStudioSessionContextSnapshot {
  readonly page: LabelStudioPageContext
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
  readonly binding: LabelStudioBindingSnapshot
}

/** Browser request to commit a Label Studio page for its current Session lease. */
export interface LabelStudioPageCommitRequest {
  readonly leaseId: string
  readonly generation: number
  readonly navigationSequence: number
  readonly expectedSessionContextRevision: number
  readonly page: LabelStudioPageContextWire
}

/** Validated Host representation of a Label Studio page commit. */
export interface LabelStudioPageCommit {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly navigationSequence: LabelStudioNavigationSequence
  readonly expectedSessionContextRevision: number
  readonly page: LabelStudioPageContext
}

/** Current lease identity and server expiry. */
export interface LabelStudioLeaseSnapshot {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly expiresAt: number
}

/** Result of opening or idempotently recovering a Session lease. */
export interface LabelStudioLeaseOpenResult {
  readonly lease: LabelStudioLeaseSnapshot
  readonly replayBaseline: number
  readonly sessionContext: LabelStudioSessionContextSnapshot
}

/** Reservation issued before the controlled browser publishes a target. */
export interface LabelStudioTargetReservation {
  readonly lease: LabelStudioLeaseSnapshot
  readonly targetRevision: number
  readonly navigationSequence?: LabelStudioNavigationSequence
}

/** Authoritative target state for one lease generation. */
export type LabelStudioTargetState =
  | {
    readonly phase: 'vacant'
    readonly targetRevision: number
  }
  | {
    readonly phase: 'reserved'
    readonly targetRevision: number
    readonly reservation:
      | {
        readonly kind: 'browser'
        readonly navigationSequence: LabelStudioNavigationSequence
      }
      | {
        readonly kind: 'focus'
        readonly correlationId: LabelStudioFocusCorrelationId
      }
  }
  | {
    readonly phase: 'committed'
    readonly targetRevision: number
    readonly target: LabelStudioActiveTarget
  }

/** Committed target associated with one live Session lease. */
export interface LabelStudioActiveContext {
  readonly sessionId: SessionId
  readonly sourceId: LabelStudioContextSourceId
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly targetRevision: number
  readonly expiresAt: number
  readonly target: LabelStudioActiveTarget
}

/** Stable reasons that make a controlled task stale in the browser. */
export type LabelStudioChangeReason = 'prediction-created'

/** Host request for one current iframe location inspection. */
export interface LabelStudioInspectPageEvent {
  readonly kind: 'inspect-current-page'
  readonly inspectionId: LabelStudioPageInspectionId
  readonly deadlineAt: number
  readonly eventRevision: number
}

/** Browser status emitted when an authenticated Webhook has no exact binding. */
export interface LabelStudioWebhookUnassignedEvent {
  readonly kind: 'webhook-unassigned'
  readonly reason: 'no-matching-binding'
  readonly eventRevision: number
}

/** Complete binding projection emitted after a Host-side change. */
export interface LabelStudioBindingChangedEvent {
  readonly kind: 'binding-changed'
  readonly binding: LabelStudioBindingSnapshot
  readonly eventRevision: number
}

/** Current availability of the optional Label Studio Webhook integration. */
export interface LabelStudioWebhookStatusEvent {
  readonly kind: 'webhook-status'
  readonly status: 'ready' | 'unavailable'
  readonly eventRevision: number
}

/** Host-originated browser event carried by the revision stream. */
export type LabelStudioBrowserEvent =
  | LabelStudioInspectPageEvent
  | LabelStudioWebhookUnassignedEvent
  | LabelStudioBindingChangedEvent
  | LabelStudioWebhookStatusEvent
  | {
    readonly kind: 'focus-task'
    readonly eventRevision: number
    readonly correlationId: LabelStudioFocusCorrelationId
    readonly targetRevision: number
    readonly target: LabelStudioActiveTarget
    readonly expectedSessionContextRevision: number
    readonly deadlineAt: number
    readonly committed: boolean
  }
  | {
    readonly kind: 'task-changed'
    readonly eventRevision: number
    readonly taskId: LabelStudioTaskId
    readonly reason: LabelStudioChangeReason
  }

/** Message sent from the DSH Client to the controlled Label Studio iframe. */
export interface LabelStudioInspectPageRequest {
  readonly protocol: 'dsh-label-studio-page/v1'
  readonly kind: 'inspect-current-page'
  readonly inspectionId: string
  readonly capability: string
}

/** Current Label Studio route returned by the controlled iframe. */
export interface LabelStudioInspectPageResponse {
  readonly protocol: 'dsh-label-studio-page/v1'
  readonly kind: 'current-page'
  readonly inspectionId: string
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContextWire }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}

/** JSON request used by the Client to submit an inspection response. */
export interface LabelStudioInspectPageCommitRequest {
  readonly leaseId: string
  readonly generation: number
  readonly inspectionId: string
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContextWire }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}

/** Validated Host representation of an inspection response. */
export interface LabelStudioInspectPageCommit {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly inspectionId: LabelStudioPageInspectionId
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContext }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}

/** Minimal normalized fields retained from one Label Studio Webhook payload. */
export type LabelStudioWebhookEvent =
  | {
    readonly action: 'PROJECT_CREATED' | 'PROJECT_UPDATED' | 'PROJECT_DELETED'
    readonly projectId: LabelStudioProjectId
  }
  | {
    readonly action: 'TASK_CREATED' | 'TASKS_CREATED' | 'TASK_DELETED' | 'TASKS_DELETED'
    readonly projectId: LabelStudioProjectId
    readonly taskIds: readonly [LabelStudioTaskId, ...LabelStudioTaskId[]]
  }
  | {
    readonly action: 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED'
    readonly projectId: LabelStudioProjectId
    readonly items: readonly [{ readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId }]
  }
  | {
    readonly action: 'ANNOTATIONS_CREATED'
    readonly projectId: LabelStudioProjectId
    readonly items: readonly [
      { readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId },
      ...{ readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId }[],
    ]
  }
  | {
    readonly action: 'ANNOTATION_DELETED' | 'ANNOTATIONS_DELETED'
    readonly projectId: LabelStudioProjectId
    readonly annotationIds: readonly [LabelStudioAnnotationId, ...LabelStudioAnnotationId[]]
  }

/** One long-poll result with the current lease and target state. */
export interface LabelStudioEventBatch {
  readonly lease: LabelStudioLeaseSnapshot
  readonly context: LabelStudioTargetState
  readonly events: readonly LabelStudioBrowserEvent[]
  readonly latestRevision: number
  readonly resetRequired: boolean
}

/** Request payloads owned by the Label Studio Connection channel. */
export interface LabelStudioRpcRequestMap {
  readonly 'lease/open': { readonly sessionId: string; readonly sourceId: string }
  readonly 'lease/close': { readonly leaseId: string; readonly generation: number }
  readonly 'context/reserve': {
    readonly leaseId: string
    readonly generation: number
    readonly navigationSequence: number
    readonly expectedTargetRevision: number
  }
  readonly 'context/publish': {
    readonly leaseId: string
    readonly generation: number
    readonly targetRevision: number
    readonly target: LabelStudioActiveTargetWire
  }
  readonly 'events/wait': {
    readonly leaseId: string
    readonly generation: number
    readonly afterRevision: number
  }
  readonly 'focus/ack': {
    readonly leaseId: string
    readonly generation: number
    readonly correlationId: string
    readonly targetRevision: number
    readonly target: LabelStudioActiveTargetWire
  }
  readonly 'page/commit': LabelStudioPageCommitRequest
  readonly 'inspection/commit': LabelStudioInspectPageCommitRequest
}

/** Successful result values owned by each Label Studio endpoint. */
export interface LabelStudioRpcResultMap {
  readonly 'lease/open': LabelStudioLeaseOpenResult
  readonly 'lease/close': { readonly closed: boolean }
  readonly 'context/reserve': LabelStudioTargetReservation
  readonly 'context/publish': LabelStudioActiveContext
  readonly 'events/wait': LabelStudioEventBatch
  readonly 'focus/ack': LabelStudioActiveContext
  readonly 'page/commit': LabelStudioSessionContextSnapshot
  readonly 'inspection/commit': { readonly accepted: true }
}

/** Stable durable Session-context failures returned by Label Studio RPC. */
export type LabelStudioSessionContextErrorCode =
  | 'session-context-conflict'
  | 'session-context-unavailable'

/** Stable failures produced while selecting and synchronizing Session bindings. */
export type LabelStudioBindingErrorCode =
  | 'binding-missing'
  | 'binding-conflict'
  | 'binding-target-mismatch'
  | 'current-page-unavailable'
  | 'current-page-timeout'
  | 'current-page-unsupported'
  | 'webhook-unavailable'
  | 'webhook-unassigned'

/** Stable Label Studio failures nested inside the transport RPC result. */
export type LabelStudioRpcErrorCode =
  | 'invalid-request'
  | 'session-not-found'
  | 'lease-conflict'
  | 'lease-expired'
  | 'stale-generation'
  | 'stale-revision'
  | 'future-revision'
  | 'focus-conflict'
  | 'focus-not-found'
  | LabelStudioSessionContextErrorCode
  | LabelStudioBindingErrorCode

/** Sanitized plugin error returned without request or response bodies. */
export type LabelStudioRpcError =
  | {
    readonly code: 'lease-conflict'
    readonly message: string
    readonly details: { readonly retryAfterMs: number }
  }
  | {
    readonly code: Exclude<LabelStudioRpcErrorCode, 'lease-conflict'>
    readonly message: string
    readonly details: Record<string, never>
  }

/** Plugin business outcome nested inside Connection's framework result. */
export type LabelStudioRpcOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LabelStudioRpcError }
