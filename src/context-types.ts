/** Host-side validation for Label Studio context identifiers. */

import type {
  LabelStudioAnnotationId,
  LabelStudioContextLeaseId,
  LabelStudioContextSourceId,
  LabelStudioFocusCorrelationId,
  LabelStudioNavigationSequence,
  LabelStudioPredictionId,
  LabelStudioProjectId,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function positiveId(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`)
  return value
}

function uuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) throw new TypeError(`${name} must be a UUID`)
  return value
}

/**
 * Validate and brand a Label Studio project id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioProjectId = (value: number): LabelStudioProjectId =>
  positiveId(value, 'projectId') as LabelStudioProjectId

/**
 * Validate and brand a Label Studio task id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioTaskId = (value: number): LabelStudioTaskId =>
  positiveId(value, 'taskId') as LabelStudioTaskId

/**
 * Validate and brand a Label Studio annotation id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioAnnotationId = (value: number): LabelStudioAnnotationId =>
  positiveId(value, 'annotationId') as LabelStudioAnnotationId

/**
 * Validate and brand a Label Studio prediction id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioPredictionId = (value: number): LabelStudioPredictionId =>
  positiveId(value, 'predictionId') as LabelStudioPredictionId

/**
 * Validate and brand a browser context source UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioContextSourceId = (value: string): LabelStudioContextSourceId =>
  uuid(value, 'sourceId') as LabelStudioContextSourceId

/**
 * Validate and brand a Host lease UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioContextLeaseId = (value: string): LabelStudioContextLeaseId =>
  uuid(value, 'leaseId') as LabelStudioContextLeaseId

/**
 * Validate and brand a Host focus correlation UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioFocusCorrelationId = (value: string): LabelStudioFocusCorrelationId =>
  uuid(value, 'correlationId') as LabelStudioFocusCorrelationId

/**
 * Validate and brand a browser navigation sequence.
 * @param value - untrusted numeric JSON value.
 * @returns the validated non-negative safe integer.
 */
export function labelStudioNavigationSequence(value: number): LabelStudioNavigationSequence {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('navigationSequence must be a non-negative safe integer')
  }
  return value as LabelStudioNavigationSequence
}
