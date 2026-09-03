/** Host-side validation for Label Studio context identifiers. */
import type { LabelStudioAnnotationId, LabelStudioContextLeaseId, LabelStudioContextSourceId, LabelStudioFocusCorrelationId, LabelStudioNavigationSequence, LabelStudioPageInspectionId, LabelStudioPredictionId, LabelStudioProjectId, LabelStudioTaskId } from '@deepseek-ai/dsh-label-studio-protocol';
/**
 * Validate and brand a Label Studio project id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export declare const labelStudioProjectId: (value: number) => LabelStudioProjectId;
/**
 * Validate and brand a Label Studio task id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export declare const labelStudioTaskId: (value: number) => LabelStudioTaskId;
/**
 * Validate and brand a Label Studio annotation id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export declare const labelStudioAnnotationId: (value: number) => LabelStudioAnnotationId;
/**
 * Validate and brand a Label Studio prediction id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export declare const labelStudioPredictionId: (value: number) => LabelStudioPredictionId;
/**
 * Validate and brand a browser context source UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export declare const labelStudioContextSourceId: (value: string) => LabelStudioContextSourceId;
/**
 * Validate and brand a Host lease UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export declare const labelStudioContextLeaseId: (value: string) => LabelStudioContextLeaseId;
/**
 * Validate and brand a Host focus correlation UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export declare const labelStudioFocusCorrelationId: (value: string) => LabelStudioFocusCorrelationId;
/**
 * Validate and brand a Host current-page inspection UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export declare const labelStudioPageInspectionId: (value: string) => LabelStudioPageInspectionId;
/**
 * Validate and brand a browser navigation sequence.
 * @param value - untrusted numeric JSON value.
 * @returns the validated non-negative safe integer.
 */
export declare function labelStudioNavigationSequence(value: number): LabelStudioNavigationSequence;
//# sourceMappingURL=context-types.d.ts.map