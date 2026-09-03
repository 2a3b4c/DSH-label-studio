/** Finite Label Studio Webhook payload reduction. */
import type { LabelStudioAnnotationId, LabelStudioProjectId, LabelStudioTaskId } from '@deepseek-ai/dsh-label-studio-protocol';
interface AnnotationItem {
    readonly taskId: LabelStudioTaskId;
    readonly annotationId: LabelStudioAnnotationId;
}
type NonEmpty<T> = readonly [T, ...T[]];
/** Identifier-only event accepted from the Label Studio Webhook endpoint. */
export type LabelStudioWebhookEvent = {
    readonly action: 'PROJECT_CREATED' | 'PROJECT_UPDATED';
    readonly projectId: LabelStudioProjectId;
} | {
    readonly action: 'PROJECT_DELETED';
    readonly projectId: LabelStudioProjectId;
} | {
    readonly action: 'TASK_CREATED' | 'TASKS_CREATED';
    readonly projectId: LabelStudioProjectId;
    readonly taskIds: NonEmpty<LabelStudioTaskId>;
} | {
    readonly action: 'TASK_DELETED' | 'TASKS_DELETED';
    readonly projectId: LabelStudioProjectId;
    readonly taskIds: NonEmpty<LabelStudioTaskId>;
} | {
    readonly action: 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED';
    readonly projectId: LabelStudioProjectId;
    readonly items: readonly [AnnotationItem];
} | {
    readonly action: 'ANNOTATIONS_CREATED';
    readonly projectId: LabelStudioProjectId;
    readonly items: NonEmpty<AnnotationItem>;
} | {
    readonly action: 'ANNOTATION_DELETED' | 'ANNOTATIONS_DELETED';
    readonly projectId: LabelStudioProjectId;
    readonly annotationIds: NonEmpty<LabelStudioAnnotationId>;
};
/** Every known single and batch action understood by the finite parser. */
export declare const LABEL_STUDIO_WEBHOOK_ACTIONS: readonly ["PROJECT_CREATED", "PROJECT_UPDATED", "PROJECT_DELETED", "TASK_CREATED", "TASKS_CREATED", "TASK_DELETED", "TASKS_DELETED", "ANNOTATION_CREATED", "ANNOTATIONS_CREATED", "ANNOTATION_UPDATED", "ANNOTATION_DELETED", "ANNOTATIONS_DELETED"];
/**
 * Reduce an untrusted Label Studio Webhook JSON value to action and resource ids.
 * @param input - parsed JSON request body.
 * @returns one validated identifier-only event.
 */
export declare function parseLabelStudioWebhook(input: unknown): LabelStudioWebhookEvent;
export {};
//# sourceMappingURL=webhook-payload.d.ts.map