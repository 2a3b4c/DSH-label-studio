window.__ModuleLoader__.load({
	id: "dsh-label-studio-workbench",
	factory: (require) => {
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
		//#region src/client/task-url.ts
		/**
		* Parse one positive decimal identifier without accepting alternate numeric syntax.
		* @param value - browser input value.
		* @param field - field name used in the failure message.
		* @returns positive safe integer.
		*/
		function positiveId(value, field) {
			if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`label-studio client: ${field} must be a positive integer`);
			const parsed = Number(value);
			if (!Number.isSafeInteger(parsed)) throw new Error(`label-studio client: ${field} must be a positive safe integer`);
			return parsed;
		}
		/**
		* Parse the workbench target controls into branded protocol identifiers.
		* @param input - untrusted browser input strings.
		* @returns validated controlled target.
		*/
		function parseLabelStudioTargetInput(input) {
			const projectId = positiveId(input.projectId, "projectId");
			const taskId = positiveId(input.taskId, "taskId");
			const annotation = input.annotationId?.trim();
			return {
				projectId,
				taskId,
				...annotation === void 0 || annotation === "" ? {} : { annotationId: positiveId(annotation, "annotationId") }
			};
		}
		/**
		* Build the Label Studio 1.22 controlled-task route verified by Task 3.
		* @param baseUrl - Host-validated Label Studio endpoint.
		* @param target - validated project, task, and optional annotation ids.
		* @returns same-origin project data URL selecting the task.
		*/
		function buildLabelStudioTaskUrl(baseUrl, target) {
			const base = new URL(baseUrl);
			const url = new URL(`/projects/${String(target.projectId)}/data`, base.origin);
			url.searchParams.set("task", String(target.taskId));
			if (target.annotationId !== void 0) url.searchParams.set("annotation", String(target.annotationId));
			return url.href;
		}
		//#endregion
		//#region src/client/panel-state.ts
		/** Owns one browser page's workbench visibility and iframe identity. */
		var LabelStudioPanelController = class {
			baseUrl;
			/** Observable browser-local panel state. */
			store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				open: false,
				mounted: false,
				reloadRevision: 0,
				navigationRevision: 0
			});
			pending = /* @__PURE__ */ new Map();
			/** @param baseUrl - Host-validated neutral Label Studio page. */
			constructor(baseUrl) {
				this.baseUrl = baseUrl;
			}
			/**
			* Set workbench visibility while permanently latching the first mount.
			* @param open - requested visibility; the first open permanently latches mounted.
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
			* Stage a controlled task URL and wait until React commits the matching iframe src.
			* @param target - Host-reserved target.
			* @returns promise resolved by {@link confirmApplied}.
			*/
			applyTarget(target) {
				this.rejectPending("label-studio panel: navigation superseded");
				const current = this.store.getSnapshot();
				const navigationRevision = current.navigationRevision + 1;
				this.store.set({
					...current,
					navigationRevision,
					targetUrl: buildLabelStudioTaskUrl(this.baseUrl, target)
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
			clearTarget() {
				this.rejectPending("label-studio panel: navigation cleared");
				const current = this.store.getSnapshot();
				this.store.set({
					open: current.open,
					mounted: current.mounted,
					reloadRevision: current.reloadRevision,
					navigationRevision: current.navigationRevision + 1
				});
			}
			/** Reload only a currently controlled target. */
			reloadTarget() {
				if (this.store.getSnapshot().targetUrl !== void 0) this.reload();
			}
			/** Open the controlled target, or the neutral endpoint, outside the dock. */
			openExternal() {
				window.open(this.store.getSnapshot().targetUrl ?? this.baseUrl, "_blank", "noopener,noreferrer");
			}
			/** Reject outstanding DOM confirmations during plugin teardown. */
			dispose() {
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
		/** Calls and validates the plugin's six fixed RPC endpoints. */
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
			* @returns connected Host description, or absence during disconnection.
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
		function positive(value, field) {
			const result = integer(value, field);
			if (result === 0) throw new Error(`invalid ${field}`);
			return result;
		}
		function string(value, field) {
			if (typeof value !== "string" || value === "") throw new Error(`invalid ${field}`);
			return value;
		}
		function record(value, field) {
			if (!isRecord(value)) throw new Error(`invalid ${field}`);
			return value;
		}
		function recordBoolean(value, field) {
			const object = record(value, "result");
			if (typeof object[field] !== "boolean") throw new Error(`invalid ${field}`);
			return object[field];
		}
		function parseLease(value) {
			const object = record(value, "lease");
			return {
				leaseId: string(object.leaseId, "leaseId"),
				generation: integer(object.generation, "generation"),
				expiresAt: positive(object.expiresAt, "expiresAt")
			};
		}
		function parseOpen(value) {
			const object = record(value, "open result");
			return {
				lease: parseLease(object.lease),
				replayBaseline: integer(object.replayBaseline, "replayBaseline")
			};
		}
		function parseTarget(value) {
			const object = record(value, "target");
			return {
				projectId: positive(object.projectId, "projectId"),
				taskId: positive(object.taskId, "taskId"),
				...object.annotationId === void 0 ? {} : { annotationId: positive(object.annotationId, "annotationId") }
			};
		}
		function parseReservation(value) {
			const object = record(value, "reservation");
			return {
				lease: parseLease(object.lease),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				...object.navigationSequence === void 0 ? {} : { navigationSequence: integer(object.navigationSequence, "navigationSequence") }
			};
		}
		function parseActiveContext(value) {
			const object = record(value, "active context");
			return {
				sessionId: string(object.sessionId, "sessionId"),
				sourceId: string(object.sourceId, "sourceId"),
				leaseId: string(object.leaseId, "leaseId"),
				generation: integer(object.generation, "generation"),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				expiresAt: positive(object.expiresAt, "expiresAt"),
				target: parseTarget(object.target)
			};
		}
		function parseTargetState(value) {
			const object = record(value, "target state");
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
			const reservation = record(object.reservation, "reservation identity");
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
			const object = record(value, "event");
			const eventRevision = positive(object.eventRevision, "eventRevision");
			if (object.kind === "task-changed") {
				if (object.reason !== "prediction-created") throw new Error("invalid change reason");
				return {
					kind: "task-changed",
					eventRevision,
					taskId: positive(object.taskId, "taskId"),
					reason: object.reason
				};
			}
			if (object.kind !== "focus-task" || typeof object.committed !== "boolean") throw new Error("invalid event kind");
			return {
				kind: "focus-task",
				eventRevision,
				correlationId: string(object.correlationId, "correlationId"),
				targetRevision: integer(object.targetRevision, "targetRevision"),
				target: parseTarget(object.target),
				deadlineAt: positive(object.deadlineAt, "deadlineAt"),
				committed: object.committed
			};
		}
		function parseEventBatch(value) {
			const object = record(value, "event batch");
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
				"focus-not-found"
			].includes(value.code)) return false;
			return value.code !== "lease-conflict" || Number.isSafeInteger(value.details.retryAfterMs) && Number(value.details.retryAfterMs) > 0;
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
				const previous = this.store.getSnapshot().lease;
				this.sessionEpoch += 1;
				this.navigationEpoch += 1;
				this.cancelGeneration();
				this.rejectPendingManual("label-studio client: Session changed");
				if (previous !== void 0) this.bestEffortClose(previous);
				this.events = [];
				this.page.clearTarget();
				this.store.set({
					sourceId: this.store.getSnapshot().sourceId,
					...sessionId === void 0 ? {} : { sessionId },
					navigationSequence: 0,
					targetRevision: 0,
					eventRevision: 0,
					observedEventRevision: 0,
					bufferedEventCount: 0,
					status: sessionId === void 0 ? "no-session" : "leasing"
				});
				if (sessionId !== void 0 && this.bridge.currentHost() !== void 0) this.startOpen();
			}
			/**
			* Reserve, apply, and publish a user-selected target through the serial navigation queue.
			* @param target - parsed controlled target.
			* @returns completion after a deterministic commit or reconciliation.
			*/
			selectTarget(target) {
				const queued = this.navigationQueue.catch(() => {}).then(() => this.performSelection(target));
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
			/** Reload the current controlled task only. */
			reload() {
				this.page.reloadTarget();
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
				this.page.clearTarget();
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
						status: before.target === void 0 ? "lease-active" : "syncing",
						error: void 0
					});
					if (before.target !== void 0) {
						this.page.reloadTarget();
						this.selectTarget(before.target).catch(() => {});
					}
					this.startWait(result.lease);
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
							error: "The selected DSH Session no longer exists"
						});
						return;
					}
					if (!isCancellation(error)) this.patch({
						status: "error",
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
					if (snapshot.target !== void 0) this.page.reloadTarget();
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
						if (this.store.getSnapshot().target?.taskId === event.taskId) this.page.reloadTarget();
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (context.targetRevision === event.targetRevision && context.phase === "committed" && sameTarget(context.target, event.target)) {
						this.patch({
							target: context.target,
							targetRevision: context.targetRevision,
							status: "synced",
							error: void 0
						});
						this.commitEvent(event.eventRevision);
						continue;
					}
					if (context.targetRevision === event.targetRevision && context.phase === "vacant") {
						this.page.clearTarget();
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
					await this.page.applyTarget(event.target);
					if (!this.currentNavigation(epoch, navigationEpoch)) return false;
					const committed = await this.bridge.acknowledgeFocus(lease, event.correlationId, event.targetRevision, event.target, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) return false;
					this.patch({
						lease: leaseFromContext(committed),
						target: committed.target,
						targetRevision: committed.targetRevision,
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
					this.page.clearTarget();
					this.patch({
						target: void 0,
						status: "error",
						error: bridgeMessage(error)
					});
					return true;
				}
			}
			async performSelection(target) {
				const snapshot = this.store.getSnapshot();
				const lease = snapshot.lease;
				if (lease === void 0) throw new Error("label-studio client: no active page lease");
				const epoch = this.epoch();
				const navigationEpoch = ++this.navigationEpoch;
				const sequence = Number(snapshot.navigationSequence) + 1;
				const deferred = makeDeferred();
				this.patch({
					navigationSequence: sequence,
					status: "syncing",
					error: void 0
				});
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
							deadline: lease.expiresAt,
							deferred
						};
						this.patch({
							status: "reconciling",
							error: "Target reservation result is unknown"
						});
						return deferred.promise;
					}
					this.page.clearTarget();
					this.patch({
						target: void 0,
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
					targetRevision: reservation.targetRevision,
					deadline: lease.expiresAt,
					deferred
				}, epoch, navigationEpoch);
			}
			async applyAndPublish(pending, epoch, navigationEpoch) {
				try {
					this.page.setOpen(true);
					await this.page.applyTarget(pending.target);
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					const committed = await this.bridge.publishTarget(pending.lease, requiredRevision(pending), pending.target, this.generationSignal());
					if (!this.currentNavigation(epoch, navigationEpoch)) throw new Error("label-studio client: navigation superseded");
					this.pendingManual = void 0;
					this.patch({
						lease: leaseFromContext(committed),
						target: committed.target,
						targetRevision: committed.targetRevision,
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
							status: "reconciling",
							error: "Target publish result is unknown"
						});
						await pending.deferred.promise;
						return;
					}
					this.pendingManual = void 0;
					this.page.clearTarget();
					this.patch({
						target: void 0,
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
					this.page.clearTarget();
					pending.deferred.reject(/* @__PURE__ */ new Error("label-studio client: reconciliation deadline expired"));
					this.expireLease();
					this.schedule(() => {
						this.startOpen();
					}, this.options.contextOpenRetryMs);
					return;
				}
				if (context.phase === "committed" && sameTarget(context.target, pending.target)) {
					this.pendingManual = void 0;
					this.patch({
						target: context.target,
						targetRevision: context.targetRevision,
						status: "synced",
						error: void 0
					});
					pending.deferred.resolve();
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
						this.page.clearTarget();
						pending.deferred.reject(toError(error));
					}
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
				this.page.clearTarget();
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
				if (!preserveTarget) this.page.clearTarget();
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
		//#region \0dsh-css:LabelStudioPanel.module.css.mjs
		const css$1 = ".LwyFZG_panel{box-sizing:border-box;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);flex-direction:column;min-width:0;height:100%;display:flex;overflow:hidden}.LwyFZG_panel[hidden]{display:none}.LwyFZG_panel[data-fullscreen]{z-index:100;position:fixed;inset:0;width:100%!important;height:100dvh;border-left:0}.LwyFZG_header{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex:none;justify-content:space-between;align-items:center;gap:12px;min-height:44px;padding:0 10px 0 14px;display:flex}.LwyFZG_title{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;overflow:hidden}.LwyFZG_actions{flex:none;gap:2px;display:flex}.LwyFZG_targetBar{border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);grid-template-columns:minmax(64px,.8fr) minmax(64px,.8fr) minmax(64px,.8fr) auto minmax(96px,1.4fr);gap:6px;padding:8px 10px;display:grid}.LwyFZG_targetBar input,.LwyFZG_targetBar button{box-sizing:border-box;min-width:0;height:28px}.LwyFZG_targetBar output{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;align-self:center;font-size:11px;overflow:hidden}.LwyFZG_iconButton{width:30px;height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:8px;place-items:center;padding:0;display:grid}.LwyFZG_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.LwyFZG_iframe{background:var(--dsw-alias-bg-base);border:0;flex:1;width:100%;min-height:0}";
		const tagId$1 = "dsh-label-studio-workbench/LabelStudioPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-label-studio-workbench";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var LabelStudioPanel_module_css_default = {
			"panel": "LwyFZG_panel",
			"iframe": "LwyFZG_iframe",
			"header": "LwyFZG_header",
			"iconButton": "LwyFZG_iconButton",
			"title": "LwyFZG_title",
			"actions": "LwyFZG_actions",
			"targetBar": "LwyFZG_targetBar"
		};
		//#endregion
		//#region src/client/LabelStudioPanel.tsx
		/** Render the iframe only after first open and retain it while hidden. */
		function LabelStudioPanel({ useLabelStudioPanel, useLabelStudioContext, baseUrl, open, width, close, reload, openExternal, confirmApplied, selectTarget, t }) {
			const state = useLabelStudioPanel((snapshot) => snapshot);
			const context = useLabelStudioContext((snapshot) => snapshot);
			const [projectId, setProjectId] = (0, react.useState)("");
			const [taskId, setTaskId] = (0, react.useState)("");
			const [annotationId, setAnnotationId] = (0, react.useState)("");
			const [inputError, setInputError] = (0, react.useState)();
			const [fullscreen, setFullscreen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (!open && fullscreen) setFullscreen(false);
			}, [fullscreen, open]);
			(0, react.useEffect)(() => {
				if (!fullscreen) return;
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					setFullscreen(false);
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [fullscreen]);
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
				style: { width },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: LabelStudioPanel_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: LabelStudioPanel_module_css_default.title,
							children: t("panel.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
										children: fullscreen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M8 4v4H4M12 4v4h4M8 16v-4H4M12 16v-4h4",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "1.5",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M8 4H4v4M12 4h4v4M8 16H4v-4M12 16h4v-4",
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
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: LabelStudioPanel_module_css_default.targetBar,
						onSubmit: (event) => {
							event.preventDefault();
							setInputError(void 0);
							selectTarget({
								projectId,
								taskId,
								...annotationId === "" ? {} : { annotationId }
							}).catch((error) => {
								setInputError(error instanceof Error ? error.message : String(error));
							});
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("panel.projectId"),
								value: projectId,
								onChange: (event) => {
									setProjectId(event.currentTarget.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("panel.taskId"),
								value: taskId,
								onChange: (event) => {
									setTaskId(event.currentTarget.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								"aria-label": t("panel.annotationId"),
								value: annotationId,
								onChange: (event) => {
									setAnnotationId(event.currentTarget.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								children: t("panel.navigate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", {
								"aria-live": "polite",
								children: inputError ?? context.error ?? t(`status.${context.status}`)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						className: LabelStudioPanel_module_css_default.iframe,
						src: state.targetUrl ?? baseUrl,
						title: t("panel.title"),
						allow: "clipboard-read; clipboard-write"
					}, state.reloadRevision)
				]
			});
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
		//#region \0dsh-css:LabelStudioRoot.module.css.mjs
		const css = ".KcRxUa_frame{background:var(--dsw-alias-bg-base);height:100%;transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);grid-template-rows:100%;display:grid;position:relative;overflow:hidden}.KcRxUa_frame[data-dragging]{transition:none}.KcRxUa_sidebarCol{border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-sidebar-fill);min-width:0;overflow:hidden}.KcRxUa_conversationCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}.KcRxUa_detailsCol{border-left:1px solid var(--dsw-alias-border-l2);min-width:0;overflow:hidden}.KcRxUa_frame[data-details-collapsed] .KcRxUa_detailsCol{border-left:0}.KcRxUa_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.KcRxUa_overlayLayer>*{pointer-events:auto}.KcRxUa_handle{z-index:2;cursor:col-resize;touch-action:none;width:8px;transition:left var(--ds-transition-duration-slow) var(--ds-ease-in-out);margin-left:-4px;position:absolute;top:0;bottom:0}.KcRxUa_frame[data-dragging] .KcRxUa_handle{transition:none}@media (prefers-reduced-motion:reduce){.KcRxUa_frame,.KcRxUa_handle{transition:none}}";
		const tagId = "dsh-label-studio-workbench/LabelStudioRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-label-studio-workbench";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var LabelStudioRoot_module_css_default = {
			"frame": "KcRxUa_frame",
			"conversationCol": "KcRxUa_conversationCol",
			"detailsCol": "KcRxUa_detailsCol",
			"handle": "KcRxUa_handle",
			"sidebarCol": "KcRxUa_sidebarCol",
			"overlayLayer": "KcRxUa_overlayLayer"
		};
		//#endregion
		//#region src/client/layout/LabelStudioRoot.tsx
		function DragHandle({ side, left, onStart, onDrag, onEnd }) {
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
				style: { left },
				onPointerDown: pointerDown,
				onPointerMove: pointerMove,
				onPointerUp: pointerUp
			});
		}
		/** Render the original four child slots and the package-private workbench in one root. */
		function LabelStudioRoot({ useStore, actions, useSessions, renderSlot, SessionProvider, useLabelStudioPanel, useLabelStudioContext, baseUrl, bindSession, confirmApplied, selectTarget, close, reload, openExternal, t }) {
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
				style: { gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px ${columns.workbench}px` },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.sidebarCol,
						children: renderSlot("sidebar", {
							collapsed: sidebarCollapsed,
							width: columns.sidebar
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.conversationCol,
						children: renderSlot("conversation", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.detailsCol,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionProvider, { children: renderSlot("details", {}) })
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
						selectTarget,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: LabelStudioRoot_module_css_default.overlayLayer,
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!sidebarCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "sidebar",
						left: columns.sidebar,
						onStart: () => {
							sidebarBase.current = columnsRef.current.sidebar;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setSidebar(sidebarBase.current + dx);
						},
						onEnd: endDrag
					}),
					columns.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "details",
						left: viewport - columns.workbench - columns.details,
						onStart: () => {
							detailsBase.current = columnsRef.current.details;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setDetails(detailsBase.current - dx);
						},
						onEnd: endDrag
					}),
					columns.workbench > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "workbench",
						left: viewport - columns.workbench,
						onStart: () => {
							workbenchBase.current = columnsRef.current.workbench;
							setDragging(true);
						},
						onDrag: (dx) => {
							actions.setWorkbench(workbenchBase.current - dx);
						},
						onEnd: endDrag
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
				"eventHistorySize"
			]) if (!Number.isSafeInteger(config[field]) || config[field] <= 0) throw new Error(`label-studio client: invalid browser boot ${field}`);
			return config;
		}
		/**
		* Provide the compatible layout, replace the root, and add one Session action.
		* @param ctx - browser root context.
		*/
		function apply(ctx) {
			const boot = readBootConfig();
			const baseUrl = boot.baseUrl;
			const layout = new LabelStudioLayoutController();
			const panel = new LabelStudioPanelController(baseUrl);
			const setOpen = (open) => {
				if (panel.store.getSnapshot().open === open) return;
				panel.setOpen(open);
				if (open) layout.openWorkbench();
				else layout.closeWorkbench();
			};
			const bridge = new LabelStudioContextBridge({
				connection: ctx.get("connection"),
				channel: "/label-studio"
			});
			const sourceId = globalThis.crypto.randomUUID();
			const contexts = new LabelStudioContextController(bridge, {
				setOpen,
				applyTarget: (target) => panel.applyTarget(target),
				clearTarget: () => {
					panel.clearTarget();
				},
				reloadTarget: () => {
					panel.reloadTarget();
				}
			}, sourceId, {
				contextOpenRetryMs: boot.contextOpenRetryMs,
				contextCloseTimeoutMs: boot.contextCloseTimeoutMs,
				eventHistorySize: boot.eventHistorySize
			});
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
							bindSession: (sessionId) => {
								contexts.bindSession(sessionId);
							},
							confirmApplied: (revision) => {
								panel.confirmApplied(revision);
							},
							selectTarget: (input) => contexts.selectTarget(parseLabelStudioTargetInput(input)),
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
				panel.dispose();
			}, "label-studio: browser context lifecycle");
		}
		//#endregion
		exports.LabelStudioContextBridge = LabelStudioContextBridge;
		exports.LabelStudioContextController = LabelStudioContextController;
		exports.LabelStudioLayoutController = LabelStudioLayoutController;
		exports.apply = apply;
		exports.buildLabelStudioTaskUrl = buildLabelStudioTaskUrl;
		exports.inject = inject;
		exports.isLabelStudioBridgeFailure = isLabelStudioBridgeFailure;
		exports.isLabelStudioPluginFailure = isLabelStudioPluginFailure;
		exports.isLabelStudioTransportUnknown = isLabelStudioTransportUnknown;
		exports.parseLabelStudioTargetInput = parseLabelStudioTargetInput;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
