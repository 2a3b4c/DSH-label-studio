import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { SessionId } from "@deepseek-ai/dsh-session/types";
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
* Validate and brand a browser navigation sequence.
* @param value - untrusted numeric JSON value.
* @returns the validated non-negative safe integer.
*/
function labelStudioNavigationSequence(value) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("navigationSequence must be a non-negative safe integer");
	return value;
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
			id: numberField(body, "id"),
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
				taskId: numberField(body, "task"),
				...typeof modelVersion === "string" ? { modelVersion } : {}
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
			method: "GET",
			...signal === void 0 ? {} : { signal }
		});
		return {
			id: projectIdField(body, "id"),
			labelConfig: stringField$1(body, "label_config"),
			showCollabPredictions: booleanField(body, "show_collab_predictions")
		};
	}
	/**
	* Read one complete task including saved annotations and predictions.
	* @param taskId - validated Label Studio task id.
	* @param signal - optional caller cancellation.
	* @returns authoritative task data and result arrays.
	*/
	async getTask(taskId, signal) {
		return parseTaskView(await this.request(`/api/tasks/${taskId}/`, {
			method: "GET",
			...signal === void 0 ? {} : { signal }
		}));
	}
	async request(path, request) {
		const credential = await this.credentials.resolve(this.refreshTokenCredential);
		if (credential === void 0) throw new Error(`label-studio: credential "${String(this.refreshTokenCredential)}" is not configured`);
		const accessToken = await this.exchangeAccessToken(credential.value, request.signal);
		if (request.signal?.aborted === true) throw new Error(`label-studio: ${request.method} ${path} cancelled before dispatch`);
		return this.fetchJsonObject(path, {
			method: request.method,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${accessToken}`,
				...request.method === "POST" ? { "Content-Type": "application/json" } : {}
			},
			...request.body === void 0 ? {} : { body: JSON.stringify(request.body) },
			...request.signal === void 0 ? {} : { signal: request.signal }
		}, request.method === "POST");
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
		if (!response.ok) throw new Error(`label-studio: ${operation} returned ${response.status}`);
		try {
			return parseJsonObject(raw, operation);
		} catch (error) {
			if (mutation) throw new LabelStudioMutationOutcomeUnknownError(operation);
			throw error;
		}
	}
};
function decodeMutationResponse(operation, decode) {
	try {
		return decode();
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
function parseJsonObject(raw, operation) {
	let value;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error(`label-studio: ${operation} returned invalid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`label-studio: ${operation} must return a JSON object`);
	return value;
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
			if (navigationSequence === prior.navigationSequence && expectedTargetRevision === prior.expectedTargetRevision) return this.reservationSnapshot(record, prior.targetRevision, navigationSequence);
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
			navigationSequence,
			expectedTargetRevision,
			targetRevision
		});
		return this.reservationSnapshot(record, targetRevision, navigationSequence);
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
	states = /* @__PURE__ */ new Map();
	unsubscribeLeaseEnded;
	disposed = false;
	/**
	* Create a broker and subscribe to authoritative lease removal.
	* @param registry - context registry committing focus targets.
	* @param historySize - positive bounded event count retained per Session.
	*/
	constructor(registry, historySize) {
		this.registry = registry;
		this.historySize = historySize;
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
	* Publish one focus request and await its matching browser ACK.
	* @param sessionId - Session owning the browser lease.
	* @param correlationId - Host-generated idempotency key.
	* @param reservation - registry focus reservation.
	* @param target - target the browser must apply.
	* @param timeoutMs - positive ACK deadline duration.
	* @param signal - caller/package cancellation.
	* @returns committed active context after ACK.
	*/
	requestFocus(sessionId, correlationId, reservation, target, timeoutMs, signal) {
		if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new LabelStudioContextError("invalid-request", "focus timeout must be positive"));
		const state = this.state(sessionId);
		if (state.pending !== void 0) return Promise.reject(new LabelStudioContextError("focus-conflict", "another focus request is pending"));
		signal.throwIfAborted();
		state.completed = void 0;
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
				correlationId,
				leaseId: reservation.lease.leaseId,
				generation: reservation.lease.generation,
				targetRevision: reservation.targetRevision,
				target: Object.freeze({ ...target }),
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
	acknowledgeFocus(leaseId, generation, correlationId, targetRevision, target) {
		const binding = this.registry.inspectLease(leaseId, generation);
		const state = this.states.get(binding.sessionId);
		if (state === void 0) throw new LabelStudioContextError("focus-not-found", "focus ACK does not match a pending request");
		const completed = state.completed;
		if (completed !== void 0 && completed.leaseId === leaseId && completed.generation === generation && completed.correlationId === correlationId && completed.targetRevision === targetRevision && targetsEqual(completed.target, target)) return completed.context;
		const pending = state.pending;
		if (pending === void 0 || pending.leaseId !== leaseId || pending.generation !== generation || pending.correlationId !== correlationId || pending.targetRevision !== targetRevision || !targetsEqual(pending.target, target)) throw new LabelStudioContextError("focus-not-found", "focus ACK does not match a pending request");
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
/** Default launcher retained by the repository's local development Bundle. */
const DEFAULT_LABEL_STUDIO_LAUNCH_MODE = "conda";
/** Default Conda environment requested by the local launcher. */
const DEFAULT_CONDA_ENVIRONMENT = "label-studio";
/** Default Label Studio console script resolved by the direct launcher. */
const DEFAULT_LABEL_STUDIO_EXECUTABLE = "label-studio";
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
const SUPPORTED_CONFIG_FIELDS = {
	baseUrl: true,
	launchMode: true,
	condaExecutable: true,
	condaEnvironment: true,
	labelStudioExecutable: true,
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
	contextCloseTimeoutMs: true
};
/** Schemastery projection used by Cordis loaders and configuration UIs. */
const Config = z.object({
	baseUrl: z.string().default(DEFAULT_LABEL_STUDIO_BASE_URL),
	launchMode: z.union([
		"conda",
		"executable",
		"external"
	]).default(DEFAULT_LABEL_STUDIO_LAUNCH_MODE),
	condaExecutable: z.string().default("conda"),
	condaEnvironment: z.string().default(DEFAULT_CONDA_ENVIRONMENT),
	labelStudioExecutable: z.string().default(DEFAULT_LABEL_STUDIO_EXECUTABLE),
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
	contextCloseTimeoutMs: z.number().min(1).default(DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS)
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
		throw new Error("label-studio: baseUrl must be a loopback HTTP(S) URL");
	}
	const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
	if (url.protocol !== "http:" && url.protocol !== "https:" || !loopback) throw new Error("label-studio: baseUrl must be a loopback HTTP(S) URL");
	if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new Error("label-studio: baseUrl must not contain credentials, a query, or a fragment");
	const condaExecutable = nonEmpty(config.condaExecutable ?? "conda", "condaExecutable");
	const condaEnvironment = nonEmpty(config.condaEnvironment ?? "label-studio", "condaEnvironment");
	const labelStudioExecutable = nonEmpty(config.labelStudioExecutable ?? "label-studio", "labelStudioExecutable");
	const launchMode = config.launchMode ?? "conda";
	const startupTimeoutMs = positive$1(config.startupTimeoutMs ?? 12e4, "startupTimeoutMs");
	const shutdownGraceMs = positive$1(config.shutdownGraceMs ?? 5e3, "shutdownGraceMs");
	const restResponseMaxBytes = positiveSafeInteger(config.restResponseMaxBytes ?? 8388608, "restResponseMaxBytes");
	const activeTaskMaxBytes = positiveSafeInteger(config.activeTaskMaxBytes ?? 262144, "activeTaskMaxBytes");
	const focusAckTimeoutMs = positiveSafeInteger(config.focusAckTimeoutMs ?? 5e3, "focusAckTimeoutMs");
	const contextLeaseTtlMs = positiveSafeInteger(config.contextLeaseTtlMs ?? 3e4, "contextLeaseTtlMs");
	const eventWaitTimeoutMs = positiveSafeInteger(config.eventWaitTimeoutMs ?? 25e3, "eventWaitTimeoutMs");
	const eventHistorySize = positiveSafeInteger(config.eventHistorySize ?? 64, "eventHistorySize");
	const contextOpenRetryMs = positiveSafeInteger(config.contextOpenRetryMs ?? 1e3, "contextOpenRetryMs");
	const contextCloseTimeoutMs = positiveSafeInteger(config.contextCloseTimeoutMs ?? 1e3, "contextCloseTimeoutMs");
	if (eventWaitTimeoutMs >= contextLeaseTtlMs) throw new Error("label-studio: eventWaitTimeoutMs must be less than contextLeaseTtlMs");
	return {
		baseUrl: url.href.replace(/\/$/, ""),
		launchMode,
		condaExecutable,
		condaEnvironment,
		labelStudioExecutable,
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
		eventHistorySize
	};
}
function nonEmpty(value, field) {
	if (value.trim() === "") throw new Error(`label-studio: ${field} must be non-empty`);
	return value;
}
function positive$1(value, field) {
	if (!Number.isFinite(value) || value <= 0) throw new Error(`label-studio: ${field} must be a positive finite number`);
	return value;
}
function positiveSafeInteger(value, field) {
	if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`label-studio: ${field} must be a positive safe integer`);
	return value;
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
	resources.disposeTools();
	await resources.disposeBrowser?.();
	await resources.operations.drain();
	await resources.disposeBroker();
	resources.disposeRegistry();
	await resources.disposeRuntime();
}
//#endregion
//#region lib/types/context-rpc.js
/** Loopback-only Connection RPC handlers for browser context synchronization. */
const ENDPOINTS = /* @__PURE__ */ new Set([
	"lease/open",
	"lease/close",
	"context/reserve",
	"context/publish",
	"events/wait",
	"focus/ack"
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
	"focus-not-found": "focus request is absent or does not match"
};
/**
* Register the Label Studio channel on Connection's loopback trust policy.
* @param ctx - Host context carrying Connection, Session, and persistence services.
* @param registry - synchronous lease and target state.
* @param broker - Session event history and focus acknowledgements.
* @param operations - shared package operation gate.
* @param options - bounded long-poll settings.
* @returns asynchronous disposer that closes the route before removing it.
*/
function registerLabelStudioContextRpc(ctx, registry, broker, operations, options) {
	let closing = false;
	const handler = async (rawEndpoint, payload, signal) => {
		if (closing) return outer(failure("invalid-request"));
		if (!ENDPOINTS.has(rawEndpoint)) return outer(failure("invalid-request"));
		try {
			return outer(success(await operations.run(signal, (operationSignal) => dispatch(rawEndpoint, payload, operationSignal, ctx, registry, broker, options))));
		} catch (error) {
			if (error instanceof LabelStudioContextError) return outer(failure(error.code, error.retryAfterMs));
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
async function dispatch(endpoint, payload, signal, ctx, registry, broker, options) {
	switch (endpoint) {
		case "lease/open": {
			const request = parseOpen(payload);
			const sessionId = SessionId(request.sessionId);
			await requirePersistentSession(ctx, sessionId, signal, registry, broker);
			const baseline = broker.latestRevision(sessionId);
			return registry.openLease(sessionId, labelStudioContextSourceId(request.sourceId), baseline);
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
			await requirePersistentSession(ctx, inspected.sessionId, signal, registry, broker);
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
			return broker.acknowledgeFocus(request.leaseId, request.generation, request.correlationId, request.targetRevision, request.target);
		}
	}
}
async function requirePersistentSession(ctx, sessionId, signal, registry, broker) {
	if (ctx.sessions.get(sessionId) !== void 0) return;
	if ((await ctx.sessionPersistence.list(signal)).some((header) => header.id === sessionId)) return;
	registry.deleteSession(sessionId);
	broker.deleteSession(sessionId);
	throw new SessionNotFoundError();
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
		if ((await this.status()).available || this.config.launchMode === "external") return;
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
			graceMs: this.config.shutdownGraceMs
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
			"--host",
			this.config.baseUrl
		];
		switch (this.config.launchMode) {
			case "conda": return [
				await this.subprocess.resolveExecutable(this.config.condaExecutable),
				"run",
				"-n",
				this.config.condaEnvironment,
				"label-studio",
				...tail
			];
			case "executable": return [await this.subprocess.resolveExecutable(this.config.labelStudioExecutable), ...tail];
			case "external": throw new Error("label-studio: external launch mode cannot create a process");
			default: return assertNever(this.config.launchMode);
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
function assertNever(value) {
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
		title: `Import ${Array.isArray(args.tasks) ? args.tasks.length : 0} tasks into Label Studio project ${args.project_id}`,
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
		title: `Create prediction for Label Studio task ${args.task_id}`,
		kind: "execute"
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
* @param policy - model-output byte limit and browser focus deadline owned by the Host configuration.
* @returns disposer unregistering every tool in reverse order.
*/
function registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, policy) {
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
		execute: (_args, exec) => operations.run(exec.signal, (signal) => runtime.status(signal)),
		presentCall: presentStatusCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_project",
		description: "Create a Label Studio project through the authenticated REST API. Supply Label Studio XML in label_config when the project must be immediately ready for annotation. Returns the project id and browser URL.",
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
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio project ${value.id} (${value.title}): ${value.webUrl}`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				await requireAvailable(runtime, signal);
				const project = await api.createProject({
					title: args.title,
					...args.label_config === void 0 ? {} : { labelConfig: args.label_config },
					...args.description === void 0 ? {} : { description: args.description }
				}, signal);
				return {
					...project,
					webUrl: `${runtime.config.baseUrl}/projects/${project.id}/data`
				};
			});
		},
		presentCall: presentCreateProjectCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_import_tasks",
		description: "Import JSON tasks into an existing Label Studio project. Each task must contain a data object whose keys match the project label configuration. Returns the accepted task ids when Label Studio supplies them.",
		parameters: {
			project_id: {
				type: "number",
				required: true,
				description: "Target Label Studio project id."
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
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Imported ${value.taskCount} tasks into Label Studio project ${value.projectId}.`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const tasks = parseTasks(args.tasks);
				await requireAvailable(runtime, signal);
				const imported = await api.importTasks(args.project_id, tasks, signal);
				return {
					projectId: args.project_id,
					...imported
				};
			});
		},
		presentCall: presentImportTasksCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_prediction",
		description: "Create a pre-annotation prediction for one existing Label Studio task. result must use the project labeling configuration names and Label Studio prediction result format. This never updates a saved annotation. Returns the prediction and task ids.",
		parameters: {
			task_id: {
				type: "number",
				required: true,
				description: "Existing Label Studio task id."
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
					modelVersion: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio prediction ${value.id} for task ${value.taskId}.`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				const result = parseArray(args.result, "result");
				await requireAvailable(runtime, signal);
				return api.createPrediction({
					taskId: args.task_id,
					result,
					...args.model_version === void 0 ? {} : { modelVersion: args.model_version },
					...args.score === void 0 ? {} : { score: args.score }
				}, signal);
			});
		},
		presentCall: presentCreatePredictionCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_create_active_prediction",
		description: "Create a pre-annotation prediction for the current Label Studio workbench task. Supply result explicitly using the project label configuration; do not infer it from saved annotations. The tool validates the task association, rejects a target changed before dispatch, and marks the active page for refresh after Label Studio confirms creation. It never updates a saved annotation.",
		parameters: {
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
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Created Label Studio prediction ${value.id} for active task ${value.taskId} in project ${value.projectId}.`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				if (exec.agent === void 0) throw new Error("label-studio: active prediction creation requires a DSH Session");
				const active = contexts.getLive(exec.agent.id);
				if (active === void 0) throw new Error("label-studio: this Session has no live active task");
				const result = parseArray(args.result, "result");
				const task = await api.getTask(active.target.taskId, signal);
				if (task.id !== active.target.taskId || task.projectId !== active.target.projectId) throw new Error("label-studio: active task project association does not match Label Studio");
				const current = contexts.getLive(exec.agent.id);
				if (current === void 0 || current.leaseId !== active.leaseId || current.generation !== active.generation || current.targetRevision !== active.targetRevision) throw new Error("label-studio: active task changed before prediction dispatch");
				const prediction = await api.createPrediction({
					taskId: active.target.taskId,
					result,
					...args.model_version === void 0 ? {} : { modelVersion: args.model_version },
					...args.score === void 0 ? {} : { score: args.score }
				}, signal);
				if (prediction.taskId !== active.target.taskId) throw new Error("label-studio: created prediction task does not match the active task");
				const event = changes.publishTaskChanged(exec.agent.id, active.target.taskId, "prediction-created");
				return {
					id: prediction.id,
					projectId: active.target.projectId,
					taskId: prediction.taskId,
					...prediction.modelVersion === void 0 ? {} : { modelVersion: prediction.modelVersion },
					eventRevision: event.eventRevision
				};
			});
		},
		presentCall: presentCreateActivePredictionCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_focus_task",
		description: "Navigate the Label Studio workbench for this DSH Session to a project task and optional saved annotation. Returns only after the browser applies the task URL; the embedded page may still be loading.",
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
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Label Studio workbench applied the URL for task ${value.taskId} in project ${value.projectId}; page loading was not checked.`
			}]
		},
		async execute(args, exec) {
			return operations.run(exec.signal, async (signal) => {
				if (exec.agent === void 0) throw new Error("label-studio: task focus requires a DSH Session");
				const binding = contexts.getLease(exec.agent.id);
				if (binding === void 0) throw new Error("label-studio: this Session has no live Label Studio browser lease");
				const target = {
					projectId: labelStudioProjectId(args.project_id),
					taskId: labelStudioTaskId(args.task_id),
					...args.annotation_id === void 0 ? {} : { annotationId: labelStudioAnnotationId(args.annotation_id) }
				};
				const correlationId = labelStudioFocusCorrelationId(randomUUID());
				const reservation = contexts.reserveFocusTarget(binding.lease.leaseId, binding.lease.generation, correlationId);
				const committed = await changes.requestFocus(exec.agent.id, correlationId, reservation, target, policy.focusAckTimeoutMs, signal);
				return {
					projectId: committed.target.projectId,
					taskId: committed.target.taskId,
					...committed.target.annotationId === void 0 ? {} : { annotationId: committed.target.annotationId },
					targetRevision: committed.targetRevision
				};
			});
		},
		presentCall: presentFocusTaskCall
	})));
	disposers.push(ctx.tools.register(defineTool({
		name: "label_studio_get_active_task",
		description: "Read the project labeling configuration, task data, saved annotations, and predictions for the current DSH Session active in the Label Studio workbench. Takes no task id because the live browser lease owns it.",
		parameters: {},
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
					}
				}
			},
			render: (_args, value) => activeTaskBlocks(value, policy.activeTaskMaxBytes),
			presentationMeta: (_args, value) => presentActiveTaskMeta(value)
		},
		async execute(_args, exec) {
			return operations.run(exec.signal, async (signal) => {
				if (exec.agent === void 0) throw new Error("label-studio: active-task reads require a DSH Session");
				const active = contexts.getLive(exec.agent.id);
				if (active === void 0) throw new Error("label-studio: this Session has no live active task");
				const project = await api.getProject(active.target.projectId, signal);
				const task = await api.getTask(active.target.taskId, signal);
				return validateSelectedTask(active.target, project, task);
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
//#endregion
//#region lib/types/index.js
/**
* Label Studio plugin: managed local process, authenticated REST tools, and
* browser workbench boot configuration.
* @module dsh-label-studio-workbench
*/
/** Cordis plugin name. */
const name = "label-studio";
/** Required Host services for process ownership, REST authentication, and tools. */
const inject = [
	"tools",
	"subprocess",
	"credentials"
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
	const runtime = new LabelStudioRuntime(ctx.subprocess, resolved);
	await runtime.start();
	const api = new LabelStudioApi(resolved.baseUrl, resolved.refreshTokenCredential, ctx.credentials, resolved.restResponseMaxBytes);
	const contexts = new LabelStudioContextRegistry(resolved.contextLeaseTtlMs);
	const changes = new LabelStudioChangeBroker(contexts, resolved.eventHistorySize);
	const disposeTools = registerLabelStudioTools(ctx, runtime, api, contexts, changes, operations, {
		activeTaskMaxBytes: resolved.activeTaskMaxBytes,
		focusAckTimeoutMs: resolved.focusAckTimeoutMs
	});
	let activeBrowserDisposer;
	ctx.inject([
		"connection",
		"sessions",
		"sessionPersistence",
		"webServer"
	], (browserCtx) => {
		browserCtx.effect(() => {
			const removeBootConfig = browserCtx.webServer.tapIndex((html) => injectLabelStudioBootConfig(html, {
				baseUrl: resolved.baseUrl,
				contextOpenRetryMs: resolved.contextOpenRetryMs,
				contextCloseTimeoutMs: resolved.contextCloseTimeoutMs,
				eventHistorySize: resolved.eventHistorySize
			}));
			const removeRpc = registerLabelStudioContextRpc(browserCtx, contexts, changes, operations, { eventWaitTimeoutMs: resolved.eventWaitTimeoutMs });
			let disposed = false;
			const disposeBrowser = async () => {
				if (disposed) return;
				disposed = true;
				await removeRpc();
				removeBootConfig();
				if (activeBrowserDisposer === disposeBrowser) activeBrowserDisposer = void 0;
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
			disposeBroker: () => changes.dispose(),
			disposeRegistry: () => {
				contexts.dispose();
			},
			disposeRuntime: () => runtime.dispose()
		});
	}, "label-studio: ordered package shutdown");
}
//#endregion
export { Config, DEFAULT_ACTIVE_TASK_MAX_BYTES, DEFAULT_CONDA_ENVIRONMENT, DEFAULT_CONTEXT_CLOSE_TIMEOUT_MS, DEFAULT_CONTEXT_LEASE_TTL_MS, DEFAULT_CONTEXT_OPEN_RETRY_MS, DEFAULT_EVENT_HISTORY_SIZE, DEFAULT_EVENT_WAIT_TIMEOUT_MS, DEFAULT_FOCUS_ACK_TIMEOUT_MS, DEFAULT_LABEL_STUDIO_BASE_URL, DEFAULT_LABEL_STUDIO_EXECUTABLE, DEFAULT_LABEL_STUDIO_LAUNCH_MODE, DEFAULT_REFRESH_TOKEN_CREDENTIAL, DEFAULT_REST_RESPONSE_MAX_BYTES, DEFAULT_SHUTDOWN_GRACE_MS, DEFAULT_STARTUP_TIMEOUT_MS, LabelStudioApi, LabelStudioChangeBroker, LabelStudioContextError, LabelStudioContextRegistry, LabelStudioOperationClosedError, LabelStudioOperationGate, LabelStudioRuntime, apply, disposeLabelStudioResources, inject, injectLabelStudioBootConfig, labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioContextSourceId, labelStudioFocusCorrelationId, labelStudioNavigationSequence, labelStudioPredictionId, labelStudioProjectId, labelStudioTaskId, name, registerLabelStudioContextRpc, registerLabelStudioTools, resolveConfig, validateSelectedTask };
