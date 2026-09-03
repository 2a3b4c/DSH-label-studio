/** Browser state machine for Session-bound controlled Label Studio pages. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { isLabelStudioPluginFailure, isLabelStudioTransportUnknown, } from "./context-bridge.js";
import { targetOfPage } from "./page-url.js";
/** Owns the current Session lease, target mutation queue, and event cursors. */
export class LabelStudioContextController {
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
        this.store = createSnapshotStore({
            sourceId,
            navigationSequence: 0,
            targetRevision: 0,
            eventRevision: 0,
            observedEventRevision: 0,
            bufferedEventCount: 0,
            sessionContext: emptySessionContext(),
            sessionContextStatus: 'idle',
            status: 'no-session',
        });
        this.offHost = bridge.onHostChanged(() => { this.hostChanged(); });
    }
    /**
     * Bind the page to the selected DSH Session. This method schedules RPC work and never blocks React.
     * @param sessionId - selected Session, or absent selection.
     */
    bindSession(sessionId) {
        if (this.disposed || this.store.getSnapshot().sessionId === sessionId)
            return;
        const previous = this.store.getSnapshot().lease;
        this.sessionEpoch += 1;
        this.navigationEpoch += 1;
        this.cancelGeneration();
        this.rejectPendingManual('label-studio client: Session changed');
        if (previous !== undefined)
            this.bestEffortClose(previous);
        this.events = [];
        this.page.clearPage();
        this.store.set({
            sourceId: this.store.getSnapshot().sourceId,
            ...(sessionId === undefined ? {} : { sessionId }),
            navigationSequence: 0,
            targetRevision: 0,
            eventRevision: 0,
            observedEventRevision: 0,
            bufferedEventCount: 0,
            sessionContext: emptySessionContext(),
            sessionContextStatus: sessionId === undefined ? 'idle' : 'restoring',
            status: sessionId === undefined ? 'no-session' : 'leasing',
        });
        if (sessionId !== undefined && this.bridge.currentHost() !== undefined)
            this.startOpen();
    }
    /**
     * Reserve, apply, and publish a user-selected target through the serial navigation queue.
     * @param target - parsed controlled target.
     * @returns completion after a deterministic commit or reconciliation.
     */
    selectPage(page) {
        const queued = this.navigationQueue.catch(() => { }).then(() => this.performPageSelection(page));
        this.navigationQueue = queued;
        return queued;
    }
    /**
     * Apply one focus event through the same serial queue as manual navigation.
     * @param event - Host focus request.
     */
    applyFocus(event) {
        const queued = this.navigationQueue.catch(() => { }).then(async () => {
            await this.performFocus(event);
        });
        this.navigationQueue = queued;
        return queued;
    }
    /** Retry the current Session context by reopening its lease. */
    retrySessionContext() {
        if (this.disposed || this.store.getSnapshot().sessionId === undefined)
            return;
        this.expireLease(false);
        this.startOpen();
    }
    /** Reload the current controlled page only. */
    reload() { this.page.reloadPage(); }
    /** Stop listeners and requests before returning; lease closure remains best effort. */
    dispose() {
        if (this.disposed)
            return Promise.resolve();
        this.disposed = true;
        this.sessionEpoch += 1;
        this.connectionEpoch += 1;
        this.navigationEpoch += 1;
        this.offHost();
        this.cancelGeneration();
        this.rejectPendingManual('label-studio client: disposed');
        const lease = this.store.getSnapshot().lease;
        if (lease !== undefined)
            this.bestEffortClose(lease);
        this.events = [];
        this.page.clearPage();
        return Promise.resolve();
    }
    epoch() { return { session: this.sessionEpoch, connection: this.connectionEpoch }; }
    current(epoch) {
        return !this.disposed && epoch.session === this.sessionEpoch && epoch.connection === this.connectionEpoch;
    }
    hostChanged() {
        if (this.disposed)
            return;
        this.connectionEpoch += 1;
        this.cancelGeneration();
        const snapshot = this.store.getSnapshot();
        if (snapshot.sessionId === undefined || this.bridge.currentHost() === undefined)
            return;
        if (snapshot.lease !== undefined && snapshot.lease.expiresAt > this.clock()) {
            this.patch({ status: snapshot.target === undefined ? 'lease-active' : 'reconciling' });
            this.startWait(snapshot.lease);
            return;
        }
        this.expireLease();
        this.startOpen();
    }
    startOpen() {
        if (this.disposed || this.openInFlight || this.bridge.currentHost() === undefined)
            return;
        const snapshot = this.store.getSnapshot();
        if (snapshot.sessionId === undefined)
            return;
        this.clearRetry();
        const epoch = this.epoch();
        const abort = new AbortController();
        this.openAbort = abort;
        this.openInFlight = true;
        this.patch({ status: 'leasing', sessionContextStatus: 'restoring', error: undefined });
        void this.bridge.openLease(snapshot.sessionId, snapshot.sourceId, abort.signal).then((result) => {
            if (!this.current(epoch))
                return;
            this.openInFlight = false;
            this.openAbort = undefined;
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
                sessionContextStatus: 'restoring',
                status: 'syncing',
                error: undefined,
            });
            const restore = this.navigationQueue.catch(() => { }).then(() => this.performPageSelection(result.sessionContext.page, true));
            this.navigationQueue = restore;
            void restore.catch(() => { }).finally(() => {
                if (this.current(epoch))
                    this.startWait(result.lease);
            });
        }).catch((error) => {
            if (!this.current(epoch))
                return;
            this.openInFlight = false;
            this.openAbort = undefined;
            if (isLabelStudioPluginFailure(error) && error.error.code === 'lease-conflict') {
                const retry = error.error.details.retryAfterMs;
                this.patch({ status: 'lease-conflict', error: error.error.message });
                this.schedule(() => { this.startOpen(); }, retry);
                return;
            }
            if (isLabelStudioTransportUnknown(error)) {
                this.patch({ status: 'reconciling', error: 'Label Studio lease open result is unknown' });
                this.schedule(() => { this.startOpen(); }, this.options.contextOpenRetryMs);
                return;
            }
            if (isLabelStudioPluginFailure(error) && error.error.code === 'session-not-found') {
                this.patch({ status: 'error', sessionContextStatus: 'unavailable', error: 'The selected DSH Session no longer exists' });
                return;
            }
            if (!isCancellation(error))
                this.patch({ status: 'error', sessionContextStatus: 'unavailable', error: bridgeMessage(error) });
        });
    }
    startWait(lease) {
        if (this.disposed || this.waitAbort !== undefined || this.bridge.currentHost() === undefined)
            return;
        const epoch = this.epoch();
        const afterRevision = this.store.getSnapshot().observedEventRevision;
        const abort = new AbortController();
        this.waitAbort = abort;
        void this.bridge.waitEvents(lease, afterRevision, abort.signal).then(async (batch) => {
            if (!this.current(epoch) || this.waitAbort !== abort)
                return;
            this.waitAbort = undefined;
            await this.acceptBatch(batch, epoch);
            if (!this.current(epoch))
                return;
            const nextLease = this.store.getSnapshot().lease;
            if (nextLease !== undefined)
                this.startWait(nextLease);
        }).catch((error) => {
            if (!this.current(epoch) || this.waitAbort !== abort)
                return;
            this.waitAbort = undefined;
            if (isCancellation(error))
                return;
            if (isLabelStudioPluginFailure(error)
                && ['lease-expired', 'stale-generation', 'session-not-found'].includes(error.error.code)) {
                this.expireLease(error.error.code !== 'session-not-found');
                this.startOpen();
                return;
            }
            this.patch({ status: 'reconciling', error: bridgeMessage(error) });
            this.schedule(() => {
                const current = this.store.getSnapshot().lease;
                if (current !== undefined)
                    this.startWait(current);
            }, this.options.contextOpenRetryMs);
        });
    }
    async acceptBatch(batch, epoch) {
        if (!this.current(epoch))
            return;
        const snapshot = this.store.getSnapshot();
        if (snapshot.lease === undefined
            || batch.lease.leaseId !== snapshot.lease.leaseId
            || batch.lease.generation !== snapshot.lease.generation)
            return;
        if (batch.resetRequired) {
            this.events = [];
            this.store.set({
                ...snapshot, lease: batch.lease,
                eventRevision: batch.latestRevision,
                observedEventRevision: batch.latestRevision,
                bufferedEventCount: 0,
            });
            if (snapshot.target !== undefined)
                this.page.reloadPage();
        }
        else {
            const known = new Set(this.events.map(event => event.eventRevision));
            for (const event of batch.events) {
                if (event.eventRevision > snapshot.eventRevision && !known.has(event.eventRevision)) {
                    this.events.push(event);
                    known.add(event.eventRevision);
                }
            }
            this.events.sort((a, b) => a.eventRevision - b.eventRevision);
            this.patch({ lease: batch.lease, observedEventRevision: batch.latestRevision, bufferedEventCount: this.events.length });
        }
        if (this.events.length > this.options.eventHistorySize) {
            this.rebuildAfterOverflow(batch.lease);
            return;
        }
        await this.reconcileManual(batch.context, epoch);
        if (!this.current(epoch))
            return;
        await this.processEvents(batch.context, epoch);
        if (!this.current(epoch))
            return;
        if (this.events.length === 0 && this.pendingManual === undefined)
            this.mergeContext(batch.context);
    }
    async processEvents(context, epoch) {
        while (this.events.length > 0 && this.current(epoch)) {
            const event = this.events[0];
            if (event === undefined)
                return;
            if (event.kind === 'task-changed') {
                if (this.store.getSnapshot().target?.taskId === event.taskId)
                    this.page.reloadPage();
                this.commitEvent(event.eventRevision);
                continue;
            }
            if (context.targetRevision === event.targetRevision && context.phase === 'committed'
                && sameTarget(context.target, event.target)) {
                this.patch({
                    target: context.target,
                    targetRevision: context.targetRevision,
                    sessionContext: focusSnapshot(this.store.getSnapshot().sessionContext, event, this.clock()),
                    sessionContextStatus: 'ready',
                    status: 'synced',
                    error: undefined,
                });
                this.commitEvent(event.eventRevision);
                continue;
            }
            if (context.targetRevision === event.targetRevision && context.phase === 'vacant') {
                this.page.clearPage();
                this.patch({ target: undefined, targetRevision: context.targetRevision, status: 'no-task' });
                this.commitEvent(event.eventRevision);
                continue;
            }
            const settled = await this.performFocus(event);
            if (!settled)
                return;
            this.commitEvent(event.eventRevision);
        }
    }
    async performFocus(event) {
        const snapshot = this.store.getSnapshot();
        const lease = snapshot.lease;
        if (lease === undefined || event.targetRevision < snapshot.targetRevision)
            return true;
        if (!event.committed && this.clock() >= event.deadlineAt)
            return true;
        const epoch = this.epoch();
        const navigationEpoch = ++this.navigationEpoch;
        this.page.setOpen(true);
        this.patch({ targetRevision: event.targetRevision, status: 'syncing', error: undefined });
        try {
            await this.page.applyPage(pageOfTarget(event.target));
            if (!this.currentNavigation(epoch, navigationEpoch))
                return false;
            const committed = await this.bridge.acknowledgeFocus(lease, event.correlationId, event.targetRevision, event.target, this.generationSignal());
            if (!this.currentNavigation(epoch, navigationEpoch))
                return false;
            this.patch({
                lease: leaseFromContext(committed),
                target: committed.target,
                targetRevision: committed.targetRevision,
                sessionContext: focusSnapshot(this.store.getSnapshot().sessionContext, event, this.clock()),
                sessionContextStatus: 'ready',
                status: 'synced',
                error: undefined,
            });
            return true;
        }
        catch (error) {
            if (!this.current(epoch))
                return false;
            if (isLabelStudioTransportUnknown(error)) {
                this.patch({ status: 'reconciling', error: 'Focus acknowledgement result is unknown' });
                return false;
            }
            this.page.clearPage();
            this.patch({ target: undefined, sessionContextStatus: contextFailureStatus(error), status: 'error', error: bridgeMessage(error) });
            return true;
        }
    }
    async performPageSelection(page, restoring = false) {
        const snapshot = this.store.getSnapshot();
        const lease = snapshot.lease;
        if (lease === undefined)
            throw new Error('label-studio client: no active page lease');
        const epoch = this.epoch();
        const navigationEpoch = ++this.navigationEpoch;
        const sequence = (restoring && page.view !== 'task'
            ? snapshot.navigationSequence
            : Number(snapshot.navigationSequence) + 1);
        this.page.setOpen(true);
        this.patch({
            navigationSequence: sequence,
            sessionContextStatus: restoring ? 'restoring' : 'committing',
            status: 'syncing',
            error: undefined,
        });
        if (page.view !== 'task') {
            try {
                await this.page.applyPage(page);
                if (!this.currentNavigation(epoch, navigationEpoch))
                    throw new Error('label-studio client: navigation superseded');
                if (restoring) {
                    this.patch({ target: undefined, sessionContextStatus: 'ready', status: 'no-task', error: undefined });
                    return;
                }
                const committed = await this.bridge.commitPage(lease, sequence, snapshot.sessionContext.revision, page, this.generationSignal());
                if (!this.currentNavigation(epoch, navigationEpoch))
                    throw new Error('label-studio client: navigation superseded');
                this.patch({
                    target: undefined,
                    sessionContext: committed,
                    sessionContextStatus: 'ready',
                    status: 'no-task',
                    error: undefined,
                });
                return;
            }
            catch (error) {
                if (this.current(epoch)) {
                    this.patch({ sessionContextStatus: contextFailureStatus(error), status: 'error', error: bridgeMessage(error) });
                }
                throw toError(error);
            }
        }
        await this.performTaskSelection(page, lease, sequence, snapshot, epoch, navigationEpoch);
    }
    async performTaskSelection(page, lease, sequence, snapshot, epoch, navigationEpoch) {
        const target = targetOfPage(page);
        const deferred = makeDeferred();
        let reservation;
        try {
            reservation = await this.bridge.reserveTarget(lease, sequence, snapshot.targetRevision, this.generationSignal());
        }
        catch (error) {
            if (!this.currentNavigation(epoch, navigationEpoch))
                throw new Error('label-studio client: navigation superseded');
            if (isLabelStudioTransportUnknown(error)) {
                this.pendingManual = {
                    phase: 'reserve', lease, sequence, expectedRevision: snapshot.targetRevision,
                    target, page, expectedSessionContextRevision: snapshot.sessionContext.revision,
                    deadline: lease.expiresAt, deferred,
                };
                this.patch({ status: 'reconciling', error: 'Target reservation result is unknown' });
                return deferred.promise;
            }
            this.page.clearPage();
            this.patch({ target: undefined, sessionContextStatus: contextFailureStatus(error), status: 'error', error: bridgeMessage(error) });
            throw toError(error);
        }
        if (!this.currentNavigation(epoch, navigationEpoch))
            throw new Error('label-studio client: navigation superseded');
        await this.applyAndPublish({
            phase: 'publish', lease: reservation.lease, sequence,
            expectedRevision: snapshot.targetRevision, target, page,
            expectedSessionContextRevision: snapshot.sessionContext.revision,
            targetRevision: reservation.targetRevision, deadline: lease.expiresAt, deferred,
        }, epoch, navigationEpoch);
    }
    async applyAndPublish(pending, epoch, navigationEpoch) {
        try {
            this.page.setOpen(true);
            await this.page.applyPage(pending.page);
            if (!this.currentNavigation(epoch, navigationEpoch))
                throw new Error('label-studio client: navigation superseded');
            const committed = await this.bridge.publishTarget(pending.lease, requiredRevision(pending), pending.target, this.generationSignal());
            if (!this.currentNavigation(epoch, navigationEpoch))
                throw new Error('label-studio client: navigation superseded');
            pending.phase = 'commit';
            await this.commitPending(pending, committed, epoch, navigationEpoch);
        }
        catch (error) {
            if (!this.current(epoch)) {
                pending.deferred.reject(new Error('label-studio client: navigation superseded'));
                return;
            }
            if (isLabelStudioTransportUnknown(error)) {
                this.pendingManual = pending;
                this.patch({ status: 'reconciling', error: 'Target publish result is unknown' });
                await pending.deferred.promise;
                return;
            }
            this.pendingManual = undefined;
            this.page.clearPage();
            this.patch({ target: undefined, sessionContextStatus: contextFailureStatus(error), status: 'error', error: bridgeMessage(error) });
            const failure = toError(error);
            pending.deferred.reject(failure);
            throw failure;
        }
    }
    async reconcileManual(context, epoch) {
        const pending = this.pendingManual;
        if (pending === undefined || !this.current(epoch))
            return;
        if (this.clock() >= pending.deadline) {
            this.pendingManual = undefined;
            this.page.clearPage();
            pending.deferred.reject(new Error('label-studio client: reconciliation deadline expired'));
            this.expireLease();
            this.schedule(() => { this.startOpen(); }, this.options.contextOpenRetryMs);
            return;
        }
        if (context.phase === 'committed' && sameTarget(context.target, pending.target)) {
            await this.commitPending(pending, {
                sessionId: this.store.getSnapshot().sessionId,
                sourceId: this.store.getSnapshot().sourceId,
                ...pending.lease,
                targetRevision: context.targetRevision,
                target: context.target,
            }, epoch, this.navigationEpoch);
            return;
        }
        if (context.phase === 'reserved' && context.reservation.kind === 'browser'
            && context.reservation.navigationSequence === pending.sequence) {
            pending.phase = 'publish';
            pending.targetRevision = context.targetRevision;
            const navigationEpoch = this.navigationEpoch;
            await this.applyAndPublish(pending, epoch, navigationEpoch);
            return;
        }
        if (pending.phase === 'reserve' && context.targetRevision === pending.expectedRevision) {
            try {
                const reservation = await this.bridge.reserveTarget(pending.lease, pending.sequence, pending.expectedRevision, this.generationSignal());
                pending.phase = 'publish';
                pending.targetRevision = reservation.targetRevision;
                await this.applyAndPublish(pending, epoch, this.navigationEpoch);
            }
            catch (error) {
                if (!isLabelStudioTransportUnknown(error)) {
                    this.pendingManual = undefined;
                    this.page.clearPage();
                    pending.deferred.reject(toError(error));
                }
            }
        }
    }
    async commitPending(pending, active, epoch, navigationEpoch) {
        try {
            const sessionContext = await this.bridge.commitPage(pending.lease, pending.sequence, pending.expectedSessionContextRevision, pending.page, this.generationSignal());
            if (!this.currentNavigation(epoch, navigationEpoch))
                throw new Error('label-studio client: navigation superseded');
            this.pendingManual = undefined;
            this.patch({
                lease: leaseFromContext(active),
                target: active.target,
                targetRevision: active.targetRevision,
                sessionContext,
                sessionContextStatus: 'ready',
                status: 'synced',
                error: undefined,
            });
            pending.deferred.resolve();
        }
        catch (error) {
            if (!this.current(epoch)) {
                pending.deferred.reject(new Error('label-studio client: navigation superseded'));
                return;
            }
            if (isLabelStudioTransportUnknown(error)) {
                this.pendingManual = pending;
                this.patch({ sessionContextStatus: 'unavailable', status: 'reconciling', error: 'Page commit result is unknown' });
                await pending.deferred.promise;
                return;
            }
            this.pendingManual = undefined;
            this.patch({ sessionContextStatus: contextFailureStatus(error), status: 'error', error: bridgeMessage(error) });
            const failure = toError(error);
            pending.deferred.reject(failure);
            throw failure;
        }
    }
    mergeContext(context) {
        const snapshot = this.store.getSnapshot();
        if (context.targetRevision < snapshot.targetRevision)
            return;
        if (context.phase === 'committed') {
            this.patch({ target: context.target, targetRevision: context.targetRevision, status: 'synced', error: undefined });
        }
        else if (context.targetRevision > snapshot.targetRevision || snapshot.target === undefined) {
            this.patch({ target: undefined, targetRevision: context.targetRevision, status: context.phase === 'reserved' ? 'syncing' : 'no-task' });
        }
    }
    commitEvent(revision) {
        const first = this.events[0];
        if (first?.eventRevision === revision)
            this.events.shift();
        this.patch({ eventRevision: revision, bufferedEventCount: this.events.length });
    }
    rebuildAfterOverflow(lease) {
        this.events = [];
        this.page.clearPage();
        this.patch({ lease: undefined, target: undefined, bufferedEventCount: 0, status: 'reconciling', error: 'Label Studio event buffer exceeded its configured limit' });
        const epoch = this.epoch();
        const signal = AbortSignal.timeout(this.options.contextCloseTimeoutMs);
        this.schedule(() => { this.startOpen(); }, Math.max(this.options.contextOpenRetryMs, lease.expiresAt - this.clock()));
        void this.bridge.closeLease(lease, signal).then(() => {
            if (!this.current(epoch))
                return;
            this.clearRetry();
            this.startOpen();
        }).catch(() => {
            // The expiry timer owns recovery when close cannot determine its outcome.
        });
    }
    expireLease(preserveTarget = true) {
        this.waitAbort?.abort();
        this.waitAbort = undefined;
        this.rejectPendingManual('label-studio client: lease expired');
        this.events = [];
        if (!preserveTarget)
            this.page.clearPage();
        this.patch({
            lease: undefined,
            ...(preserveTarget ? {} : { target: undefined }),
            bufferedEventCount: 0,
            status: 'lease-expired',
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
        void this.bridge.closeLease(lease, signal).catch(() => { });
    }
    cancelGeneration() {
        this.waitAbort?.abort();
        this.waitAbort = undefined;
        this.openAbort?.abort();
        this.openAbort = undefined;
        this.openInFlight = false;
        this.mutationAbort.abort();
        this.mutationAbort = new AbortController();
        this.clearRetry();
    }
    schedule(callback, delay) {
        this.clearRetry();
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (!this.disposed)
                callback();
        }, Math.min(2_147_483_647, Math.max(1, delay)));
    }
    clearRetry() {
        if (this.retryTimer !== undefined)
            clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
    }
    rejectPendingManual(message) {
        this.pendingManual?.deferred.reject(new Error(message));
        this.pendingManual = undefined;
    }
    patch(values) {
        this.store.set({ ...this.store.getSnapshot(), ...values });
    }
}
function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    void promise.catch(() => { });
    return { promise, resolve, reject };
}
function isCancellation(error) {
    return typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'cancelled';
}
function bridgeMessage(error) {
    if (isLabelStudioPluginFailure(error))
        return error.error.message;
    if (typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'framework'
        && 'error' in error && typeof error.error === 'object' && error.error !== null && 'message' in error.error) {
        return String(error.error.message);
    }
    return error instanceof Error ? error.message : 'Label Studio synchronization failed';
}
function toError(error) { return error instanceof Error ? error : new Error(bridgeMessage(error)); }
function sameTarget(left, right) {
    return left.projectId === right.projectId && left.taskId === right.taskId && left.annotationId === right.annotationId;
}
function leaseFromContext(context) {
    return { leaseId: context.leaseId, generation: context.generation, expiresAt: context.expiresAt };
}
function requiredRevision(pending) {
    if (pending.targetRevision === undefined)
        throw new Error('label-studio client: missing target reservation revision');
    return pending.targetRevision;
}
function emptySessionContext() {
    return { page: { view: 'projects' }, recentProjects: [], revision: 0 };
}
function pageOfTarget(target) {
    return {
        view: 'task',
        projectId: target.projectId,
        taskId: target.taskId,
        ...(target.annotationId === undefined ? {} : { annotationId: target.annotationId }),
    };
}
function samePage(left, right) {
    if (left.view !== right.view)
        return false;
    if (left.view === 'projects' || right.view === 'projects')
        return true;
    if (left.projectId !== right.projectId)
        return false;
    if (left.view === 'project' || right.view === 'project')
        return true;
    return left.taskId === right.taskId && left.annotationId === right.annotationId;
}
function focusSnapshot(current, event, visitedAt) {
    const page = pageOfTarget(event.target);
    if (samePage(current.page, page))
        return current;
    const prior = current.recentProjects.filter(recent => recent.projectId !== page.projectId);
    return {
        page,
        recentProjects: [{
                projectId: page.projectId,
                lastTaskId: page.taskId,
                lastVisitedAt: visitedAt,
                availability: 'available',
            }, ...prior],
        revision: event.expectedSessionContextRevision + 1,
    };
}
function contextFailureStatus(error) {
    return isLabelStudioPluginFailure(error) && error.error.code === 'session-context-conflict'
        ? 'conflict'
        : 'unavailable';
}
//# sourceMappingURL=context-state.js.map