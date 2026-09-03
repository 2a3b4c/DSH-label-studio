/** Host-side validation for Label Studio context identifiers. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function positiveId(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new TypeError(`${name} must be a positive safe integer`);
    return value;
}
function uuid(value, name) {
    if (!UUID_PATTERN.test(value))
        throw new TypeError(`${name} must be a UUID`);
    return value;
}
/**
 * Validate and brand a Label Studio project id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioProjectId = (value) => positiveId(value, 'projectId');
/**
 * Validate and brand a Label Studio task id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioTaskId = (value) => positiveId(value, 'taskId');
/**
 * Validate and brand a Label Studio annotation id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioAnnotationId = (value) => positiveId(value, 'annotationId');
/**
 * Validate and brand a Label Studio prediction id.
 * @param value - untrusted numeric REST or JSON value.
 * @returns the validated positive safe integer.
 */
export const labelStudioPredictionId = (value) => positiveId(value, 'predictionId');
/**
 * Validate and brand a browser context source UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioContextSourceId = (value) => uuid(value, 'sourceId');
/**
 * Validate and brand a Host lease UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioContextLeaseId = (value) => uuid(value, 'leaseId');
/**
 * Validate and brand a Host focus correlation UUID.
 * @param value - untrusted JSON string.
 * @returns the validated UUID.
 */
export const labelStudioFocusCorrelationId = (value) => uuid(value, 'correlationId');
/**
 * Validate and brand a browser navigation sequence.
 * @param value - untrusted numeric JSON value.
 * @returns the validated non-negative safe integer.
 */
export function labelStudioNavigationSequence(value) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError('navigationSequence must be a non-negative safe integer');
    }
    return value;
}
//# sourceMappingURL=context-types.js.map