window.__ModuleLoader__.load({
	id: "dsh-label-studio-workbench",
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		//#region src/client/LabelStudioAction.tsx
		/** Render the Session-header workbench toggle. */
		function LabelStudioAction({ useLabelStudioPanel, toggle, t }) {
			const open = useLabelStudioPanel((snapshot) => snapshot.open);
			const label = t(open ? "action.close" : "action.open");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": label,
				"aria-pressed": open,
				title: label,
				onClick: toggle,
				children: "Label Studio"
			});
		}
		//#endregion
		//#region src/client/page-url.ts
		function positiveId(value, field) {
			if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`label-studio client: ${field} must be a positive integer`);
			const parsed = Number(value);
			if (!Number.isSafeInteger(parsed)) throw new Error(`label-studio client: ${field} must be a positive safe integer`);
			return parsed;
		}
		function assertId(value, field) {
			if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`label-studio client: ${field} must be a positive safe integer`);
		}
		function baseOrigin(baseUrl) {
			const base = new URL(baseUrl);
			if (!(base.hostname === "127.0.0.1" || base.hostname === "localhost" || base.hostname === "[::1]") || !["http:", "https:"].includes(base.protocol)) throw new Error("label-studio client: baseUrl must be a loopback HTTP(S) origin");
			if (base.username !== "" || base.password !== "" || base.pathname !== "/" || base.search !== "" || base.hash !== "") throw new Error("label-studio client: baseUrl must contain only a loopback origin");
			return base;
		}
		/**
		* Parse task controls into a structured task page.
		* @param input - untrusted browser input strings.
		* @returns validated task page.
		*/
		function parseLabelStudioTargetInput(input) {
			const projectId = positiveId(input.projectId, "projectId");
			const taskId = positiveId(input.taskId, "taskId");
			const annotation = input.annotationId?.trim();
			return {
				view: "task",
				projectId,
				taskId,
				...annotation === void 0 || annotation === "" ? {} : { annotationId: positiveId(annotation, "annotationId") }
			};
		}
		/**
		* Build one same-origin Label Studio page URL from validated structured ids.
		* @param baseUrl - Host-validated Label Studio origin.
		* @param page - controlled projects, project, or task page.
		* @returns absolute same-origin URL.
		*/
		function buildLabelStudioPageUrl(baseUrl, page) {
			const base = baseOrigin(baseUrl);
			if (page.view === "projects") return base.href;
			assertId(page.projectId, "projectId");
			const url = new URL(`/projects/${String(page.projectId)}/data`, base.origin);
			if (page.view === "project") return url.href;
			assertId(page.taskId, "taskId");
			url.searchParams.set("task", String(page.taskId));
			if (page.annotationId !== void 0) {
				assertId(page.annotationId, "annotationId");
				url.searchParams.set("annotation", String(page.annotationId));
			}
			return url.href;
		}
		/**
		* Convert a task page to the active-target fields used by the Host lease registry.
		* @param page - validated task page.
		* @returns active target without its page discriminant.
		*/
		function targetOfPage(page) {
			return {
				projectId: page.projectId,
				taskId: page.taskId,
				...page.annotationId === void 0 ? {} : { annotationId: page.annotationId }
			};
		}
		//#endregion
		//#region src/client/panel-state.ts
		/** Owns one browser page's workbench visibility and iframe identity. */
		var LabelStudioPanelController = class {
			frameBaseUrl;
			externalBaseUrl;
			/** Observable browser-local panel state. */
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				open: false,
				mounted: false,
				reloadRevision: 0,
				navigationRevision: 0
			});
			pending = /* @__PURE__ */ new Map();
			frameWindow;
			/**
			* @param frameBaseUrl - isolated proxy endpoint used by the iframe.
			* @param externalBaseUrl - direct Label Studio endpoint used outside DSH.
			*/
			constructor(frameBaseUrl, externalBaseUrl = frameBaseUrl) {
				this.frameBaseUrl = frameBaseUrl;
				this.externalBaseUrl = externalBaseUrl;
			}
			/**
			* Set workbench visibility while retaining any mounted iframe.
			* @param open - requested visibility; opening permanently latches mounted.
			*/
			setOpen(open) {
				const current = this.store.getSnapshot();
				const mounted = current.mounted || open;
				if (current.open === open && current.mounted === mounted) return;
				this.store.set({
					...current,
					open,
					mounted
				});
			}
			/** Hide the workbench without unmounting a previously created iframe. */
			close() {
				this.setOpen(false);
			}
			/** Replace the iframe element while retaining visibility state. */
			reload() {
				const current = this.store.getSnapshot();
				this.store.set({
					...current,
					reloadRevision: current.reloadRevision + 1
				});
			}
			/**
			* Mount if needed, stage a controlled page URL, and wait for the matching iframe src.
			* @param page - structured Label Studio page.
			* @returns promise resolved by {@link confirmApplied}.
			*/
			applyPage(page) {
				this.rejectPending("label-studio panel: navigation superseded");
				const current = this.store.getSnapshot();
				const navigationRevision = current.navigationRevision + 1;
				this.store.set({
					...current,
					mounted: true,
					navigationRevision,
					targetUrl: buildLabelStudioPageUrl(this.frameBaseUrl, page)
				});
				return new Promise((resolve, reject) => {
					this.pending.set(navigationRevision, {
						resolve,
						reject
					});
				});
			}
			/**
			* Confirm that React committed one staged URL to the iframe node.
			* @param navigationRevision - revision observed by the panel layout effect.
			*/
			confirmApplied(navigationRevision) {
				const pending = this.pending.get(navigationRevision);
				if (pending === void 0) return;
				this.pending.delete(navigationRevision);
				pending.resolve();
			}
			/** Clear the controlled URL and reject every uncommitted navigation. */
			clearPage() {
				this.rejectPending("label-studio panel: navigation cleared");
				const current = this.store.getSnapshot();
				this.store.set({
					open: current.open,
					mounted: current.mounted,
					reloadRevision: current.reloadRevision,
					navigationRevision: current.navigationRevision + 1
				});
			}
			/** Reload only a currently controlled page. */
			reloadPage() {
				if (this.store.getSnapshot().targetUrl !== void 0) this.reload();
			}
			/** Record the currently mounted iframe window for one-shot inspection. */
			attachFrame(frame) {
				this.frameWindow = frame?.contentWindow ?? void 0;
			}
			/** Return the currently mounted iframe window without querying the DOM. */
			currentFrameWindow() {
				return this.frameWindow;
			}
			/** Open the controlled target, or the neutral endpoint, outside the dock. */
			openExternal() {
				const targetUrl = this.store.getSnapshot().targetUrl;
				const url = targetUrl === void 0 ? this.externalBaseUrl : (() => {
					const target = new URL(targetUrl);
					return new URL(`${target.pathname}${target.search}${target.hash}`, `${this.externalBaseUrl}/`).href;
				})();
				window.open(url, "_blank", "noopener,noreferrer");
			}
			/** Reject outstanding DOM confirmations during plugin teardown. */
			dispose() {
				this.frameWindow = void 0;
				this.rejectPending("label-studio panel: disposed");
			}
			rejectPending(message) {
				for (const pending of this.pending.values()) pending.reject(new Error(message));
				this.pending.clear();
			}
		};
		//#endregion
		//#region src/client/context-bridge.ts
		/** Deterministic failure returned by the Connection framework. */
		var LabelStudioFrameworkFailure = class extends Error {
			error;
			/** Stable failure category. */
			kind = "framework";
			/** @param error - sanitized Connection failure. */
			constructor(error) {
				super(error.message);
				this.error = error;
			}
		};
		/** Deterministic failure returned by the Label Studio plugin. */
		var LabelStudioPluginFailure = class extends Error {
			error;
			/** Stable failure category. */
			kind = "plugin";
			/** @param error - sanitized plugin failure. */
			constructor(error) {
				super(error.message);
				this.error = error;
			}
		};
		/** Dispatched request whose commit outcome cannot be inferred. */
		var LabelStudioTransportUnknown = class extends Error {
			cause;
			/** Stable failure category. */
			kind = "transport-unknown";
			/** @param cause - transport or response-validation failure. */
			constructor(cause) {
				super("Label Studio RPC outcome is unknown", { cause });
				this.cause = cause;
			}
		};
		/** Request cancelled before dispatch, or a cancelled read-only wait. */
		var LabelStudioCancellationFailure = class extends Error {
			/** Stable failure category. */
			kind = "cancelled";
			constructor() {
				super("Label Studio RPC was cancelled");
			}
		};
		/**
		* Identify failures classified by the browser RPC bridge.
		* @param error - caught value.
		* @returns whether it is a classified bridge failure.
		*/
		function isLabelStudioBridgeFailure(error) {
			return isRecord(error) && [
				"framework",
				"plugin",
				"transport-unknown",
				"cancelled"
			].includes(String(error.kind));
		}
		/**
		* Identify a dispatched request whose commit outcome is unknown.
		* @param error - caught value.
		* @returns whether the dispatched outcome is unknown.
		*/
		function isLabelStudioTransportUnknown(error) {
			return isRecord(error) && error.kind === "transport-unknown";
		}
		/**
		* Identify a deterministic rejection from the Label Studio Host plugin.
		* @param error - caught value.
		* @returns whether the plugin rejected the request.
		*/
		function isLabelStudioPluginFailure(error) {
			return isRecord(error) && error.kind === "plugin";
		}
		/** Calls and validates the plugin's eight fixed RPC endpoints. */
		var LabelStudioContextBridge = class {
			connection;
			channel;
			/** @param options - Connection source and fixed plugin channel. */
			constructor(options) {
				this.connection = options.connection;
				this.channel = options.channel;
			}
			/**
			* Read the current connected Host generation.
			* @returns connected Host generation, or absence during disconnection.
			*/
			currentHost() {
				return this.connection.generation.getSnapshot();
			}
			/**
			* Subscribe to Host generation replacement and loss.
			* @param listener - generation-change callback.
			* @returns listener disposer.
			*/
			onHostChanged(listener) {
				return this.connection.generation.subscribe(listener);
			}
			/**
			* Open the selected Session for this browser page.
			* @param sessionId - selected DSH Session.
			* @param sourceId - browser page id.
			* @param signal - cancellation.
			* @returns opened lease and event replay baseline.
			*/
			openLease(sessionId, sourceId, signal) {
				return this.mutate("lease/open", {
					sessionId,
					sourceId
				}, parseOpen, signal);
			}
			/**
			* Close an active browser lease without assuming the outcome after dispatch failure.
			* @param lease - active lease.
			* @param signal - cancellation.
			* @returns whether the Host closed that lease.
			*/
			closeLease(lease, signal) {
				return this.mutate("lease/close", leaseFields(lease), (value) => recordBoolean(value, "closed"), signal);
			}
			/**
			* Reserve the next controlled target revision.
			* @param lease - active lease.
			* @param navigationSequence - monotonic page sequence.
			* @param expectedTargetRevision - CAS revision.
			* @param signal - cancellation.
			* @returns Host reservation.
			*/
			reserveTarget(lease, navigationSequence, expectedTargetRevision, signal) {
				return this.mutate("context/reserve", {
					...leaseFields(lease),
					navigationSequence,
					expectedTargetRevision
				}, parseReservation, signal);
			}
			/**
			* Publish a target after its URL has committed in the browser.
			* @param lease - active lease.
			* @param targetRevision - reserved revision.
			* @param target - controlled target.
			* @param signal - cancellation.
			* @returns committed context.
			*/
			publishTarget(lease, targetRevision, target, signal) {
				return this.mutate("context/publish", {
					...leaseFields(lease),
					targetRevision,
					target: targetWire(target)
				}, parseActiveContext, signal);
			}
			/**
			* Persist the selected page after browser target synchronization completes.
			* @param lease - active lease.
			* @param navigationSequence - browser-monotonic navigation sequence.
			* @param expectedSessionContextRevision - durable page revision observed by the browser.
			* @param page - structured Label Studio page to commit.
			* @param signal - cancellation.
			* @returns committed durable Session context.
			*/
			commitPage(lease, navigationSequence, expectedSessionContextRevision, page, signal) {
				return this.mutate("page/commit", {
					...leaseFields(lease),
					navigationSequence,
					expectedSessionContextRevision,
					page: pageWire(page)
				}, parseSessionContext, signal);
			}
			/**
			* Wait for events after the observed revision.
			* @param lease - active lease.
			* @param afterRevision - observed event cursor.
			* @param signal - required wait cancellation.
			* @returns next event batch.
			*/
			waitEvents(lease, afterRevision, signal) {
				return this.call("events/wait", {
					...leaseFields(lease),
					afterRevision
				}, (value) => {
					const batch = parseEventBatch(value);
					if (batch.latestRevision < afterRevision || batch.events.some((event) => event.eventRevision > batch.latestRevision)) throw new Error("invalid event revision range");
					return batch;
				}, signal, false);
			}
			/**
			* Confirm a Host focus request after its URL has committed in the browser.
			* @param lease - active lease.
			* @param correlationId - focus receipt.
			* @param targetRevision - focus reservation revision.
			* @param target - applied target.
			* @param signal - cancellation.
			* @returns committed context.
			*/
			acknowledgeFocus(lease, correlationId, targetRevision, target, signal) {
				return this.mutate("focus/ack", {
					...leaseFields(lease),
					correlationId,
					targetRevision,
					target: targetWire(target)
				}, parseActiveContext, signal);
			}
			/**
			* Submit one exact current-page inspection outcome.
			* @param lease - active browser lease.
			* @param inspectionId - Host-issued inspection identity.
			* @param outcome - validated structured iframe result.
			* @param signal - Session/Connection generation cancellation.
			* @returns idempotent Host acceptance receipt.
			*/
			commitInspection(lease, inspectionId, outcome, signal) {
				return this.mutate("inspection/commit", {
					...leaseFields(lease),
					inspectionId,
					outcome
				}, (value) => {
					if (record$1(value, "inspection receipt").accepted !== true) throw new Error("invalid inspection receipt");
					return { accepted: true };
				}, signal);
			}
			mutate(endpoint, payload, parse, signal) {
				return this.call(endpoint, payload, parse, signal, true);
			}
			async call(endpoint, payload, parse, signal, commitUnknown) {
				if (signal?.aborted === true) throw new LabelStudioCancellationFailure();
				let result;
				try {
					result = await this.connection.rpc.call(this.channel, endpoint, payload, signal);
				} catch (cause) {
					if (!commitUnknown && isAborted(signal)) throw new LabelStudioCancellationFailure();
					throw new LabelStudioTransportUnknown(cause);
				}
				if (!isRecord(result) || typeof result.ok !== "boolean") throw new LabelStudioTransportUnknown(/* @__PURE__ */ new Error("invalid Connection RPC result"));
				if (!result.ok) throw new LabelStudioFrameworkFailure(result.error);
				const outcome = result.value;
				if (!isRecord(outcome) || typeof outcome.ok !== "boolean") throw new LabelStudioTransportUnknown(/* @__PURE__ */ new Error("invalid Label Studio RPC outcome"));
				if (!outcome.ok) {
					if (!isPluginError(outcome.error)) throw new LabelStudioTransportUnknown(/* @__PURE__ */ new Error("invalid Label Studio RPC error"));
					throw new LabelStudioPluginFailure(outcome.error);
				}
				try {
					return parse(outcome.value);
				} catch (cause) {
					throw new LabelStudioTransportUnknown(cause);
				}
			}
		};
		function leaseFields(lease) {
			return {
				leaseId: lease.leaseId,
				generation: lease.generation
			};
		}
		function targetWire(target) {
			return {
				projectId: target.projectId,
				taskId: target.taskId,
				...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
			};
		}
		function pageWire(page) {
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
		function isAborted(signal) {
			return signal?.aborted === true;
		}
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function integer(value, field) {
			if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`invalid ${field}`);
			return Number(value);
		}
		function positive$1(value, field) {
			const result = integer(value, field);
			if (result === 0) throw new Error(`invalid ${field}`);
			return result;
		}
		function string(value, field) {
			if (typeof value !== "string" || value === "") throw new Error(`invalid ${field}`);
			return value;
		}
		function record$1(value, field) {
			if (!isRecord(value)) throw new Error(`invalid ${field}`);
			return value;
		}
		function recordBoolean(value, field) {
			const object = record$1(value, "result");
			if (typeof object[field] !== "boolean") throw new Error(`invalid ${field}`);
			return object[field];
		}
		function parseLease(value) {
			const object = record$1(value, "lease");
			return {
				leaseId: string(object.leaseId, "leaseId"),
				generation: integer(object.generation, "generation"),
				expiresAt: positive$1(object.expiresAt, "expiresAt")
			};
		}
		function parseOpen(value) {
			const object = record$1(value, "open result");
			return {
				lease: parseLease(object.lease),
				replayBaseline: integer(object.replayBaseline, "replayBaseline"),
				sessionContext: parseSessionContext(object.sessionContext)
			};
		}
		function parsePage$1(value) {
			const object = record$1(value, "page");
			if (object.view === "projects") return { view: "projects" };
			if (object.view === "project") return {
				view: "project",
				projectId: positive$1(object.projectId, "projectId")
			};
			if (object.view === "task") return {
				view: "task",
				projectId: positive$1(object.projectId, "projectId"),
				taskId: positive$1(object.taskId, "taskId"),
				...object.annotationId === void 0 ? {} : { annotationId: positive$1(object.annotationId, "annotationId") }
			};
			throw new Error("invalid page view");
		}
		function parseSessionContext(value) {
			const object = record$1(value, "session context");
			return {
				page: parsePage$1(object.page),
				recentProjects: parseRecentProjects(object.recentProjects),
				revision: integer(object.revision, "revision"),
				binding: parseBinding(object.binding)
			};
		}
		function parseRecentProjects(value) {
			if (!Array.isArray(value)) throw new Error("invalid recentProjects");
			return value.map((entry) => {
				const recent = record$1(entry, "recent project");
				if (recent.availability !== "available" && recent.availability !== "deleted") throw new Error("invalid project availability");
				return {
					projectId: positive$1(recent.projectId, "projectId"),
					...recent.lastTaskId === void 0 ? {} : { lastTaskId: positive$1(recent.lastTaskId, "lastTaskId") },
					lastVisitedAt: integer(recent.lastVisitedAt, "lastVisitedAt"),
					availability: recent.availability
				};
			});
		}
		function parseBinding(value) {
			const object = record$1(value, "binding");
			const recentProjects = parseRecentProjects(object.recentProjects);
			const revision = integer(object.revision, "binding revision");
			if (object.target === void 0) {
				if (object.source !== void 0 || object.boundAt !== void 0) throw new Error("invalid empty binding");
				return {
					recentProjects,
					revision
				};
			}
			if (object.source !== "tool-result" && object.source !== "webhook" && object.source !== "current-page") throw new Error("invalid binding source");
			const target = record$1(object.target, "binding target");
			const projectId = positive$1(target.projectId, "projectId");
			if (target.kind === "project") return {
				target: {
					kind: "project",
					projectId
				},
				source: object.source,
				boundAt: integer(object.boundAt, "boundAt"),
				recentProjects,
				revision
			};
			if (target.kind !== "task") throw new Error("invalid binding target kind");
			return {
				target: {
					kind: "task",
					projectId,
					taskId: positive$1(target.taskId, "taskId"),
					...target.annotationId === void 0 ? {} : { annotationId: positive$1(target.annotationId, "annotationId") }
				},
				source: object.source,
				boundAt: integer(object.boundAt, "boundAt"),
				recentProjects,
				revision
			};
		}
		function parseTarget(value) {
			const object = record$1(value, "target");
			return {
				projectId: positive$1(object.projectId, "projectId"),
				taskId: positive$1(object.taskId, "taskId"),
				...object.annotationId === void 0 ? {} : { annotationId: positive$1(object.annotationId, "annotationId") }
			};
		}
		function parseReservation(value) {
			const object = record$1(value, "reservation");
			return {
				lease: parseLease(object.lease),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				...object.navigationSequence === void 0 ? {} : { navigationSequence: integer(object.navigationSequence, "navigationSequence") }
			};
		}
		function parseActiveContext(value) {
			const object = record$1(value, "active context");
			return {
				sessionId: string(object.sessionId, "sessionId"),
				sourceId: string(object.sourceId, "sourceId"),
				leaseId: string(object.leaseId, "leaseId"),
				generation: integer(object.generation, "generation"),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				expiresAt: positive$1(object.expiresAt, "expiresAt"),
				target: parseTarget(object.target)
			};
		}
		function parseTargetState(value) {
			const object = record$1(value, "target state");
			const targetRevision = integer(object.targetRevision, "targetRevision");
			if (object.phase === "vacant") return {
				phase: "vacant",
				targetRevision
			};
			if (object.phase === "committed") return {
				phase: "committed",
				targetRevision,
				target: parseTarget(object.target)
			};
			if (object.phase !== "reserved") throw new Error("invalid target phase");
			const reservation = record$1(object.reservation, "reservation identity");
			if (reservation.kind === "browser") return {
				phase: "reserved",
				targetRevision,
				reservation: {
					kind: "browser",
					navigationSequence: integer(reservation.navigationSequence, "navigationSequence")
				}
			};
			if (reservation.kind === "focus") return {
				phase: "reserved",
				targetRevision,
				reservation: {
					kind: "focus",
					correlationId: string(reservation.correlationId, "correlationId")
				}
			};
			throw new Error("invalid reservation kind");
		}
		function parseEvent(value) {
			const object = record$1(value, "event");
			const eventRevision = positive$1(object.eventRevision, "eventRevision");
			if (object.kind === "task-changed") {
				if (object.reason !== "prediction-created") throw new Error("invalid change reason");
				return {
					kind: "task-changed",
					eventRevision,
					taskId: positive$1(object.taskId, "taskId"),
					reason: object.reason
				};
			}
			if (object.kind === "inspect-current-page") return {
				kind: "inspect-current-page",
				eventRevision,
				inspectionId: string(object.inspectionId, "inspectionId"),
				deadlineAt: positive$1(object.deadlineAt, "deadlineAt")
			};
			if (object.kind === "webhook-unassigned") {
				if (object.reason !== "no-matching-binding") throw new Error("invalid Webhook unassigned reason");
				return {
					kind: "webhook-unassigned",
					eventRevision,
					reason: object.reason
				};
			}
			if (object.kind === "webhook-status") {
				if (object.status !== "ready" && object.status !== "unavailable") throw new Error("invalid Webhook status");
				return {
					kind: "webhook-status",
					eventRevision,
					status: object.status
				};
			}
			if (object.kind === "binding-changed") return {
				kind: "binding-changed",
				eventRevision,
				binding: parseBinding(object.binding)
			};
			if (object.kind !== "focus-task" || typeof object.committed !== "boolean") throw new Error("invalid event kind");
			return {
				kind: "focus-task",
				eventRevision,
				correlationId: string(object.correlationId, "correlationId"),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				target: parseTarget(object.target),
				expectedSessionContextRevision: integer(object.expectedSessionContextRevision, "expectedSessionContextRevision"),
				deadlineAt: positive$1(object.deadlineAt, "deadlineAt"),
				committed: object.committed
			};
		}
		function parseEventBatch(value) {
			const object = record$1(value, "event batch");
			if (!Array.isArray(object.events) || typeof object.resetRequired !== "boolean") throw new Error("invalid event batch");
			return {
				lease: parseLease(object.lease),
				context: parseTargetState(object.context),
				events: object.events.map(parseEvent),
				latestRevision: integer(object.latestRevision, "latestRevision"),
				resetRequired: object.resetRequired
			};
		}
		function isPluginError(value) {
			if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string" || !isRecord(value.details)) return false;
			if (![
				"invalid-request",
				"session-not-found",
				"lease-conflict",
				"lease-expired",
				"stale-generation",
				"stale-revision",
				"future-revision",
				"focus-conflict",
				"focus-not-found",
				"session-context-conflict",
				"session-context-unavailable",
				"binding-missing",
				"binding-conflict",
				"binding-target-mismatch",
				"current-page-unavailable",
				"current-page-timeout",
				"current-page-unsupported",
				"webhook-unavailable",
				"webhook-unassigned"
			].includes(value.code)) return false;
			return value.code !== "lease-conflict" || Number.isSafeInteger(value.details.retryAfterMs) && Number(value.details.retryAfterMs) > 0;
		}
		//#endregion
		//#region src/client/current-page-bridge.ts
		/** Validates iframe responses and submits exactly one matching Host receipt. */
		var LabelStudioCurrentPageBridge = class {
			rpc;
			frame;
			frameOrigin;
			protocol;
			capability;
			clock;
			pending;
			disposed = false;
			/**
			* @param rpc - typed Connection RPC caller.
			* @param frame - current iframe window supplier.
			* @param frameOrigin - exact isolated proxy origin.
			* @param protocol - fixed parent/iframe protocol.
			* @param capability - ephemeral proxy capability.
			* @param clock - epoch-millisecond clock for deterministic deadlines.
			*/
			constructor(rpc, frame, frameOrigin, protocol, capability, clock = Date.now) {
				this.rpc = rpc;
				this.frame = frame;
				this.frameOrigin = frameOrigin;
				this.protocol = protocol;
				this.capability = capability;
				this.clock = clock;
			}
			/**
			* Inspect the current iframe once and forward its exact structured outcome.
			* @param event - Host request from the Session event stream.
			* @param lease - current browser lease.
			* @param signal - current Session/Connection generation cancellation.
			* @returns final inspection status after the Host accepts the response.
			*/
			async inspect(event, lease, signal) {
				if (this.disposed) throw new Error("label-studio client: current-page bridge disposed");
				signal.throwIfAborted();
				if (this.clock() >= event.deadlineAt) throw new Error("label-studio client: inspection expired");
				if (this.pending !== void 0) throw new Error("label-studio client: inspection already active");
				const frame = this.frame();
				if (frame === void 0) {
					await this.rpc.commitInspection(lease, event.inspectionId, { kind: "unavailable" }, signal);
					return "unavailable";
				}
				return new Promise((resolve, reject) => {
					const abort = new AbortController();
					const onAbort = () => {
						this.rejectPending(signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("label-studio client: inspection cancelled"));
					};
					const remaining = Math.max(1, event.deadlineAt - this.clock());
					const timer = setTimeout(() => {
						this.rejectPending(/* @__PURE__ */ new Error("label-studio client: inspection expired"));
					}, remaining);
					const cleanup = () => {
						clearTimeout(timer);
						signal.removeEventListener("abort", onAbort);
						window.removeEventListener("message", this.onMessage);
					};
					this.pending = {
						event,
						lease,
						frame,
						abort,
						signal,
						cleanup,
						resolve,
						reject
					};
					signal.addEventListener("abort", onAbort, { once: true });
					window.addEventListener("message", this.onMessage);
					try {
						frame.postMessage({
							protocol: this.protocol,
							capability: this.capability,
							kind: "inspect-current-page",
							inspectionId: event.inspectionId
						}, this.frameOrigin);
					} catch {
						const pending = this.takePending();
						if (pending === void 0) return;
						this.rpc.commitInspection(lease, event.inspectionId, { kind: "unavailable" }, signal).then(() => {
							pending.resolve("unavailable");
						}, pending.reject);
					}
				});
			}
			/** Cancel the current Session or Connection generation. */
			cancel() {
				this.rejectPending(/* @__PURE__ */ new Error("label-studio client: inspection cancelled"));
			}
			/** Remove listeners and permanently reject later work. */
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.rejectPending(/* @__PURE__ */ new Error("label-studio client: current-page bridge disposed"));
			}
			onMessage = (event) => {
				const pending = this.pending;
				if (pending === void 0 || event.source !== pending.frame || event.origin !== this.frameOrigin) return;
				const outcome = parseResponse(event.data, this.protocol, String(pending.event.inspectionId));
				if (outcome === void 0) return;
				const accepted = this.takePending();
				if (accepted === void 0) return;
				this.rpc.commitInspection(accepted.lease, accepted.event.inspectionId, outcome, AbortSignal.any([accepted.signal, accepted.abort.signal])).then(() => {
					accepted.resolve(inspectionStatus(outcome));
				}, accepted.reject);
			};
			rejectPending(reason) {
				const pending = this.takePending();
				if (pending !== void 0) {
					pending.abort.abort(reason);
					pending.reject(reason);
				}
			}
			takePending() {
				const pending = this.pending;
				if (pending === void 0) return void 0;
				this.pending = void 0;
				pending.cleanup();
				return pending;
			}
		};
		function inspectionStatus(outcome) {
			return outcome.kind === "page" ? "ready" : outcome.kind;
		}
		function parseResponse(value, protocol, inspectionId) {
			if (!record(value) || value.protocol !== protocol || value.kind !== "current-page" || value.inspectionId !== inspectionId || !record(value.outcome)) return void 0;
			if (value.outcome.kind === "unsupported") return { kind: "unsupported" };
			if (value.outcome.kind === "unavailable") return { kind: "unavailable" };
			if (value.outcome.kind !== "page") return void 0;
			const page = parsePage(value.outcome.page);
			return page === void 0 ? void 0 : {
				kind: "page",
				page
			};
		}
		function parsePage(value) {
			if (!record(value)) return void 0;
			if (value.view === "projects" && exactKeys(value, ["view"])) return { view: "projects" };
			if (value.view === "project" && exactKeys(value, ["view", "projectId"]) && positive(value.projectId)) return {
				view: "project",
				projectId: value.projectId
			};
			if (value.view !== "task" || !exactKeys(value, value.annotationId === void 0 ? [
				"view",
				"projectId",
				"taskId"
			] : [
				"view",
				"projectId",
				"taskId",
				"annotationId"
			]) || !positive(value.projectId) || !positive(value.taskId) || value.annotationId !== void 0 && !positive(value.annotationId)) return void 0;
			return {
				view: "task",
				projectId: value.projectId,
				taskId: value.taskId,
				...value.annotationId === void 0 ? {} : { annotationId: value.annotationId }
			};
		}
		function record(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function positive(value) {
			return Number.isSafeInteger(value) && Number(value) > 0;
		}
		function exactKeys(value, keys) {
			return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
		}
		//#endregion
		//#region src/client/context-state.ts
		/** Browser state machine for Session-bound controlled Label Studio pages. */
		/** Owns the current Session lease, target mutation queue, and event cursors. */
		var LabelStudioContextController = class {
			bridge;
			page;
			options;
			clock;
			/** Observable synchronization state. */
			store;
			offHost;
			disposed = false;
			sessionEpoch = 0;
			connectionEpoch = 0;
			navigationEpoch = 0;
			waitAbort;
			openAbort;
			mutationAbort = new AbortController();
			retryTimer;
			openInFlight = false;
			events = [];
			navigationQueue = Promise.resolve();
			pendingManual;
			/**
			* @param bridge - typed Connection caller.
			* @param page - controlled iframe operations.
			* @param sourceId - stable id for this browser page.
			* @param options - retry, close, and buffer limits.
			* @param clock - wall clock used for lease and focus deadlines.
			*/
			constructor(bridge, page, sourceId, options, clock = Date.now) {
				this.bridge = bridge;
				this.page = page;
				this.options = options;
				this.clock = clock;
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					sourceId,
					navigationSequence: 0,
					targetRevision: 0,
					eventRevision: 0,
					observedEventRevision: 0,
					bufferedEventCount: 0,
					sessionContext: emptySessionContext(),
					sessionContextStatus: "idle",
					inspectionStatus: "idle",
					webhookStatus: options.webhookStatus ?? "disabled",
					webhookUnassigned: false,
					status: "no-session"
				});
				this.offHost = bridge.onHostChanged(() => {
					this.hostChanged();
				});
			}
			/**
			* Bind the page to the selected DSH Session. This method schedules RPC work and never blocks React.
			* @param sessionId - selected Session, or absent selection.
			*/
			bindSession(sessionId) {
				if (this.disposed || this.store.getSnapshot().sessionId === sessionId) return;
				const previousSnapshot = this.store.getSnapshot();
				const previous = previousSnapshot.lease;
				this.sessionEpoch += 1;
				this.navigationEpoch += 1;
				this.cancelGeneration();
				this.rejectPendingManual("label-studio client: Session changed");
				if (previous !== void 0) this.bestEffortClose(previous);
				this.events = [];
				this.page.clearPage();
				this.store.set({
					sourceId: this.store.getSnapshot().sourceId,
					...sessionId === void 0 ? {} : { sessionId },
					navigationSequence: 0,
					targetRevision: 0,
					eventRevision: 0,
					observedEventRevision: 0,
					bufferedEventCount: 0,
					sessionContext: emptySessionContext(),
					sessionContextStatus: sessionId === void 0 ? "idle" : "restoring",
					inspectionStatus: "idle",
					webhookStatus: previousSnapshot.webhookStatus,
					webhookUnassigned: false,
					status: sessionId === void 0 ? "no-session" : "leasing"
				});
				if (sessionId !== void 0 && this.bridge.currentHost() !== void 0) this.startOpen();
			}
			/**
			* Reserve, apply, and publish a user-selected target through the serial navigation queue.
			* @param target - parsed controlled target.
			* @returns completion after a deterministic commit or reconciliation.
			*/
			selectPage(page) {
				const queued = this.navigationQueue.catch(() => {}).then(() => this.performPageSelection(page));
				this.navigationQueue = queued;
				return queued;
			}
			/**
			* Apply one focus event through the same serial queue as manual navigation.
			* @param event - Host focus request.
			*/
			applyFocus(event) {
				const queued = this.navigationQueue.catch(() => {}).then(async () => {
					await this.performFocus(event);
				});
				this.navigationQueue = queued;
				return queued;
			}
			/** Retry the current Session context by reopening its lease. */
			retrySessionContext() {
				if (this.disposed || this.store.getSnapshot().sessionId === void 0) return;
				this.expireLease(false);
				this.startOpen();
			}
			/** Reload the current controlled page only. */
			reload() {
				this.page.reloadPage();
			}
			/** Stop listeners and requests before returning; lease closure remains best effort. */
			dispose() {
				if (this.disposed) return Promise.resolve();
				this.disposed = true;
				this.sessionEpoch += 1;
				this.connectionEpoch += 1;
				this.navigationEpoch += 1;
				this.offHost();
				this.cancelGeneration();
				this.rejectPendingManual("label-studio client: disposed");
				const lease = this.store.getSnapshot().lease;
				if (lease !== void 0) this.bestEffortClose(lease);
				this.events = [];
				this.page.clearPage();
				return Promise.resolve();
			}
			epoch() {
				return {
					session: this.sessionEpoch,
					connection: this.connectionEpoch
				};
			}
			current(epoch) {
				return !this.disposed && epoch.session === this.sessionEpoch && epoch.connection === this.connectionEpoch;
			}
			hostChanged() {
				if (this.disposed) return;
				this.connectionEpoch += 1;
				this.cancelGeneration();
				const snapshot = this.store.getSnapshot();
				if (snapshot.sessionId === void 0 || this.bridge.currentHost() === void 0) return;
				if (snapshot.lease !== void 0 && snapshot.lease.expiresAt > this.clock()) {
					this.patch({ status: snapshot.target === void 0 ? "lease-active" : "reconciling" });
					this.startWait(snapshot.lease);
					return;
				}
				this.expireLease();
				this.startOpen();
			}
			startOpen() {
				if (this.disposed || this.openInFlight || this.bridge.currentHost() === void 0) return;
				const snapshot = this.store.getSnapshot();
				if (snapshot.sessionId === void 0) return;
				this.clearRetry();
				const epoch = this.epoch();
				const abort = new AbortController();
				this.openAbort = abort;
				this.openInFlight = true;
				this.patch({
					status: "leasing",
					sessionContextStatus: "restoring",
					error: void 0
				});
				this.bridge.openLease(snapshot.sessionId, snapshot.sourceId, abort.signal).then((result) => {
					if (!this.current(epoch)) return;
					this.openInFlight = false;
					this.openAbort = void 0;
					const before = this.store.getSnapshot();
					this.events = [];
					this.store.set({
						...before,
						lease: result.lease,
						navigationSequence: 0,
						targetRevision: 0,
						eventRevision: result.replayBaseline,
						observedEventRevision: result.replayBaseline,
						bufferedEventCount: 0,
						sessionContext: result.sessionContext,
						sessionContextStatus: "restoring",
						status: "syncing",
						error: void 0
					});
					const restore = this.navigationQueue.catch(() => {}).then(() => this.performPageSelection(restorationPage(result.sessionContext), true));
					this.navigationQueue = restore;
					restore.catch(() => {}).finally(() => {
						if (this.current(epoch)) this.startWait(result.lease);
					});
				}).catch((error) => {
					if (!this.current(epoch)) return;
					this.openInFlight = false;
					this.openAbort = void 0;
					if (isLabelStudioPluginFailure(error) && error.error.code === "lease-conflict") {
						const retry = error.error.details.retryAfterMs;
						this.patch({
							status: "lease-conflict",
							error: error.error.message
						});
						this.schedule(() => {
							this.startOpen();
						}, retry);
						return;
					}
					if (isLabelStudioTransportUnknown(error)) {
						this.patch({
							status: "reconciling",
							error: "Label Studio lease open result is unknown"
						});
						this.schedule(() => {
							this.startOpen();
						}, this.options.contextOpenRetryMs);
						return;
					}
					if (isLabelStudioPluginFailure(error) && error.error.code === "session-not-found") {
						this.patch({
							status: "error",
							sessionContextStatus: "unavailable",
							error: "The selected DSH Session no longer exists"
						});
						return;
					}
					if (!isCancellation(error)) this.patch({
						status: "error",
						sessionContextStatus: "unavailable",
						error: bridgeMessage(error)
					});
				});
			}
			startWait(lease) {
				if (this.disposed || this.waitAbort !== void 0 || this.bridge.currentHost() === void 0) return;
				const epoch = this.epoch();
				const afterRevision = this.store.getSnapshot().observedEventRevision;
				const abort = new AbortController();
				this.waitAbort = abort;
				this.bridge.waitEvents(lease, afterRevision, abort.signal).then(async (batch) => {
					if (!this.current(epoch) || this.waitAbort !== abort) return;
					this.waitAbort = void 0;
					await this.acceptBatch(batch, epoch);
					if (!this.current(epoch)) return;
					const nextLease = this.store.getSnapshot().lease;
					if (nextLease !== void 0) this.startWait(nextLease);
				}).catch((error) => {
					if (!this.current(epoch) || this.waitAbort !== abort) return;
					this.waitAbort = void 0;
					if (isCancellation(error)) return;
					if (isLabelStudioPluginFailure(error) && [
						"lease-expired",
						"stale-generation",
						"session-not-found"
					].includes(error.error.code)) {
						this.expireLease(error.error.code !== "session-not-found");
						this.startOpen();
						return;
					}
					this.patch({
						status: "reconciling",
						error: bridgeMessage(error)
					});
					this.schedule(() => {
						const current = this.store.getSnapshot().lease;
						if (current !== void 0) this.startWait(current);
					}, this.options.contextOpenRetryMs);
				});
			}
			async acceptBatch(batch, epoch) {
				if (!this.current(epoch)) return;
				const snapshot = this.store.getSnapshot();
				if (snapshot.lease === void 0 || batch.lease.leaseId !== snapshot.lease.leaseId || batch.lease.generation !== snapshot.lease.generation) return;
				if (batch.resetRequired) {
					this.events = [];
					this.store.set({
						...snapshot,
						lease: batch.lease,
						eventRevision: batch.latestRevision,
						observedEventRevision: batch.latestRevision,
						bufferedEventCount: 0
					});
					if (snapshot.target !== void 0) this.page.reloadPage();
				} else {
					const known = new Set(this.events.map((event) => event.eventRevision));
					for (const event of batch.events) if (event.eventRevision > snapshot.eventRevision && !known.has(event.eventRevision)) {
						this.events.push(event);
						known.add(event.eventRevision);
					}
					this.events.sort((a, b) => a.eventRevision - b.eventRevision);
					this.patch({
						lease: batch.lease,
						observedEventRevision: batch.latestRevision,
						bufferedEventCount: this.events.length
					});
				}
				if (this.events.length > this.options.eventHistorySize) {
					this.rebuildAfterOverflow(batch.lease);
					return;
				}
				await this.reconcileManual(batch.context, epoch);
				if (!this.current(epoch)) return;
				await this.processEvents(batch.context, epoch);
				if (!this.current(epoch)) return;
				if (this.events.length === 0 && this.pendingManual === void 0) this.mergeContext(batch.context);
			}
			async processEvents(context, epoch) {
				while (this.events.length > 0 && this.current(epoch)) {
					const event = this.events[0];
					if (event === void 0) return;
					if (event.kind === "task-changed") {
						if (this.store.getSnapshot().target?.taskId === event.taskId) this.page.reloadPage();
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (event.kind === "inspect-current-page") {
						const lease = this.store.getSnapshot().lease;
						if (lease === void 0) return;
						this.patch({ inspectionStatus: "inspecting" });
						try {
							const outcome = await this.page.inspectCurrentPage(event, lease, this.generationSignal());
							if (!this.current(epoch)) return;
							this.patch({ inspectionStatus: outcome ?? "ready" });
						} catch (error) {
							if (!this.current(epoch)) return;
							if (isLabelStudioTransportUnknown(error)) {
								this.patch({ inspectionStatus: "unavailable" });
								return;
							}
							this.patch({ inspectionStatus: inspectionFailureStatus(error) });
						}
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (event.kind === "binding-changed") {
						const current = this.store.getSnapshot().sessionContext;
						this.patch({
							sessionContext: {
								...current,
								binding: event.binding
							},
							webhookUnassigned: false
						});
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (event.kind === "webhook-status") {
						this.patch({
							webhookStatus: event.status,
							...event.status === "ready" ? { webhookUnassigned: false } : {}
						});
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (event.kind === "webhook-unassigned") {
						this.patch({ webhookUnassigned: true });
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (context.targetRevision === event.targetRevision && context.phase === "committed" && sameTarget(context.target, event.target)) {
						this.patch({
							target: context.target,
							targetRevision: context.targetRevision,
							sessionContext: focusSnapshot(this.store.getSnapshot().sessionContext, event, this.clock()),
							sessionContextStatus: "ready",
							status: "synced",
							error: void 0
						});
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (context.targetRevision === event.targetRevision && context.phase === "vacant") {
						this.page.clearPage();
						this.patch({
							target: void 0,
							targetRevision: context.targetRevision,
							status: "no-task"
						});
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (!await this.performFocus(event)) return;
					this.commitEvent(event.eventRevision);
				}
			}
			async performFocus(event) {
				const snapshot = this.store.getSnapshot();
				const lease = snapshot.lease;
				if (lease === void 0 || event.targetRevision < snapshot.targetRevision) return true;
				if (!event.committed && this.clock() >= event.deadlineAt) return true;
				const epoch = this.epoch();
				const navigationEpoch = ++this.navigationEpoch;
				this.page.setOpen(true);
				this.patch({
					targetRevision: event.targetRevision,
					status: "syncing",
					error: void 0
				});
				try {
					await this.page.applyPage(pageOfTarget(event.target));
					if (!this.currentNavigation(epoch, navigationEpoch)) return false;
					const committed = await this.bridge.acknowledgeFocus(lease, event.correlationId, event.targetRevision, event.target, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) return false;
					this.patch({
						lease: leaseFromContext(committed),
						target: committed.target,
						targetRevision: committed.targetRevision,
						sessionContext: focusSnapshot(this.store.getSnapshot().sessionContext, event, this.clock()),
						sessionContextStatus: "ready",
						status: "synced",
						error: void 0
					});
					return true;
				} catch (error) {
					if (!this.current(epoch)) return false;
					if (isLabelStudioTransportUnknown(error)) {
						this.patch({
							status: "reconciling",
							error: "Focus acknowledgement result is unknown"
						});
						return false;
					}
					this.page.clearPage();
					this.patch({
						target: void 0,
						sessionContextStatus: contextFailureStatus(error),
						status: "error",
						error: bridgeMessage(error)
					});
					return true;
				}
			}
			async performPageSelection(page, restoring = false) {
				const snapshot = this.store.getSnapshot();
				const lease = snapshot.lease;
				if (lease === void 0) throw new Error("label-studio client: no active page lease");
				const epoch = this.epoch();
				const navigationEpoch = ++this.navigationEpoch;
				const sequence = restoring && page.view !== "task" ? snapshot.navigationSequence : Number(snapshot.navigationSequence) + 1;
				if (!restoring) this.page.setOpen(true);
				this.patch({
					navigationSequence: sequence,
					sessionContextStatus: restoring ? "restoring" : "committing",
					status: "syncing",
					error: void 0
				});
				if (page.view !== "task") try {
					await this.page.applyPage(page);
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					if (restoring) {
						this.patch({
							target: void 0,
							sessionContextStatus: "ready",
							status: "no-task",
							error: void 0
						});
						return;
					}
					const committed = await this.bridge.commitPage(lease, sequence, snapshot.sessionContext.revision, page, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					this.patch({
						target: void 0,
						sessionContext: committed,
						sessionContextStatus: "ready",
						status: "no-task",
						error: void 0
					});
					return;
				} catch (error) {
					if (this.current(epoch)) this.patch({
						sessionContextStatus: contextFailureStatus(error),
						status: "error",
						error: bridgeMessage(error)
					});
					throw toError(error);
				}
				await this.performTaskSelection(page, lease, sequence, snapshot, epoch, navigationEpoch);
			}
			async performTaskSelection(page, lease, sequence, snapshot, epoch, navigationEpoch) {
				const target = targetOfPage(page);
				const deferred = makeDeferred();
				let reservation;
				try {
					reservation = await this.bridge.reserveTarget(lease, sequence, snapshot.targetRevision, this.generationSignal());
				} catch (error) {
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					if (isLabelStudioTransportUnknown(error)) {
						this.pendingManual = {
							phase: "reserve",
							lease,
							sequence,
							expectedRevision: snapshot.targetRevision,
							target,
							page,
							expectedSessionContextRevision: snapshot.sessionContext.revision,
							deadline: lease.expiresAt,
							deferred
						};
						this.patch({
							status: "reconciling",
							error: "Target reservation result is unknown"
						});
						return deferred.promise;
					}
					this.page.clearPage();
					this.patch({
						target: void 0,
						sessionContextStatus: contextFailureStatus(error),
						status: "error",
						error: bridgeMessage(error)
					});
					throw toError(error);
				}
				if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
				await this.applyAndPublish({
					phase: "publish",
					lease: reservation.lease,
					sequence,
					expectedRevision: snapshot.targetRevision,
					target,
					page,
					expectedSessionContextRevision: snapshot.sessionContext.revision,
					targetRevision: reservation.targetRevision,
					deadline: lease.expiresAt,
					deferred
				}, epoch, navigationEpoch);
			}
			async applyAndPublish(pending, epoch, navigationEpoch) {
				try {
					this.page.setOpen(true);
					await this.page.applyPage(pending.page);
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					const committed = await this.bridge.publishTarget(pending.lease, requiredRevision(pending), pending.target, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					pending.phase = "commit";
					await this.commitPending(pending, committed, epoch, navigationEpoch);
				} catch (error) {
					if (!this.current(epoch)) {
						pending.deferred.reject(/* @__PURE__ */ new Error("label-studio client: navigation superseded"));
						return;
					}
					if (isLabelStudioTransportUnknown(error)) {
						this.pendingManual = pending;
						this.patch({
							status: "reconciling",
							error: "Target publish result is unknown"
						});
						await pending.deferred.promise;
						return;
					}
					this.pendingManual = void 0;
					this.page.clearPage();
					this.patch({
						target: void 0,
						sessionContextStatus: contextFailureStatus(error),
						status: "error",
						error: bridgeMessage(error)
					});
					const failure = toError(error);
					pending.deferred.reject(failure);
					throw failure;
				}
			}
			async reconcileManual(context, epoch) {
				const pending = this.pendingManual;
				if (pending === void 0 || !this.current(epoch)) return;
				if (this.clock() >= pending.deadline) {
					this.pendingManual = void 0;
					this.page.clearPage();
					pending.deferred.reject(/* @__PURE__ */ new Error("label-studio client: reconciliation deadline expired"));
					this.expireLease();
					this.schedule(() => {
						this.startOpen();
					}, this.options.contextOpenRetryMs);
					return;
				}
				if (context.phase === "committed" && sameTarget(context.target, pending.target)) {
					await this.commitPending(pending, {
						sessionId: this.store.getSnapshot().sessionId,
						sourceId: this.store.getSnapshot().sourceId,
						...pending.lease,
						targetRevision: context.targetRevision,
						target: context.target
					}, epoch, this.navigationEpoch);
					return;
				}
				if (context.phase === "reserved" && context.reservation.kind === "browser" && context.reservation.navigationSequence === pending.sequence) {
					pending.phase = "publish";
					pending.targetRevision = context.targetRevision;
					const navigationEpoch = this.navigationEpoch;
					await this.applyAndPublish(pending, epoch, navigationEpoch);
					return;
				}
				if (pending.phase === "reserve" && context.targetRevision === pending.expectedRevision) try {
					const reservation = await this.bridge.reserveTarget(pending.lease, pending.sequence, pending.expectedRevision, this.generationSignal());
					pending.phase = "publish";
					pending.targetRevision = reservation.targetRevision;
					await this.applyAndPublish(pending, epoch, this.navigationEpoch);
				} catch (error) {
					if (!isLabelStudioTransportUnknown(error)) {
						this.pendingManual = void 0;
						this.page.clearPage();
						pending.deferred.reject(toError(error));
					}
				}
			}
			async commitPending(pending, active, epoch, navigationEpoch) {
				try {
					const sessionContext = await this.bridge.commitPage(pending.lease, pending.sequence, pending.expectedSessionContextRevision, pending.page, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					this.pendingManual = void 0;
					this.patch({
						lease: leaseFromContext(active),
						target: active.target,
						targetRevision: active.targetRevision,
						sessionContext,
						sessionContextStatus: "ready",
						status: "synced",
						error: void 0
					});
					pending.deferred.resolve();
				} catch (error) {
					if (!this.current(epoch)) {
						pending.deferred.reject(/* @__PURE__ */ new Error("label-studio client: navigation superseded"));
						return;
					}
					if (isLabelStudioTransportUnknown(error)) {
						this.pendingManual = pending;
						this.patch({
							sessionContextStatus: "unavailable",
							status: "reconciling",
							error: "Page commit result is unknown"
						});
						await pending.deferred.promise;
						return;
					}
					this.pendingManual = void 0;
					this.patch({
						sessionContextStatus: contextFailureStatus(error),
						status: "error",
						error: bridgeMessage(error)
					});
					const failure = toError(error);
					pending.deferred.reject(failure);
					throw failure;
				}
			}
			mergeContext(context) {
				const snapshot = this.store.getSnapshot();
				if (context.targetRevision < snapshot.targetRevision) return;
				if (context.phase === "committed") this.patch({
					target: context.target,
					targetRevision: context.targetRevision,
					status: "synced",
					error: void 0
				});
				else if (context.targetRevision > snapshot.targetRevision || snapshot.target === void 0) this.patch({
					target: void 0,
					targetRevision: context.targetRevision,
					status: context.phase === "reserved" ? "syncing" : "no-task"
				});
			}
			commitEvent(revision) {
				if (this.events[0]?.eventRevision === revision) this.events.shift();
				this.patch({
					eventRevision: revision,
					bufferedEventCount: this.events.length
				});
			}
			rebuildAfterOverflow(lease) {
				this.events = [];
				this.page.clearPage();
				this.patch({
					lease: void 0,
					target: void 0,
					bufferedEventCount: 0,
					status: "reconciling",
					error: "Label Studio event buffer exceeded its configured limit"
				});
				const epoch = this.epoch();
				const signal = AbortSignal.timeout(this.options.contextCloseTimeoutMs);
				this.schedule(() => {
					this.startOpen();
				}, Math.max(this.options.contextOpenRetryMs, lease.expiresAt - this.clock()));
				this.bridge.closeLease(lease, signal).then(() => {
					if (!this.current(epoch)) return;
					this.clearRetry();
					this.startOpen();
				}).catch(() => {});
			}
			expireLease(preserveTarget = true) {
				this.waitAbort?.abort();
				this.waitAbort = void 0;
				this.rejectPendingManual("label-studio client: lease expired");
				this.events = [];
				if (!preserveTarget) this.page.clearPage();
				this.patch({
					lease: void 0,
					...preserveTarget ? {} : { target: void 0 },
					bufferedEventCount: 0,
					status: "lease-expired"
				});
			}
			currentNavigation(epoch, navigationEpoch) {
				return this.current(epoch) && navigationEpoch === this.navigationEpoch;
			}
			generationSignal() {
				return this.mutationAbort.signal;
			}
			bestEffortClose(lease) {
				const signal = AbortSignal.timeout(this.options.contextCloseTimeoutMs);
				this.bridge.closeLease(lease, signal).catch(() => {});
			}
			cancelGeneration() {
				this.waitAbort?.abort();
				this.waitAbort = void 0;
				this.openAbort?.abort();
				this.openAbort = void 0;
				this.openInFlight = false;
				this.mutationAbort.abort();
				this.mutationAbort = new AbortController();
				this.clearRetry();
			}
			schedule(callback, delay) {
				this.clearRetry();
				this.retryTimer = setTimeout(() => {
					this.retryTimer = void 0;
					if (!this.disposed) callback();
				}, Math.min(2147483647, Math.max(1, delay)));
			}
			clearRetry() {
				if (this.retryTimer !== void 0) clearTimeout(this.retryTimer);
				this.retryTimer = void 0;
			}
			rejectPendingManual(message) {
				this.pendingManual?.deferred.reject(new Error(message));
				this.pendingManual = void 0;
			}
			patch(values) {
				this.store.set({
					...this.store.getSnapshot(),
					...values
				});
			}
		};
		function makeDeferred() {
			let resolve;
			let reject;
			const promise = new Promise((done, fail) => {
				resolve = done;
				reject = fail;
			});
			promise.catch(() => {});
			return {
				promise,
				resolve,
				reject
			};
		}
		function isCancellation(error) {
			return typeof error === "object" && error !== null && "kind" in error && error.kind === "cancelled";
		}
		function bridgeMessage(error) {
			if (isLabelStudioPluginFailure(error)) return error.error.message;
			if (typeof error === "object" && error !== null && "kind" in error && error.kind === "framework" && "error" in error && typeof error.error === "object" && error.error !== null && "message" in error.error) return String(error.error.message);
			return error instanceof Error ? error.message : "Label Studio synchronization failed";
		}
		function inspectionFailureStatus(error) {
			return bridgeMessage(error).includes("expired") ? "timeout" : "unavailable";
		}
		function toError(error) {
			return error instanceof Error ? error : new Error(bridgeMessage(error));
		}
		function sameTarget(left, right) {
			return left.projectId === right.projectId && left.taskId === right.taskId && left.annotationId === right.annotationId;
		}
		function leaseFromContext(context) {
			return {
				leaseId: context.leaseId,
				generation: context.generation,
				expiresAt: context.expiresAt
			};
		}
		function requiredRevision(pending) {
			if (pending.targetRevision === void 0) throw new Error("label-studio client: missing target reservation revision");
			return pending.targetRevision;
		}
		function restorationPage(context) {
			if (context.page.view !== "projects" || context.binding.target === void 0) return context.page;
			const target = context.binding.target;
			if (target.kind === "project") return {
				view: "project",
				projectId: target.projectId
			};
			return {
				view: "task",
				projectId: target.projectId,
				taskId: target.taskId,
				...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
			};
		}
		function emptySessionContext() {
			return {
				page: { view: "projects" },
				recentProjects: [],
				revision: 0,
				binding: {
					recentProjects: [],
					revision: 0
				}
			};
		}
		function pageOfTarget(target) {
			return {
				view: "task",
				projectId: target.projectId,
				taskId: target.taskId,
				...target.annotationId === void 0 ? {} : { annotationId: target.annotationId }
			};
		}
		function samePage(left, right) {
			if (left.view !== right.view) return false;
			if (left.view === "projects" || right.view === "projects") return true;
			if (left.projectId !== right.projectId) return false;
			if (left.view === "project" || right.view === "project") return true;
			return left.taskId === right.taskId && left.annotationId === right.annotationId;
		}
		function focusSnapshot(current, event, visitedAt) {
			const page = pageOfTarget(event.target);
			if (samePage(current.page, page)) return current;
			const prior = current.recentProjects.filter((recent) => recent.projectId !== page.projectId);
			return {
				page,
				recentProjects: [{
					projectId: page.projectId,
					lastTaskId: page.taskId,
					lastVisitedAt: visitedAt,
					availability: "available"
				}, ...prior],
				revision: event.expectedSessionContextRevision + 1,
				binding: current.binding
			};
		}
		function contextFailureStatus(error) {
			return isLabelStudioPluginFailure(error) && error.error.code === "session-context-conflict" ? "conflict" : "unavailable";
		}
		//#endregion
		//#region src/client/locales.ts
		/** Dictionary namespace owned by the Label Studio browser plugin. */
		const NS = "labelStudio";
		/** Simplified Chinese dictionary and key source. */
		const zh = {
			"action.open": "打开 Label Studio",
			"action.close": "关闭 Label Studio",
			"panel.title": "Label Studio 标注工作台",
			"panel.fullscreen": "全屏标注",
			"panel.exitFullscreen": "退出全屏",
			"panel.reload": "重新加载",
			"panel.external": "在新窗口打开",
			"panel.close": "关闭工作台",
			"panel.projectId": "项目 ID",
			"panel.taskId": "任务 ID",
			"panel.annotationId": "标注 ID（可选）",
			"panel.navigate": "定位",
			"panel.openLocator": "打开定位",
			"panel.closeLocator": "关闭定位",
			"panel.contextDetails": "查看会话上下文",
			"panel.currentPage": "当前位置",
			"panel.projects": "项目列表",
			"panel.recentProjects": "最近项目",
			"panel.project": "项目",
			"panel.deleted": "已删除",
			"panel.binding": "当前绑定",
			"panel.unbound": "未绑定",
			"panel.bound": "已绑定",
			"panel.pageDiffers": "页面未绑定",
			"panel.bindingSource": "绑定来源",
			"panel.syncStatus": "同步状态",
			"panel.source.tool-result": "工具结果",
			"panel.source.webhook": "Webhook",
			"panel.source.current-page": "按需检查",
			"panel.inspection": "页面检查",
			"panel.inspection.idle": "未请求",
			"panel.inspection.inspecting": "检查中",
			"panel.inspection.ready": "已就绪",
			"panel.inspection.timeout": "已超时",
			"panel.inspection.unsupported": "页面不支持",
			"panel.inspection.unavailable": "不可用",
			"panel.webhook": "Webhook",
			"panel.webhook.disabled": "已关闭",
			"panel.webhook.ready": "已就绪",
			"panel.webhook.unavailable": "不可用",
			"panel.webhook.unassigned": "事件未匹配当前会话",
			"panel.bridgeLimitation": "仅同步插件控制的导航，无法观察页面内任意点击或未保存草稿。",
			"status.no-session": "未选择 DSH 会话",
			"status.no-task": "未选择任务",
			"status.leasing": "正在建立页面租约",
			"status.lease-active": "页面租约已连接",
			"status.lease-conflict": "另一标签页正在控制此会话",
			"status.lease-expired": "页面租约已过期",
			"status.syncing": "正在同步目标",
			"status.reconciling": "正在核对未知结果",
			"status.synced": "目标已同步",
			"status.error": "同步失败"
		};
		/** English dictionary. */
		const en = {
			"action.open": "Open Label Studio",
			"action.close": "Close Label Studio",
			"panel.title": "Label Studio annotation workbench",
			"panel.fullscreen": "Enter fullscreen",
			"panel.exitFullscreen": "Exit fullscreen",
			"panel.reload": "Reload",
			"panel.external": "Open in a new window",
			"panel.close": "Close workbench",
			"panel.projectId": "Project ID",
			"panel.taskId": "Task ID",
			"panel.annotationId": "Annotation ID (optional)",
			"panel.navigate": "Go",
			"panel.openLocator": "Open locator",
			"panel.closeLocator": "Close locator",
			"panel.contextDetails": "View Session context",
			"panel.currentPage": "Current page",
			"panel.projects": "Projects",
			"panel.recentProjects": "Recent projects",
			"panel.project": "Project",
			"panel.deleted": "deleted",
			"panel.binding": "Current binding",
			"panel.unbound": "Unbound",
			"panel.bound": "Bound",
			"panel.pageDiffers": "Page not bound",
			"panel.bindingSource": "Binding source",
			"panel.syncStatus": "Sync status",
			"panel.source.tool-result": "Tool result",
			"panel.source.webhook": "Webhook",
			"panel.source.current-page": "On-demand inspection",
			"panel.inspection": "Page inspection",
			"panel.inspection.idle": "Not requested",
			"panel.inspection.inspecting": "Inspecting",
			"panel.inspection.ready": "Ready",
			"panel.inspection.timeout": "Timed out",
			"panel.inspection.unsupported": "Unsupported page",
			"panel.inspection.unavailable": "Unavailable",
			"panel.webhook": "Webhook",
			"panel.webhook.disabled": "Disabled",
			"panel.webhook.ready": "Ready",
			"panel.webhook.unavailable": "Unavailable",
			"panel.webhook.unassigned": "Event did not match this Session",
			"panel.bridgeLimitation": "Only plugin-controlled navigation is synchronized. Arbitrary iframe clicks and unsaved drafts are not observed.",
			"status.no-session": "No DSH Session selected",
			"status.no-task": "No task selected",
			"status.leasing": "Opening page lease",
			"status.lease-active": "Page lease connected",
			"status.lease-conflict": "Another tab controls this Session",
			"status.lease-expired": "Page lease expired",
			"status.syncing": "Synchronizing target",
			"status.reconciling": "Reconciling unknown result",
			"status.synced": "Target synchronized",
			"status.error": "Synchronization failed"
		};
		//#endregion
		//#region \0dsh-label-studio-css:/Users/xinlongzhang/PycharmProjects/dsh-label-studio-plugin-package/packages/client-ui/src/client/LabelStudioPanel.module.css.mjs
		const css$1 = ".Q-ow9W_panel{box-sizing:border-box;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex-direction:column;flex:none;min-width:0;height:100%;display:flex;overflow:hidden}.Q-ow9W_panel[hidden]{display:none}.Q-ow9W_panel[data-fullscreen]{z-index:100;border-left:0;height:100dvh;position:fixed;inset:0;width:100%!important}.Q-ow9W_header{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex-wrap:wrap;flex:none;align-items:center;gap:6px;padding:6px 10px 6px 14px;display:flex}.Q-ow9W_title{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:13px;font-weight:500;overflow:hidden}.Q-ow9W_actions{flex:none;order:3;gap:2px;display:flex}.Q-ow9W_compactBar{display:contents}.Q-ow9W_contextSummary{min-width:0;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;background:0 0;border:0;border-radius:7px;flex:1;align-items:center;gap:7px;padding:7px 8px;display:flex}.Q-ow9W_contextSummary:hover,.Q-ow9W_locatorButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.Q-ow9W_summaryText{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:11px;font-weight:500;overflow:hidden}.Q-ow9W_chevron{color:var(--dsw-alias-label-secondary);flex:none;transition:transform .16s}.Q-ow9W_contextSummary[aria-expanded=true] .Q-ow9W_chevron{transform:rotate(180deg)}.Q-ow9W_compactActions{flex:0 auto;order:2;align-items:center;gap:3px;min-width:0;display:flex}.Q-ow9W_healthIndicator{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;flex:0 auto;justify-content:center;align-items:center;gap:5px;padding:6px 5px;font-size:10px;display:inline-flex}.Q-ow9W_healthIndicator>span:not(.Q-ow9W_statusDot){text-overflow:ellipsis;min-width:0;overflow:hidden}.Q-ow9W_healthIndicator[data-tone=warning]{color:#9a6519;background:#b7791f1a}.Q-ow9W_statusDot{background:currentColor;border-radius:50%;flex:none;width:6px;height:6px}.Q-ow9W_contextSummary>.Q-ow9W_statusDot[data-tone=good],.Q-ow9W_healthIndicator[data-tone=good]{color:var(--dsw-alias-label-primary)}.Q-ow9W_contextSummary>.Q-ow9W_statusDot[data-tone=warning]{color:#9a6519}.Q-ow9W_locatorButton{color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;background:0 0;border:0;border-radius:7px;align-items:center;gap:5px;padding:7px 8px;font-size:11px;display:inline-flex}.Q-ow9W_popover{box-sizing:border-box;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex:1 0 100%;order:4;display:flex}.Q-ow9W_locatorPopover{flex-wrap:wrap;align-items:end;gap:8px;padding:10px 0 4px}.Q-ow9W_locatorPopover label{min-width:0;color:var(--dsw-alias-label-secondary);flex-direction:column;flex:1 1 0;gap:4px;font-size:10px;display:flex}.Q-ow9W_locatorPopover input,.Q-ow9W_locatorPopover button{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px}.Q-ow9W_locatorPopover input{padding:6px 7px}.Q-ow9W_locatorPopover button{cursor:pointer;flex:none;padding:6px 10px}.Q-ow9W_locatorPopover output{color:#9a6519;flex:1 0 100%;font-size:11px}.Q-ow9W_contextPopover{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:6px;padding:10px 0 4px;font-size:11px}.Q-ow9W_detailRow{justify-content:space-between;gap:14px;min-width:0;display:flex}.Q-ow9W_detailRow strong{color:var(--dsw-alias-label-primary);text-align:right;text-overflow:ellipsis;white-space:nowrap;font-weight:500;overflow:hidden}.Q-ow9W_recentProjects{gap:5px;display:flex;overflow-x:auto}.Q-ow9W_recentProjects button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);min-height:25px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:6px;flex:none;padding:2px 8px}.Q-ow9W_recentProjects button:disabled{color:var(--dsw-alias-label-secondary);cursor:not-allowed;opacity:.65}.Q-ow9W_bridgeLimitation{border-top:1px solid var(--dsw-alias-border-l2);margin:2px 0 0;padding-top:7px;line-height:1.35}.Q-ow9W_iconButton{width:30px;height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:8px;place-items:center;padding:0;display:grid}.Q-ow9W_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.Q-ow9W_iframe{background:var(--dsw-alias-bg-base);border:0;flex:1;width:100%;min-height:0}";
		const tagId$1 = "dsh-label-studio-workbench/LabelStudioPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-label-studio-workbench";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var LabelStudioPanel_module_css_default = {
			"panel": "Q-ow9W_panel",
			"chevron": "Q-ow9W_chevron",
			"header": "Q-ow9W_header",
			"locatorPopover": "Q-ow9W_locatorPopover",
			"iconButton": "Q-ow9W_iconButton",
			"iframe": "Q-ow9W_iframe",
			"summaryText": "Q-ow9W_summaryText",
			"compactBar": "Q-ow9W_compactBar",
			"healthIndicator": "Q-ow9W_healthIndicator",
			"compactActions": "Q-ow9W_compactActions",
			"detailRow": "Q-ow9W_detailRow",
			"contextSummary": "Q-ow9W_contextSummary",
			"title": "Q-ow9W_title",
			"locatorButton": "Q-ow9W_locatorButton",
			"contextPopover": "Q-ow9W_contextPopover",
			"recentProjects": "Q-ow9W_recentProjects",
			"bridgeLimitation": "Q-ow9W_bridgeLimitation",
			"popover": "Q-ow9W_popover",
			"statusDot": "Q-ow9W_statusDot",
			"actions": "Q-ow9W_actions"
		};
		//#endregion
		//#region src/client/LabelStudioPanel.tsx
		/** Render a restored or explicitly opened iframe and retain it while hidden. */
		function LabelStudioPanel({ useLabelStudioPanel, useLabelStudioContext, baseUrl, open, width, close, reload, openExternal, confirmApplied, attachFrame, selectTarget, selectPage, t }) {
			const state = useLabelStudioPanel((snapshot) => snapshot);
			const context = useLabelStudioContext((snapshot) => snapshot);
			const [projectId, setProjectId] = (0, react.useState)("");
			const [taskId, setTaskId] = (0, react.useState)("");
			const [annotationId, setAnnotationId] = (0, react.useState)("");
			const [inputError, setInputError] = (0, react.useState)();
			const [fullscreen, setFullscreen] = (0, react.useState)(false);
			const [locatorOpen, setLocatorOpen] = (0, react.useState)(false);
			const [detailsOpen, setDetailsOpen] = (0, react.useState)(false);
			const recentProjects = context.sessionContext.binding.recentProjects.length > 0 ? context.sessionContext.binding.recentProjects : context.sessionContext.recentProjects;
			const bindingTarget = context.sessionContext.binding.target;
			const bindingMatches = bindingTarget !== void 0 && pageMatchesBinding(context.sessionContext.page, bindingTarget);
			const bindingStatus = bindingTarget === void 0 ? t("panel.unbound") : bindingMatches ? t("panel.bound") : t("panel.pageDiffers");
			const inspectionLabel = t(`panel.inspection.${context.inspectionStatus}`);
			const webhookLabel = `${t(`panel.webhook.${context.webhookStatus}`)}${context.webhookUnassigned ? ` · ${t("panel.webhook.unassigned")}` : ""}`;
			const inspectionAttention = !["idle", "ready"].includes(context.inspectionStatus);
			const webhookAttention = context.webhookStatus !== "ready" || context.webhookUnassigned;
			(0, react.useEffect)(() => {
				if (!open) {
					if (fullscreen) setFullscreen(false);
					if (locatorOpen) setLocatorOpen(false);
					if (detailsOpen) setDetailsOpen(false);
				}
			}, [
				detailsOpen,
				fullscreen,
				locatorOpen,
				open
			]);
			(0, react.useEffect)(() => {
				if (!fullscreen && !locatorOpen && !detailsOpen) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") {
						setLocatorOpen(false);
						setDetailsOpen(false);
						setFullscreen(false);
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [
				detailsOpen,
				fullscreen,
				locatorOpen
			]);
			(0, react.useLayoutEffect)(() => {
				if (state.targetUrl !== void 0) confirmApplied(state.navigationRevision);
			}, [
				confirmApplied,
				state.navigationRevision,
				state.targetUrl
			]);
			if (!state.mounted) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: LabelStudioPanel_module_css_default.panel,
				role: "region",
				"aria-label": t("panel.title"),
				hidden: !open,
				...!open ? { inert: "" } : {},
				"data-fullscreen": fullscreen || void 0,
				style: { flexBasis: width },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: LabelStudioPanel_module_css_default.header,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: LabelStudioPanel_module_css_default.title,
							children: t("panel.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: LabelStudioPanel_module_css_default.compactBar,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: LabelStudioPanel_module_css_default.contextSummary,
									"aria-label": t("panel.contextDetails"),
									"aria-expanded": detailsOpen,
									onClick: () => {
										setDetailsOpen((current) => !current);
										setLocatorOpen(false);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: LabelStudioPanel_module_css_default.statusDot,
											"data-tone": bindingTarget === void 0 ? "muted" : bindingMatches ? "good" : "warning"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: LabelStudioPanel_module_css_default.summaryText,
											children: [
												pageName(context.sessionContext.page, t),
												" · ",
												bindingStatus
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
											className: LabelStudioPanel_module_css_default.chevron,
											viewBox: "0 0 16 16",
											width: "14",
											height: "14",
											"aria-hidden": true,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
												d: "m5 6 3 3 3-3",
												fill: "none",
												stroke: "currentColor",
												strokeWidth: "1.5",
												strokeLinecap: "round",
												strokeLinejoin: "round"
											})
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LabelStudioPanel_module_css_default.compactActions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: LabelStudioPanel_module_css_default.healthIndicator,
											"data-tone": inspectionTone(context.inspectionStatus),
											"aria-label": `${t("panel.inspection")}: ${inspectionLabel}`,
											title: `${t("panel.inspection")}: ${inspectionLabel}`,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: LabelStudioPanel_module_css_default.statusDot }), inspectionAttention && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: inspectionLabel })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: LabelStudioPanel_module_css_default.healthIndicator,
											"data-tone": webhookAttention ? "warning" : "good",
											"aria-label": `${t("panel.webhook")}: ${webhookLabel}`,
											title: `${t("panel.webhook")}: ${webhookLabel}`,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: LabelStudioPanel_module_css_default.statusDot }), webhookAttention && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: webhookLabel })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: LabelStudioPanel_module_css_default.locatorButton,
											"aria-label": locatorOpen ? t("panel.closeLocator") : t("panel.openLocator"),
											"aria-expanded": locatorOpen,
											onClick: () => {
												setLocatorOpen((current) => !current);
												setDetailsOpen(false);
												setInputError(void 0);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
												viewBox: "0 0 16 16",
												width: "14",
												height: "14",
												"aria-hidden": true,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
													cx: "8",
													cy: "8",
													r: "2.5",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.4"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: "M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.4",
													strokeLinecap: "round"
												})]
											}), t("panel.navigate")]
										})
									]
								}),
								locatorOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
									className: `${LabelStudioPanel_module_css_default.popover} ${LabelStudioPanel_module_css_default.locatorPopover}`,
									"aria-label": t("panel.openLocator"),
									onSubmit: (event) => {
										event.preventDefault();
										setInputError(void 0);
										selectTarget({
											projectId,
											taskId,
											...annotationId === "" ? {} : { annotationId }
										}).then(() => {
											setLocatorOpen(false);
										}).catch((error) => {
											setInputError(error instanceof Error ? error.message : String(error));
										});
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.projectId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											"aria-label": t("panel.projectId"),
											value: projectId,
											onChange: (event) => {
												setProjectId(event.currentTarget.value);
											}
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.taskId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											"aria-label": t("panel.taskId"),
											value: taskId,
											onChange: (event) => {
												setTaskId(event.currentTarget.value);
											}
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.annotationId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											"aria-label": t("panel.annotationId"),
											value: annotationId,
											onChange: (event) => {
												setAnnotationId(event.currentTarget.value);
											}
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "submit",
											children: t("panel.navigate")
										}),
										(inputError ?? context.error) !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
											"aria-live": "polite",
											children: inputError ?? context.error
										})
									]
								}),
								detailsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: `${LabelStudioPanel_module_css_default.popover} ${LabelStudioPanel_module_css_default.contextPopover}`,
									role: "region",
									"aria-label": t("panel.contextDetails"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.currentPage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: pageName(context.sessionContext.page, t) })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.binding") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: bindingName(bindingTarget, t) })]
										}),
										context.sessionContext.binding.source !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.bindingSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`panel.source.${context.sessionContext.binding.source}`) })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.syncStatus") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(`status.${context.status}`) })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.inspection") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: inspectionLabel })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LabelStudioPanel_module_css_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.webhook") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: webhookLabel })]
										}),
										recentProjects.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
											className: LabelStudioPanel_module_css_default.recentProjects,
											"aria-label": t("panel.recentProjects"),
											children: recentProjects.map((project) => {
												const deleted = project.availability === "deleted";
												const label = `${t("panel.project")} ${String(project.projectId)}${deleted ? ` (${t("panel.deleted")})` : ""}`;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													disabled: deleted,
													"aria-label": label,
													onClick: () => {
														selectPage({
															view: "project",
															projectId: project.projectId
														});
													},
													children: label
												}, project.projectId);
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: LabelStudioPanel_module_css_default.bridgeLimitation,
											children: t("panel.bridgeLimitation")
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: LabelStudioPanel_module_css_default.actions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: LabelStudioPanel_module_css_default.iconButton,
									"aria-label": t(fullscreen ? "panel.exitFullscreen" : "panel.fullscreen"),
									"aria-pressed": fullscreen,
									title: t(fullscreen ? "panel.exitFullscreen" : "panel.fullscreen"),
									onClick: () => {
										setFullscreen((current) => !current);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										viewBox: "0 0 20 20",
										width: "16",
										height: "16",
										"aria-hidden": true,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: fullscreen ? "M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4" : "M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										})
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: LabelStudioPanel_module_css_default.iconButton,
									"aria-label": t("panel.reload"),
									title: t("panel.reload"),
									onClick: reload,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
										viewBox: "0 0 20 20",
										width: "16",
										height: "16",
										"aria-hidden": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M15.5 7A6 6 0 1 0 16 12",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M12.5 4.5h3v3",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										})]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: LabelStudioPanel_module_css_default.iconButton,
									"aria-label": t("panel.external"),
									title: t("panel.external"),
									onClick: openExternal,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
										viewBox: "0 0 20 20",
										width: "16",
										height: "16",
										"aria-hidden": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M11 4h5v5M16 4l-7 7",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M15 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5"
										})]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: LabelStudioPanel_module_css_default.iconButton,
									"aria-label": t("panel.close"),
									title: t("panel.close"),
									onClick: close,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
										viewBox: "0 0 20 20",
										width: "16",
										height: "16",
										"aria-hidden": true,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M5 5l10 10M15 5 5 15",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round"
										})
									})
								})
							]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					ref: attachFrame,
					className: LabelStudioPanel_module_css_default.iframe,
					src: state.targetUrl ?? baseUrl,
					title: t("panel.title"),
					allow: "clipboard-read; clipboard-write"
				}, state.reloadRevision)]
			});
		}
		function pageName(page, t) {
			if (page.view === "projects") return t("panel.projects");
			if (page.view === "project") return `${t("panel.project")} ${String(page.projectId)}`;
			const annotation = page.annotationId === void 0 ? "" : ` / ${t("panel.annotationId")} ${String(page.annotationId)}`;
			return `${t("panel.project")} ${String(page.projectId)} / ${t("panel.taskId")} ${String(page.taskId)}${annotation}`;
		}
		function bindingName(target, t) {
			if (target === void 0) return t("panel.unbound");
			if (target.kind === "project") return `${t("panel.project")} ${String(target.projectId)}`;
			const annotation = target.annotationId === void 0 ? "" : ` / ${t("panel.annotationId")} ${String(target.annotationId)}`;
			return `${t("panel.project")} ${String(target.projectId)} / ${t("panel.taskId")} ${String(target.taskId)}${annotation}`;
		}
		function pageMatchesBinding(page, target) {
			if (target.kind === "project") return page.view === "project" && page.projectId === target.projectId;
			return page.view === "task" && page.projectId === target.projectId && page.taskId === target.taskId && page.annotationId === target.annotationId;
		}
		function inspectionTone(status) {
			if (status === "ready") return "good";
			if (status === "idle") return "muted";
			return "warning";
		}
		/** Viewport width that activates narrow sidebar behavior. */
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/** Maximum user-resizable Label Studio workbench width. */
		const WORKBENCH_MAX = 1200;
		/**
		* Clamp and round a panel width.
		* @param px - requested width in CSS pixels.
		* @param min - inclusive lower limit.
		* @param max - inclusive upper limit.
		* @returns the rounded width inside the requested range.
		*/
		function clampWidth(px, min, max) {
			return Math.min(max, Math.max(min, Math.round(px)));
		}
		/**
		* Resolve the four replacement-root tracks without mutating preferences.
		* @param viewport - available root width.
		* @param sidebar - sidebar preference, where zero means the compact rail.
		* @param details - details preference, where zero means closed.
		* @param workbench - workbench preference, where zero means closed.
		* @returns rendered widths after the details-then-workbench concession chain.
		*/
		function computeLabelStudioColumns(viewport, sidebar, details, workbench) {
			const s = sidebar === 0 ? 56 : clampWidth(sidebar, 264, 420);
			const d = details === 0 ? 0 : clampWidth(details, 300, 520);
			const w = workbench === 0 ? 0 : clampWidth(workbench, 480, WORKBENCH_MAX);
			if (s + d + w + 640 <= viewport) return {
				sidebar: s,
				conversation: viewport - s - d - w,
				details: d,
				workbench: w
			};
			const availableDetails = viewport - s - w - 640;
			if (d > 0 && availableDetails >= 300) return {
				sidebar: s,
				conversation: 640,
				details: availableDetails,
				workbench: w
			};
			if (s + w + 640 <= viewport) return {
				sidebar: s,
				conversation: viewport - s - w,
				details: 0,
				workbench: w
			};
			const availableWorkbench = viewport - s - 640;
			if (w > 0 && availableWorkbench >= 480) return {
				sidebar: s,
				conversation: 640,
				details: 0,
				workbench: availableWorkbench
			};
			const resolvedWorkbench = w === 0 ? 0 : Math.max(0, availableWorkbench);
			return {
				sidebar: s,
				conversation: Math.max(0, viewport - s - resolvedWorkbench),
				details: 0,
				workbench: resolvedWorkbench
			};
		}
		//#endregion
		//#region \0dsh-label-studio-css:/Users/xinlongzhang/PycharmProjects/dsh-label-studio-plugin-package/packages/client-ui/src/client/layout/LabelStudioRoot.module.css.mjs
		const css = ".STqelW_frame{background:var(--dsw-alias-bg-base);height:100%;display:flex;position:relative;overflow:hidden}.STqelW_sidebarCol{border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill);flex:none;min-width:0;overflow:hidden}.STqelW_conversationCol{flex-direction:column;flex:1 1 0;min-width:0;display:flex;overflow:hidden}.STqelW_detailsCol{border-left:1px solid var(--dsw-alias-border-l2);flex:none;min-width:0;overflow:hidden}.STqelW_frame[data-details-collapsed] .STqelW_detailsCol{border-left:0}.STqelW_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.STqelW_overlayLayer>*{pointer-events:auto}.STqelW_handle{z-index:2;cursor:col-resize;touch-action:none;flex:0 0 8px;align-self:stretch;width:8px;margin-inline:-4px}";
		const tagId = "dsh-label-studio-workbench/LabelStudioRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-label-studio-workbench";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var LabelStudioRoot_module_css_default = {
			"handle": "STqelW_handle",
			"conversationCol": "STqelW_conversationCol",
			"overlayLayer": "STqelW_overlayLayer",
			"frame": "STqelW_frame",
			"sidebarCol": "STqelW_sidebarCol",
			"detailsCol": "STqelW_detailsCol"
		};
		//#endregion
		//#region src/client/layout/LabelStudioRoot.tsx
		function DragHandle({ side, onStart, onDrag, onEnd }) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart,
				onDrag,
				onEnd
			});
			callbacks.current = {
				onStart,
				onDrag,
				onEnd
			};
			const pointerDown = (0, react.useCallback)((event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				origin.current = event.clientX;
				latest.current = event.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const pointerMove = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				latest.current = event.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const pointerUp = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				latest.current = event.clientX;
				event.currentTarget.releasePointerCapture(event.pointerId);
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				callbacks.current.onDrag(latest.current - origin.current);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: LabelStudioRoot_module_css_default.handle,
				"data-side": side,
				"data-dragging": dragging || void 0,
				onPointerDown: pointerDown,
				onPointerMove: pointerMove,
				onPointerUp: pointerUp
			});
		}
		/** Render the original four child slots and the package-private workbench in one root. */
		function LabelStudioRoot({ useStore, actions, useSessions, renderSlot, SessionProvider, useLabelStudioPanel, useLabelStudioContext, baseUrl, bindSession, confirmApplied, attachFrame, selectTarget, selectPage, close, reload, openExternal, t }) {
			const panels = useStore((state) => state);
			const selectedSession = useSessions((unknownState) => unknownState.current);
			const liveSession = useSessions((unknownState) => {
				const state = unknownState;
				const id = state.current;
				return id !== void 0 && state.byId[id]?.blank === false ? id : void 0;
			});
			const lastLiveSession = (0, react.useRef)(liveSession);
			(0, react.useEffect)(() => {
				bindSession(selectedSession);
			}, [bindSession, selectedSession]);
			(0, react.useLayoutEffect)(() => {
				if (liveSession === void 0) return;
				if (lastLiveSession.current !== void 0 && lastLiveSession.current !== liveSession) actions.closeDetails();
				lastLiveSession.current = liveSession;
			}, [actions, liveSession]);
			const rootRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			(0, react.useEffect)(() => {
				const element = rootRef.current;
				if (element === null) return;
				let frame = null;
				const observer = new ResizeObserver(() => {
					frame ??= requestAnimationFrame(() => {
						frame = null;
						const width = element.getBoundingClientRect().width;
						if (width > 0) setViewport(width);
					});
				});
				observer.observe(element);
				return () => {
					observer.disconnect();
					if (frame !== null) cancelAnimationFrame(frame);
				};
			}, []);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			(0, react.useEffect)(() => {
				actions.setNarrow(narrow);
			}, [actions, narrow]);
			const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const columns = computeLabelStudioColumns(viewport, sidebarCollapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, liveSession === void 0 ? 0 : panels.details, panels.workbench);
			const columnsRef = (0, react.useRef)(columns);
			columnsRef.current = columns;
			const sidebarBase = (0, react.useRef)(0);
			const detailsBase = (0, react.useRef)(0);
			const workbenchBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const endDrag = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: LabelStudioRoot_module_css_default.frame,
				"data-label-studio-root": true,
				"data-details-collapsed": columns.details === 0 || void 0,
				"data-workbench-collapsed": columns.workbench === 0 || void 0,
				"data-sidebar-collapsed": sidebarCollapsed || void 0,
				"data-dragging": dragging || void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.sidebarCol,
						style: { flexBasis: columns.sidebar },
						children: renderSlot("sidebar", {
							collapsed: sidebarCollapsed,
							width: columns.sidebar
						})
					}),
					!sidebarCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "sidebar",
						onStart: () => {
							sidebarBase.current = columnsRef.current.sidebar;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setSidebar(sidebarBase.current + dx);
						},
						onEnd: endDrag
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.conversationCol,
						children: renderSlot("conversation", {})
					}),
					columns.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "details",
						onStart: () => {
							detailsBase.current = columnsRef.current.details;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setDetails(detailsBase.current - dx);
						},
						onEnd: endDrag
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.detailsCol,
						style: { flexBasis: columns.details },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionProvider, { children: renderSlot("details", {}) })
					}),
					columns.workbench > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "workbench",
						onStart: () => {
							workbenchBase.current = columnsRef.current.workbench;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setWorkbench(workbenchBase.current - dx);
						},
						onEnd: endDrag
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LabelStudioPanel, {
						useLabelStudioPanel,
						useLabelStudioContext,
						baseUrl,
						open: panels.workbench > 0,
						width: columns.workbench,
						close,
						reload,
						openExternal,
						confirmApplied,
						attachFrame,
						selectTarget,
						selectPage,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.overlayLayer,
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					})
				]
			});
		}
		//#endregion
		//#region src/client/layout/store.ts
		/**
		* Create page-local layout state for one replacement-root registration.
		* @returns an independent store handle for one replacement-root registration.
		*/
		function createLabelStudioLayoutStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					sidebar: 280,
					details: 0,
					workbench: 0,
					narrow: false,
					narrowExpanded: false
				}),
				actions: {
					setSidebar: (draft, px) => {
						draft.sidebar = clampWidth(px, 264, 420);
					},
					setDetails: (draft, px) => {
						draft.details = clampWidth(px, 300, 520);
					},
					setWorkbench: (draft, px) => {
						draft.workbench = clampWidth(px, 480, WORKBENCH_MAX);
					},
					toggleSidebar: (draft) => {
						if (draft.narrow) draft.narrowExpanded = !draft.narrowExpanded;
						else draft.sidebar = draft.sidebar === 0 ? 280 : 0;
					},
					setNarrow: (draft, narrow) => {
						if (draft.narrow === narrow) return;
						draft.narrow = narrow;
						draft.narrowExpanded = false;
					},
					openDetails: (draft) => {
						if (draft.details === 0) draft.details = 360;
					},
					closeDetails: (draft) => {
						draft.details = 0;
					},
					openWorkbench: (draft) => {
						if (draft.workbench === 0) draft.workbench = 720;
					},
					closeWorkbench: (draft) => {
						draft.workbench = 0;
					}
				}
			});
		}
		//#endregion
		//#region src/client/layout/service.ts
		/** Compatible public layout face plus package-private workbench actions. */
		var LabelStudioLayoutController = class {
			#panels;
			/**
			* Attach the bound actions owned by the mounted replacement root.
			* @param actions - bound actions owned by the current root registration.
			*/
			attachPanels(actions) {
				this.#panels = actions;
			}
			/** Toggle the original sidebar surface. */
			toggleSidebar() {
				this.#require().toggleSidebar();
			}
			/** Open the original details surface. */
			openDetails() {
				this.#require().openDetails();
			}
			/** Close the original details surface. */
			closeDetails() {
				this.#require().closeDetails();
			}
			/** Open the package-private Label Studio track. */
			openWorkbench() {
				this.#require().openWorkbench();
			}
			/** Close the package-private Label Studio track. */
			closeWorkbench() {
				this.#require().closeWorkbench();
			}
			#require() {
				if (this.#panels === void 0) throw new Error("label-studio layout: panel actions not wired (root entry not mounted)");
				return this.#panels;
			}
		};
		//#endregion
		//#region src/client/layout/theme-presenter.ts
		/** Body attribute used by existing Harness dark-theme selectors. */
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Applies resolved theme facts and retracts only writes owned by this instance. */
		var LabelStudioThemePresenter = class {
			appliedTokens = [];
			themeColorMeta;
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			/**
			* Project the resolved theme onto the document.
			* @param snapshot - resolved active theme.
			*/
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				if (scheme === "dark") document.body.setAttribute(DARK_ATTRIBUTE, "");
				else document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					document.body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			/** Retract this presenter's scheme, token, attribute, and metadata writes. */
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"theme",
			"connection"
		];
		function readBootConfig() {
			const config = window.__DSH_LABEL_STUDIO__;
			if (config === void 0 || config.baseUrl === "") throw new Error("label-studio client: missing browser boot config");
			try {
				new URL(config.baseUrl);
			} catch {
				throw new Error("label-studio client: invalid browser boot baseUrl");
			}
			for (const field of [
				"contextOpenRetryMs",
				"contextCloseTimeoutMs",
				"eventHistorySize",
				"currentPageTimeoutMs"
			]) if (!Number.isSafeInteger(config[field]) || config[field] <= 0) throw new Error(`label-studio client: invalid browser boot ${field}`);
			if (config.frameBaseUrl === "" || config.frameCapability === "" || config.inspectionProtocol !== "dsh-label-studio-page/v1") throw new Error("label-studio client: invalid frame boot config");
			try {
				new URL(config.frameBaseUrl);
			} catch {
				throw new Error("label-studio client: invalid frame boot baseUrl");
			}
			return config;
		}
		/**
		* Provide the compatible layout, replace the root, and add one Session action.
		* @param ctx - browser root context.
		*/
		function apply(ctx) {
			const boot = readBootConfig();
			const baseUrl = boot.frameBaseUrl;
			const layout = new LabelStudioLayoutController();
			const panel = new LabelStudioPanelController(boot.frameBaseUrl, boot.baseUrl);
			let activeSessionId;
			const sessionVisibility = /* @__PURE__ */ new Map();
			const applyVisibility = (open) => {
				if (panel.store.getSnapshot().open === open) return;
				panel.setOpen(open);
				if (open) layout.openWorkbench();
				else layout.closeWorkbench();
			};
			const setOpen = (open) => {
				if (activeSessionId !== void 0) sessionVisibility.set(activeSessionId, open);
				applyVisibility(open);
			};
			const bridge = new LabelStudioContextBridge({
				connection: ctx.get("connection"),
				channel: "/label-studio"
			});
			const currentPages = new LabelStudioCurrentPageBridge(bridge, () => panel.currentFrameWindow(), new URL(boot.frameBaseUrl).origin, boot.inspectionProtocol, boot.frameCapability);
			const sourceId = globalThis.crypto.randomUUID();
			const contexts = new LabelStudioContextController(bridge, {
				setOpen,
				applyPage: (page) => panel.applyPage(page),
				clearPage: () => {
					panel.clearPage();
				},
				reloadPage: () => {
					panel.reloadPage();
				},
				inspectCurrentPage: (event, lease, signal) => currentPages.inspect(event, lease, signal)
			}, sourceId, {
				contextOpenRetryMs: boot.contextOpenRetryMs,
				contextCloseTimeoutMs: boot.contextCloseTimeoutMs,
				eventHistorySize: boot.eventHistorySize,
				...boot.webhookStatus === void 0 ? {} : { webhookStatus: boot.webhookStatus }
			});
			const bindSession = (sessionId) => {
				if (activeSessionId !== sessionId) {
					activeSessionId = sessionId;
					applyVisibility(sessionId !== void 0 && sessionVisibility.get(sessionId) === true);
				}
				contexts.bindSession(sessionId);
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "label-studio: dictionaries");
			ctx.effect(() => {
				const disposeService = ctx.reflect.provide("layout", layout);
				const disposeRoot = ctx.slots.register({
					name: "root",
					children: {
						"sidebar": {
							kind: "single",
							scope: "root"
						},
						"conversation": {
							kind: "single",
							scope: "session-maybe"
						},
						"details": {
							kind: "single",
							scope: "session"
						},
						"shell.overlay": {
							kind: "list",
							scope: "root"
						}
					},
					store: createLabelStudioLayoutStore,
					locale: NS,
					inject: (actions) => {
						layout.attachPanels(actions);
						return {
							hooks: {
								labelStudioPanel: panel.store,
								labelStudioContext: contexts.store
							},
							baseUrl,
							bindSession,
							confirmApplied: (revision) => {
								panel.confirmApplied(revision);
							},
							attachFrame: (frame) => {
								currentPages.cancel();
								panel.attachFrame(frame);
							},
							selectTarget: (input) => contexts.selectPage(parseLabelStudioTargetInput(input)),
							selectPage: (page) => contexts.selectPage(page),
							close: () => {
								setOpen(false);
							},
							reload: () => {
								contexts.reload();
							},
							openExternal: () => {
								panel.openExternal();
							}
						};
					}
				}, LabelStudioRoot);
				return () => {
					setOpen(false);
					disposeRoot();
					disposeService();
				};
			}, "label-studio: compatible layout + replacement root");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "label-studio",
				order: 40,
				locale: NS,
				inject: () => ({
					hooks: { labelStudioPanel: panel.store },
					toggle: () => {
						setOpen(!panel.store.getSnapshot().open);
					}
				})
			}, LabelStudioAction));
			ctx.effect(() => {
				const presenter = new LabelStudioThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "label-studio: theme presenter");
			ctx.effect(() => async () => {
				await contexts.dispose();
				currentPages.dispose();
				panel.dispose();
			}, "label-studio: browser context lifecycle");
		}
		//#endregion
		exports.LabelStudioContextBridge = LabelStudioContextBridge;
		exports.LabelStudioContextController = LabelStudioContextController;
		exports.LabelStudioCurrentPageBridge = LabelStudioCurrentPageBridge;
		exports.LabelStudioLayoutController = LabelStudioLayoutController;
		exports.apply = apply;
		exports.buildLabelStudioPageUrl = buildLabelStudioPageUrl;
		exports.inject = inject;
		exports.isLabelStudioBridgeFailure = isLabelStudioBridgeFailure;
		exports.isLabelStudioPluginFailure = isLabelStudioPluginFailure;
		exports.isLabelStudioTransportUnknown = isLabelStudioTransportUnknown;
		exports.parseLabelStudioTargetInput = parseLabelStudioTargetInput;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map