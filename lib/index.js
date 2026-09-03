import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { SessionId } from "@deepseek-ai/dsh-session/types";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z as z$1 } from "zod";
import { createServer, request } from "node:http";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region lib/types/context-types.js
/** Host-side validation for Label Studio context identifiers. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function positiveId(value, name) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
	return value;
}
function uuid(value, name) {
	if (!UUID_PATTERN.test(value)) throw new TypeError(`${name} must be a UUID`);
	return value;
}
/**
* Validate and brand a Label Studio project id.
* @param value - untrusted numeric REST or JSON value.
* @returns the validated positive safe integer.
*/
const labelStudioProjectId = (value) => positiveId(value, "projectId");
/**
* Validate and brand a Label Studio task id.
* @param value - untrusted numeric REST or JSON value.
* @returns the validated positive safe integer.
*/
const labelStudioTaskId = (value) => positiveId(value, "taskId");
/**
* Validate and brand a Label Studio annotation id.
* @param value - untrusted numeric REST or JSON value.
* @returns the validated positive safe integer.
*/
const labelStudioAnnotationId = (value) => positiveId(value, "annotationId");
/**
* Validate and brand a Label Studio prediction id.
* @param value - untrusted numeric REST or JSON value.
* @returns the validated positive safe integer.
*/
const labelStudioPredictionId = (value) => positiveId(value, "predictionId");
/**
* Validate and brand a browser context source UUID.
* @param value - untrusted JSON string.
* @returns the validated UUID.
*/
const labelStudioContextSourceId = (value) => uuid(value, "sourceId");
/**
* Validate and brand a Host lease UUID.
* @param value - untrusted JSON string.
* @returns the validated UUID.
*/
const labelStudioContextLeaseId = (value) => uuid(value, "leaseId");
/**
* Validate and brand a Host focus correlation UUID.
* @param value - untrusted JSON string.
* @returns the validated UUID.
*/
const labelStudioFocusCorrelationId = (value) => uuid(value, "correlationId");
/**
* Validate and brand a Host current-page inspection UUID.
* @param value - untrusted JSON string.
* @returns the validated UUID.
*/
const labelStudioPageInspectionId = (value) => uuid(value, "inspectionId");
/**
* Validate and brand a browser navigation sequence.
* @param value - untrusted numeric JSON value.
* @returns the validated non-negative safe integer.
*/
function labelStudioNavigationSequence(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("navigationSequence must be a non-negative safe integer");
	return value;
}
//#endregion
//#region lib/types/webhook-payload.js
/** Finite Label Studio Webhook payload reduction. */
/** Every known single and batch action understood by the finite parser. */
const LABEL_STUDIO_WEBHOOK_ACTIONS = [
	"PROJECT_CREATED",
	"PROJECT_UPDATED",
	"PROJECT_DELETED",
	"TASK_CREATED",
	"TASKS_CREATED",
	"TASK_DELETED",
	"TASKS_DELETED",
	"ANNOTATION_CREATED",
	"ANNOTATIONS_CREATED",
	"ANNOTATION_UPDATED",
	"ANNOTATION_DELETED",
	"ANNOTATIONS_DELETED"
];
/**
* Reduce an untrusted Label Studio Webhook JSON value to action and resource ids.
* @param input - parsed JSON request body.
* @returns one validated identifier-only event.
*/
function parseLabelStudioWebhook(input) {
	const body = record$1(input);
	const action = body.action;
	if (typeof action !== "string" || !LABEL_STUDIO_WEBHOOK_ACTIONS.includes(action)) fail$1();
	const knownAction = action;
	const projectId = id(record$1(body.project).id, labelStudioProjectId);
	switch (knownAction) {
		case "PROJECT_CREATED":
		case "PROJECT_UPDATED":
		case "PROJECT_DELETED": return {
			action: knownAction,
			projectId
		};
		case "TASK_CREATED":
		case "TASK_DELETED": {
			const task = record$1(body.task);
			assertProject(task.project, projectId, action === "TASK_CREATED");
			return {
				action: knownAction,
				projectId,
				taskIds: [id(task.id, labelStudioTaskId)]
			};
		}
		case "TASKS_CREATED":
		case "TASKS_DELETED": {
			const tasks = nonEmptyRecords(body.tasks);
			const requireProject = action === "TASKS_CREATED";
			for (const task of tasks) assertProject(task.project, projectId, requireProject);
			return {
				action: knownAction,
				projectId,
				taskIds: mapNonEmpty(tasks, (task) => id(task.id, labelStudioTaskId))
			};
		}
		case "ANNOTATION_CREATED":
		case "ANNOTATION_UPDATED": {
			const annotation = record$1(body.annotation);
			const task = record$1(body.task);
			const taskId = id(annotation.task, labelStudioTaskId);
			if (id(task.id, labelStudioTaskId) !== taskId) fail$1();
			assertProject(task.project, projectId, true);
			return {
				action: knownAction,
				projectId,
				items: [{
					taskId,
					annotationId: id(annotation.id, labelStudioAnnotationId)
				}]
			};
		}
		case "ANNOTATIONS_CREATED": {
			const annotations = nonEmptyRecords(body.annotation);
			const tasks = nonEmptyRecords(body.task);
			if (annotations.length !== tasks.length) fail$1();
			return {
				action: knownAction,
				projectId,
				items: mapNonEmpty(annotations, (annotation, index) => {
					const task = tasks[index];
					const taskId = id(annotation.task, labelStudioTaskId);
					if (id(task.id, labelStudioTaskId) !== taskId) fail$1();
					assertProject(task.project, projectId, true);
					return {
						taskId,
						annotationId: id(annotation.id, labelStudioAnnotationId)
					};
				})
			};
		}
		case "ANNOTATION_DELETED": return {
			action: knownAction,
			projectId,
			annotationIds: [id(record$1(body.annotation).id, labelStudioAnnotationId)]
		};
		case "ANNOTATIONS_DELETED": return {
			action: knownAction,
			projectId,
			annotationIds: mapNonEmpty(nonEmptyRecords(body.annotations), (annotation) => id(annotation.id, labelStudioAnnotationId))
		};
		default: return assertNever$2(knownAction);
	}
}
function record$1(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) fail$1();
	return value;
}
function nonEmptyRecords(value) {
	if (!Array.isArray(value) || value.length === 0) fail$1();
	return [record$1(value[0]), ...value.slice(1).map(record$1)];
}
function mapNonEmpty(values, transform) {
	return [transform(values[0], 0), ...values.slice(1).map((value, index) => transform(value, index + 1))];
}
function id(value, brand) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) fail$1();
	return brand(value);
}
function assertProject(value, projectId, required) {
	if (value === void 0 && !required) return;
	if (id(value, labelStudioProjectId) !== projectId) fail$1();
}
function fail$1() {
	throw new Error("label-studio: invalid webhook payload");
}
function assertNever$2(value) {
	throw new Error(`label-studio: invalid webhook payload action ${String(value)}`);
}
//#endregion
//#region lib/types/api.js
/** Authenticated Label Studio REST operations used by model tools. */
/** A dispatched Label Studio mutation whose external commit cannot be determined from its response. */
var LabelStudioMutationOutcomeUnknownError = class extends Error {
	operation;
	/**
	* @param operation - fixed HTTP method and path without credentials or response content.
	*/
	constructor(operation) {
		super(`label-studio: ${operation} submission status is unknown; verify Label Studio before retrying`);
		this.operation = operation;
		this.name = "LabelStudioMutationOutcomeUnknownError";
	}
};
/** Sanitized non-success response from one Label Studio HTTP operation. */
var LabelStudioHttpError = class extends Error {
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
		this.name = "LabelStudioHttpError";
	}
};
/** REST client that resolves and exchanges its PAT refresh credential once per operation. */
var LabelStudioApi = class {
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
		const operation = "POST /api/projects/";
		const body = await this.request("/api/projects/", {
			method: "POST",
			body: {
				title: input.title,
				...input.labelConfig === void 0 ? {} : { label_config: input.labelConfig },
				...input.description === void 0 ? {} : { description: input.description }
			},
			...signal === void 0 ? {} : { signal }
		});
		return decodeMutationResponse(operation, () => ({
			id: projectIdField(body, "id"),
			title: stringField$1(body, "title")
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
			method: "POST",
			body: tasks,
			...signal === void 0 ? {} : { signal }
		});
		return decodeMutationResponse(operation, () => {
			const ids = Array.isArray(body.task_ids) ? body.task_ids.map((value, index) => numberValue(value, `task_ids[${index}]`)) : [];
			return {
				taskCount: numberField(body, "task_count"),
				taskIds: ids
			};
		});
	}
	/**
	* Attach one model prediction to an existing task.
	* @param input - task id, Label Studio result array, and optional model facts.
	* @param signal - optional caller cancellation.
	* @returns stable identity fields from the created prediction.
	*/
	async createPrediction(input, signal) {
		const operation = "POST /api/predictions/";
		const body = await this.request("/api/predictions/", {
			method: "POST",
			body: {
				task: input.taskId,
				result: input.result,
				...input.modelVersion === void 0 ? {} : { model_version: input.modelVersion },
				...input.score === void 0 ? {} : { score: input.score }
			},
			...signal === void 0 ? {} : { signal }
		});
		return decodeMutationResponse(operation, () => {
			const modelVersion = body.model_version;
			return {
				id: numberField(body, "id"),
				taskId: taskIdField(body, "task"),
				...typeof modelVersion === "string" ? { modelVersion } : {}
			};
		}, (prediction) => assertRequestedId("task", input.taskId, prediction.taskId));
	}
	/**
	* Replace one project's Label Studio labeling-interface XML.
	* @param projectId - verified target project.
	* @param labelConfig - complete Label Studio labeling-interface XML.
	* @param signal - optional caller cancellation.
	* @returns response fields proven to match the requested update.
	*/
	async updateProjectLabelConfig(projectId, labelConfig, signal) {
		const operation = `PATCH /api/projects/${projectId}/`;
		const body = await this.request(`/api/projects/${projectId}/`, {
			method: "PATCH",
			body: { label_config: labelConfig },
			...signal === void 0 ? {} : { signal }
		});
		return decodeMutationResponse(operation, () => {
			const updated = {
				id: projectIdField(body, "id"),
				labelConfig: stringField$1(body, "label_config")
			};
			assertRequestedId("project", projectId, updated.id);
			if (updated.labelConfig !== labelConfig) throw new Error("label config response does not match the requested value");
			return updated;
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
			method: "GET",
			...signal === void 0 ? {} : { signal }
		});
		const project = {
			id: projectIdField(body, "id"),
			labelConfig: stringField$1(body, "label_config"),
			showCollabPredictions: booleanField(body, "show_collab_predictions")
		};
		assertRequestedId("project", projectId, project.id);
		return project;
	}
	/**
	* Read one complete task including saved annotations and predictions.
	* @param taskId - validated Label Studio task id.
	* @param signal - optional caller cancellation.
	* @returns authoritative task data and result arrays.
	*/
	async getTask(taskId, signal) {
		const task = parseTaskView(await this.request(`/api/tasks/${taskId}/`, {
			method: "GET",
			...signal === void 0 ? {} : { signal }
		}));
		assertRequestedId("task", taskId, task.id);
		return task;
	}
	/** List every project id visible to the authenticated Label Studio user. */
	async listProjectIds(signal) {
		const projectIds = [];
		let path = "/api/projects/?page_size=100";
		while (path !== void 0) {
			const body = await this.request(path, {
				method: "GET",
				...signal === void 0 ? {} : { signal }
			});
			if (!Array.isArray(body.results)) throw new Error("label-studio: response field \"results\" must be an array");
			projectIds.push(...body.results.map((value, index) => projectIdField(recordValue(value, `results[${index}]`), "id")));
			path = nextApiPath(body.next, this.baseUrl);
		}
		return projectIds;
	}
	/** Create one explicitly configured project Webhook. */
	async createWebhook(input, signal) {
		const operation = "POST /api/webhooks/";
		const body = await this.request("/api/webhooks/", {
			method: "POST",
			body: input,
			...signal === void 0 ? {} : { signal }
		});
		return decodeMutationResponse(operation, () => parseWebhookRegistration(body), (registration) => {
			if (registration.projectId !== input.project || registration.url !== input.url || registration.ownerId !== input.headers["X-DSH-Label-Studio-Owner"]) throw new Error("created Webhook does not match request");
		});
	}
	/** List action names supported by this Label Studio deployment. */
	async listWebhookActions(signal) {
		const body = await this.request("/api/webhooks/info/", {
			method: "GET",
			...signal === void 0 ? {} : { signal }
		});
		return new Set(LABEL_STUDIO_WEBHOOK_ACTIONS.filter((action) => Object.hasOwn(body, action)));
	}
	/** List Webhooks and reduce each record to id, URL, and plugin owner header. */
	async listWebhooks(signal) {
		const accessToken = await this.exchangeAccessToken(await this.resolveRefreshCredential(), signal);
		const value = await this.fetchJsonValue("/api/webhooks/", {
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${accessToken}`
			},
			...signal === void 0 ? {} : { signal }
		});
		return (Array.isArray(value) ? value : webhookResults(value)).map((value, index) => parseWebhookRegistration(recordValue(value, `results[${index}]`)));
	}
	/** Delete one exact Webhook registration. */
	async deleteWebhook(webhookId, signal) {
		if (!Number.isSafeInteger(webhookId) || webhookId <= 0) throw new TypeError("label-studio: webhook id must be a positive safe integer");
		const path = `/api/webhooks/${webhookId}/`;
		const credential = await this.resolveRefreshCredential();
		const accessToken = await this.exchangeAccessToken(credential, signal);
		if (signal?.aborted === true) throw new Error(`label-studio: DELETE ${path} cancelled before dispatch`);
		let response;
		try {
			response = await this.fetcher(`${this.baseUrl}${path}`, {
				method: "DELETE",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${accessToken}`
				},
				...signal === void 0 ? {} : { signal }
			});
		} catch {
			throw new LabelStudioMutationOutcomeUnknownError(`DELETE ${path}`);
		}
		if (!response.ok) {
			await cancelBody(response.body);
			throw new LabelStudioHttpError("DELETE", path, response.status);
		}
		try {
			await readBoundedResponse(response, this.responseMaxBytes, `DELETE ${path}`);
		} catch {
			throw new LabelStudioMutationOutcomeUnknownError(`DELETE ${path}`);
		}
	}
	async request(path, request) {
		const accessToken = await this.exchangeAccessToken(await this.resolveRefreshCredential(), request.signal);
		if (request.signal?.aborted === true) throw new Error(`label-studio: ${request.method} ${path} cancelled before dispatch`);
		return this.fetchJsonObject(path, {
			method: request.method,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${accessToken}`,
				...request.method === "POST" || request.method === "PATCH" ? { "Content-Type": "application/json" } : {}
			},
			...request.body === void 0 ? {} : { body: JSON.stringify(request.body) },
			...request.signal === void 0 ? {} : { signal: request.signal }
		}, request.method !== "GET");
	}
	async exchangeAccessToken(refreshToken, signal) {
		const path = "/api/token/refresh/";
		const access = (await this.fetchJsonObject(path, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ refresh: refreshToken }),
			...signal === void 0 ? {} : { signal }
		})).access;
		if (typeof access !== "string" || access.length === 0) throw new Error(`label-studio: POST ${path} response field "access" must be a non-empty string`);
		return access;
	}
	async fetchJsonObject(path, init, mutation = false) {
		const value = await this.fetchJsonValue(path, init, mutation);
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			if (mutation) throw new LabelStudioMutationOutcomeUnknownError(`${init.method ?? "GET"} ${path}`);
			throw new Error(`label-studio: ${init.method ?? "GET"} ${path} must return a JSON object`);
		}
		return value;
	}
	async fetchJsonValue(path, init, mutation = false) {
		const operation = `${init.method ?? "GET"} ${path}`;
		if (init.signal?.aborted === true) throw new Error(`label-studio: ${operation} cancelled before dispatch`);
		let pending;
		try {
			pending = this.fetcher(`${this.baseUrl}${path}`, init);
		} catch (error) {
			const outcome = isAbort(error, init.signal) ? "cancelled before dispatch" : "request failed before dispatch";
			throw new Error(`label-studio: ${operation} ${outcome}`);
		}
		let response;
		try {
			response = await pending;
		} catch (error) {
			if (mutation) throw new LabelStudioMutationOutcomeUnknownError(operation);
			const outcome = isAbort(error, init.signal) ? "cancelled" : "request failed";
			throw new Error(`label-studio: ${operation} ${outcome}`);
		}
		let raw;
		try {
			raw = await readBoundedResponse(response, this.responseMaxBytes, operation);
		} catch (error) {
			if (mutation && response.ok) throw new LabelStudioMutationOutcomeUnknownError(operation);
			throw error;
		}
		if (!response.ok) throw new LabelStudioHttpError(init.method, path, response.status);
		try {
			return JSON.parse(raw);
		} catch (error) {
			if (mutation) throw new LabelStudioMutationOutcomeUnknownError(operation);
			throw new Error(`label-studio: ${operation} returned invalid JSON`);
		}
	}
	async resolveRefreshCredential() {
		const credential = await this.credentials.resolve(this.refreshTokenCredential);
		if (credential === void 0) throw new Error(`label-studio: credential "${String(this.refreshTokenCredential)}" is not configured`);
		return credential.value;
	}
};
function parseWebhookRegistration(body) {
	const ownerId = recordValue(body.headers, "headers")["X-DSH-Label-Studio-Owner"];
	if (ownerId !== void 0 && (typeof ownerId !== "string" || ownerId === "")) throw new Error("label-studio: response field \"headers.X-DSH-Label-Studio-Owner\" must be a string");
	return {
		id: numberField(body, "id"),
		projectId: projectIdField(body, "project"),
		url: stringField$1(body, "url"),
		...ownerId === void 0 ? {} : { ownerId }
	};
}
function nextApiPath(value, baseUrl) {
	if (value === null) return void 0;
	if (typeof value !== "string") throw new Error("label-studio: response field \"next\" must be a URL or null");
	const next = new URL(value, baseUrl);
	if (next.origin !== baseUrl) throw new Error("label-studio: response field \"next\" must use the configured origin");
	return `${next.pathname}${next.search}`;
}
function webhookResults(value) {
	const body = recordValue(value, "webhooks response");
	if (!Array.isArray(body.results)) throw new Error("label-studio: response field \"results\" must be an array");
	return body.results;
}
function decodeMutationResponse(operation, decode, verify) {
	try {
		const value = decode();
		verify?.(value);
		return value;
	} catch {
		throw new LabelStudioMutationOutcomeUnknownError(operation);
	}
}
async function readBoundedResponse(response, maxBytes, operation) {
	const declared = response.headers.get("content-length")?.trim();
	if (declared !== void 0 && /^\d+$/.test(declared) && BigInt(declared) > BigInt(maxBytes)) {
		await cancelBody(response.body);
		throw responseTooLarge(operation, maxBytes, response.status);
	}
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	while (true) {
		let item;
		try {
			item = await reader.read();
		} catch (error) {
			await cancelReader(reader);
			const outcome = isAbort(error) ? "cancelled while reading its response" : "response read failed";
			throw new Error(`label-studio: ${operation} ${outcome} (status ${response.status})`);
		}
		if (item.done) break;
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
	return /* @__PURE__ */ new Error(`label-studio: ${operation} response exceeded ${maxBytes} bytes (status ${status})`);
}
async function cancelBody(body) {
	if (body === null) return;
	try {
		await body.cancel();
	} catch (cancelError) {}
}
async function cancelReader(reader) {
	try {
		await reader.cancel();
	} catch (cancelError) {}
}
function isAbort(error, signal) {
	return signal?.aborted === true || typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
function numberField(value, field) {
	return numberValue(value[field], field);
}
function numberValue(value, field) {
	if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`label-studio: response field "${field}" must be an integer`);
	return value;
}
function stringField$1(value, field) {
	const fieldValue = value[field];
	if (typeof fieldValue !== "string") throw new Error(`label-studio: response field "${field}" must be a string`);
	return fieldValue;
}
function booleanField(value, field) {
	const fieldValue = value[field];
	if (typeof fieldValue !== "boolean") throw new Error(`label-studio: response field "${field}" must be a boolean`);
	return fieldValue;
}
function jsonRecordField(value, field) {
	const fieldValue = value[field];
	if (typeof fieldValue !== "object" || fieldValue === null || Array.isArray(fieldValue)) throw new Error(`label-studio: response field "${field}" must be a JSON object`);
	return fieldValue;
}
function projectIdField(value, field) {
	return labelStudioProjectId(numberField(value, field));
}
function taskIdField(value, field) {
	return labelStudioTaskId(numberField(value, field));
}
function assertRequestedId(kind, requested, received) {
	if (requested !== received) throw new Error(`label-studio: requested ${kind} ${requested} but received ${kind} ${received}`);
}
function parseTaskView(body) {
	const annotations = body.annotations;
	if (!Array.isArray(annotations)) throw new Error("label-studio: response field \"annotations\" must be an array");
	const predictions = body.predictions;
	if (!Array.isArray(predictions)) throw new Error("label-studio: response field \"predictions\" must be an array");
	return {
		id: taskIdField(body, "id"),
		projectId: projectIdField(body, "project"),
		data: jsonRecordField(body, "data"),
		annotations: annotations.map((value, index) => parseAnnotation(value, index)),
		predictions: predictions.map((value, index) => parsePrediction(value, index))
	};
}
function parseAnnotation(value, index) {
	const field = `annotations[${index}]`;
	const body = recordValue(value, field);
	return {
		id: labelStudioAnnotationId(numberFieldAt(body, "id", `${field}.id`)),
		projectId: labelStudioProjectId(numberFieldAt(body, "project", `${field}.project`)),
		taskId: labelStudioTaskId(numberFieldAt(body, "task", `${field}.task`)),
		result: jsonArrayFieldAt(body, "result", `${field}.result`),
		updatedAt: stringFieldAt(body, "updated_at", `${field}.updated_at`)
	};
}
function parsePrediction(value, index) {
	const field = `predictions[${index}]`;
	const body = recordValue(value, field);
	const modelVersion = optionalStringField(body, "model_version", `${field}.model_version`);
	const score = optionalFiniteNumberField(body, "score", `${field}.score`);
	return {
		id: labelStudioPredictionId(numberFieldAt(body, "id", `${field}.id`)),
		projectId: labelStudioProjectId(numberFieldAt(body, "project", `${field}.project`)),
		taskId: labelStudioTaskId(numberFieldAt(body, "task", `${field}.task`)),
		result: jsonArrayFieldAt(body, "result", `${field}.result`),
		...modelVersion === void 0 ? {} : { modelVersion },
		...score === void 0 ? {} : { score }
	};
}
function recordValue(value, field) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`label-studio: response field "${field}" must be a JSON object`);
	return value;
}
function numberFieldAt(value, key, field) {
	return numberValue(value[key], field);
}
function stringFieldAt(value, key, field) {
	const fieldValue = value[key];
	if (typeof fieldValue !== "string") throw new Error(`label-studio: response field "${field}" must be a string`);
	return fieldValue;
}
function jsonArrayFieldAt(value, key, field) {
	const fieldValue = value[key];
	if (!Array.isArray(fieldValue)) throw new Error(`label-studio: response field "${field}" must be an array`);
	return fieldValue;
}
function optionalStringField(value, key, field) {
	const fieldValue = value[key];
	if (fieldValue === void 0 || fieldValue === null) return void 0;
	if (typeof fieldValue !== "string") throw new Error(`label-studio: response field "${field}" must be a string when present`);
	return fieldValue;
}
function optionalFiniteNumberField(value, key, field) {
	const fieldValue = value[key];
	if (fieldValue === void 0 || fieldValue === null) return void 0;
	if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) throw new Error(`label-studio: response field "${field}" must be a finite number when present`);
	return fieldValue;
}
/**
* Verify that REST project, task, annotation, and prediction ids match the live browser target.
* @param active - committed identifiers owned by the current Session lease.
* @param project - authoritative project REST projection.
* @param task - authoritative task REST projection.
* @returns the validated project and task pair.
*/
function validateSelectedTask(active, project, task) {
	if (project.id !== active.projectId || task.projectId !== project.id) throw new Error("label-studio: active project does not match the REST project and task");
	if (task.id !== active.taskId) throw new Error("label-studio: active task does not match the REST task");
	for (const annotation of task.annotations) if (annotation.projectId !== project.id || annotation.taskId !== task.id) throw new Error("label-studio: annotation does not belong to the active project and task");
	for (const prediction of task.predictions) if (prediction.projectId !== project.id || prediction.taskId !== task.id) throw new Error("label-studio: prediction does not belong to the active project and task");
	if (active.annotationId !== void 0 && !task.annotations.some((annotation) => annotation.id === active.annotationId)) throw new Error("label-studio: active annotation does not belong to the REST task");
	return {
		project,
		task
	};
}
//#endregion
//#region lib/types/boot-config.js
/** Host-injected browser endpoint for the Label Studio iframe. */
function script(config) {
	return `<script>window.__DSH_LABEL_STUDIO__=${JSON.stringify(config).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029")}<\/script>`;
}
/**
* Insert the browser endpoint before the application module starts.
* @param html - raw application index HTML.
* @param config - validated browser synchronization fields.
* @returns HTML containing the boot assignment.
*/
function injectLabelStudioBootConfig(html, config) {
	const source = script(config);
	const body = /<body(?:\s[^>]*)?>/i.exec(html);
	if (body === null) return `${html}${source}`;
	const at = body.index + body[0].length;
	return `${html.slice(0, at)}${source}${html.slice(at)}`;
}
//#endregion
//#region lib/types/context-registry.js
/** Session-scoped ownership and target state for the Label Studio browser surface. */
/** Domain failure raised by the synchronous context state machine. */
var LabelStudioContextError = class extends Error {
	code;
	retryAfterMs;
	/**
	* Create a stable context failure.
	* @param code - machine-readable failure category.
	* @param message - operator-facing explanation without request data.
	* @param retryAfterMs - exact remaining lease duration for a conflict.
	*/
	constructor(code, message, retryAfterMs) {
		super(message);
		this.code = code;
		this.retryAfterMs = retryAfterMs;
		this.name = "LabelStudioContextError";
	}
};
function nonNegativeInteger(value, name) {
	if (!Number.isSafeInteger(value) || value < 0) throw new LabelStudioContextError("invalid-request", `${name} must be a non-negative safe integer`);
	return value;
}
function snapshotTarget(target) {
	return Object.freeze(target.annotationId === void 0 ? {
		projectId: target.projectId,
		taskId: target.taskId
	} : {
		projectId: target.projectId,
		taskId: target.taskId,
		annotationId: target.annotationId
	});
}
function targetsEqual$1(left, right) {
	return left.projectId === right.projectId && left.taskId === right.taskId && left.annotationId === right.annotationId;
}
function snapshotState(state) {
	switch (state.phase) {
		case "vacant": return Object.freeze({
			phase: "vacant",
			targetRevision: state.targetRevision
		});
		case "reserved": return Object.freeze({
			phase: "reserved",
			targetRevision: state.targetRevision,
			reservation: Object.freeze({ ...state.reservation })
		});
		case "committed": return Object.freeze({
			phase: "committed",
			targetRevision: state.targetRevision,
			target: snapshotTarget(state.target)
		});
	}
}
/** Owns one expiring Label Studio browser lease per DSH Session. */
var LabelStudioContextRegistry = class {
	leaseTtlMs;
	clock;
	bySession = /* @__PURE__ */ new Map();
	byLease = /* @__PURE__ */ new Map();
	lastGeneration = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	deletingSessions = /* @__PURE__ */ new Set();
	disposed = false;
	/**
	* Create an empty registry.
	* @param leaseTtlMs - positive safe-integer lifetime applied by open and renew.
	* @param clock - epoch-millisecond clock used for deterministic expiry.
	*/
	constructor(leaseTtlMs, clock = Date.now) {
		this.leaseTtlMs = leaseTtlMs;
		this.clock = clock;
		if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 0) throw new TypeError("leaseTtlMs must be a positive safe integer");
	}
	/**
	* Open a new Session lease or idempotently recover the current source's lease.
	* @param sessionId - persistent DSH Session identity already verified by the caller.
	* @param sourceId - browser page UUID.
	* @param replayBaseline - broker revision captured before creating the lease.
	* @returns the immutable lease and its original replay baseline.
	*/
	openLease(sessionId, sourceId, replayBaseline) {
		this.assertUsable();
		if (this.deletingSessions.has(sessionId)) throw new LabelStudioContextError("invalid-request", "Session context is being deleted");
		nonNegativeInteger(replayBaseline, "replayBaseline");
		const current = this.recordForSession(sessionId);
		const now = this.clock();
		if (current !== void 0) {
			if (current.sourceId !== sourceId) throw new LabelStudioContextError("lease-conflict", "another browser source owns this Session", Math.max(1, Math.ceil(current.expiresAt - now)));
			current.expiresAt = now + this.leaseTtlMs;
			return this.openSnapshot(current);
		}
		const priorGeneration = this.lastGeneration.get(sessionId) ?? 0;
		if (priorGeneration >= Number.MAX_SAFE_INTEGER) throw new LabelStudioContextError("invalid-request", "lease generation is exhausted");
		const generation = priorGeneration + 1;
		const record = {
			sessionId,
			sourceId,
			leaseId: labelStudioContextLeaseId(randomUUID()),
			generation,
			replayBaseline,
			expiresAt: now + this.leaseTtlMs,
			context: Object.freeze({
				phase: "vacant",
				targetRevision: 0
			})
		};
		this.lastGeneration.set(sessionId, generation);
		this.bySession.set(sessionId, record);
		this.byLease.set(record.leaseId, record);
		return this.openSnapshot(record);
	}
	/**
	* Reserve the next target revision for a browser navigation.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @param navigationSequence - browser-monotonic navigation sequence.
	* @param expectedTargetRevision - compare-and-swap revision observed by the browser.
	* @returns the immutable reservation receipt.
	*/
	reserveBrowserTarget(leaseId, generation, navigationSequence, expectedTargetRevision) {
		const record = this.requireLease(leaseId, generation);
		nonNegativeInteger(expectedTargetRevision, "expectedTargetRevision");
		const prior = record.browserReceipt;
		if (prior !== void 0 && navigationSequence <= prior.navigationSequence) {
			if (prior.kind === "reserve" && navigationSequence === prior.navigationSequence && expectedTargetRevision === prior.expectedTargetRevision) return this.reservationSnapshot(record, prior.targetRevision, navigationSequence);
			throw new LabelStudioContextError("stale-revision", "browser navigation sequence is stale");
		}
		if (expectedTargetRevision !== record.context.targetRevision) throw new LabelStudioContextError("stale-revision", "target revision compare-and-swap failed");
		const targetRevision = this.nextRevision(record.context.targetRevision);
		record.context = Object.freeze({
			phase: "reserved",
			targetRevision,
			reservation: Object.freeze({
				kind: "browser",
				navigationSequence
			})
		});
		record.browserReceipt = Object.freeze({
			kind: "reserve",
			navigationSequence,
			expectedTargetRevision,
			targetRevision
		});
		return this.reservationSnapshot(record, targetRevision, navigationSequence);
	}
	/**
	* Replace the current target with vacant state for a browser navigation.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @param navigationSequence - browser-monotonic navigation sequence.
	* @param expectedTargetRevision - compare-and-swap revision observed before clearing.
	* @returns the immutable vacant state, including the incremented target revision.
	*/
	clearBrowserTarget(leaseId, generation, navigationSequence, expectedTargetRevision) {
		const record = this.requireLease(leaseId, generation);
		nonNegativeInteger(expectedTargetRevision, "expectedTargetRevision");
		const prior = record.browserReceipt;
		if (prior !== void 0 && navigationSequence <= prior.navigationSequence) {
			if (prior.kind === "clear" && navigationSequence === prior.navigationSequence && expectedTargetRevision === prior.expectedTargetRevision) return Object.freeze({
				phase: "vacant",
				targetRevision: prior.targetRevision
			});
			throw new LabelStudioContextError("stale-revision", "browser navigation sequence is stale");
		}
		if (expectedTargetRevision !== record.context.targetRevision) throw new LabelStudioContextError("stale-revision", "target revision compare-and-swap failed");
		const targetRevision = this.nextRevision(record.context.targetRevision);
		record.context = Object.freeze({
			phase: "vacant",
			targetRevision
		});
		record.browserReceipt = Object.freeze({
			kind: "clear",
			navigationSequence,
			expectedTargetRevision,
			targetRevision
		});
		return snapshotState(record.context);
	}
	/**
	* Reserve the next target revision for a Host focus request.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @param correlationId - Host-issued idempotency key.
	* @returns the immutable reservation receipt.
	*/
	reserveFocusTarget(leaseId, generation, correlationId) {
		const record = this.requireLease(leaseId, generation);
		if (record.context.phase === "reserved") {
			if (record.context.reservation.kind === "focus" && record.context.reservation.correlationId === correlationId) return this.reservationSnapshot(record, record.context.targetRevision);
			throw new LabelStudioContextError("focus-conflict", "another target reservation is pending");
		}
		const targetRevision = this.nextRevision(record.context.targetRevision);
		record.context = Object.freeze({
			phase: "reserved",
			targetRevision,
			reservation: Object.freeze({
				kind: "focus",
				correlationId
			})
		});
		return this.reservationSnapshot(record, targetRevision);
	}
	/**
	* Convert the current reservation into a committed target.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @param targetRevision - revision returned by the reservation operation.
	* @param target - validated Label Studio identifiers to commit.
	* @returns the immutable active context.
	*/
	publishTarget(leaseId, generation, targetRevision, target) {
		const record = this.requireLease(leaseId, generation);
		nonNegativeInteger(targetRevision, "targetRevision");
		if (record.context.phase === "committed" && record.context.targetRevision === targetRevision) {
			if (!targetsEqual$1(record.context.target, target)) throw new LabelStudioContextError("stale-revision", "target revision is already committed");
			return this.activeSnapshot(record);
		}
		if (record.context.phase !== "reserved" || record.context.targetRevision !== targetRevision) throw new LabelStudioContextError("stale-revision", "target reservation is not current");
		record.context = Object.freeze({
			phase: "committed",
			targetRevision,
			target: snapshotTarget(target)
		});
		return this.activeSnapshot(record);
	}
	/**
	* Retire the exact pending focus without advancing the target revision.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @param correlationId - focus id to retire.
	* @returns the resulting immutable target state.
	*/
	retireFocusTarget(leaseId, generation, correlationId) {
		const record = this.requireLease(leaseId, generation);
		if (record.context.phase === "committed") return snapshotState(record.context);
		if (record.context.phase !== "reserved" || record.context.reservation.kind !== "focus" || record.context.reservation.correlationId !== correlationId) throw new LabelStudioContextError("focus-not-found", "focus reservation is not current");
		record.context = Object.freeze({
			phase: "vacant",
			targetRevision: record.context.targetRevision
		});
		return snapshotState(record.context);
	}
	/**
	* Inspect the current lease without extending its expiry.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @returns the immutable Host-only binding.
	*/
	inspectLease(leaseId, generation) {
		return this.bindingSnapshot(this.requireLease(leaseId, generation));
	}
	/**
	* Extend the current lease from the current clock value.
	* @param leaseId - current Host-issued lease id.
	* @param generation - current lease generation.
	* @returns the renewed immutable Host-only binding.
	*/
	renew(leaseId, generation) {
		const record = this.requireLease(leaseId, generation);
		record.expiresAt = this.clock() + this.leaseTtlMs;
		return this.bindingSnapshot(record);
	}
	/**
	* Close only the exact active lease generation.
	* @param leaseId - Host-issued lease id.
	* @param generation - lease generation to close.
	* @returns true when this call removed the active lease; false when it was already absent.
	*/
	closeLease(leaseId, generation) {
		this.assertUsable();
		const record = this.recordForLease(leaseId);
		if (record === void 0 || record.generation !== generation) return false;
		this.remove(record);
		return true;
	}
	/**
	* Read a Session's current lease, including a vacant or reserved target.
	* @param sessionId - persistent DSH Session identity.
	* @returns the immutable binding, or undefined after close or expiry.
	*/
	getLease(sessionId) {
		if (this.disposed) return void 0;
		const record = this.recordForSession(sessionId);
		return record === void 0 ? void 0 : this.bindingSnapshot(record);
	}
	/**
	* Read a Session's committed target while its lease remains live.
	* @param sessionId - persistent DSH Session identity.
	* @returns the immutable active context, or undefined without a committed target.
	*/
	getLive(sessionId) {
		if (this.disposed) return void 0;
		const record = this.recordForSession(sessionId);
		return record?.context.phase === "committed" ? this.activeSnapshot(record) : void 0;
	}
	/** Return every current, unexpired Session lease id. */
	sessionIds() {
		if (this.disposed) return [];
		return [...this.bySession.keys()].filter((sessionId) => this.recordForSession(sessionId) !== void 0);
	}
	/**
	* Subscribe to authoritative lease removal.
	* @param listener - callback isolated from cleanup and sibling callbacks.
	* @returns an idempotent unsubscribe function.
	*/
	onLeaseEnded(listener) {
		this.assertUsable();
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	/**
	* Remove all context state for a deleted persistent Session.
	* @param sessionId - deleted DSH Session identity.
	*/
	deleteSession(sessionId) {
		this.assertUsable();
		this.deletingSessions.add(sessionId);
		try {
			const record = this.bySession.get(sessionId);
			if (record !== void 0) this.remove(record);
			this.lastGeneration.delete(sessionId);
		} finally {
			this.deletingSessions.delete(sessionId);
		}
	}
	/** Remove every lease and listener, permanently rejecting later mutations. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const records = [...this.bySession.values()];
		this.bySession.clear();
		this.byLease.clear();
		this.lastGeneration.clear();
		this.deletingSessions.clear();
		for (const record of records) this.notifyEnded(record.sessionId);
		this.listeners.clear();
	}
	assertUsable() {
		if (this.disposed) throw new LabelStudioContextError("invalid-request", "context registry is disposed");
	}
	nextRevision(current) {
		if (current >= Number.MAX_SAFE_INTEGER) throw new LabelStudioContextError("invalid-request", "target revision is exhausted");
		return current + 1;
	}
	recordForSession(sessionId) {
		const record = this.bySession.get(sessionId);
		if (record !== void 0 && this.clock() >= record.expiresAt) {
			this.remove(record);
			return;
		}
		return record;
	}
	recordForLease(leaseId) {
		const record = this.byLease.get(leaseId);
		if (record !== void 0 && this.clock() >= record.expiresAt) {
			this.remove(record);
			return;
		}
		return record;
	}
	requireLease(leaseId, generation) {
		this.assertUsable();
		nonNegativeInteger(generation, "generation");
		const record = this.recordForLease(leaseId);
		if (record === void 0) throw new LabelStudioContextError("lease-expired", "lease is absent or expired");
		if (record.generation !== generation) throw new LabelStudioContextError("stale-generation", "lease generation is stale");
		return record;
	}
	remove(record) {
		if (this.bySession.get(record.sessionId) !== record) return;
		this.bySession.delete(record.sessionId);
		this.byLease.delete(record.leaseId);
		this.notifyEnded(record.sessionId);
	}
	notifyEnded(sessionId) {
		for (const listener of [...this.listeners]) try {
			listener(sessionId);
		} catch (error) {
			console.error("[label-studio] lease-ended listener threw:", error);
		}
	}
	leaseSnapshot(record) {
		return Object.freeze({
			leaseId: record.leaseId,
			generation: record.generation,
			expiresAt: record.expiresAt
		});
	}
	openSnapshot(record) {
		return Object.freeze({
			lease: this.leaseSnapshot(record),
			replayBaseline: record.replayBaseline
		});
	}
	reservationSnapshot(record, targetRevision, navigationSequence) {
		return Object.freeze(navigationSequence === void 0 ? {
			lease: this.leaseSnapshot(record),
			targetRevision
		} : {
			lease: this.leaseSnapshot(record),
			targetRevision,
			navigationSequence
		});
	}
	bindingSnapshot(record) {
		return Object.freeze({
			sessionId: record.sessionId,
			sourceId: record.sourceId,
			lease: this.leaseSnapshot(record),
			context: snapshotState(record.context)
		});
	}
	activeSnapshot(record) {
		if (record.context.phase !== "committed") throw new LabelStudioContextError("stale-revision", "target is not committed");
		return Object.freeze({
			sessionId: record.sessionId,
			sourceId: record.sourceId,
			leaseId: record.leaseId,
			generation: record.generation,
			targetRevision: record.context.targetRevision,
			expiresAt: record.expiresAt,
			target: snapshotTarget(record.context.target)
		});
	}
};
//#endregion
//#region lib/types/change-broker.js
/** Session-isolated revision history, long polling, and focus acknowledgements. */
function targetsEqual(left, right) {
	return left.projectId === right.projectId && left.taskId === right.taskId && left.annotationId === right.annotationId;
}
/** Maintains the browser event stream and focus receipt for each DSH Session. */
var LabelStudioChangeBroker = class {
	registry;
	historySize;
	sessionContexts;
	states = /* @__PURE__ */ new Map();
	unsubscribeLeaseEnded;
	disposed = false;
	/**
	* Create a broker and subscribe to authoritative lease removal.
	* @param registry - context registry committing focus targets.
	* @param historySize - positive bounded event count retained per Session.
	* @param sessionContexts - durable page store completed before target publication.
	*/
	constructor(registry, historySize, sessionContexts) {
		this.registry = registry;
		this.historySize = historySize;
		this.sessionContexts = sessionContexts;
		if (!Number.isSafeInteger(historySize) || historySize <= 0) throw new TypeError("historySize must be a positive safe integer");
		this.unsubscribeLeaseEnded = registry.onLeaseEnded((sessionId) => {
			this.deleteSession(sessionId);
		});
	}
	/**
	* Publish a successful task mutation.
	* @param sessionId - Session whose controlled task changed.
	* @param taskId - changed Label Studio task.
	* @param reason - stable mutation reason.
	* @returns the immutable published event.
	*/
	publishTaskChanged(sessionId, taskId, reason) {
		const state = this.state(sessionId);
		const event = Object.freeze({
			kind: "task-changed",
			eventRevision: this.nextRevision(state),
			taskId,
			reason
		});
		this.append(state, event);
		return event;
	}
	/**
	* Publish one on-demand iframe inspection through the existing Session event stream.
	* @param sessionId - Session whose browser lease owns the iframe.
	* @param inspectionId - Host-generated one-shot request identity.
	* @param deadlineAt - absolute response deadline.
	* @returns the immutable published event.
	*/
	publishCurrentPageInspection(sessionId, inspectionId, deadlineAt) {
		if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= 0) throw new LabelStudioContextError("invalid-request", "inspection deadline must be a positive safe integer");
		const state = this.state(sessionId);
		const event = Object.freeze({
			kind: "inspect-current-page",
			inspectionId,
			deadlineAt,
			eventRevision: this.nextRevision(state)
		});
		this.append(state, event);
		return event;
	}
	/** Publish a complete binding after Host-side deletion reconciliation. */
	publishBindingChanged(sessionId, binding) {
		const state = this.state(sessionId);
		const event = Object.freeze({
			kind: "binding-changed",
			binding,
			eventRevision: this.nextRevision(state)
		});
		this.append(state, event);
		return event;
	}
	/** Broadcast a non-sensitive unmatched-Webhook status to every current plugin lease. */
	publishWebhookUnassigned() {
		for (const sessionId of this.registry.sessionIds()) {
			const state = this.state(sessionId);
			this.append(state, Object.freeze({
				kind: "webhook-unassigned",
				reason: "no-matching-binding",
				eventRevision: this.nextRevision(state)
			}));
		}
	}
	/** Broadcast current optional Webhook availability to every current plugin lease. */
	publishWebhookStatus(status) {
		for (const sessionId of this.registry.sessionIds()) {
			const state = this.state(sessionId);
			this.append(state, Object.freeze({
				kind: "webhook-status",
				status,
				eventRevision: this.nextRevision(state)
			}));
		}
	}
	/**
	* Read the current event cursor without modifying the Session.
	* @param sessionId - DSH Session identity.
	* @returns current revision, or zero before the first event.
	*/
	latestRevision(sessionId) {
		if (this.disposed) return 0;
		return this.states.get(sessionId)?.latestRevision ?? 0;
	}
	/**
	* Retire the current focus receipt after a newer successful reservation.
	* @param sessionId - Session whose old receipt is superseded.
	*/
	retireFocus(sessionId) {
		const state = this.states.get(sessionId);
		if (state === void 0) return;
		if (state.pending !== void 0) this.cancelPending(state, state.pending, new LabelStudioContextError("focus-not-found", "focus request was superseded"));
		state.completed = void 0;
		this.wake(state);
	}
	/**
	* Delete all event and pending state for a Session.
	* @param sessionId - persistent Session identity.
	*/
	deleteSession(sessionId) {
		const state = this.states.get(sessionId);
		if (state === void 0) return;
		this.states.delete(sessionId);
		const error = new LabelStudioContextError("lease-expired", "lease ended");
		for (const waiter of [...state.waiters]) waiter.reject(error);
		state.waiters.clear();
		if (state.pending !== void 0) this.cancelPending(state, state.pending, error, false);
	}
	/**
	* Mark a confirmed missing project in durable Session history and retire its live lease.
	* @param identity - exact Session lifecycle that observed the missing project.
	* @param projectId - project confirmed missing by an authenticated REST read.
	* @returns updated durable page snapshot with project-list fallback.
	*/
	async markProjectDeleted(identity, projectId) {
		const snapshot = await this.sessionContexts.markProjectDeleted(identity, projectId);
		this.registry.deleteSession(identity.sessionId);
		return snapshot;
	}
	/**
	* Publish one focus request and await its matching browser ACK.
	* @param identity - exact Session lifecycle owning the browser lease.
	* @param correlationId - Host-generated idempotency key.
	* @param reservation - registry focus reservation.
	* @param target - target the browser must apply.
	* @param timeoutMs - positive ACK deadline duration.
	* @param signal - caller/package cancellation.
	* @returns committed active context after ACK.
	*/
	requestFocus(identity, correlationId, reservation, target, timeoutMs, signal) {
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new LabelStudioContextError("invalid-request", "focus timeout must be positive"));
		const state = this.state(identity.sessionId);
		if (state.pending !== void 0) return Promise.reject(new LabelStudioContextError("focus-conflict", "another focus request is pending"));
		signal.throwIfAborted();
		state.completed = void 0;
		const expectedSessionContextRevision = this.sessionContexts.read(identity).revision;
		const deadlineAt = Date.now() + timeoutMs;
		const promise = new Promise((resolve, reject) => {
			const onAbort = () => {
				const pending = state.pending;
				if (pending?.correlationId === correlationId) this.cancelPending(state, pending, signal.reason);
			};
			const timer = setTimeout(() => {
				const pending = state.pending;
				if (pending?.correlationId === correlationId) this.cancelPending(state, pending, new LabelStudioContextError("focus-not-found", "focus ACK timed out"));
			}, timeoutMs);
			const cleanup = () => {
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
			};
			state.pending = {
				identity,
				correlationId,
				leaseId: reservation.lease.leaseId,
				generation: reservation.lease.generation,
				targetRevision: reservation.targetRevision,
				target: Object.freeze({ ...target }),
				expectedSessionContextRevision,
				deadlineAt,
				resolve,
				reject,
				cleanup
			};
			signal.addEventListener("abort", onAbort, { once: true });
		});
		const event = Object.freeze({
			kind: "focus-task",
			eventRevision: this.nextRevision(state),
			correlationId,
			targetRevision: reservation.targetRevision,
			target: Object.freeze({ ...target }),
			expectedSessionContextRevision,
			deadlineAt,
			committed: false
		});
		this.append(state, event);
		return promise;
	}
	/**
	* Wait for events after a Session cursor.
	* @param sessionId - DSH Session identity.
	* @param afterRevision - last continuously observed event revision.
	* @param timeoutMs - positive long-poll deadline duration.
	* @param signal - cancellation signal.
	* @returns missing event suffix or an empty timeout batch.
	*/
	async wait(sessionId, afterRevision, timeoutMs, signal) {
		this.assertUsable();
		if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) throw new LabelStudioContextError("invalid-request", "afterRevision must be a non-negative safe integer");
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new LabelStudioContextError("invalid-request", "wait timeout must be a positive safe integer");
		signal.throwIfAborted();
		const state = this.state(sessionId);
		const immediate = this.snapshot(state, afterRevision);
		if (immediate.resetRequired || immediate.events.length > 0) return immediate;
		return new Promise((resolve, reject) => {
			let settled = false;
			const finish = (action) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				state.waiters.delete(waiter);
				action();
			};
			const waiter = {
				settle: () => {
					finish(() => {
						try {
							resolve(this.snapshot(state, afterRevision));
						} catch (error) {
							reject(asError(error, "event wait failed"));
						}
					});
				},
				reject: (error) => {
					finish(() => {
						reject(asError(error, "event wait was cancelled"));
					});
				}
			};
			const onAbort = () => {
				waiter.reject(signal.reason);
			};
			const timer = setTimeout(() => {
				waiter.settle();
			}, timeoutMs);
			state.waiters.add(waiter);
			signal.addEventListener("abort", onAbort, { once: true });
		});
	}
	/**
	* Commit or recover the exact matching focus ACK.
	* @param leaseId - current browser lease id.
	* @param generation - current lease generation.
	* @param correlationId - focus request identity.
	* @param targetRevision - reserved target revision.
	* @param target - browser-applied target.
	* @returns committed active context.
	*/
	async acknowledgeFocus(leaseId, generation, correlationId, targetRevision, target) {
		const binding = this.registry.inspectLease(leaseId, generation);
		const state = this.states.get(binding.sessionId);
		if (state === void 0) throw new LabelStudioContextError("focus-not-found", "focus ACK does not match a pending request");
		const completed = state.completed;
		if (completed !== void 0 && completed.leaseId === leaseId && completed.generation === generation && completed.correlationId === correlationId && completed.targetRevision === targetRevision && targetsEqual(completed.target, target)) return completed.context;
		const pending = state.pending;
		if (pending === void 0 || pending.leaseId !== leaseId || pending.generation !== generation || pending.correlationId !== correlationId || pending.targetRevision !== targetRevision || !targetsEqual(pending.target, target)) throw new LabelStudioContextError("focus-not-found", "focus ACK does not match a pending request");
		const pageCommit = {
			leaseId,
			generation,
			navigationSequence: labelStudioNavigationSequence(targetRevision),
			expectedSessionContextRevision: pending.expectedSessionContextRevision,
			page: {
				view: "task",
				projectId: target.projectId,
				taskId: target.taskId,
				...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
			}
		};
		await this.sessionContexts.commit(pending.identity, pageCommit);
		const context = this.registry.publishTarget(leaseId, generation, targetRevision, target);
		pending.cleanup();
		state.pending = void 0;
		state.completed = Object.freeze({
			correlationId,
			leaseId,
			generation,
			targetRevision,
			target: Object.freeze({ ...target }),
			context
		});
		pending.resolve(context);
		this.wake(state);
		return context;
	}
	/** Unsubscribe, reject pending work, and clear all event histories. */
	dispose() {
		if (this.disposed) return Promise.resolve();
		this.disposed = true;
		this.unsubscribeLeaseEnded();
		const error = /* @__PURE__ */ new Error("label-studio: change broker is disposed");
		for (const [sessionId, state] of [...this.states]) {
			this.states.delete(sessionId);
			for (const waiter of [...state.waiters]) waiter.reject(error);
			state.waiters.clear();
			if (state.pending !== void 0) this.cancelPending(state, state.pending, error, false);
		}
		return Promise.resolve();
	}
	state(sessionId) {
		this.assertUsable();
		let state = this.states.get(sessionId);
		if (state === void 0) {
			state = {
				latestRevision: 0,
				history: [],
				waiters: /* @__PURE__ */ new Set(),
				pending: void 0,
				completed: void 0
			};
			this.states.set(sessionId, state);
		}
		return state;
	}
	assertUsable() {
		if (this.disposed) throw new Error("label-studio: change broker is disposed");
	}
	nextRevision(state) {
		if (state.latestRevision >= Number.MAX_SAFE_INTEGER) throw new LabelStudioContextError("invalid-request", "event revision is exhausted");
		state.latestRevision += 1;
		return state.latestRevision;
	}
	append(state, event) {
		state.history.push(event);
		if (state.history.length > this.historySize) state.history.shift();
		this.wake(state);
	}
	wake(state) {
		for (const waiter of [...state.waiters]) waiter.settle();
	}
	snapshot(state, afterRevision) {
		if (afterRevision > state.latestRevision) throw new LabelStudioContextError("future-revision", "event cursor is ahead of the Host");
		const first = state.history[0]?.eventRevision;
		if (first !== void 0 && afterRevision < first - 1) return {
			events: [],
			latestRevision: state.latestRevision,
			resetRequired: true
		};
		const pending = state.pending;
		if (pending !== void 0 && Date.now() >= pending.deadlineAt) this.cancelPending(state, pending, new LabelStudioContextError("focus-not-found", "focus ACK timed out"));
		return {
			events: state.history.filter((event) => event.eventRevision > afterRevision).flatMap((event) => {
				if (event.kind !== "focus-task") return [event];
				const activePending = state.pending?.correlationId === event.correlationId;
				const completed = state.completed?.correlationId === event.correlationId;
				if (!activePending && !completed) return [];
				return [completed ? Object.freeze({
					...event,
					committed: true
				}) : event];
			}),
			latestRevision: state.latestRevision,
			resetRequired: false
		};
	}
	cancelPending(state, pending, reason, retire = true) {
		if (state.pending !== pending) return;
		state.pending = void 0;
		pending.cleanup();
		if (retire) try {
			this.registry.retireFocusTarget(pending.leaseId, pending.generation, pending.correlationId);
		} catch (error) {
			if (!(error instanceof LabelStudioContextError)) throw error;
		}
		pending.reject(reason);
		this.wake(state);
	}
};
function asError(reason, fallback) {
	return reason instanceof Error ? reason : new Error(fallback);
}
//#endregion
//#region lib/types/shared.js
/** Client-safe constants shared by both plugin halves. */
/** Default local Label Studio endpoint. */
const DEFAULT_LABEL_STUDIO_BASE_URL = "http://127.0.0.1:8080";
//#endregion
//#region lib/types/config.js
/** Label Studio plugin configuration and explicit default resolution. */
/** Default launcher used by the installable Bundle and repository example. */
const DEFAULT_LABEL_STUDIO_LAUNCH_MODE = "python";
/** Default global Python command resolved by the subprocess provider. */
const DEFAULT_PYTHON_EXECUTABLE = "python";
/** Default PAT refresh-token credential reference for authenticated REST operations. */
const DEFAULT_REFRESH_TOKEN_CREDENTIAL = "LABEL_STUDIO_PAT";
/** Default maximum decoded byte length of one Label Studio REST response. */
const DEFAULT_REST_RESPONSE_MAX_BYTES = 8388608;
/** Default maximum serialized ContentBlock bytes returned by the active-task tool. */
const DEFAULT_ACTIVE_TASK_MAX_BYTES = 262144;
/** Default deadline for a browser to apply and acknowledge one focus request. */
const DEFAULT_FOCUS_ACK_TIMEOUT_MS = 5e3;
/** Default readiness deadline for a cold Label Studio database migration. */
const DEFAULT_STARTUP_TIMEOUT_MS = 12e4;
/** Default TERM-to-KILL grace for the managed Label Studio process tree. */
const DEFAULT_SHUTDOWN_GRACE_MS = 5e3;
/** Default lifetime renewed by successful browser event waits. */
const DEFAULT_CONTEXT_LEASE_TTL_MS = 3e4;
/** Default maximum duration of one browser event long poll. */
const DEFAULT_EVENT_WAIT_TIMEOUT_MS = 25e3;
/** Default retained browser event count per DSH Session. */
const DEFAULT_EVENT_HISTORY_SIZE = 64;
/** Default interval before retrying an open whose dispatch result is unknown. */
const DEFAULT_CONTEXT_OPEN_RETRY_MS = 1e3;
/** Default abort deadline for best-effort browser lease closure. */
const DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS = 1e3;
/** Default number of recently visited projects retained for each Session. */
const DEFAULT_RECENT_PROJECT_LIMIT = 10;
/** Default deadline for one on-demand current iframe inspection. */
const DEFAULT_CURRENT_PAGE_TIMEOUT_MS = 5e3;
/** Default maximum decoded Label Studio HTML bytes buffered for bridge injection. */
const DEFAULT_FRAME_PROXY_HTML_MAX_BYTES = 2097152;
/** Default Webhook policy keeps tools available when registration is unavailable. */
const DEFAULT_WEBHOOK_MODE = "optional";
/** Default exact DSH WebServer route receiving Label Studio events. */
const DEFAULT_WEBHOOK_PATH = "/api/label-studio/webhook";
/** Default maximum decoded Webhook request bytes. */
const DEFAULT_WEBHOOK_MAX_BODY_BYTES = 1048576;
/** Default Label Studio delivery deadline for a managed Python process. */
const DEFAULT_MANAGED_WEBHOOK_TIMEOUT_SECONDS = 5;
const SUPPORTED_CONFIG_FIELDS = {
	baseUrl: true,
	launchMode: true,
	pythonExecutable: true,
	refreshTokenCredential: true,
	startupTimeoutMs: true,
	shutdownGraceMs: true,
	restResponseMaxBytes: true,
	activeTaskMaxBytes: true,
	focusAckTimeoutMs: true,
	contextLeaseTtlMs: true,
	eventWaitTimeoutMs: true,
	eventHistorySize: true,
	contextOpenRetryMs: true,
	contextCloseTimeoutMs: true,
	recentProjectLimit: true,
	currentPageTimeoutMs: true,
	frameProxyHtmlMaxBytes: true,
	webhookMode: true,
	webhookPath: true,
	webhookMaxBodyBytes: true,
	managedWebhookTimeoutSeconds: true
};
/** Schemastery projection used by Cordis loaders and configuration UIs. */
const Config = z.object({
	baseUrl: z.string().default(DEFAULT_LABEL_STUDIO_BASE_URL),
	launchMode: z.union(["python", "external"]).default(DEFAULT_LABEL_STUDIO_LAUNCH_MODE),
	pythonExecutable: z.string().default(DEFAULT_PYTHON_EXECUTABLE),
	refreshTokenCredential: z.string().role("credential-ref").default(DEFAULT_REFRESH_TOKEN_CREDENTIAL),
	startupTimeoutMs: z.number().min(1).default(DEFAULT_STARTUP_TIMEOUT_MS),
	shutdownGraceMs: z.number().min(1).default(DEFAULT_SHUTDOWN_GRACE_MS),
	restResponseMaxBytes: z.number().min(1).default(DEFAULT_REST_RESPONSE_MAX_BYTES),
	activeTaskMaxBytes: z.number().min(1).default(DEFAULT_ACTIVE_TASK_MAX_BYTES),
	focusAckTimeoutMs: z.number().min(1).default(DEFAULT_FOCUS_ACK_TIMEOUT_MS),
	contextLeaseTtlMs: z.number().min(1).default(DEFAULT_CONTEXT_LEASE_TTL_MS),
	eventWaitTimeoutMs: z.number().min(1).default(DEFAULT_EVENT_WAIT_TIMEOUT_MS),
	eventHistorySize: z.number().min(1).default(64),
	contextOpenRetryMs: z.number().min(1).default(DEFAULT_CONTEXT_OPEN_RETRY_MS),
	contextCloseTimeoutMs: z.number().min(1).default(DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS),
	recentProjectLimit: z.number().min(1).max(100).default(10),
	currentPageTimeoutMs: z.number().min(1).default(DEFAULT_CURRENT_PAGE_TIMEOUT_MS),
	frameProxyHtmlMaxBytes: z.number().min(1).default(DEFAULT_FRAME_PROXY_HTML_MAX_BYTES),
	webhookMode: z.union([
		"required",
		"optional",
		"off"
	]).default(DEFAULT_WEBHOOK_MODE),
	webhookPath: z.string().default(DEFAULT_WEBHOOK_PATH),
	webhookMaxBodyBytes: z.number().min(1).default(DEFAULT_WEBHOOK_MAX_BODY_BYTES),
	managedWebhookTimeoutSeconds: z.number().min(1).default(5)
});
/**
* Resolve every launcher and API default at the package boundary.
* @param config - raw Cordis plugin configuration.
* @returns validated immutable runtime facts.
*/
function resolveConfig(config) {
	if ("apiKeyEnv" in config) throw new Error("label-studio: apiKeyEnv was removed; use refreshTokenCredential");
	if ("allowDirectAnnotationUpdate" in config) throw new Error("label-studio: allowDirectAnnotationUpdate is unsupported; create predictions for user review");
	const unsupportedField = Object.keys(config).find((field) => !Object.hasOwn(SUPPORTED_CONFIG_FIELDS, field));
	if (unsupportedField !== void 0) throw new Error(`label-studio: unsupported configuration field "${unsupportedField}"`);
	let url;
	try {
		url = new URL(config.baseUrl ?? "http://127.0.0.1:8080");
	} catch {
		throw new Error("label-studio: baseUrl must be a loopback HTTP origin");
	}
	const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
	if (url.protocol !== "http:" || !loopback) throw new Error("label-studio: baseUrl must be a loopback HTTP origin");
	if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new Error("label-studio: baseUrl must not contain credentials, a query, or a fragment");
	if (url.pathname !== "/") throw new Error("label-studio: baseUrl must be an origin without a path");
	const pythonExecutable = nonEmpty(config.pythonExecutable ?? "python", "pythonExecutable");
	const launchMode = config.launchMode ?? "python";
	const startupTimeoutMs = positive$1(config.startupTimeoutMs ?? 12e4, "startupTimeoutMs");
	const shutdownGraceMs = positive$1(config.shutdownGraceMs ?? 5e3, "shutdownGraceMs");
	const restResponseMaxBytes = positiveSafeInteger$1(config.restResponseMaxBytes ?? 8388608, "restResponseMaxBytes");
	const activeTaskMaxBytes = positiveSafeInteger$1(config.activeTaskMaxBytes ?? 262144, "activeTaskMaxBytes");
	const focusAckTimeoutMs = positiveSafeInteger$1(config.focusAckTimeoutMs ?? 5e3, "focusAckTimeoutMs");
	const contextLeaseTtlMs = positiveSafeInteger$1(config.contextLeaseTtlMs ?? 3e4, "contextLeaseTtlMs");
	const eventWaitTimeoutMs = positiveSafeInteger$1(config.eventWaitTimeoutMs ?? 25e3, "eventWaitTimeoutMs");
	const eventHistorySize = positiveSafeInteger$1(config.eventHistorySize ?? 64, "eventHistorySize");
	const contextOpenRetryMs = positiveSafeInteger$1(config.contextOpenRetryMs ?? 1e3, "contextOpenRetryMs");
	const contextCloseTimeoutMs = positiveSafeInteger$1(config.contextCloseTimeoutMs ?? 1e3, "contextCloseTimeoutMs");
	const recentProjectLimit = positiveSafeInteger$1(config.recentProjectLimit ?? 10, "recentProjectLimit");
	const currentPageTimeoutMs = positiveSafeInteger$1(config.currentPageTimeoutMs ?? 5e3, "currentPageTimeoutMs");
	const frameProxyHtmlMaxBytes = positiveSafeInteger$1(config.frameProxyHtmlMaxBytes ?? 2097152, "frameProxyHtmlMaxBytes");
	const webhookMode = config.webhookMode ?? "optional";
	const webhookPath = resolveWebhookPath(config.webhookPath ?? "/api/label-studio/webhook");
	const webhookMaxBodyBytes = positiveSafeInteger$1(config.webhookMaxBodyBytes ?? 1048576, "webhookMaxBodyBytes");
	const managedWebhookTimeoutSeconds = positiveSafeInteger$1(config.managedWebhookTimeoutSeconds ?? 5, "managedWebhookTimeoutSeconds");
	if (recentProjectLimit > 100) throw new Error("label-studio: recentProjectLimit must be at most 100");
	if (eventWaitTimeoutMs >= contextLeaseTtlMs) throw new Error("label-studio: eventWaitTimeoutMs must be less than contextLeaseTtlMs");
	return {
		baseUrl: url.href.replace(/\/$/, ""),
		launchMode,
		pythonExecutable,
		refreshTokenCredential: credentialRef(config.refreshTokenCredential ?? "LABEL_STUDIO_PAT"),
		startupTimeoutMs,
		shutdownGraceMs,
		restResponseMaxBytes,
		activeTaskMaxBytes,
		focusAckTimeoutMs,
		contextLeaseTtlMs,
		contextOpenRetryMs,
		contextCloseTimeoutMs,
		eventWaitTimeoutMs,
		eventHistorySize,
		recentProjectLimit,
		currentPageTimeoutMs,
		frameProxyHtmlMaxBytes,
		webhookMode,
		webhookPath,
		webhookMaxBodyBytes,
		managedWebhookTimeoutSeconds
	};
}
function resolveWebhookPath(value) {
	if (!value.startsWith("/") || value === "/" || value.endsWith("/") || value.includes("?") || value.includes("#")) throw new Error("label-studio: webhookPath must be an absolute non-root path without a trailing slash, query, or fragment");
	return value;
}
function nonEmpty(value, field) {
	if (value.trim() === "") throw new Error(`label-studio: ${field} must be non-empty`);
	return value;
}
function positive$1(value, field) {
	if (!Number.isFinite(value) || value <= 0) throw new Error(`label-studio: ${field} must be a positive finite number`);
	return value;
}
function positiveSafeInteger$1(value, field) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`label-studio: ${field} must be a positive safe integer`);
	return value;
}
//#endregion
//#region lib/types/current-page-broker.js
/** One-shot current-page requests carried by the existing browser event channel. */
/** Stable failure from one on-demand iframe inspection. */
var LabelStudioCurrentPageError = class extends Error {
	code;
	/**
	* @param code - model-independent failure category.
	* @param message - sanitized operator-facing explanation.
	*/
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "LabelStudioCurrentPageError";
	}
};
/** Coordinates one concurrent current-page inspection per DSH Session. */
var LabelStudioCurrentPageBroker = class {
	registry;
	changes;
	clock;
	states = /* @__PURE__ */ new Map();
	unsubscribeLeaseEnded;
	disposed = false;
	/**
	* @param registry - authoritative live browser leases.
	* @param changes - existing per-Session browser event stream.
	* @param clock - epoch-millisecond clock for deterministic deadlines.
	*/
	constructor(registry, changes, clock = Date.now) {
		this.registry = registry;
		this.changes = changes;
		this.clock = clock;
		this.unsubscribeLeaseEnded = registry.onLeaseEnded((sessionId) => {
			this.cancelSession(sessionId);
		});
	}
	/**
	* Ask the current Session iframe for its structured Label Studio route.
	* @param identity - exact persistent Session lifecycle selected by the tool.
	* @param timeoutMs - positive one-shot response deadline.
	* @param signal - caller and plugin cancellation.
	* @returns current structured page without writing a binding.
	*/
	request(identity, timeoutMs, signal) {
		if (this.disposed) return Promise.reject(unavailable("current-page broker is disposed"));
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(/* @__PURE__ */ new TypeError("currentPageTimeoutMs must be a positive safe integer"));
		try {
			signal.throwIfAborted();
		} catch (error) {
			return Promise.reject(error);
		}
		const binding = this.registry.getLease(identity.sessionId);
		if (binding === void 0) return Promise.reject(unavailable("this Session has no active browser lease"));
		const state = this.states.get(identity.sessionId) ?? {
			pending: void 0,
			completed: void 0
		};
		if (state.pending !== void 0) return Promise.reject(unavailable("another current-page inspection is pending"));
		state.completed = void 0;
		this.states.set(identity.sessionId, state);
		const inspectionId = labelStudioPageInspectionId(randomUUID());
		const deadlineAt = this.clock() + timeoutMs;
		const promise = new Promise((resolve, reject) => {
			const onAbort = () => {
				this.finish(identity.sessionId, inspectionId, () => {
					reject(signal.reason);
				});
			};
			const timer = setTimeout(() => {
				this.finish(identity.sessionId, inspectionId, () => {
					reject(new LabelStudioCurrentPageError("current-page-timeout", "current page inspection timed out"));
				});
			}, timeoutMs);
			const cleanup = () => {
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
			};
			state.pending = {
				identity,
				leaseId: binding.lease.leaseId,
				generation: binding.lease.generation,
				inspectionId,
				resolve,
				reject,
				cleanup
			};
			signal.addEventListener("abort", onAbort, { once: true });
		});
		try {
			this.changes.publishCurrentPageInspection(identity.sessionId, inspectionId, deadlineAt);
		} catch (error) {
			const pending = this.states.get(identity.sessionId)?.pending;
			if (pending !== void 0) {
				pending.cleanup();
				state.pending = void 0;
				pending.reject(error);
			}
		}
		return promise;
	}
	/**
	* Accept an exact browser receipt or recover an already accepted receipt.
	* @param commit - validated lease, inspection identity, and structured outcome.
	* @param identity - currently authoritative persistent Session lifecycle.
	* @returns idempotent acceptance receipt.
	*/
	commit(commit, identity) {
		const binding = this.registry.inspectLease(commit.leaseId, commit.generation);
		if (binding.sessionId !== identity.sessionId) throw unavailable("inspection response belongs to another Session");
		const state = this.states.get(binding.sessionId);
		const completed = state?.completed;
		if (completed !== void 0 && sameCommit(completed, commit)) return { accepted: true };
		const pending = state?.pending;
		if (state === void 0 || pending === void 0 || pending.leaseId !== commit.leaseId || pending.generation !== commit.generation || pending.inspectionId !== commit.inspectionId || pending.identity.createdAt !== identity.createdAt) throw unavailable("inspection response does not match a pending request");
		pending.cleanup();
		state.pending = void 0;
		state.completed = Object.freeze({
			leaseId: commit.leaseId,
			generation: commit.generation,
			inspectionId: commit.inspectionId,
			outcome: commit.outcome
		});
		switch (commit.outcome.kind) {
			case "page":
				pending.resolve(commit.outcome.page);
				break;
			case "unavailable":
				pending.reject(unavailable("the Label Studio iframe is unavailable"));
				break;
			case "unsupported": pending.reject(new LabelStudioCurrentPageError("current-page-unsupported", "the current Label Studio route is unsupported"));
		}
		return { accepted: true };
	}
	/** Cancel a Session's pending request and idempotency receipt. */
	cancelSession(sessionId) {
		const state = this.states.get(sessionId);
		if (state === void 0) return;
		this.states.delete(sessionId);
		const pending = state.pending;
		if (pending !== void 0) {
			pending.cleanup();
			pending.reject(unavailable("the browser lease ended"));
		}
	}
	/** Cancel all requests and permanently reject new work. */
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.unsubscribeLeaseEnded();
		for (const sessionId of [...this.states.keys()]) this.cancelSession(sessionId);
	}
	finish(sessionId, inspectionId, settle) {
		const state = this.states.get(sessionId);
		if (state?.pending?.inspectionId !== inspectionId) return;
		state.pending.cleanup();
		state.pending = void 0;
		settle();
	}
};
function unavailable(message) {
	return new LabelStudioCurrentPageError("current-page-unavailable", message);
}
function sameCommit(completed, commit) {
	if (completed.leaseId !== commit.leaseId || completed.generation !== commit.generation || completed.inspectionId !== commit.inspectionId || completed.outcome.kind !== commit.outcome.kind) return false;
	if (completed.outcome.kind !== "page" || commit.outcome.kind !== "page") return true;
	return JSON.stringify(completed.outcome.page) === JSON.stringify(commit.outcome.page);
}
//#endregion
//#region lib/types/lifecycle.js
/** Shared cancellation and quiescence gate for Label Studio tools and RPC. */
const CLOSING_MESSAGE = "label-studio: operation gate is closing";
/** Stable rejection for work attempted after package shutdown begins. */
var LabelStudioOperationClosedError = class extends Error {
	constructor() {
		super(CLOSING_MESSAGE);
		this.name = "LabelStudioOperationClosedError";
	}
};
/** Owns package cancellation and tracks operations that entered before close. */
var LabelStudioOperationGate = class {
	lifetime = new AbortController();
	inFlight = /* @__PURE__ */ new Set();
	closing = false;
	closingSnapshot = [];
	/**
	* Run one operation with caller and package cancellation combined.
	* @param callerSignal - cancellation owned by the caller.
	* @param operation - asynchronous work using the combined signal.
	* @returns the operation result.
	*/
	run(callerSignal, operation) {
		if (this.closing) return Promise.reject(new LabelStudioOperationClosedError());
		const signal = AbortSignal.any([callerSignal, this.lifetime.signal]);
		const pending = Promise.resolve().then(() => {
			signal.throwIfAborted();
			return operation(signal);
		});
		this.inFlight.add(pending);
		pending.finally(() => {
			this.inFlight.delete(pending);
		}).catch(() => void 0);
		return pending;
	}
	/** Reject new operations and abort every operation that already entered. */
	beginClose() {
		if (this.closing) return;
		this.closing = true;
		this.closingSnapshot = [...this.inFlight];
		this.lifetime.abort(new LabelStudioOperationClosedError());
	}
	/** Wait until the operations captured by {@link beginClose} have settled. */
	async drain() {
		const pending = this.closing ? this.closingSnapshot : [...this.inFlight];
		await Promise.allSettled(pending);
	}
};
/**
* Close ingress, quiesce work, and then release stateful resources in order.
* @param resources - resource-specific disposal callbacks owned by one plugin instance.
*/
async function disposeLabelStudioResources(resources) {
	resources.operations.beginClose();
	const errors = [];
	attemptSync(() => resources.disposeTools(), errors);
	attemptSync(() => resources.disposeWebhookIngress?.(), errors);
	await attempt(() => resources.disposeBrowser?.(), errors);
	await attempt(() => resources.disposeWebhookRegistration?.(), errors);
	await attempt(() => resources.operations.drain(), errors);
	attemptSync(() => resources.disposeCurrentPages?.(), errors);
	await attempt(() => resources.disposeFrameProxy?.(), errors);
	await attempt(() => resources.disposeBroker(), errors);
	attemptSync(() => resources.disposeRegistry(), errors);
	await attempt(() => resources.disposeRuntime(), errors);
	await attempt(() => resources.disposeStore(), errors);
	if (errors.length === 1) throw errors[0];
	if (errors.length > 1) throw new AggregateError(errors, "label-studio: resource shutdown failed");
}
async function attempt(operation, errors) {
	try {
		await operation();
	} catch (error) {
		errors.push(error);
	}
}
function attemptSync(operation, errors) {
	try {
		operation();
	} catch (error) {
		errors.push(error);
	}
}
//#endregion
//#region lib/types/session-context-spec.js
/** Durable schema for Label Studio page state associated with DSH Sessions. */
const nonNegativeSafeInteger = z$1.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeInteger = z$1.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const projectIdSchema = positiveSafeInteger.transform(labelStudioProjectId);
const taskIdSchema = positiveSafeInteger.transform(labelStudioTaskId);
const annotationIdSchema = positiveSafeInteger.transform(labelStudioAnnotationId);
const leaseIdSchema = z$1.string().uuid().transform(labelStudioContextLeaseId);
const navigationSequenceSchema = nonNegativeSafeInteger.transform(labelStudioNavigationSequence);
/** Validates and brands a durable Label Studio page. */
const labelStudioPageContextSchema = z$1.discriminatedUnion("view", [
	z$1.strictObject({ view: z$1.literal("projects") }),
	z$1.strictObject({
		view: z$1.literal("project"),
		projectId: projectIdSchema
	}),
	z$1.strictObject({
		view: z$1.literal("task"),
		projectId: projectIdSchema,
		taskId: taskIdSchema,
		annotationId: annotationIdSchema.optional()
	})
]).transform((page) => {
	if (page.view !== "task") return page;
	return {
		view: "task",
		projectId: page.projectId,
		taskId: page.taskId,
		...page.annotationId === void 0 ? {} : { annotationId: page.annotationId }
	};
});
const recentProjectSchema = z$1.strictObject({
	projectId: projectIdSchema,
	lastTaskId: taskIdSchema.optional(),
	lastVisitedAt: nonNegativeSafeInteger,
	availability: z$1.enum(["available", "deleted"])
}).transform((recent) => ({
	projectId: recent.projectId,
	...recent.lastTaskId === void 0 ? {} : { lastTaskId: recent.lastTaskId },
	lastVisitedAt: recent.lastVisitedAt,
	availability: recent.availability
}));
const bindingTargetSchema = z$1.discriminatedUnion("kind", [z$1.strictObject({
	kind: z$1.literal("project"),
	projectId: projectIdSchema
}), z$1.strictObject({
	kind: z$1.literal("task"),
	projectId: projectIdSchema,
	taskId: taskIdSchema,
	annotationId: annotationIdSchema.optional()
})]).transform((target) => {
	if (target.kind === "project") return target;
	return {
		kind: "task",
		projectId: target.projectId,
		taskId: target.taskId,
		...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
	};
});
const bindingSourceSchema = z$1.enum([
	"tool-result",
	"webhook",
	"current-page"
]);
const emptyBindingSchema = z$1.strictObject({
	recentProjects: z$1.array(recentProjectSchema),
	revision: nonNegativeSafeInteger
});
const boundBindingSchema = z$1.strictObject({
	target: bindingTargetSchema,
	source: bindingSourceSchema,
	boundAt: nonNegativeSafeInteger,
	recentProjects: z$1.array(recentProjectSchema),
	revision: nonNegativeSafeInteger
});
/** Validates a complete empty or bound Session binding snapshot. */
const labelStudioBindingSnapshotSchema = z$1.union([emptyBindingSchema, boundBindingSchema]).transform((binding) => {
	const recentProjects = binding.recentProjects.map((recent) => ({ ...recent }));
	if (!("target" in binding)) return {
		recentProjects,
		revision: binding.revision
	};
	return {
		target: binding.target,
		source: binding.source,
		boundAt: binding.boundAt,
		recentProjects,
		revision: binding.revision
	};
});
/** Validates the singleton Webhook owner record. */
const labelStudioWebhookOwnerRecordSchema = z$1.strictObject({ ownerId: z$1.string().uuid() });
const pageCommitReceiptSchema = z$1.strictObject({
	leaseId: leaseIdSchema,
	generation: nonNegativeSafeInteger,
	navigationSequence: navigationSequenceSchema,
	expectedRevision: nonNegativeSafeInteger,
	committedRevision: nonNegativeSafeInteger,
	page: labelStudioPageContextSchema
});
/** Validates records loaded from the Label Studio Session context domain. */
const labelStudioSessionContextRecordSchema = z$1.strictObject({
	sessionCreatedAt: nonNegativeSafeInteger,
	page: labelStudioPageContextSchema,
	recentProjects: z$1.array(recentProjectSchema),
	revision: nonNegativeSafeInteger,
	binding: labelStudioBindingSnapshotSchema.optional(),
	lastCommit: pageCommitReceiptSchema.optional()
}).transform((record) => ({
	sessionCreatedAt: record.sessionCreatedAt,
	page: record.page,
	recentProjects: record.recentProjects.map((recent) => ({
		projectId: recent.projectId,
		...recent.lastTaskId === void 0 ? {} : { lastTaskId: recent.lastTaskId },
		lastVisitedAt: recent.lastVisitedAt,
		availability: recent.availability
	})),
	revision: record.revision,
	binding: record.binding ?? {
		recentProjects: [],
		revision: 0
	},
	...record.lastCommit === void 0 ? {} : { lastCommit: record.lastCommit }
}));
/** Storage-domain declaration for durable per-Session Label Studio navigation. */
const labelStudioSessionContextDomainSpec = defineDomain({
	name: "label_studio_context",
	version: 1,
	tables: {
		sessions: domainTable(labelStudioSessionContextRecordSchema),
		webhook_owners: domainTable(labelStudioWebhookOwnerRecordSchema)
	}
});
//#endregion
//#region lib/types/session-context-store.js
/** Durable per-Session Label Studio page and operation-binding store. */
/** Stable failure raised when a durable Session page cannot accept a commit. */
var LabelStudioSessionContextError = class extends Error {
	code;
	/**
	* Create a sanitized Session-context failure.
	* @param code - stable RPC-facing failure category.
	*/
	constructor(code) {
		super(code === "session-context-conflict" ? "Label Studio Session context revision conflict" : "Label Studio Session context is unavailable");
		this.code = code;
		this.name = "LabelStudioSessionContextError";
	}
};
/** Persists Label Studio navigation and operation bindings independently for each DSH Session. */
var LabelStudioSessionContextStore = class LabelStudioSessionContextStore {
	domain;
	recentProjectLimit;
	clock;
	table;
	ownerTable;
	tails = /* @__PURE__ */ new Map();
	ownerTail = Promise.resolve();
	closing = false;
	closePromise;
	constructor(domain, recentProjectLimit, clock) {
		this.domain = domain;
		this.recentProjectLimit = recentProjectLimit;
		this.clock = clock;
		this.table = domain.table("sessions");
		this.ownerTable = domain.table("webhook_owners");
	}
	/**
	* Open the plugin-owned storage domain.
	* @param ctx - Host context providing the storage-domain service.
	* @param options - History limit and optional Host clock.
	* @returns an open Session context store.
	*/
	static async open(ctx, options) {
		if (!Number.isSafeInteger(options.recentProjectLimit) || options.recentProjectLimit <= 0) throw new TypeError("recentProjectLimit must be a positive safe integer");
		const domain = await ctx.storageDomain.open(labelStudioSessionContextDomainSpec);
		return new LabelStudioSessionContextStore(domain, options.recentProjectLimit, options.clock ?? Date.now);
	}
	/**
	* Read the context for one exact Session lifecycle without I/O.
	* @param identity - Session id and creation time.
	* @returns an immutable snapshot, or the empty context when no matching record exists.
	*/
	read(identity) {
		const record = this.matchingRecord(identity);
		return record === void 0 ? emptySnapshot() : snapshotOf(record);
	}
	/**
	* Read the binding for one exact Session lifecycle without I/O.
	* @param identity - Session id and creation time.
	* @returns an immutable empty or bound snapshot.
	*/
	readBinding(identity) {
		const record = this.matchingRecord(identity);
		return record?.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding);
	}
	/**
	* List every durable non-empty binding without creating or changing a Session record.
	* @returns immutable Session ids and binding snapshots in table iteration order.
	*/
	listBindings() {
		return [...this.table.entries()].flatMap(([sessionId, record]) => record.binding?.target === void 0 ? [] : [{
			sessionId,
			binding: bindingSnapshotOf(record.binding)
		}]);
	}
	/**
	* Commit a browser page under revision compare-and-swap semantics.
	* @param identity - Session lifecycle receiving the page.
	* @param request - Validated lease request and expected context revision.
	* @returns the committed context snapshot.
	*/
	commit(identity, request) {
		return this.enqueue(identity.sessionId, async () => {
			const record = this.matchingRecord(identity);
			if (record !== void 0 && exactRetry(record.lastCommit, request)) return snapshotOf(record);
			const current = record === void 0 ? emptySnapshot() : snapshotOf(record);
			if (current.revision !== request.expectedSessionContextRevision) throw new LabelStudioSessionContextError("session-context-conflict");
			if (samePage(current.page, request.page)) return current;
			const revision = current.revision + 1;
			const recentProjects = visitProject(current.recentProjects, request.page, this.clock(), this.recentProjectLimit);
			const next = {
				sessionCreatedAt: identity.createdAt,
				page: request.page,
				recentProjects,
				revision,
				binding: current.binding,
				lastCommit: receiptOf(request, revision)
			};
			await this.table.put(identity.sessionId, next);
			return snapshotOf(next);
		});
	}
	/**
	* Commit an operation binding with an independent revision.
	* @param identity - Session lifecycle receiving the binding.
	* @param request - Expected binding revision and optional new target.
	* @returns the committed snapshot or the newer conflicting snapshot.
	*/
	commitBinding(identity, request) {
		return this.enqueue(identity.sessionId, async () => {
			const record = this.matchingRecord(identity);
			const current = record?.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding);
			if (sameBindingRequest(current, request)) return {
				kind: "committed",
				snapshot: current
			};
			if (current.revision !== request.expectedRevision) return {
				kind: "conflict",
				current
			};
			const nextBinding = bindingAfterCommit(current, request, this.clock(), this.recentProjectLimit);
			const next = record === void 0 ? {
				sessionCreatedAt: identity.createdAt,
				page: { view: "projects" },
				recentProjects: [],
				revision: 0,
				binding: nextBinding
			} : {
				...record,
				binding: nextBinding
			};
			await this.table.put(identity.sessionId, next);
			return {
				kind: "committed",
				snapshot: bindingSnapshotOf(nextBinding)
			};
		});
	}
	/**
	* Clear or update every binding that refers to a deleted project.
	* @param projectId - Confirmed deleted Label Studio project.
	* @returns changed Session bindings in table iteration order.
	*/
	reconcileProjectDeleted(projectId) {
		return this.reconcileRecords((record) => projectDeletedRecord(record, projectId));
	}
	/**
	* Downgrade bindings whose exact task was deleted.
	* @param projectId - Project that owned the deleted tasks.
	* @param taskIds - Confirmed deleted task identifiers.
	* @returns changed Session bindings in table iteration order.
	*/
	reconcileTasksDeleted(projectId, taskIds) {
		const deleted = new Set(taskIds);
		if (deleted.size === 0) return Promise.resolve([]);
		const now = this.clock();
		return this.reconcileRecords((record) => tasksDeletedRecord(record, projectId, deleted, now));
	}
	/**
	* Persist the first generated Webhook owner id and return it thereafter.
	* @param candidate - Non-empty owner identity proposed by this process.
	* @returns the durable first owner identity.
	*/
	ensureWebhookOwnerId(candidate) {
		const owner = labelStudioWebhookOwnerRecordSchema.parse({ ownerId: candidate });
		if (this.closing) return Promise.reject(/* @__PURE__ */ new Error("Label Studio Session context store is closing"));
		const result = this.ownerTail.then(async () => {
			const existing = this.ownerTable.get("owner");
			if (existing !== void 0) return existing.ownerId;
			await this.ownerTable.put("owner", owner);
			return owner.ownerId;
		});
		this.ownerTail = result.then(() => void 0, () => void 0);
		return result;
	}
	/**
	* Mark one known project deleted in page recovery state and the Session binding.
	* @param identity - Session lifecycle owning the history.
	* @param projectId - Confirmed deleted Label Studio project.
	* @returns the resulting context snapshot.
	*/
	markProjectDeleted(identity, projectId) {
		return this.enqueue(identity.sessionId, async () => {
			const record = this.matchingRecord(identity);
			if (record === void 0) return emptySnapshot();
			const reconciliation = projectDeletedRecord(record, projectId);
			if (reconciliation === void 0) return snapshotOf(record);
			await this.table.put(identity.sessionId, reconciliation.record);
			return snapshotOf(reconciliation.record);
		});
	}
	/**
	* Delete one Session's durable Label Studio context.
	* @param sessionId - Session record key to remove.
	* @returns whether a record existed.
	*/
	delete(sessionId) {
		return this.enqueue(sessionId, () => this.table.delete(sessionId));
	}
	/**
	* Drain queued operations and close the owned domain handle once.
	* @returns resolution after storage shutdown.
	*/
	close() {
		this.closePromise ??= this.runClose();
		return this.closePromise;
	}
	async runClose() {
		this.closing = true;
		await Promise.all([...this.tails.values(), this.ownerTail]);
		await this.domain.close();
	}
	async reconcileRecords(transform) {
		return (await Promise.all([...this.table.keys()].map((sessionId) => this.enqueue(sessionId, async () => {
			const record = this.table.get(sessionId);
			if (record === void 0) return void 0;
			const before = record.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding);
			const reconciliation = transform(record);
			if (reconciliation === void 0) return void 0;
			await this.table.put(sessionId, reconciliation.record);
			if (!reconciliation.bindingChanged) return void 0;
			return {
				sessionId,
				before,
				after: reconciliation.record.binding === void 0 ? emptyBinding() : bindingSnapshotOf(reconciliation.record.binding)
			};
		})))).filter((change) => change !== void 0);
	}
	matchingRecord(identity) {
		const record = this.table.get(identity.sessionId);
		return record?.sessionCreatedAt === identity.createdAt ? record : void 0;
	}
	enqueue(sessionId, operation) {
		if (this.closing) return Promise.reject(/* @__PURE__ */ new Error("Label Studio Session context store is closing"));
		const result = (this.tails.get(sessionId) ?? Promise.resolve()).then(operation);
		const settled = result.then(() => void 0, () => void 0);
		this.tails.set(sessionId, settled);
		settled.then(() => {
			if (this.tails.get(sessionId) === settled) this.tails.delete(sessionId);
		});
		return result;
	}
};
function emptySnapshot() {
	return {
		page: { view: "projects" },
		recentProjects: [],
		revision: 0,
		binding: emptyBinding()
	};
}
function snapshotOf(record) {
	return {
		page: copyPage(record.page),
		recentProjects: record.recentProjects.map((recent) => ({ ...recent })),
		revision: record.revision,
		binding: record.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding)
	};
}
function emptyBinding() {
	return {
		recentProjects: [],
		revision: 0
	};
}
function bindingSnapshotOf(binding) {
	const recentProjects = binding.recentProjects.map((recent) => ({ ...recent }));
	if (binding.target === void 0) return {
		recentProjects,
		revision: binding.revision
	};
	return {
		target: copyBindingTarget(binding.target),
		source: binding.source,
		boundAt: binding.boundAt,
		recentProjects,
		revision: binding.revision
	};
}
function copyBindingTarget(target) {
	if (target.kind === "project") return {
		kind: "project",
		projectId: target.projectId
	};
	return {
		kind: "task",
		projectId: target.projectId,
		taskId: target.taskId,
		...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
	};
}
function sameBindingTarget(left, right) {
	if (left.kind !== right.kind || left.projectId !== right.projectId) return false;
	if (left.kind === "project" || right.kind === "project") return true;
	return left.taskId === right.taskId && left.annotationId === right.annotationId;
}
function sameBindingRequest(current, request) {
	if (request.target === void 0) return current.target === void 0;
	return current.target !== void 0 && sameBindingTarget(current.target, request.target) && current.source === request.source;
}
function bindingAfterCommit(current, request, now, limit) {
	const revision = current.revision + 1;
	if (request.target === void 0) return {
		recentProjects: current.recentProjects.map((recent) => ({ ...recent })),
		revision
	};
	return {
		target: copyBindingTarget(request.target),
		source: request.source,
		boundAt: now,
		recentProjects: visitBindingProject(current.recentProjects, request.target, now, limit),
		revision
	};
}
function visitBindingProject(current, target, now, limit) {
	const previous = current.find((recent) => recent.projectId === target.projectId);
	return [{
		projectId: target.projectId,
		...target.kind === "task" ? { lastTaskId: target.taskId } : previous?.lastTaskId === void 0 ? {} : { lastTaskId: previous.lastTaskId },
		lastVisitedAt: now,
		availability: "available"
	}, ...current.filter((recent) => recent.projectId !== target.projectId)].slice(0, limit);
}
function projectDeletedBinding(current, projectId) {
	const targetDeleted = current.target?.projectId === projectId;
	let historyChanged = false;
	const recentProjects = current.recentProjects.map((recent) => {
		if (recent.projectId !== projectId || recent.availability === "deleted") return recent;
		historyChanged = true;
		return {
			...recent,
			availability: "deleted"
		};
	});
	if (!targetDeleted && !historyChanged) return void 0;
	const revision = current.revision + 1;
	if (targetDeleted) return {
		recentProjects,
		revision
	};
	if (current.target === void 0) return {
		recentProjects,
		revision
	};
	return {
		target: copyBindingTarget(current.target),
		source: current.source,
		boundAt: current.boundAt,
		recentProjects,
		revision
	};
}
function projectDeletedRecord(record, projectId) {
	const pageUsesProject = record.page.view !== "projects" && record.page.projectId === projectId;
	let pageHistoryChanged = false;
	const recentProjects = record.recentProjects.map((recent) => {
		if (recent.projectId !== projectId || recent.availability === "deleted") return recent;
		pageHistoryChanged = true;
		return {
			...recent,
			availability: "deleted"
		};
	});
	const binding = projectDeletedBinding(record.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding), projectId);
	const pageChanged = pageUsesProject || pageHistoryChanged;
	if (!pageChanged && binding === void 0) return void 0;
	return {
		record: reconciledRecord(record, pageUsesProject ? { view: "projects" } : record.page, recentProjects, pageChanged, binding),
		bindingChanged: binding !== void 0
	};
}
function tasksDeletedBinding(current, projectId, taskIds, now) {
	const targetDeleted = current.target?.kind === "task" && current.target.projectId === projectId && taskIds.has(current.target.taskId);
	let historyChanged = false;
	const recentProjects = current.recentProjects.map((recent) => {
		if (recent.projectId !== projectId || recent.lastTaskId === void 0 || !taskIds.has(recent.lastTaskId)) return recent;
		historyChanged = true;
		const { lastTaskId: _lastTaskId, ...project } = recent;
		return project;
	});
	if (!targetDeleted && !historyChanged) return void 0;
	const revision = current.revision + 1;
	if (targetDeleted) return {
		target: {
			kind: "project",
			projectId
		},
		source: "webhook",
		boundAt: now,
		recentProjects,
		revision
	};
	return current.target === void 0 ? {
		recentProjects,
		revision
	} : {
		target: copyBindingTarget(current.target),
		source: current.source,
		boundAt: current.boundAt,
		recentProjects,
		revision
	};
}
function tasksDeletedRecord(record, projectId, taskIds, now) {
	const pageUsesTask = record.page.view === "task" && record.page.projectId === projectId && taskIds.has(record.page.taskId);
	let pageHistoryChanged = false;
	const recentProjects = record.recentProjects.map((recent) => {
		if (recent.projectId !== projectId || recent.lastTaskId === void 0 || !taskIds.has(recent.lastTaskId)) return recent;
		pageHistoryChanged = true;
		const { lastTaskId: _lastTaskId, ...project } = recent;
		return project;
	});
	const binding = tasksDeletedBinding(record.binding === void 0 ? emptyBinding() : bindingSnapshotOf(record.binding), projectId, taskIds, now);
	const pageChanged = pageUsesTask || pageHistoryChanged;
	if (!pageChanged && binding === void 0) return void 0;
	return {
		record: reconciledRecord(record, pageUsesTask ? {
			view: "project",
			projectId
		} : record.page, recentProjects, pageChanged, binding),
		bindingChanged: binding !== void 0
	};
}
function reconciledRecord(record, page, recentProjects, pageChanged, binding) {
	return {
		sessionCreatedAt: record.sessionCreatedAt,
		page: copyPage(page),
		recentProjects,
		revision: pageChanged ? record.revision + 1 : record.revision,
		...binding === void 0 ? record.binding === void 0 ? {} : { binding: record.binding } : { binding },
		...!pageChanged && record.lastCommit !== void 0 ? { lastCommit: record.lastCommit } : {}
	};
}
function copyPage(page) {
	if (page.view === "projects") return { view: "projects" };
	if (page.view === "project") return {
		view: "project",
		projectId: page.projectId
	};
	return {
		view: "task",
		projectId: page.projectId,
		taskId: page.taskId,
		...page.annotationId === void 0 ? {} : { annotationId: page.annotationId }
	};
}
function samePage(left, right) {
	if (left.view !== right.view) return false;
	if (left.view === "projects" || right.view === "projects") return true;
	if (left.projectId !== right.projectId) return false;
	if (left.view === "project" || right.view === "project") return true;
	return left.taskId === right.taskId && left.annotationId === right.annotationId;
}
function visitProject(current, page, now, limit) {
	if (page.view === "projects") return current.map((recent) => ({ ...recent }));
	const previous = current.find((recent) => recent.projectId === page.projectId);
	return [{
		projectId: page.projectId,
		...page.view === "task" ? { lastTaskId: page.taskId } : previous?.lastTaskId === void 0 ? {} : { lastTaskId: previous.lastTaskId },
		lastVisitedAt: now,
		availability: "available"
	}, ...current.filter((recent) => recent.projectId !== page.projectId)].slice(0, limit);
}
function receiptOf(request, committedRevision) {
	return {
		leaseId: request.leaseId,
		generation: request.generation,
		navigationSequence: request.navigationSequence,
		expectedRevision: request.expectedSessionContextRevision,
		committedRevision,
		page: copyPage(request.page)
	};
}
function exactRetry(receipt, request) {
	return receipt !== void 0 && receipt.leaseId === request.leaseId && receipt.generation === request.generation && receipt.navigationSequence === request.navigationSequence && receipt.expectedRevision === request.expectedSessionContextRevision && samePage(receipt.page, request.page);
}
//#endregion
//#region lib/types/context-rpc.js
/** Authenticated Connection RPC handlers for browser context synchronization. */
const ENDPOINTS = /* @__PURE__ */ new Set([
	"lease/open",
	"lease/close",
	"context/reserve",
	"context/publish",
	"events/wait",
	"focus/ack",
	"page/commit",
	"inspection/commit"
]);
const ERROR_MESSAGES = {
	"invalid-request": "request fields are invalid",
	"session-not-found": "DSH Session does not exist",
	"lease-conflict": "another browser source owns this Session",
	"lease-expired": "browser lease is absent or expired",
	"stale-generation": "browser lease generation is stale",
	"stale-revision": "context revision is stale",
	"future-revision": "event cursor is ahead of the Host",
	"focus-conflict": "another focus request is pending",
	"focus-not-found": "focus request is absent or does not match",
	"session-context-conflict": "Session page revision is stale",
	"session-context-unavailable": "Session page storage is unavailable",
	"binding-missing": "Label Studio binding is missing",
	"binding-conflict": "Label Studio binding revision is stale",
	"binding-target-mismatch": "Label Studio binding target does not match",
	"current-page-unavailable": "current Label Studio page is unavailable",
	"current-page-timeout": "current Label Studio page inspection timed out",
	"current-page-unsupported": "current Label Studio route is unsupported",
	"webhook-unavailable": "Label Studio Webhook is unavailable",
	"webhook-unassigned": "Label Studio Webhook has no matching binding"
};
/**
* Register the Label Studio channel on Connection's loopback trust policy.
* @param ctx - Host context carrying Connection, Session, and persistence services.
* @param registry - synchronous lease and target state.
* @param broker - Session event history and focus acknowledgements.
* @param sessionContexts - durable page state for exact Session lifecycles.
* @param operations - shared package operation gate.
* @param options - bounded long-poll settings.
* @param currentPages - optional one-shot page broker during staged assembly.
* @returns asynchronous disposer that closes the route before removing it.
*/
function registerLabelStudioContextRpc(ctx, registry, broker, sessionContexts, operations, options, currentPages) {
	let closing = false;
	const handler = async (rawEndpoint, payload, signal) => {
		if (closing) return outer(failure("invalid-request"));
		if (!ENDPOINTS.has(rawEndpoint)) return outer(failure("invalid-request"));
		try {
			return outer(success(await operations.run(signal, (operationSignal) => dispatch(rawEndpoint, payload, operationSignal, ctx, registry, broker, sessionContexts, options, currentPages))));
		} catch (error) {
			if (error instanceof LabelStudioContextError) return outer(failure(error.code, error.retryAfterMs));
			if (error instanceof LabelStudioSessionContextError) return outer(failure(error.code));
			if (error instanceof LabelStudioCurrentPageError) return outer(failure(error.code));
			if (error instanceof LabelStudioOperationClosedError) return outer(failure("invalid-request"));
			if (error instanceof TypeError) return outer(failure("invalid-request"));
			if (signal.aborted) return {
				ok: false,
				error: {
					code: "cancelled",
					message: "Label Studio context request was cancelled",
					details: {}
				}
			};
			return {
				ok: false,
				error: {
					code: "internal",
					message: "Label Studio context request failed",
					details: {}
				}
			};
		}
	};
	const remove = ctx.connection.rpc.handle("/label-studio", handler);
	return async () => {
		closing = true;
		await remove();
	};
}
async function dispatch(endpoint, payload, signal, ctx, registry, broker, sessionContexts, options, currentPages) {
	switch (endpoint) {
		case "lease/open": {
			const request = parseOpen(payload);
			const sessionId = SessionId(request.sessionId);
			const identity = await resolvePersistentSessionIdentity(ctx, sessionId, signal, registry, broker, sessionContexts);
			const baseline = broker.latestRevision(sessionId);
			const opened = registry.openLease(sessionId, labelStudioContextSourceId(request.sourceId), baseline);
			const sessionContext = await durableOperation(() => sessionContexts.read(identity));
			return Object.freeze({
				...opened,
				sessionContext
			});
		}
		case "lease/close": {
			const request = parseLease(payload);
			return { closed: registry.closeLease(request.leaseId, request.generation) };
		}
		case "context/reserve": {
			const request = parseReserve(payload);
			const binding = registry.inspectLease(request.leaseId, request.generation);
			const reservation = registry.reserveBrowserTarget(request.leaseId, request.generation, request.navigationSequence, request.expectedTargetRevision);
			broker.retireFocus(binding.sessionId);
			return reservation;
		}
		case "context/publish": {
			const request = parsePublish(payload);
			return registry.publishTarget(request.leaseId, request.generation, request.targetRevision, request.target);
		}
		case "events/wait": {
			const request = parseWait(payload);
			const inspected = registry.inspectLease(request.leaseId, request.generation);
			await resolvePersistentSessionIdentity(ctx, inspected.sessionId, signal, registry, broker, sessionContexts);
			registry.renew(request.leaseId, request.generation);
			const batch = await broker.wait(inspected.sessionId, request.afterRevision, options.eventWaitTimeoutMs, signal);
			const current = registry.inspectLease(request.leaseId, request.generation);
			return Object.freeze({
				lease: current.lease,
				context: current.context,
				events: batch.events,
				latestRevision: batch.latestRevision,
				resetRequired: batch.resetRequired
			});
		}
		case "focus/ack": {
			const request = parseAck(payload);
			await resolvePersistentSessionIdentity(ctx, registry.inspectLease(request.leaseId, request.generation).sessionId, signal, registry, broker, sessionContexts);
			return durableOperation(() => broker.acknowledgeFocus(request.leaseId, request.generation, request.correlationId, request.targetRevision, request.target));
		}
		case "page/commit": {
			const request = parsePageCommit(payload);
			const binding = registry.inspectLease(request.leaseId, request.generation);
			const identity = await resolvePersistentSessionIdentity(ctx, binding.sessionId, signal, registry, broker, sessionContexts);
			if (request.page.view === "task") {
				if (binding.context.phase !== "committed" || !pageMatchesTarget(request.page, binding.context.target)) throw new LabelStudioContextError("stale-revision", "task page does not match the active target");
				try {
					return await durableOperation(() => sessionContexts.commit(identity, request));
				} catch (error) {
					registry.closeLease(request.leaseId, request.generation);
					throw error;
				}
			}
			if (binding.context.phase !== "vacant") {
				registry.clearBrowserTarget(request.leaseId, request.generation, request.navigationSequence, binding.context.targetRevision);
				broker.retireFocus(binding.sessionId);
			}
			return durableOperation(() => sessionContexts.commit(identity, request));
		}
		case "inspection/commit": {
			if (currentPages === void 0) throw new TypeError("current-page broker is unavailable");
			const request = parseInspectionCommit(payload);
			const identity = await resolvePersistentSessionIdentity(ctx, registry.inspectLease(request.leaseId, request.generation).sessionId, signal, registry, broker, sessionContexts);
			return currentPages.commit(request, identity);
		}
	}
}
/**
* Resolve one current or persisted Session to its exact lifecycle identity.
* @param ctx - Session services used for live and persisted lookup.
* @param sessionId - verified opaque Session id.
* @param signal - cancellation for persistence lookup.
* @param registry - lease registry cleared when the Session no longer exists.
* @param broker - event state cleared when the Session no longer exists.
* @param sessionContexts - durable plugin state cleared for a missing Session.
* @returns the exact Session id and creation time.
*/
async function resolvePersistentSessionIdentity(ctx, sessionId, signal, registry, broker, sessionContexts) {
	const live = ctx.sessions.get(sessionId);
	if (live !== void 0) return {
		sessionId,
		createdAt: live.header.createdAt
	};
	const header = (await ctx.sessionPersistence.list(signal)).find((candidate) => candidate.id === sessionId);
	if (header !== void 0) return {
		sessionId,
		createdAt: header.createdAt
	};
	registry.deleteSession(sessionId);
	broker.deleteSession(sessionId);
	await durableOperation(() => sessionContexts.delete(sessionId));
	throw new SessionNotFoundError();
}
async function durableOperation(operation) {
	try {
		return await operation();
	} catch (error) {
		if (error instanceof LabelStudioSessionContextError) throw error;
		throw new LabelStudioSessionContextError("session-context-unavailable");
	}
}
var SessionNotFoundError = class extends LabelStudioContextError {
	constructor() {
		super("session-not-found", "DSH Session does not exist");
	}
};
function outer(value) {
	return {
		ok: true,
		value
	};
}
function success(value) {
	return {
		ok: true,
		value
	};
}
function failure(code, retryAfterMs) {
	if (code === "lease-conflict") return {
		ok: false,
		error: {
			code,
			message: ERROR_MESSAGES[code],
			details: { retryAfterMs: Math.max(1, retryAfterMs ?? 1) }
		}
	};
	return {
		ok: false,
		error: {
			code,
			message: ERROR_MESSAGES[code],
			details: {}
		}
	};
}
function record(value, keys) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("payload must be an object");
	const result = value;
	if (Object.keys(result).some((key) => !keys.includes(key))) throw new TypeError("payload has unknown fields");
	return result;
}
function stringField(value) {
	if (typeof value !== "string" || value === "") throw new TypeError("field must be a non-empty string");
	return value;
}
function nonNegative(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("field must be a non-negative safe integer");
	return value;
}
function positive(value) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("field must be a positive safe integer");
	return value;
}
function parseOpen(payload) {
	const value = record(payload, ["sessionId", "sourceId"]);
	return {
		sessionId: stringField(value.sessionId),
		sourceId: stringField(value.sourceId)
	};
}
function parseLease(payload) {
	const value = record(payload, ["leaseId", "generation"]);
	return {
		leaseId: labelStudioContextLeaseId(stringField(value.leaseId)),
		generation: positive(value.generation)
	};
}
function parseReserve(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"navigationSequence",
		"expectedTargetRevision"
	]);
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		navigationSequence: labelStudioNavigationSequence(nonNegative(value.navigationSequence)),
		expectedTargetRevision: nonNegative(value.expectedTargetRevision)
	};
}
function parseTarget(value) {
	const target = record(value, [
		"projectId",
		"taskId",
		"annotationId"
	]);
	return Object.freeze(target.annotationId === void 0 ? {
		projectId: labelStudioProjectId(positive(target.projectId)),
		taskId: labelStudioTaskId(positive(target.taskId))
	} : {
		projectId: labelStudioProjectId(positive(target.projectId)),
		taskId: labelStudioTaskId(positive(target.taskId)),
		annotationId: labelStudioAnnotationId(positive(target.annotationId))
	});
}
function parsePublish(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"targetRevision",
		"target"
	]);
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		targetRevision: nonNegative(value.targetRevision),
		target: parseTarget(value.target)
	};
}
function parseWait(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"afterRevision"
	]);
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		afterRevision: nonNegative(value.afterRevision)
	};
}
function parseAck(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"correlationId",
		"targetRevision",
		"target"
	]);
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		correlationId: labelStudioFocusCorrelationId(stringField(value.correlationId)),
		targetRevision: nonNegative(value.targetRevision),
		target: parseTarget(value.target)
	};
}
function parsePageCommit(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"navigationSequence",
		"expectedSessionContextRevision",
		"page"
	]);
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		navigationSequence: labelStudioNavigationSequence(nonNegative(value.navigationSequence)),
		expectedSessionContextRevision: nonNegative(value.expectedSessionContextRevision),
		page: parsePage(value.page)
	};
}
function parseInspectionCommit(payload) {
	const value = record(payload, [
		"leaseId",
		"generation",
		"inspectionId",
		"outcome"
	]);
	const outcome = record(value.outcome, ["kind", "page"]);
	if (outcome.kind === "unavailable" || outcome.kind === "unsupported") {
		if (outcome.page !== void 0) throw new TypeError("negative inspection must not include a page");
		return {
			...parseLease({
				leaseId: value.leaseId,
				generation: value.generation
			}),
			inspectionId: labelStudioPageInspectionId(stringField(value.inspectionId)),
			outcome: { kind: outcome.kind }
		};
	}
	if (outcome.kind !== "page" || outcome.page === void 0) throw new TypeError("invalid inspection outcome");
	return {
		...parseLease({
			leaseId: value.leaseId,
			generation: value.generation
		}),
		inspectionId: labelStudioPageInspectionId(stringField(value.inspectionId)),
		outcome: {
			kind: "page",
			page: parsePage(outcome.page)
		}
	};
}
function parsePage(value) {
	const base = record(value, [
		"view",
		"projectId",
		"taskId",
		"annotationId"
	]);
	if (base.view === "projects") {
		record(value, ["view"]);
		return { view: "projects" };
	}
	if (base.view === "project") {
		record(value, ["view", "projectId"]);
		return {
			view: "project",
			projectId: labelStudioProjectId(positive(base.projectId))
		};
	}
	if (base.view === "task") {
		record(value, [
			"view",
			"projectId",
			"taskId",
			"annotationId"
		]);
		return {
			view: "task",
			projectId: labelStudioProjectId(positive(base.projectId)),
			taskId: labelStudioTaskId(positive(base.taskId)),
			...base.annotationId === void 0 ? {} : { annotationId: labelStudioAnnotationId(positive(base.annotationId)) }
		};
	}
	throw new TypeError("page view is invalid");
}
function pageMatchesTarget(page, target) {
	return page.projectId === target.projectId && page.taskId === target.taskId && page.annotationId === target.annotationId;
}
//#endregion
//#region lib/types/frame-bridge-script.js
/** Same-origin iframe script for one explicitly requested page inspection. */
/** Fixed same-origin URL served only by the frame proxy. */
const LABEL_STUDIO_FRAME_BRIDGE_PATH = "/.dsh/label-studio-page-bridge.js";
/**
* Add one external bridge script to an HTML document.
* @param html - decoded Label Studio HTML.
* @param protocol - protocol version represented by the script route.
* @returns HTML referencing the same-origin bridge script exactly once.
*/
function injectLabelStudioInspectionBridge(html, protocol) {
	if (html.includes(`src="/.dsh/label-studio-page-bridge.js"`)) return html;
	const tag = `<script src="${LABEL_STUDIO_FRAME_BRIDGE_PATH}"><\/script>`;
	const closingBody = /<\/body\s*>/iu.exec(html);
	if (closingBody === null) return `${html}${tag}`;
	return `${html.slice(0, closingBody.index)}${tag}${html.slice(closingBody.index)}`;
}
/**
* Render the isolated classic script served inside the Label Studio origin.
* @param protocol - exact parent/iframe wire protocol.
* @param capability - ephemeral frame capability generated by the proxy.
* @returns JavaScript with one message listener and no passive instrumentation.
*/
function renderLabelStudioFrameBridgeScript(protocol, capability) {
	return `(() => {
  'use strict';
  const protocol = ${safeLiteral(protocol)};
  const capability = ${safeLiteral(capability)};
  const positive = (value) => {
    if (value === null || !/^[1-9]\\d*$/.test(value)) return undefined;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : undefined;
  };
  const inspect = () => {
    const path = location.pathname;
    if (path === '/' || /^\\/projects\\/?$/.test(path)) {
      return { kind: 'page', page: { view: 'projects' } };
    }
    const match = /^\\/projects\\/([1-9]\\d*)(?:\\/.*)?$/.exec(path);
    if (match === null) return { kind: 'unsupported' };
    const projectId = positive(match[1]);
    if (projectId === undefined) return { kind: 'unsupported' };
    const query = new URLSearchParams(location.search);
    const taskValue = query.get('task');
    const annotationValue = query.get('annotation');
    if (taskValue === null && annotationValue === null) {
      return { kind: 'page', page: { view: 'project', projectId } };
    }
    const taskId = positive(taskValue);
    if (taskId === undefined) return { kind: 'unsupported' };
    const annotationId = annotationValue === null ? undefined : positive(annotationValue);
    if (annotationValue !== null && annotationId === undefined) return { kind: 'unsupported' };
    return {
      kind: 'page',
      page: annotationId === undefined
        ? { view: 'task', projectId, taskId }
        : { view: 'task', projectId, taskId, annotationId },
    };
  };
  addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const data = event.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
    if (data.protocol !== protocol || data.capability !== capability
      || data.kind !== 'inspect-current-page'
      || typeof data.inspectionId !== 'string' || data.inspectionId === '') return;
    parent.postMessage({
      protocol,
      kind: 'current-page',
      inspectionId: data.inspectionId,
      outcome: inspect(),
    }, event.origin);
  });
})();\n`;
}
function safeLiteral(value) {
	return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}
