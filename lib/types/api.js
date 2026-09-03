/** Authenticated Label Studio REST operations used by model tools. */
import { labelStudioAnnotationId, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, } from "./context-types.js";
/** A dispatched Label Studio mutation whose external commit cannot be determined from its response. */
export class LabelStudioMutationOutcomeUnknownError extends Error {
    operation;
    /**
     * @param operation - fixed HTTP method and path without credentials or response content.
     */
    constructor(operation) {
        super(`label-studio: ${operation} submission status is unknown; verify Label Studio before retrying`);
        this.operation = operation;
        this.name = 'LabelStudioMutationOutcomeUnknownError';
    }
}
/** Sanitized non-success response from one Label Studio HTTP operation. */
export class LabelStudioHttpError extends Error {
    method;
    path;
    status;
    /**
     * @param method - fixed request method.
     * @param path - fixed REST path without credentials or response content.
     * @param status - HTTP response status.
     */
    constructor(method, path, status) {
        super(`label-studio: ${method} ${path} returned ${status}`);
        this.method = method;
        this.path = path;
        this.status = status;
        this.name = 'LabelStudioHttpError';
    }
}
/** REST client that resolves and exchanges its PAT refresh credential once per operation. */
export class LabelStudioApi {
    baseUrl;
    refreshTokenCredential;
    credentials;
    responseMaxBytes;
    fetcher;
    /**
     * @param baseUrl - normalized Label Studio endpoint without a trailing slash.
     * @param refreshTokenCredential - PAT refresh-token credential reference resolved at operation time.
     * @param credentials - credential provider.
     * @param responseMaxBytes - maximum decoded bytes accepted from each REST response.
     * @param fetcher - HTTP implementation, injectable for tests.
     */
    constructor(baseUrl, refreshTokenCredential, credentials, responseMaxBytes, fetcher = globalThis.fetch) {
        this.baseUrl = baseUrl;
        this.refreshTokenCredential = refreshTokenCredential;
        this.credentials = credentials;
        this.responseMaxBytes = responseMaxBytes;
        this.fetcher = fetcher;
    }
    /**
     * Create one Label Studio project.
     * @param input - project title and optional Label Studio fields.
     * @param signal - optional caller cancellation.
     * @returns stable identity fields from the created project.
     */
    async createProject(input, signal) {
        const operation = 'POST /api/projects/';
        const body = await this.request('/api/projects/', {
            method: 'POST',
            body: {
                title: input.title,
                ...input.labelConfig === undefined ? {} : { label_config: input.labelConfig },
                ...input.description === undefined ? {} : { description: input.description },
            },
            ...signal === undefined ? {} : { signal },
        });
        return decodeMutationResponse(operation, () => ({
            id: numberField(body, 'id'),
            title: stringField(body, 'title'),
        }));
    }
    /**
     * Import JSON tasks into one project.
     * @param projectId - target Label Studio project id.
     * @param tasks - task documents accepted by Label Studio.
     * @param signal - optional caller cancellation.
     * @returns imported task count and ids.
     */
    async importTasks(projectId, tasks, signal) {
        const operation = `POST /api/projects/${projectId}/import`;
        const body = await this.request(`/api/projects/${projectId}/import`, {
            method: 'POST', body: tasks, ...signal === undefined ? {} : { signal },
        });
        return decodeMutationResponse(operation, () => {
            const ids = Array.isArray(body.task_ids)
                ? body.task_ids.map((value, index) => numberValue(value, `task_ids[${index}]`))
                : [];
            return { taskCount: numberField(body, 'task_count'), taskIds: ids };
        });
    }
    /**
     * Attach one model prediction to an existing task.
     * @param input - task id, Label Studio result array, and optional model facts.
     * @param signal - optional caller cancellation.
     * @returns stable identity fields from the created prediction.
     */
    async createPrediction(input, signal) {
        const operation = 'POST /api/predictions/';
        const body = await this.request('/api/predictions/', {
            method: 'POST',
            body: {
                task: input.taskId,
                result: input.result,
                ...input.modelVersion === undefined ? {} : { model_version: input.modelVersion },
                ...input.score === undefined ? {} : { score: input.score },
            },
            ...signal === undefined ? {} : { signal },
        });
        return decodeMutationResponse(operation, () => {
            const modelVersion = body.model_version;
            return {
                id: numberField(body, 'id'),
                taskId: numberField(body, 'task'),
                ...typeof modelVersion === 'string' ? { modelVersion } : {},
            };
        });
    }
    /**
     * Read the project fields needed to interpret task annotations and predictions.
     * @param projectId - validated Label Studio project id.
     * @param signal - optional caller cancellation.
     * @returns authoritative project configuration.
     */
    async getProject(projectId, signal) {
        const body = await this.request(`/api/projects/${projectId}/`, {
            method: 'GET', ...signal === undefined ? {} : { signal },
        });
        return {
            id: projectIdField(body, 'id'),
            labelConfig: stringField(body, 'label_config'),
            showCollabPredictions: booleanField(body, 'show_collab_predictions'),
        };
    }
    /**
     * Read one complete task including saved annotations and predictions.
     * @param taskId - validated Label Studio task id.
     * @param signal - optional caller cancellation.
     * @returns authoritative task data and result arrays.
     */
    async getTask(taskId, signal) {
        const body = await this.request(`/api/tasks/${taskId}/`, {
            method: 'GET', ...signal === undefined ? {} : { signal },
        });
        return parseTaskView(body);
    }
    async request(path, request) {
        const credential = await this.credentials.resolve(this.refreshTokenCredential);
        if (credential === undefined) {
            throw new Error(`label-studio: credential "${String(this.refreshTokenCredential)}" is not configured`);
        }
        const accessToken = await this.exchangeAccessToken(credential.value, request.signal);
        if (request.signal?.aborted === true) {
            throw new Error(`label-studio: ${request.method} ${path} cancelled before dispatch`);
        }
        return this.fetchJsonObject(path, {
            method: request.method,
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${accessToken}`,
                ...request.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
            },
            ...request.body === undefined ? {} : { body: JSON.stringify(request.body) },
            ...request.signal === undefined ? {} : { signal: request.signal },
        }, request.method === 'POST');
    }
    async exchangeAccessToken(refreshToken, signal) {
        const path = '/api/token/refresh/';
        const value = await this.fetchJsonObject(path, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh: refreshToken }),
            ...signal === undefined ? {} : { signal },
        });
        const access = value.access;
        if (typeof access !== 'string' || access.length === 0) {
            throw new Error(`label-studio: POST ${path} response field "access" must be a non-empty string`);
        }
        return access;
    }
    async fetchJsonObject(path, init, mutation = false) {
        const operation = `${init.method ?? 'GET'} ${path}`;
        if (init.signal?.aborted === true) {
            throw new Error(`label-studio: ${operation} cancelled before dispatch`);
        }
        let pending;
        try {
            pending = this.fetcher(`${this.baseUrl}${path}`, init);
        }
        catch (error) {
            const outcome = isAbort(error, init.signal) ? 'cancelled before dispatch' : 'request failed before dispatch';
            throw new Error(`label-studio: ${operation} ${outcome}`);
        }
        let response;
        try {
            response = await pending;
        }
        catch (error) {
            if (mutation)
                throw new LabelStudioMutationOutcomeUnknownError(operation);
            const outcome = isAbort(error, init.signal) ? 'cancelled' : 'request failed';
            throw new Error(`label-studio: ${operation} ${outcome}`);
        }
        let raw;
        try {
            raw = await readBoundedResponse(response, this.responseMaxBytes, operation);
        }
        catch (error) {
            if (mutation && response.ok)
                throw new LabelStudioMutationOutcomeUnknownError(operation);
            throw error;
        }
        if (!response.ok)
            throw new LabelStudioHttpError(init.method, path, response.status);
        try {
            return parseJsonObject(raw, operation);
        }
        catch (error) {
            if (mutation)
                throw new LabelStudioMutationOutcomeUnknownError(operation);
            throw error;
        }
    }
}
function decodeMutationResponse(operation, decode) {
    try {
        return decode();
    }
    catch {
        throw new LabelStudioMutationOutcomeUnknownError(operation);
    }
}
async function readBoundedResponse(response, maxBytes, operation) {
    const declared = response.headers.get('content-length')?.trim();
    if (declared !== undefined && /^\d+$/.test(declared) && BigInt(declared) > BigInt(maxBytes)) {
        await cancelBody(response.body);
        throw responseTooLarge(operation, maxBytes, response.status);
    }
    if (response.body === null)
        return '';
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        let item;
        try {
            item = await reader.read();
        }
        catch (error) {
            await cancelReader(reader);
            const outcome = isAbort(error) ? 'cancelled while reading its response' : 'response read failed';
            throw new Error(`label-studio: ${operation} ${outcome} (status ${response.status})`);
        }
        if (item.done)
            break;
        total += item.value.byteLength;
        if (total > maxBytes) {
            await cancelReader(reader);
            throw responseTooLarge(operation, maxBytes, response.status);
        }
        chunks.push(item.value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}
function responseTooLarge(operation, maxBytes, status) {
    return new Error(`label-studio: ${operation} response exceeded ${maxBytes} bytes (status ${status})`);
}
async function cancelBody(body) {
    if (body === null)
        return;
    try {
        await body.cancel();
    }
    catch (cancelError) {
        void cancelError;
    }
}
async function cancelReader(reader) {
    try {
        await reader.cancel();
    }
    catch (cancelError) {
        void cancelError;
    }
}
function isAbort(error, signal) {
    return signal?.aborted === true
        || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError');
}
function parseJsonObject(raw, operation) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error(`label-studio: ${operation} returned invalid JSON`);
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`label-studio: ${operation} must return a JSON object`);
    }
    return value;
}
function numberField(value, field) {
    return numberValue(value[field], field);
}
function numberValue(value, field) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new Error(`label-studio: response field "${field}" must be an integer`);
    }
    return value;
}
function stringField(value, field) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'string') {
        throw new Error(`label-studio: response field "${field}" must be a string`);
    }
    return fieldValue;
}
function booleanField(value, field) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'boolean') {
        throw new Error(`label-studio: response field "${field}" must be a boolean`);
    }
    return fieldValue;
}
function jsonRecordField(value, field) {
    const fieldValue = value[field];
    if (typeof fieldValue !== 'object' || fieldValue === null || Array.isArray(fieldValue)) {
        throw new Error(`label-studio: response field "${field}" must be a JSON object`);
    }
    return fieldValue;
}
function projectIdField(value, field) {
    return labelStudioProjectId(numberField(value, field));
}
function taskIdField(value, field) {
    return labelStudioTaskId(numberField(value, field));
}
function parseTaskView(body) {
    const annotations = body.annotations;
    if (!Array.isArray(annotations)) {
        throw new Error('label-studio: response field "annotations" must be an array');
    }
    const predictions = body.predictions;
    if (!Array.isArray(predictions)) {
        throw new Error('label-studio: response field "predictions" must be an array');
    }
    return {
        id: taskIdField(body, 'id'),
        projectId: projectIdField(body, 'project'),
        data: jsonRecordField(body, 'data'),
        annotations: annotations.map((value, index) => parseAnnotation(value, index)),
        predictions: predictions.map((value, index) => parsePrediction(value, index)),
    };
}
function parseAnnotation(value, index) {
    const field = `annotations[${index}]`;
    const body = recordValue(value, field);
    return {
        id: labelStudioAnnotationId(numberFieldAt(body, 'id', `${field}.id`)),
        projectId: labelStudioProjectId(numberFieldAt(body, 'project', `${field}.project`)),
        taskId: labelStudioTaskId(numberFieldAt(body, 'task', `${field}.task`)),
        result: jsonArrayFieldAt(body, 'result', `${field}.result`),
        updatedAt: stringFieldAt(body, 'updated_at', `${field}.updated_at`),
    };
}
function parsePrediction(value, index) {
    const field = `predictions[${index}]`;
    const body = recordValue(value, field);
    const modelVersion = optionalStringField(body, 'model_version', `${field}.model_version`);
    const score = optionalFiniteNumberField(body, 'score', `${field}.score`);
    return {
        id: labelStudioPredictionId(numberFieldAt(body, 'id', `${field}.id`)),
        projectId: labelStudioProjectId(numberFieldAt(body, 'project', `${field}.project`)),
        taskId: labelStudioTaskId(numberFieldAt(body, 'task', `${field}.task`)),
        result: jsonArrayFieldAt(body, 'result', `${field}.result`),
        ...modelVersion === undefined ? {} : { modelVersion },
        ...score === undefined ? {} : { score },
    };
}
function recordValue(value, field) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`label-studio: response field "${field}" must be a JSON object`);
    }
    return value;
}
function numberFieldAt(value, key, field) {
    return numberValue(value[key], field);
}
function stringFieldAt(value, key, field) {
    const fieldValue = value[key];
    if (typeof fieldValue !== 'string') {
        throw new Error(`label-studio: response field "${field}" must be a string`);
    }
    return fieldValue;
}
function jsonArrayFieldAt(value, key, field) {
    const fieldValue = value[key];
    if (!Array.isArray(fieldValue)) {
        throw new Error(`label-studio: response field "${field}" must be an array`);
    }
    return fieldValue;
}
function optionalStringField(value, key, field) {
    const fieldValue = value[key];
    if (fieldValue === undefined || fieldValue === null)
        return undefined;
    if (typeof fieldValue !== 'string') {
        throw new Error(`label-studio: response field "${field}" must be a string when present`);
    }
    return fieldValue;
}
function optionalFiniteNumberField(value, key, field) {
    const fieldValue = value[key];
    if (fieldValue === undefined || fieldValue === null)
        return undefined;
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
        throw new Error(`label-studio: response field "${field}" must be a finite number when present`);
    }
    return fieldValue;
}
/**
 * Verify that REST project, task, annotation, and prediction ids match the live browser target.
 * @param active - committed identifiers owned by the current Session lease.
 * @param project - authoritative project REST projection.
 * @param task - authoritative task REST projection.
 * @returns the validated project and task pair.
 */
export function validateSelectedTask(active, project, task) {
    if (project.id !== active.projectId || task.projectId !== project.id) {
        throw new Error('label-studio: active project does not match the REST project and task');
    }
    if (task.id !== active.taskId) {
        throw new Error('label-studio: active task does not match the REST task');
    }
    for (const annotation of task.annotations) {
        if (annotation.projectId !== project.id || annotation.taskId !== task.id) {
            throw new Error('label-studio: annotation does not belong to the active project and task');
        }
    }
    for (const prediction of task.predictions) {
        if (prediction.projectId !== project.id || prediction.taskId !== task.id) {
            throw new Error('label-studio: prediction does not belong to the active project and task');
        }
    }
    if (active.annotationId !== undefined
        && !task.annotations.some(annotation => annotation.id === active.annotationId)) {
        throw new Error('label-studio: active annotation does not belong to the REST task');
    }
    return { project, task };
}
//# sourceMappingURL=api.js.map