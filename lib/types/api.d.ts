/** Authenticated Label Studio REST operations used by model tools. */
import type { CredentialProvider, CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { JsonValue } from '@deepseek-ai/dsh-util-values';
import type { LabelStudioActiveTarget, LabelStudioAnnotationId, LabelStudioPredictionId, LabelStudioProjectId, LabelStudioTaskId } from '@deepseek-ai/dsh-label-studio-protocol';
type Fetch = typeof globalThis.fetch;
/** Project fields accepted by the project-creation operation. */
export interface CreateProjectInput {
    title: string;
    labelConfig?: string;
    description?: string;
}
/** Stable project identity returned to tools. */
export interface CreatedProject {
    id: number;
    title: string;
}
/** One Label Studio task document. */
export interface LabelStudioTask {
    data: Record<string, unknown>;
    predictions?: unknown[];
}
/** Canonical task-import result. */
export interface ImportedTasks {
    taskCount: number;
    taskIds: number[];
}
/** Prediction fields accepted by Label Studio's prediction endpoint. */
export interface CreatePredictionInput {
    taskId: number;
    result: unknown[];
    modelVersion?: string;
    score?: number;
}
/** Stable prediction identity returned to tools. */
export interface CreatedPrediction {
    id: number;
    taskId: number;
    modelVersion?: string;
}
/** A dispatched Label Studio mutation whose external commit cannot be determined from its response. */
export declare class LabelStudioMutationOutcomeUnknownError extends Error {
    readonly operation: string;
    /**
     * @param operation - fixed HTTP method and path without credentials or response content.
     */
    constructor(operation: string);
}
/** Sanitized non-success response from one Label Studio HTTP operation. */
export declare class LabelStudioHttpError extends Error {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly status: number;
    /**
     * @param method - fixed request method.
     * @param path - fixed REST path without credentials or response content.
     * @param status - HTTP response status.
     */
    constructor(method: 'GET' | 'POST', path: string, status: number);
}
/** Complete annotation fields required by the active-task model view. */
export interface LabelStudioAnnotationView {
    id: LabelStudioAnnotationId;
    projectId: LabelStudioProjectId;
    taskId: LabelStudioTaskId;
    result: JsonValue[];
    updatedAt: string;
}
/** Complete prediction fields required by the active-task model view. */
export interface LabelStudioPredictionView {
    id: LabelStudioPredictionId;
    projectId: LabelStudioProjectId;
    taskId: LabelStudioTaskId;
    result: JsonValue[];
    modelVersion?: string;
    score?: number;
}
/** Authoritative Label Studio task projection returned to the model. */
export interface LabelStudioTaskView {
    id: LabelStudioTaskId;
    projectId: LabelStudioProjectId;
    data: Record<string, JsonValue>;
    annotations: LabelStudioAnnotationView[];
    predictions: LabelStudioPredictionView[];
}
/** Project fields required to interpret one Label Studio task. */
export interface LabelStudioProjectView {
    id: LabelStudioProjectId;
    labelConfig: string;
    showCollabPredictions: boolean;
}
/** Project configuration and task data selected by one live browser context. */
export interface LabelStudioSelectedTaskView {
    project: LabelStudioProjectView;
    task: LabelStudioTaskView;
}
/** REST client that resolves and exchanges its PAT refresh credential once per operation. */
export declare class LabelStudioApi {
    private readonly baseUrl;
    private readonly refreshTokenCredential;
    private readonly credentials;
    private readonly responseMaxBytes;
    private readonly fetcher;
    /**
     * @param baseUrl - normalized Label Studio endpoint without a trailing slash.
     * @param refreshTokenCredential - PAT refresh-token credential reference resolved at operation time.
     * @param credentials - credential provider.
     * @param responseMaxBytes - maximum decoded bytes accepted from each REST response.
     * @param fetcher - HTTP implementation, injectable for tests.
     */
    constructor(baseUrl: string, refreshTokenCredential: CredentialRef, credentials: CredentialProvider, responseMaxBytes: number, fetcher?: Fetch);
    /**
     * Create one Label Studio project.
     * @param input - project title and optional Label Studio fields.
     * @param signal - optional caller cancellation.
     * @returns stable identity fields from the created project.
     */
    createProject(input: CreateProjectInput, signal?: AbortSignal): Promise<CreatedProject>;
    /**
     * Import JSON tasks into one project.
     * @param projectId - target Label Studio project id.
     * @param tasks - task documents accepted by Label Studio.
     * @param signal - optional caller cancellation.
     * @returns imported task count and ids.
     */
    importTasks(projectId: number, tasks: readonly LabelStudioTask[], signal?: AbortSignal): Promise<ImportedTasks>;
    /**
     * Attach one model prediction to an existing task.
     * @param input - task id, Label Studio result array, and optional model facts.
     * @param signal - optional caller cancellation.
     * @returns stable identity fields from the created prediction.
     */
    createPrediction(input: CreatePredictionInput, signal?: AbortSignal): Promise<CreatedPrediction>;
    /**
     * Read the project fields needed to interpret task annotations and predictions.
     * @param projectId - validated Label Studio project id.
     * @param signal - optional caller cancellation.
     * @returns authoritative project configuration.
     */
    getProject(projectId: LabelStudioProjectId, signal?: AbortSignal): Promise<LabelStudioProjectView>;
    /**
     * Read one complete task including saved annotations and predictions.
     * @param taskId - validated Label Studio task id.
     * @param signal - optional caller cancellation.
     * @returns authoritative task data and result arrays.
     */
    getTask(taskId: LabelStudioTaskId, signal?: AbortSignal): Promise<LabelStudioTaskView>;
    private request;
    private exchangeAccessToken;
    private fetchJsonObject;
}
/**
 * Verify that REST project, task, annotation, and prediction ids match the live browser target.
 * @param active - committed identifiers owned by the current Session lease.
 * @param project - authoritative project REST projection.
 * @param task - authoritative task REST projection.
 * @returns the validated project and task pair.
 */
export declare function validateSelectedTask(active: LabelStudioActiveTarget, project: LabelStudioProjectView, task: LabelStudioTaskView): LabelStudioSelectedTaskView;
export {};
//# sourceMappingURL=api.d.ts.map