//#endregion
//#region lib/types/frame-proxy.js
/** Restricted loopback reverse proxy that injects the on-demand iframe bridge. */
const HOP_BY_HOP = /* @__PURE__ */ new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"forwarded"
]);
/** Owns a fixed-upstream HTTP proxy and all sockets created through it. */
var LabelStudioFrameProxy = class {
	options;
	upstream;
	capability = randomBytes(32).toString("base64url");
	sockets = /* @__PURE__ */ new Set();
	upstreamRequests = /* @__PURE__ */ new Set();
	server;
	address;
	starting;
	closePromise;
	closing = false;
	/** @param options - fixed loopback upstream, protocol, and decoded HTML limit. */
	constructor(options) {
		this.options = options;
		this.upstream = requireHttpLoopbackOrigin(options.upstreamBaseUrl);
		if (!Number.isSafeInteger(options.htmlMaxBytes) || options.htmlMaxBytes <= 0) throw new TypeError("htmlMaxBytes must be a positive safe integer");
	}
	/** Start once on an operating-system-assigned loopback port. */
	start() {
		if (this.address !== void 0) return Promise.resolve(this.address);
		if (this.starting !== void 0) return this.starting;
		if (this.closing) return Promise.reject(/* @__PURE__ */ new Error("label-studio: frame proxy is closed"));
		this.starting = new Promise((resolve, reject) => {
			const server = createServer((request, response) => {
				this.handle(request, response);
			});
			this.server = server;
			server.on("connection", (socket) => {
				this.sockets.add(socket);
				socket.once("close", () => {
					this.sockets.delete(socket);
				});
			});
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				server.removeListener("error", reject);
				server.on("error", () => void 0);
				const raw = server.address();
				if (raw === null || typeof raw === "string") {
					reject(/* @__PURE__ */ new Error("label-studio: frame proxy address is unavailable"));
					return;
				}
				const origin = `http://127.0.0.1:${String(raw.port)}`;
				const address = Object.freeze({
					baseUrl: origin,
					origin,
					capability: this.capability
				});
				this.address = address;
				resolve(address);
			});
		});
		return this.starting;
	}
	/** Stop accepting work and wait until owned requests and sockets are closed. */
	close() {
		if (this.closePromise !== void 0) return this.closePromise;
		this.closing = true;
		this.closePromise = this.stop();
		return this.closePromise;
	}
	async stop() {
		await this.starting?.catch(() => void 0);
		const server = this.server;
		if (server === void 0) return;
		for (const request of this.upstreamRequests) request.destroy(/* @__PURE__ */ new Error("frame proxy closed"));
		for (const socket of this.sockets) socket.destroy();
		server.closeAllConnections?.();
		if (server.listening) await new Promise((resolve) => {
			server.close(() => {
				resolve();
			});
		});
		this.address = void 0;
	}
	async handle(request, response) {
		try {
			if (this.closing) return fail(response, 503);
			const address = this.address;
			if (address === void 0 || request.headers.host !== new URL(address.origin).host) return fail(response, 400);
			if (request.method === "CONNECT" || request.headers.upgrade !== void 0) return fail(response, 405);
			const path = fixedRequestPath(request.url);
			if (path === "/.dsh/label-studio-page-bridge.js") {
				response.writeHead(200, {
					"content-type": "application/javascript; charset=utf-8",
					"cache-control": "no-store"
				});
				response.end(renderLabelStudioFrameBridgeScript(this.options.inspectionProtocol, this.capability));
				return;
			}
			const headers = this.upstreamHeaders(request.headers, address.origin, request.method ?? "GET");
			if (headers === void 0) return fail(response, 403);
			await this.forward(request, response, path, headers, address.origin);
		} catch {
			if (!response.headersSent) fail(response, 502);
			else response.destroy();
		}
	}
	upstreamHeaders(source, proxyOrigin, method) {
		const headers = filteredHeaders(source);
		headers.host = this.upstream.host;
		const origin = singleHeader(source.origin);
		if (origin !== void 0) {
			if (origin !== proxyOrigin && !safeMethod(method)) return void 0;
			headers.origin = origin === proxyOrigin ? this.upstream.origin : origin;
		}
		const referer = singleHeader(source.referer);
		if (referer !== void 0) {
			let parsed;
			try {
				parsed = new URL(referer);
			} catch {
				return;
			}
			if (parsed.origin !== proxyOrigin && !safeMethod(method)) return void 0;
			headers.referer = parsed.origin === proxyOrigin ? `${this.upstream.origin}${parsed.pathname}${parsed.search}${parsed.hash}` : referer;
		}
		return headers;
	}
	forward(incoming, outgoing, path, headers, proxyOrigin) {
		return new Promise((resolve, reject) => {
			const upstreamRequest = request({
				protocol: "http:",
				hostname: connectionHostname(this.upstream.hostname),
				port: this.upstream.port,
				method: incoming.method,
				path,
				headers
			});
			this.upstreamRequests.add(upstreamRequest);
			const release = () => {
				this.upstreamRequests.delete(upstreamRequest);
			};
			upstreamRequest.once("close", release);
			upstreamRequest.once("error", reject);
			upstreamRequest.once("response", (upstreamResponse) => {
				this.forwardResponse(upstreamResponse, outgoing, proxyOrigin, incoming.method ?? "GET").then(resolve, reject);
			});
			pipeline(incoming, upstreamRequest).catch((error) => {
				upstreamRequest.destroy(error instanceof Error ? error : /* @__PURE__ */ new Error("request body failed"));
			});
		});
	}
	async forwardResponse(incoming, outgoing, proxyOrigin, requestMethod) {
		const headers = filteredHeaders(incoming.headers);
		rewriteLocation(headers, this.upstream.origin, proxyOrigin);
		const status = incoming.statusCode ?? 502;
		if (!hasBody(status) || requestMethod === "HEAD") {
			outgoing.writeHead(status, headers);
			outgoing.end();
			incoming.resume();
			return;
		}
		if (!isHtml(incoming.headers["content-type"])) {
			outgoing.writeHead(status, headers);
			await pipeline(incoming, outgoing);
			return;
		}
		const body = await collectDecodedHtml(incoming, incoming.headers["content-encoding"], this.options.htmlMaxBytes);
		const injected = Buffer.from(injectLabelStudioInspectionBridge(body.toString("utf8"), this.options.inspectionProtocol));
		delete headers["content-encoding"];
		delete headers.etag;
		delete headers.digest;
		delete headers["content-md5"];
		headers["content-length"] = String(injected.length);
		outgoing.writeHead(status, headers);
		outgoing.end(injected);
	}
};
function requireHttpLoopbackOrigin(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new TypeError("upstreamBaseUrl must be a loopback HTTP origin");
	}
	if (url.protocol !== "http:" || ![
		"127.0.0.1",
		"localhost",
		"[::1]"
	].includes(url.hostname) || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") throw new TypeError("upstreamBaseUrl must be a loopback HTTP origin");
	return url;
}
function connectionHostname(hostname) {
	if (hostname === "localhost") return "127.0.0.1";
	if (hostname === "[::1]") return "::1";
	return hostname;
}
function fixedRequestPath(value) {
	if (value === void 0) return "/";
	try {
		const parsed = value.startsWith("//") ? new URL(`http:${value}`) : new URL(value, "http://fixed.invalid");
		return `${parsed.pathname}${parsed.search}`;
	} catch {
		return "/";
	}
}
function filteredHeaders(source) {
	const blocked = new Set(HOP_BY_HOP);
	const connection = singleHeader(source.connection);
	for (const value of connection?.split(",") ?? []) blocked.add(value.trim().toLowerCase());
	const target = {};
	for (const [name, value] of Object.entries(source)) {
		const lower = name.toLowerCase();
		if (blocked.has(lower) || lower.startsWith("x-forwarded-") || value === void 0) continue;
		target[lower] = value;
	}
	return target;
}
function singleHeader(value) {
	return Array.isArray(value) ? value[0] : value;
}
function safeMethod(method) {
	return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
function isHtml(value) {
	return value?.split(";", 1)[0]?.trim().toLowerCase() === "text/html";
}
function hasBody(status) {
	return status !== 204 && status !== 304 && status >= 200;
}
function rewriteLocation(headers, upstreamOrigin, proxyOrigin) {
	const location = singleHeader(headers.location);
	if (location === void 0) return;
	try {
		const parsed = new URL(location);
		if (parsed.origin === upstreamOrigin) headers.location = `${proxyOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {}
}
async function collectDecodedHtml(source, encoding, limit) {
	const decoder = encoding === void 0 || encoding === "identity" ? void 0 : encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
	if (decoder === null) throw new Error("unsupported HTML content encoding");
	const chunks = [];
	let size = 0;
	const sink = new Writable({ write(chunk, _encoding, callback) {
		const value = Buffer.from(chunk);
		size += value.length;
		if (size > limit) callback(/* @__PURE__ */ new Error("decoded HTML exceeds frameProxyHtmlMaxBytes"));
		else {
			chunks.push(value);
			callback();
		}
	} });
	if (decoder === void 0) await pipeline(source, sink);
	else await pipeline(source, decoder, sink);
	return Buffer.concat(chunks, size);
}
function fail(response, status) {
	response.writeHead(status, {
		"content-type": "text/plain; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end("Label Studio frame proxy request rejected");
}
//#endregion
//#region lib/types/operation-context.js
/** Resolve one Label Studio operation target from explicit ids, Session state, or the current iframe page. */
/** Stable failure raised when no verified resource satisfies an operation. */
var LabelStudioOperationContextError = class extends Error {
	code;
	/**
	* @param code - stable binding selection failure.
	* @param message - sanitized operator-facing explanation.
	*/
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "LabelStudioOperationContextError";
	}
};
/** Applies the shared target precedence and commits bindings only after caller-confirmed success. */
var LabelStudioOperationContextResolver = class {
	store;
	currentPages;
	api;
	currentPageTimeoutMs;
	/**
	* @param store - durable per-Session binding store.
	* @param currentPages - one-shot current iframe reader.
	* @param api - authoritative project and task reader.
	* @param currentPageTimeoutMs - positive one-shot inspection deadline.
	*/
	constructor(store, currentPages, api, currentPageTimeoutMs) {
		this.store = store;
		this.currentPages = currentPages;
		this.api = api;
		this.currentPageTimeoutMs = currentPageTimeoutMs;
		if (!Number.isSafeInteger(currentPageTimeoutMs) || currentPageTimeoutMs <= 0) throw new TypeError("currentPageTimeoutMs must be a positive safe integer");
	}
	/**
	* Resolve and verify one target without changing durable Session state.
	* @param identity - exact DSH Session lifecycle receiving the operation.
	* @param requirement - minimum resource level required by the operation.
	* @param selector - explicit, bound, or current-page target source.
	* @param signal - caller cancellation passed to browser and REST reads.
	* @returns verified target and the binding revision to use after business success.
	*/
	async resolve(identity, requirement, selector, signal) {
		const binding = this.store.readBinding(identity);
		if (selector.mode === "explicit") {
			const target = await this.resolveExplicit(selector, signal);
			requireLevel(target, requirement);
			return resolved(identity, target, "explicit", binding.revision);
		}
		if (selector.mode === "current-page") return resolved(identity, await this.resolveCurrentPage(identity, requirement, signal), "current-page", binding.revision);
		if (binding.target !== void 0 && satisfies(binding.target, requirement)) {
			await this.verifyTarget(binding.target, signal);
			return resolved(identity, binding.target, "binding", binding.revision);
		}
		return resolved(identity, await this.resolveCurrentPage(identity, requirement, signal), "current-page", binding.revision);
	}
	/**
	* Persist a verified target after its business operation has succeeded.
	* @param identity - exact DSH Session lifecycle receiving the binding.
	* @param target - target established by the successful operation.
	* @param source - actor that established the target.
	* @param expectedBindingRevision - revision observed before the business operation.
	* @returns committed snapshot or a newer conflicting snapshot without retrying business work.
	*/
	commitSuccessfulResult(identity, target, source, expectedBindingRevision) {
		return this.store.commitBinding(identity, {
			target,
			source,
			expectedRevision: expectedBindingRevision
		});
	}
	async resolveExplicit(selector, signal) {
		if (selector.annotationId !== void 0 && selector.taskId === void 0) throw mismatch("an explicit annotation requires a task id");
		if (selector.taskId !== void 0) {
			const task = await this.api.getTask(selector.taskId, signal);
			if (selector.projectId !== void 0 && selector.projectId !== task.projectId) throw mismatch("the explicit project does not own the requested task");
			return {
				kind: "task",
				projectId: task.projectId,
				taskId: task.id,
				...selector.annotationId === void 0 ? {} : { annotationId: selector.annotationId }
			};
		}
		if (selector.projectId === void 0) throw missing("explicit selection requires a project or task id");
		return {
			kind: "project",
			projectId: (await this.api.getProject(selector.projectId, signal)).id
		};
	}
	async resolveCurrentPage(identity, requirement, signal) {
		const page = await this.currentPages.request(identity, this.currentPageTimeoutMs, signal);
		if (page.view === "projects") throw missing("the current Label Studio page has no project target");
		const target = page.view === "project" ? {
			kind: "project",
			projectId: page.projectId
		} : {
			kind: "task",
			projectId: page.projectId,
			taskId: page.taskId,
			...page.annotationId === void 0 ? {} : { annotationId: page.annotationId }
		};
		requireLevel(target, requirement);
		await this.verifyTarget(target, signal);
		return target;
	}
	async verifyTarget(target, signal) {
		if (target.kind === "project") {
			await this.api.getProject(target.projectId, signal);
			return;
		}
		if ((await this.api.getTask(target.taskId, signal)).projectId !== target.projectId) throw mismatch("the selected project does not own the selected task");
	}
};
function resolved(identity, target, source, expectedBindingRevision) {
	return {
		identity,
		target,
		source,
		expectedBindingRevision
	};
}
function satisfies(target, requirement) {
	return requirement === "project" || target.kind === "task";
}
function requireLevel(target, requirement) {
	if (!satisfies(target, requirement)) throw mismatch("the selected target does not identify a task");
}
function missing(message) {
	return new LabelStudioOperationContextError("binding-missing", message);
}
function mismatch(message) {
	return new LabelStudioOperationContextError("binding-target-mismatch", message);
}
//#endregion
//#region lib/types/runtime.js
/** Managed local Label Studio process and readiness probe. */
/** Owns at most one Label Studio process started by this plugin instance. */
var LabelStudioRuntime = class {
	subprocess;
	config;
	fetcher;
	handle;
	/**
	* @param subprocess - execution-world process provider.
	* @param config - resolved launcher and endpoint facts.
	* @param fetcher - HTTP implementation, injectable for deterministic tests.
	*/
	constructor(subprocess, config, fetcher = globalThis.fetch) {
		this.subprocess = subprocess;
		this.config = config;
		this.fetcher = fetcher;
	}
	/** Probe, optionally spawn, and wait until Label Studio is ready. */
	async start() {
		if ((await this.status()).available) return;
		if (this.config.launchMode === "external") throw new Error(`label-studio: external service is unavailable at ${this.config.baseUrl}`);
		const url = new URL(this.config.baseUrl);
		const port = url.port === "" ? url.protocol === "https:" ? "443" : "80" : url.port;
		this.handle = this.subprocess.spawn({
			argv: await this.resolveLaunchArgv(port),
			cwd: process.cwd(),
			stdio: {
				stdin: "ignore",
				stdout: { maxBytes: 65536 },
				stderr: { maxBytes: 65536 }
			},
			graceMs: this.config.shutdownGraceMs,
			env: { WEBHOOK_TIMEOUT: String(this.config.managedWebhookTimeoutSeconds) }
		});
		try {
			const deadline = Date.now() + this.config.startupTimeoutMs;
			while (Date.now() < deadline) {
				if ((await this.status()).available) return;
				const remaining = deadline - Date.now();
				await this.waitForNextProbe(Math.min(250, Math.max(1, remaining)));
			}
			const diagnostics = this.diagnostics();
			throw new Error(`label-studio: service did not become ready within ${this.config.startupTimeoutMs}ms${diagnostics}`);
		} catch (error) {
			await this.stopOwnedProcess();
			throw error;
		}
	}
	/**
	* Read the unauthenticated Label Studio health endpoint.
	* @param signal - optional caller cancellation.
	* @returns current availability and process ownership.
	*/
	async status(signal) {
		try {
			const response = await this.fetcher(`${this.config.baseUrl}/health`, {
				method: "GET",
				headers: { Accept: "application/json" },
				...signal === void 0 ? {} : { signal }
			});
			if (!response.ok) return this.snapshot(false);
			const body = await response.json();
			return this.snapshot(body.status === "UP");
		} catch (_error) {
			if (signal?.aborted === true) throw signal.reason;
			return this.snapshot(false);
		}
	}
	/** Terminate and join only the process this instance started. */
	async dispose() {
		await this.stopOwnedProcess();
	}
	async stopOwnedProcess() {
		const handle = this.handle;
		this.handle = void 0;
		if (handle === void 0) return;
		handle.terminate();
		await handle.waitForExit();
	}
	async resolveLaunchArgv(port) {
		const tail = [
			"start",
			"--no-browser",
			"--port",
			port,
			"--internal-host",
			"127.0.0.1"
		];
		switch (this.config.launchMode) {
			case "python": return [
				await this.subprocess.resolveExecutable(this.config.pythonExecutable),
				"-m",
				"label_studio.server",
				...tail
			];
			case "external": throw new Error("label-studio: external launch mode cannot create a process");
			default: return assertNever$1(this.config.launchMode);
		}
	}
	snapshot(available) {
		return {
			available,
			baseUrl: this.config.baseUrl,
			managed: this.handle !== void 0
		};
	}
	async waitForNextProbe(delayMs) {
		const handle = this.handle;
		if (handle === void 0) return;
		const exited = handle.done.then((outcome) => {
			throw new Error(`label-studio: managed process exited before readiness (code ${String(outcome.exitCode)}, signal ${String(outcome.signal)})${this.diagnostics()}`);
		});
		await Promise.race([new Promise((resolve) => setTimeout(resolve, delayMs)), exited]);
	}
	diagnostics() {
		const handle = this.handle;
		if (handle === void 0) return "";
		const joined = [handle.collected.stdout?.readFrom(0).text.trim(), handle.collected.stderr?.readFrom(0).text.trim()].filter((part) => part !== void 0 && part !== "").join("\n");
		return joined === "" ? "" : `\n${joined}`;
	}
};
function assertNever$1(value) {
	throw new Error(`label-studio: unsupported launch mode ${String(value)}`);
}
//#endregion
//#region lib/types/present.js
/** Pure Label Studio tool-card projections. */
/**
* Present a Label Studio status probe.
* @returns generic read card for the status operation.
*/
function presentStatusCall() {
	return {
		card: "generic",
		title: "Check Label Studio",
		kind: "read"
	};
}
/**
* Present a Label Studio project creation request.
* @param args - project title supplied to the tool.
* @returns generic execution card for project creation.
*/
function presentCreateProjectCall(args) {
	return {
		card: "generic",
		title: `Create Label Studio project: ${args.title}`,
		kind: "execute"
	};
}
/**
* Present a Label Studio task import request.
* @param args - target project and unvalidated task payload.
* @returns generic execution card containing the import count.
*/
function presentImportTasksCall(args) {
	return {
		card: "generic",
		title: `Import ${Array.isArray(args.tasks) ? args.tasks.length : 0} tasks into ${args.project_id === void 0 ? "selected Label Studio project" : `Label Studio project ${args.project_id}`}`,
		kind: "execute"
	};
}
/**
* Present a Label Studio prediction creation request.
* @param args - target task id.
* @returns generic execution card for prediction creation.
*/
function presentCreatePredictionCall(args) {
	return {
		card: "generic",
		title: args.task_id === void 0 ? "Create prediction for selected Label Studio task" : `Create prediction for Label Studio task ${args.task_id}`,
		kind: "execute"
	};
}
/**
* Present a Label Studio labeling-interface update without exposing its XML.
* @param args - optional target project and omitted label configuration content.
* @returns generic execution card with no filesystem locations.
*/
function presentUpdateLabelConfigCall(args) {
	return {
		card: "generic",
		title: args.project_id === void 0 ? "Update bound Label Studio project label config" : `Update Label Studio project ${args.project_id} label config`,
		kind: "execute",
		locations: []
	};
}
/**
* Present a prediction request for the current Session's active Label Studio task.
* @param _args - explicit result and optional model metadata supplied to the tool.
* @returns generic execution card with no filesystem locations.
*/
function presentCreateActivePredictionCall(_args) {
	return {
		card: "generic",
		title: "Create prediction for active Label Studio task",
		kind: "execute",
		locations: []
	};
}
/**
* Present a request to navigate the current Session's Label Studio workbench.
* @param args - project, task, and optional annotation identifiers supplied to the tool.
* @returns generic execution card with no filesystem locations.
*/
function presentFocusTaskCall(args) {
	return {
		card: "generic",
		title: `Open Label Studio task ${args.task_id}`,
		kind: "execute",
		locations: []
	};
}
/**
* Present a read of the current Session's committed Label Studio task.
* @returns generic read card with no filesystem locations.
*/
function presentActiveTaskCall() {
	return {
		card: "generic",
		title: "Read active Label Studio task",
		kind: "read",
		locations: []
	};
}
/**
* Project non-sensitive identifiers from a complete active-task result.
* @param value - validated project and task returned by the Host REST client.
* @returns short identifiers and collection counts without task or result content.
*/
function presentActiveTaskMeta(value) {
	return {
		projectId: value.project.id,
		taskId: value.task.id,
		annotationCount: value.task.annotations.length,
		predictionCount: value.task.predictions.length
	};
}
//#endregion
//#region lib/types/tools.js
/** Model-facing Label Studio status, project, task-import, and prediction tools. */
/**
* Register all Label Studio model tools for one runtime and REST client.
* @param ctx - Host context carrying the model tool registry.
* @param runtime - local service status provider.
* @param api - authenticated Label Studio REST client.
* @param contexts - Session context registry reserved for context-aware tools.
* @param changes - browser event broker reserved for mutation notifications.
* @param operations - shared package cancellation and quiescence gate.
* @param resolver - shared explicit, binding, and current-page target resolver.
* @param bindings - binding revision reader used before target-free project creation.
* @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
* @returns disposer unregistering every tool in reverse order.
*/
function registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, resolver, bindings, policy) {
	const disposers = [];
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_status",
		description: "Check whether the configured local Label Studio service is reachable and whether this DSH plugin started it. Call this before project, task-import, or prediction operations when availability is uncertain.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					available: {
						type: "boolean",
						required: true
					},
					baseUrl: {
						type: "string",
						required: true
					},
					managed: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.available ? `Label Studio is available at ${value.baseUrl}${value.managed ? " (managed by DSH)." : "."}` : `Label Studio is unavailable at ${value.baseUrl}.`
			}]
		},
		execute: (_args, exec) => operations.run(exec.signal, async (signal) => {
			const status = await runtime.status(signal);
			if (status.available && policy.ensureWebhook !== void 0) await policy.ensureWebhook(signal);
			return status;
		}),
		presentCall: presentStatusCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_project",
		description: "Create a Label Studio project through the authenticated REST API. Supply Label Studio XML in label_config when the project must be immediately ready for annotation. The successful project becomes this DSH Session binding. Returns the project id and browser URL.",
		parameters: {
			title: {
				type: "string",
				required: true,
				description: "Project title."
			},
			label_config: {
				type: "string",
				description: "Optional Label Studio labeling-interface XML."
			},
			description: {
				type: "string",
				description: "Optional project description."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "number",
						required: true
					},
					title: {
						type: "string",
						required: true
					},
					webUrl: {
						type: "string",
						required: true
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio project ${value.id} (${value.title}): ${value.webUrl}${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "project creation");
				const expectedBindingRevision = bindings.readBinding(identity).revision;
				await requireAvailable(runtime, signal);
				const project = await api.createProject({
					title: args.title,
					...args.label_config === void 0 ? {} : { labelConfig: args.label_config },
					...args.description === void 0 ? {} : { description: args.description }
				}, signal);
				const warning = await commitWarning(resolver, identity, {
					kind: "project",
					projectId: labelStudioProjectId(project.id)
				}, expectedBindingRevision);
				return {
					...project,
					webUrl: `${runtime.config.baseUrl}/projects/${project.id}/data`,
					...warning
				};
			});
		},
		presentCall: presentCreateProjectCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_import_tasks",
		description: "Import JSON tasks into an existing Label Studio project. Supply project_id for an explicit target, set current_page when the user refers to the visible iframe, or omit both to use this DSH Session binding. Each task data object must match the project label configuration.",
		parameters: {
			project_id: {
				type: "number",
				description: "Optional explicit Label Studio project id."
			},
			current_page: {
				type: "boolean",
				description: "Inspect the visible iframe instead of reusing the Session binding."
			},
			tasks: {
				type: "json",
				required: true,
				description: "JSON array of Label Studio task objects."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					projectId: {
						type: "number",
						required: true
					},
					taskCount: {
						type: "number",
						required: true
					},
					taskIds: {
						type: "array",
						required: true,
						items: { type: "number" }
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Imported ${value.taskCount} tasks into Label Studio project ${value.projectId}.${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "task import");
				const tasks = parseTasks(args.tasks);
				await requireAvailable(runtime, signal);
				const context = await resolver.resolve(identity, "project", projectSelector(args.project_id, args.current_page), signal);
				const target = {
					kind: "project",
					projectId: context.target.projectId
				};
				const imported = await api.importTasks(target.projectId, tasks, signal);
				const warning = await commitWarning(resolver, identity, target, context.expectedBindingRevision);
				return {
					projectId: target.projectId,
					...imported,
					...warning
				};
			});
		},
		presentCall: presentImportTasksCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_prediction",
		description: "Create a pre-annotation prediction for one Label Studio task. Supply task_id and optional project_id for an explicit target, set current_page when the user refers to the visible iframe, or omit ids to reuse this DSH Session task binding. This never updates a saved annotation.",
		parameters: {
			task_id: {
				type: "number",
				description: "Optional explicit Label Studio task id."
			},
			project_id: {
				type: "number",
				description: "Optional explicit project used to verify task ownership."
			},
			current_page: {
				type: "boolean",
				description: "Inspect the visible iframe instead of reusing the Session binding."
			},
			result: {
				type: "json",
				required: true,
				description: "JSON array of Label Studio prediction result objects."
			},
			model_version: {
				type: "string",
				description: "Optional model or workflow version recorded with the prediction."
			},
			score: {
				type: "number",
				description: "Optional prediction score."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "number",
						required: true
					},
					taskId: {
						type: "number",
						required: true
					},
					modelVersion: { type: "string" },
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio prediction ${value.id} for task ${value.taskId}.${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "prediction creation");
				const result = parseArray(args.result, "result");
				await requireAvailable(runtime, signal);
				const context = await resolver.resolve(identity, "task", taskSelector(args.project_id, args.task_id, args.current_page), signal);
				const target = requireTaskTarget(context.target);
				const prediction = await api.createPrediction({
					taskId: target.taskId,
					result,
					...args.model_version === void 0 ? {} : { modelVersion: args.model_version },
					...args.score === void 0 ? {} : { score: args.score }
				}, signal);
				const warning = await commitWarning(resolver, identity, target, context.expectedBindingRevision);
				return {
					...prediction,
					...warning
				};
			});
		},
		presentCall: presentCreatePredictionCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_active_prediction",
		description: "Create a pre-annotation prediction for this DSH Session task binding. Set current_page when the user refers to the visible iframe; otherwise an absent task binding triggers one on-demand inspection. Supply result explicitly using the project label configuration. This never updates a saved annotation.",
		parameters: {
			current_page: {
				type: "boolean",
				description: "Force one inspection of the visible Label Studio iframe."
			},
			result: {
				type: "json",
				required: true,
				description: "Explicit JSON array of Label Studio prediction result objects for the active task."
			},
			model_version: {
				type: "string",
				description: "Optional model or workflow version recorded with the prediction."
			},
			score: {
				type: "number",
				description: "Optional prediction score."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: {
						type: "number",
						required: true
					},
					projectId: {
						type: "number",
						required: true
					},
					taskId: {
						type: "number",
						required: true
					},
					modelVersion: { type: "string" },
					eventRevision: {
						type: "number",
						required: true
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio prediction ${value.id} for active task ${value.taskId} in project ${value.projectId}.${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "active prediction creation");
				const result = parseArray(args.result, "result");
				const context = await resolver.resolve(identity, "task", args.current_page === true ? { mode: "current-page" } : { mode: "binding" }, signal);
				const target = requireTaskTarget(context.target);
				const prediction = await api.createPrediction({
					taskId: target.taskId,
					result,
					...args.model_version === void 0 ? {} : { modelVersion: args.model_version },
					...args.score === void 0 ? {} : { score: args.score }
				}, signal);
				const warning = await commitWarning(resolver, identity, target, context.expectedBindingRevision);
				const event = changes.publishTaskChanged(identity.sessionId, target.taskId, "prediction-created");
				return {
					id: prediction.id,
					projectId: target.projectId,
					taskId: prediction.taskId,
					...prediction.modelVersion === void 0 ? {} : { modelVersion: prediction.modelVersion },
					eventRevision: event.eventRevision,
					...warning
				};
			});
		},
		presentCall: presentCreateActivePredictionCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_focus_task",
		description: "Navigate the Label Studio workbench for this DSH Session to a project task and optional saved annotation. The tool verifies the task-project association first and binds the task only after the browser applies the URL. The embedded page may still be loading.",
		parameters: {
			project_id: {
				type: "number",
				required: true,
				description: "Target Label Studio project id."
			},
			task_id: {
				type: "number",
				required: true,
				description: "Target Label Studio task id."
			},
			annotation_id: {
				type: "number",
				description: "Optional saved Label Studio annotation id."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					projectId: {
						type: "number",
						required: true
					},
					taskId: {
						type: "number",
						required: true
					},
					annotationId: { type: "number" },
					targetRevision: {
						type: "number",
						required: true
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Label Studio workbench applied the URL for task ${value.taskId} in project ${value.projectId}; page loading was not checked.${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "task focus");
				const leaseBinding = contexts.getLease(identity.sessionId);
				if (leaseBinding === void 0) throw new Error("label-studio: this Session has no live Label Studio browser lease");
				const context = await resolver.resolve(identity, "task", {
					mode: "explicit",
					projectId: labelStudioProjectId(args.project_id),
					taskId: labelStudioTaskId(args.task_id),
					...args.annotation_id === void 0 ? {} : { annotationId: labelStudioAnnotationId(args.annotation_id) }
				}, signal);
				const target = requireTaskTarget(context.target);
				const browserTarget = {
					projectId: target.projectId,
					taskId: target.taskId,
					...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
				};
				const correlationId = labelStudioFocusCorrelationId(randomUUID());
				const reservation = contexts.reserveFocusTarget(leaseBinding.lease.leaseId, leaseBinding.lease.generation, correlationId);
				const committed = await changes.requestFocus(identity, correlationId, reservation, browserTarget, policy.focusAckTimeoutMs, signal);
				const warning = await commitWarning(resolver, identity, {
					kind: "task",
					projectId: committed.target.projectId,
					taskId: committed.target.taskId,
					...committed.target.annotationId === void 0 ? {} : { annotationId: committed.target.annotationId }
				}, context.expectedBindingRevision);
				return {
					projectId: committed.target.projectId,
					taskId: committed.target.taskId,
					...committed.target.annotationId === void 0 ? {} : { annotationId: committed.target.annotationId },
					targetRevision: committed.targetRevision,
					...warning
				};
			});
		},
		presentCall: presentFocusTaskCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_update_label_config",
		description: "Replace one Label Studio project labeling interface. Supply project_id for an explicit target, set current_page when the user refers to the visible iframe, or omit both to use this DSH Session binding. Only label_config is sent to Label Studio.",
		parameters: {
			label_config: {
				type: "string",
				required: true,
				description: "Complete Label Studio labeling-interface XML."
			},
			project_id: {
				type: "number",
				description: "Optional explicit Label Studio project id."
			},
			current_page: {
				type: "boolean",
				description: "Inspect the visible iframe instead of reusing the Session binding."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					projectId: {
						type: "number",
						required: true
					},
					labelConfig: {
						type: "string",
						required: true
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Updated the label config for Label Studio project ${value.projectId}.${bindingWarningSuffix(value.warning)}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "label-config update");
				await requireAvailable(runtime, signal);
				const context = await resolver.resolve(identity, "project", projectSelector(args.project_id, args.current_page), signal);
				const target = {
					kind: "project",
					projectId: context.target.projectId
				};
				const updated = await api.updateProjectLabelConfig(target.projectId, args.label_config, signal);
				const warning = await commitWarning(resolver, identity, target, context.expectedBindingRevision);
				return {
					projectId: updated.id,
					labelConfig: updated.labelConfig,
					...warning
				};
			});
		},
		presentCall: presentUpdateLabelConfigCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_get_active_task",
		description: "Read the project labeling configuration, task data, saved annotations, and predictions for the current DSH Session task binding. Set current_page when the user explicitly refers to the visible iframe; an absent task binding otherwise triggers one on-demand inspection.",
		parameters: { current_page: {
			type: "boolean",
			description: "Force one inspection of the visible Label Studio iframe."
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					project: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							id: {
								type: "number",
								required: true
							},
							labelConfig: {
								type: "string",
								required: true
							},
							showCollabPredictions: {
								type: "boolean",
								required: true
							}
						}
					},
					task: {
						type: "object",
						required: true,
						additionalProperties: false,
						properties: {
							id: {
								type: "number",
								required: true
							},
							projectId: {
								type: "number",
								required: true
							},
							data: {
								type: "json",
								required: true
							},
							annotations: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										id: {
											type: "number",
											required: true
										},
										projectId: {
											type: "number",
											required: true
										},
										taskId: {
											type: "number",
											required: true
										},
										result: {
											type: "array",
											required: true,
											items: { type: "json" }
										},
										updatedAt: {
											type: "string",
											required: true
										}
									}
								}
							},
							predictions: {
								type: "array",
								required: true,
								items: {
									type: "object",
									additionalProperties: false,
									properties: {
										id: {
											type: "number",
											required: true
										},
										projectId: {
											type: "number",
											required: true
										},
										taskId: {
											type: "number",
											required: true
										},
										result: {
											type: "array",
											required: true,
											items: { type: "json" }
										},
										modelVersion: { type: "string" },
										score: { type: "number" }
									}
								}
							}
						}
					},
					warning: {
						type: "string",
						enum: ["binding-conflict"]
					}
				}
			},
			render: (_args, value) => activeTaskBlocks(value, policy.activeTaskMaxBytes),
			presentationMeta: (_args, value) => presentActiveTaskMeta(value)
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const identity = requireSessionIdentity(exec.agent, "active-task read");
				const context = await resolver.resolve(identity, "task", args.current_page === true ? { mode: "current-page" } : { mode: "binding" }, signal);
				const target = requireTaskTarget(context.target);
				let project;
				try {
					project = await api.getProject(target.projectId, signal);
				} catch (error) {
					if (isMissingProjectResponse(error, target.projectId)) await changes.markProjectDeleted(identity, target.projectId);
					throw error;
				}
				const task = await api.getTask(target.taskId, signal);
				const selected = validateSelectedTask(target, project, task);
				const warning = await commitWarning(resolver, identity, target, context.expectedBindingRevision);
				return {
					...selected,
					...warning
				};
			});
		},
		presentCall: presentActiveTaskCall
	})));
	return () => {
		for (const dispose of disposers.reverse()) dispose();
	};
}
function activeTaskBlocks(value, maxBytes) {
	const blocks = [{
		type: "text",
		text: JSON.stringify(value, null, 2)
	}];
	const bytes = new TextEncoder().encode(JSON.stringify(blocks)).byteLength;
	if (bytes > maxBytes) throw new Error(`label-studio: active task result exceeds activeTaskMaxBytes (${bytes} > ${maxBytes})`);
	return blocks;
}
function bindingWarningSuffix(warning) {
	return warning === void 0 ? "" : " Warning: the business operation succeeded, but a newer Session binding was kept (binding-conflict).";
}
function requireSessionIdentity(agent, operation) {
	if (agent === void 0) throw new Error(`label-studio: ${operation} requires a DSH Session`);
	return {
		sessionId: agent.id,
		createdAt: agent.session.header.createdAt
	};
}
function projectSelector(projectId, currentPage) {
	if (projectId !== void 0) return {
		mode: "explicit",
		projectId: labelStudioProjectId(projectId)
	};
	return currentPage === true ? { mode: "current-page" } : { mode: "binding" };
}
function taskSelector(projectId, taskId, currentPage) {
	if (projectId !== void 0 || taskId !== void 0) return {
		mode: "explicit",
		...projectId === void 0 ? {} : { projectId: labelStudioProjectId(projectId) },
		...taskId === void 0 ? {} : { taskId: labelStudioTaskId(taskId) }
	};
	return currentPage === true ? { mode: "current-page" } : { mode: "binding" };
}
function requireTaskTarget(target) {
	if (target.kind !== "task") throw new Error("label-studio: resolved target does not identify a task");
	return target;
}
async function commitWarning(resolver, identity, target, expectedBindingRevision) {
	return (await resolver.commitSuccessfulResult(identity, target, "tool-result", expectedBindingRevision)).kind === "conflict" ? { warning: "binding-conflict" } : {};
}
async function requireAvailable(runtime, signal) {
	const status = await runtime.status(signal);
	if (!status.available) throw new Error(`label-studio: service is unavailable at ${status.baseUrl}`);
}
function parseTasks(value) {
	return parseArray(value, "tasks").map((task, index) => {
		if (!isRecord(task) || !isRecord(task.data)) throw new Error(`label-studio: tasks[${index}] must be an object with a data object`);
		const predictions = task.predictions;
		if (predictions !== void 0 && !Array.isArray(predictions)) throw new Error(`label-studio: tasks[${index}].predictions must be an array when present`);
		return {
			data: task.data,
			...predictions === void 0 ? {} : { predictions }
		};
	});
}
function parseArray(value, field) {
	if (!Array.isArray(value)) throw new Error(`label-studio: ${field} must be a JSON array`);
	return value;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isMissingProjectResponse(error, projectId) {
	return (error instanceof LabelStudioHttpError || isRecord(error)) && error.name === "LabelStudioHttpError" && error.method === "GET" && error.path === `/api/projects/${projectId}/` && error.status === 404;
}
//#endregion
//#region lib/types/webhook-binding.js
/** Safe mapping from Label Studio Webhooks to existing Session bindings. */
/** Applies deletion events and otherwise confirms only pre-existing exact bindings. */
var LabelStudioWebhookBindingCoordinator = class {
	store;
	broker;
	livePages;
	/**
	* @param store - durable binding reader and deletion reconciler.
	* @param broker - browser status publisher.
	*/
	constructor(store, broker, livePages) {
		this.store = store;
		this.broker = broker;
		this.livePages = livePages;
	}
	/**
	* Synchronize one finite authenticated event.
	* @param event - identifier-only Webhook event.
	* @returns matching or deletion outcome without creating a binding.
	*/
	async accept(event, signal = new AbortController().signal) {
		switch (event.action) {
			case "PROJECT_DELETED": return this.publishChanges(await this.store.reconcileProjectDeleted(event.projectId));
			case "TASK_DELETED":
			case "TASKS_DELETED": return this.publishChanges(await this.store.reconcileTasksDeleted(event.projectId, event.taskIds));
			case "ANNOTATION_DELETED":
			case "ANNOTATIONS_DELETED": return {
				kind: "reconciled-deletion",
				affectedSessionIds: []
			};
			case "ANNOTATION_CREATED":
			case "ANNOTATIONS_CREATED":
			case "ANNOTATION_UPDATED": {
				const existing = this.matchingSessionIds((binding) => {
					const target = binding.target;
					return target?.kind === "task" && target.projectId === event.projectId && event.items.some((item) => item.taskId === target.taskId);
				});
				if (existing.length > 0) return {
					kind: "matched-existing",
					sessionIds: existing
				};
				return this.bindAnnotationFromLivePage(event, signal);
			}
			case "PROJECT_CREATED":
			case "PROJECT_UPDATED":
			case "TASK_CREATED":
			case "TASKS_CREATED": return this.match((binding) => binding.target?.projectId === event.projectId);
			default: return assertNever(event);
		}
	}
	match(predicate) {
		const sessionIds = this.matchingSessionIds(predicate);
		if (sessionIds.length > 0) return {
			kind: "matched-existing",
			sessionIds
		};
		this.broker.publishWebhookUnassigned();
		return {
			kind: "unassigned",
			reason: "no-matching-binding"
		};
	}
	matchingSessionIds(predicate) {
		return this.store.listBindings().filter((item) => predicate(item.binding)).map((item) => item.sessionId);
	}
	async bindAnnotationFromLivePage(event, signal) {
		const livePages = this.livePages;
		if (livePages === void 0) return this.unassigned();
		const matches = (await Promise.all(livePages.sessionIds().map(async (sessionId) => {
			try {
				const identity = await livePages.resolveIdentity(sessionId, signal);
				return {
					identity,
					page: await livePages.currentPages.request(identity, livePages.timeoutMs, signal)
				};
			} catch {
				return;
			}
		}))).filter((item) => {
			if (item === void 0 || item.page.view !== "task" || item.page.projectId !== event.projectId) return false;
			const taskId = item.page.taskId;
			return event.items.some((eventItem) => eventItem.taskId === taskId);
		});
		if (matches.length !== 1) return this.unassigned();
		const match = matches[0];
		const annotation = event.items.find((item) => item.taskId === match.page.taskId);
		const before = this.store.readBinding(match.identity);
		const outcome = await this.store.commitBinding(match.identity, {
			expectedRevision: before.revision,
			target: {
				kind: "task",
				projectId: event.projectId,
				taskId: match.page.taskId,
				annotationId: annotation.annotationId
			},
			source: "webhook"
		});
		if (outcome.kind === "conflict") return this.unassigned();
		this.broker.publishBindingChanged(match.identity.sessionId, outcome.snapshot);
		return {
			kind: "bound-from-live-page",
			sessionId: match.identity.sessionId
		};
	}
	unassigned() {
		this.broker.publishWebhookUnassigned();
		return {
			kind: "unassigned",
			reason: "no-matching-binding"
		};
	}
	publishChanges(changes) {
		for (const change of changes) this.broker.publishBindingChanged(change.sessionId, change.after);
		return {
			kind: "reconciled-deletion",
			affectedSessionIds: changes.map((change) => change.sessionId)
		};
	}
};
function assertNever(value) {
	throw new Error(`label-studio: unsupported webhook event ${String(value)}`);
}
//#endregion
//#region lib/types/webhook-ingress.js
/** Authenticated bounded HTTP ingress for Label Studio Webhooks. */
/** Convert secret bytes to the exact opaque header value installed in Label Studio. */
function encodeWebhookSecret(secret) {
	return Buffer.from(secret).toString("base64url");
}
/**
* Create an exact-route handler that authenticates before parsing or synchronizing an event.
* @param coordinator - durable binding synchronization owner.
* @param options - request limit, route path, and ephemeral secret.
* @returns Node HTTP handler owning every response.
*/
function createLabelStudioWebhookHandler(coordinator, options) {
	const expected = digest(encodeWebhookSecret(options.secret));
	return async (req, res) => {
		if (req.method !== "POST") return finish(res, 405);
		if (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return finish(res, 415);
		if (!authenticated(req.headers["x-dsh-label-studio-webhook"], expected)) return finish(res, 401);
		const declared = req.headers["content-length"];
		if (declared !== void 0 && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(options.maxBodyBytes))) {
			req.resume();
			return finish(res, 413);
		}
		let bytes;
		try {
			bytes = await readBounded(req, options.maxBodyBytes);
		} catch {
			return finish(res, 413);
		}
		let input;
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
			input = JSON.parse(text);
			await coordinator.accept(parseLabelStudioWebhook(input));
		} catch (error) {
			return finish(res, input === void 0 || isPayloadError(error) ? 400 : 503);
		}
		finish(res, 204);
	};
}
function authenticated(value, expected) {
	const received = digest(typeof value === "string" ? value : "");
	return timingSafeEqual(received, expected) && typeof value === "string";
}
function digest(value) {
	return createHash("sha256").update(value).digest();
}
async function readBounded(stream, maxBytes) {
	const chunks = [];
	let total = 0;
	for await (const chunk of stream) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
		total += bytes.byteLength;
		if (total > maxBytes) throw new Error("too large");
		chunks.push(bytes);
	}
	return Buffer.concat(chunks, total);
}
function isPayloadError(error) {
	return error instanceof SyntaxError || error instanceof TypeError || error instanceof Error && error.message === "label-studio: invalid webhook payload";
}
function finish(res, status) {
	res.statusCode = status;
	res.setHeader("Content-Length", "0");
	res.end();
}
//#endregion
//#region lib/types/webhook-registration.js
/** Reconciled ownership of Label Studio project Webhooks. */
/** Header identifying registrations owned by one durable plugin installation. */
const LABEL_STUDIO_WEBHOOK_OWNER_HEADER = "X-DSH-Label-Studio-Owner";
/** Header authenticating deliveries from the plugin-created registration. */
const LABEL_STUDIO_WEBHOOK_SECRET_HEADER = "X-DSH-Label-Studio-Webhook";
const CATEGORIES = [
	["project update", ["PROJECT_UPDATED"]],
	["task creation", ["TASK_CREATED", "TASKS_CREATED"]],
	["task deletion", ["TASK_DELETED", "TASKS_DELETED"]],
	["annotation creation", ["ANNOTATION_CREATED", "ANNOTATIONS_CREATED"]],
	["annotation update", ["ANNOTATION_UPDATED"]],
	["annotation deletion", ["ANNOTATION_DELETED", "ANNOTATIONS_DELETED"]]
];
/** Maintains one plugin-owned Webhook for each existing Label Studio project. */
var LabelStudioWebhookRegistrar = class {
	api;
	store;
	ownerCandidate;
	installed = [];
	installing;
	/**
	* @param api - authenticated Webhook REST operations.
	* @param store - persistent singleton owner storage.
	* @param ownerCandidate - UUID generator used only when no durable owner exists.
	*/
	constructor(api, store, ownerCandidate = randomUUID) {
		this.api = api;
		this.store = store;
		this.ownerCandidate = ownerCandidate;
	}
	/**
	* Reconcile stale owned registrations and install one current registration.
	* @param callbackUrl - DSH WebServer callback URL.
	* @param secret - in-memory delivery authentication value.
	* @param signal - package or caller cancellation.
	* @returns the exact installed registrations.
	*/
	ensureInstalled(callbackUrl, secret, signal) {
		if (this.installed.length > 0) return Promise.resolve(this.installed);
		this.installing ??= this.install(callbackUrl, secret, signal).finally(() => {
			this.installing = void 0;
		});
		return this.installing;
	}
	/** Delete only the exact registrations installed by this process. */
	async dispose(signal = new AbortController().signal) {
		const installed = this.installed;
		this.installed = [];
		for (const registration of installed) try {
			await this.api.deleteWebhook(registration.id, signal);
		} catch (error) {
			if (error instanceof LabelStudioHttpError && error.status === 404) continue;
			if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error;
			if ((await this.api.listWebhooks(signal)).some((item) => item.id === registration.id)) throw error;
		}
	}
	async install(callbackUrl, secret, signal) {
		const ownerId = await this.store.ensureWebhookOwnerId(this.ownerCandidate());
		const supported = await this.api.listWebhookActions(signal);
		const actions = CATEGORIES.flatMap(([category, choices]) => {
			const selected = choices.filter((action) => supported.has(action));
			if (selected.length === 0) throw new Error(`label-studio: Webhook does not support ${category}`);
			return selected;
		});
		const projectIds = await this.api.listProjectIds(signal);
		await this.removeOwned(ownerId, signal);
		const installed = [];
		let recovered = [];
		for (const projectId of projectIds) {
			const existing = recovered.find((item) => item.ownerId === ownerId && item.url === callbackUrl && item.projectId === projectId);
			if (existing !== void 0) {
				installed.push(existing);
				continue;
			}
			try {
				installed.push(await this.api.createWebhook({
					url: callbackUrl,
					actions,
					headers: {
						[LABEL_STUDIO_WEBHOOK_OWNER_HEADER]: ownerId,
						[LABEL_STUDIO_WEBHOOK_SECRET_HEADER]: encodeWebhookSecret(secret)
					},
					is_active: true,
					project: projectId,
					send_for_all_actions: false,
					send_payload: true
				}, signal));
			} catch (error) {
				if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error;
				recovered = (await this.api.listWebhooks(signal)).filter((item) => item.ownerId === ownerId && item.url === callbackUrl);
				const registration = recovered.find((item) => item.projectId === projectId);
				if (registration === void 0) throw error;
				installed.push(registration);
			}
		}
		this.installed = Object.freeze(installed);
		return this.installed;
	}
	async removeOwned(ownerId, signal) {
		for (const registration of await this.api.listWebhooks(signal)) {
			if (registration.ownerId !== ownerId) continue;
			try {
				await this.api.deleteWebhook(registration.id, signal);
			} catch (error) {
				if (error instanceof LabelStudioHttpError && error.status === 404) continue;
				if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error;
				if ((await this.api.listWebhooks(signal)).some((item) => item.id === registration.id)) throw error;
			}
		}
	}
};
//#endregion
//#region lib/types/index.js
/**
* Label Studio plugin: managed local process, authenticated REST tools, and
* browser workbench boot configuration.
* @module @deepseek-ai/dsh-label-studio
*/
const LABEL_STUDIO_INSPECTION_PROTOCOL = "dsh-label-studio-page/v1";
/** Cordis plugin name. */
const name = "label-studio";
/** Required Host services for process ownership, REST authentication, and tools. */
const inject = [
	"tools",
	"subprocess",
	"credentials",
	"storageDomain"
];
/**
* Start or adopt Label Studio, register the REST tools, and expose its URL to
* the optional browser carrier.
* @param ctx - Host context carrying the required capability services.
* @param config - validated or programmatically supplied plugin config.
*/
async function apply(ctx, config = {}) {
	const resolved = resolveConfig(config);
	const operations = new LabelStudioOperationGate();
	const sessionContexts = await LabelStudioSessionContextStore.open(ctx, { recentProjectLimit: resolved.recentProjectLimit });
	const runtime = new LabelStudioRuntime(ctx.subprocess, resolved);
	try {
		await runtime.start();
	} catch (error) {
		await sessionContexts.close();
		throw error;
	}
	const frameProxy = new LabelStudioFrameProxy({
		upstreamBaseUrl: resolved.baseUrl,
		inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
		htmlMaxBytes: resolved.frameProxyHtmlMaxBytes
	});
	let frameAddress;
	try {
		frameAddress = await frameProxy.start();
	} catch (error) {
		await Promise.allSettled([runtime.dispose(), sessionContexts.close()]);
		throw error;
	}
	const api = new LabelStudioApi(resolved.baseUrl, resolved.refreshTokenCredential, ctx.credentials, resolved.restResponseMaxBytes);
	const contexts = new LabelStudioContextRegistry(resolved.contextLeaseTtlMs);
	const changes = new LabelStudioChangeBroker(contexts, resolved.eventHistorySize, sessionContexts);
	const currentPages = new LabelStudioCurrentPageBroker(contexts, changes);
	const resolver = new LabelStudioOperationContextResolver(sessionContexts, currentPages, api, resolved.currentPageTimeoutMs);
	const webhookRegistrar = new LabelStudioWebhookRegistrar(api, sessionContexts);
	let webhookStatus = resolved.webhookMode === "off" ? "disabled" : "unavailable";
	let ensureWebhook;
	const disposeTools = registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, resolver, sessionContexts, {
		activeTaskMaxBytes: resolved.activeTaskMaxBytes,
		focusAckTimeoutMs: resolved.focusAckTimeoutMs,
		ensureWebhook: async (signal) => {
			if (ensureWebhook === void 0) return;
			try {
				await ensureWebhook(signal);
				webhookStatus = "ready";
				changes.publishWebhookStatus("ready");
			} catch (error) {
				webhookStatus = "unavailable";
				changes.publishWebhookStatus("unavailable");
				if (resolved.webhookMode === "required") throw error;
			}
		}
	});
	let activeBrowserDisposer;
	ctx.inject([
		"connection",
		"sessions",
		"sessionPersistence",
		"webServer"
	], (browserCtx) => {
		browserCtx.effect(async () => {
			let removeWebhookIngress;
			if (resolved.webhookMode !== "off") {
				const webhookCoordinator = new LabelStudioWebhookBindingCoordinator(sessionContexts, changes, {
					sessionIds: () => contexts.sessionIds(),
					resolveIdentity: (sessionId, signal) => resolvePersistentSessionIdentity(browserCtx, sessionId, signal, contexts, changes, sessionContexts),
					currentPages,
					timeoutMs: resolved.currentPageTimeoutMs
				});
				const secret = randomBytes(32);
				removeWebhookIngress = browserCtx.webServer.register({
					kind: "exact",
					path: resolved.webhookPath,
					handler: createLabelStudioWebhookHandler(webhookCoordinator, {
						path: resolved.webhookPath,
						maxBodyBytes: resolved.webhookMaxBodyBytes,
						secret
					})
				});
				const callbackUrl = `http://127.0.0.1:${browserCtx.webServer.port}${resolved.webhookPath}`;
				ensureWebhook = (signal) => webhookRegistrar.ensureInstalled(callbackUrl, secret, signal).then(() => void 0);
				try {
					await ensureWebhook(new AbortController().signal);
					webhookStatus = "ready";
				} catch (error) {
					webhookStatus = "unavailable";
					if (resolved.webhookMode === "required") {
						ensureWebhook = void 0;
						removeWebhookIngress();
						throw error;
					}
				}
			}
			const removeBootConfig = browserCtx.webServer.tapIndex((html) => injectLabelStudioBootConfig(html, {
				baseUrl: resolved.baseUrl,
				frameBaseUrl: frameAddress.baseUrl,
				frameCapability: frameAddress.capability,
				inspectionProtocol: LABEL_STUDIO_INSPECTION_PROTOCOL,
				currentPageTimeoutMs: resolved.currentPageTimeoutMs,
				contextOpenRetryMs: resolved.contextOpenRetryMs,
				contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
				eventHistorySize: resolved.eventHistorySize,
				webhookStatus
			}));
			const removeRpc = registerLabelStudioContextRpc(browserCtx, contexts, changes, sessionContexts, operations, { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs }, currentPages);
			let disposed = false;
			const disposeBrowser = async () => {
				if (disposed) return;
				disposed = true;
				ensureWebhook = void 0;
				removeWebhookIngress?.();
				const results = await Promise.allSettled([webhookRegistrar.dispose(), removeRpc()]);
				removeBootConfig();
				if (activeBrowserDisposer === disposeBrowser) activeBrowserDisposer = void 0;
				const failures = results.filter((result) => result.status === "rejected");
				if (failures.length === 1) throw failures[0].reason;
				if (failures.length > 1) throw new AggregateError(failures.map((result) => result.reason));
			};
			activeBrowserDisposer = disposeBrowser;
			return disposeBrowser;
		}, "label-studio: browser context channel");
	});
	ctx.effect(() => async () => {
		await disposeLabelStudioResources({
			operations,
			disposeTools,
			...activeBrowserDisposer === void 0 ? {} : { disposeBrowser: activeBrowserDisposer },
			disposeCurrentPages: () => {
				currentPages.dispose();
			},
			disposeFrameProxy: () => frameProxy.close(),
			disposeBroker: () => changes.dispose(),
			disposeRegistry: () => {
				contexts.dispose();
			},
			disposeRuntime: () => runtime.dispose(),
			disposeStore: () => sessionContexts.close()
		});
	}, "label-studio: ordered package shutdown");
}
//#endregion
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_CURRENT_PAGE_TIMEOUT_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_FRAME_PROXY_HTML_MAX_BYTES, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_MANAGED_WEBHOOK_TIMEOUT_SECONDS, DEFAULT_PYTHON_EXECUTABLE, DEFAULT_RECENT_PROJECT_LIMIT, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, DEFAULT_WEBHOOK_MAX_BODY_BYTES, DEFAULT_WEBHOOK_MODE, DEFAULT_WEBHOOK_PATH, LABEL_STUDIO_FRAME_BRIDGE_PATH, LABEL_STUDIO_WEBHOOK_ACTIONS, LabelStudioApi, LabelStudioChangeBroker, LabelStudioContextError, LabelStudioContextRegistry, LabelStudioCurrentPageBroker, LabelStudioCurrentPageError, LabelStudioFrameProxy, LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError, LabelStudioOperationClosedError, LabelStudioOperationContextError, LabelStudioOperationContextResolver, LabelStudioOperationGate, LabelStudioRuntime, LabelStudioSessionContextError, LabelStudioSessionContextStore, LabelStudioWebhookBindingCoordinator, LabelStudioWebhookRegistrar, apply, createLabelStudioWebhookHandler, disposeLabelStudioResources, encodeWebhookSecret, inject, injectLabelStudioBootConfig, labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPageContextSchema, labelStudioPageInspectionId, labelStudioPredictionId, labelStudioProjectId, labelStudioSessionContextDomainSpec, labelStudioSessionContextRecordSchema, labelStudioTaskId, name, parseLabelStudioWebhook, registerLabelStudioContextRpc, registerLabelStudioTools, resolveConfig, resolvePersistentSessionIdentity, validateSelectedTask };
