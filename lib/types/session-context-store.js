/** Durable per-Session Label Studio page store. */
import { labelStudioSessionContextDomainSpec, } from "./session-context-spec.js";
/** Stable failure raised when a durable Session page cannot accept a commit. */
export class LabelStudioSessionContextError extends Error {
    code;
    /**
     * Create a sanitized Session-context failure.
     * @param code - stable RPC-facing failure category.
     */
    constructor(code) {
        super(code === 'session-context-conflict'
            ? 'Label Studio Session context revision conflict'
            : 'Label Studio Session context is unavailable');
        this.code = code;
        this.name = 'LabelStudioSessionContextError';
    }
}
/** Persists Label Studio navigation independently for each DSH Session. */
export class LabelStudioSessionContextStore {
    domain;
    recentProjectLimit;
    clock;
    table;
    tails = new Map();
    closing = false;
    closePromise;
    constructor(domain, recentProjectLimit, clock) {
        this.domain = domain;
        this.recentProjectLimit = recentProjectLimit;
        this.clock = clock;
        this.table = domain.table('sessions');
    }
    /**
     * Open the plugin-owned storage domain.
     * @param ctx - Host context providing the storage-domain service.
     * @param options - History limit and optional Host clock.
     * @returns an open Session context store.
     */
    static async open(ctx, options) {
        if (!Number.isSafeInteger(options.recentProjectLimit) || options.recentProjectLimit <= 0) {
            throw new TypeError('recentProjectLimit must be a positive safe integer');
        }
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
        return record === undefined ? emptySnapshot() : snapshotOf(record);
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
            if (record !== undefined && exactRetry(record.lastCommit, request))
                return snapshotOf(record);
            const current = record === undefined ? emptySnapshot() : snapshotOf(record);
            if (current.revision !== request.expectedSessionContextRevision) {
                throw new LabelStudioSessionContextError('session-context-conflict');
            }
            if (samePage(current.page, request.page))
                return current;
            const revision = current.revision + 1;
            const recentProjects = visitProject(current.recentProjects, request.page, this.clock(), this.recentProjectLimit);
            const next = {
                sessionCreatedAt: identity.createdAt,
                page: request.page,
                recentProjects,
                revision,
                lastCommit: receiptOf(request, revision),
            };
            await this.table.put(identity.sessionId, next);
            return snapshotOf(next);
        });
    }
    /**
     * Mark one known project deleted and clear it if it is the current page.
     * @param identity - Session lifecycle owning the history.
     * @param projectId - Confirmed deleted Label Studio project.
     * @returns the resulting context snapshot.
     */
    markProjectDeleted(identity, projectId) {
        return this.enqueue(identity.sessionId, async () => {
            const record = this.matchingRecord(identity);
            if (record === undefined)
                return emptySnapshot();
            const pageUsesProject = record.page.view !== 'projects' && record.page.projectId === projectId;
            let historyChanged = false;
            const recentProjects = record.recentProjects.map((recent) => {
                if (recent.projectId !== projectId || recent.availability === 'deleted')
                    return recent;
                historyChanged = true;
                return { ...recent, availability: 'deleted' };
            });
            if (!pageUsesProject && !historyChanged)
                return snapshotOf(record);
            const next = {
                sessionCreatedAt: identity.createdAt,
                page: pageUsesProject ? { view: 'projects' } : record.page,
                recentProjects,
                revision: record.revision + 1,
            };
            await this.table.put(identity.sessionId, next);
            return snapshotOf(next);
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
        await Promise.all(this.tails.values());
        await this.domain.close();
    }
    matchingRecord(identity) {
        const record = this.table.get(identity.sessionId);
        return record?.sessionCreatedAt === identity.createdAt ? record : undefined;
    }
    enqueue(sessionId, operation) {
        if (this.closing)
            return Promise.reject(new Error('Label Studio Session context store is closing'));
        const previous = this.tails.get(sessionId) ?? Promise.resolve();
        const result = previous.then(operation);
        const settled = result.then(() => undefined, () => undefined);
        this.tails.set(sessionId, settled);
        void settled.then(() => {
            if (this.tails.get(sessionId) === settled)
                this.tails.delete(sessionId);
        });
        return result;
    }
}
function emptySnapshot() {
    return { page: { view: 'projects' }, recentProjects: [], revision: 0 };
}
function snapshotOf(record) {
    return {
        page: copyPage(record.page),
        recentProjects: record.recentProjects.map(recent => ({ ...recent })),
        revision: record.revision,
    };
}
function copyPage(page) {
    if (page.view === 'projects')
        return { view: 'projects' };
    if (page.view === 'project')
        return { view: 'project', projectId: page.projectId };
    return {
        view: 'task',
        projectId: page.projectId,
        taskId: page.taskId,
        ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
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
function visitProject(current, page, now, limit) {
    if (page.view === 'projects')
        return current.map(recent => ({ ...recent }));
    const previous = current.find(recent => recent.projectId === page.projectId);
    const visited = {
        projectId: page.projectId,
        ...(page.view === 'task'
            ? { lastTaskId: page.taskId }
            : previous?.lastTaskId === undefined
                ? {}
                : { lastTaskId: previous.lastTaskId }),
        lastVisitedAt: now,
        availability: 'available',
    };
    return [visited, ...current.filter(recent => recent.projectId !== page.projectId)].slice(0, limit);
}
function receiptOf(request, committedRevision) {
    return {
        leaseId: request.leaseId,
        generation: request.generation,
        navigationSequence: request.navigationSequence,
        expectedRevision: request.expectedSessionContextRevision,
        committedRevision,
        page: copyPage(request.page),
    };
}
function exactRetry(receipt, request) {
    return receipt !== undefined
        && receipt.leaseId === request.leaseId
        && receipt.generation === request.generation
        && receipt.navigationSequence === request.navigationSequence
        && receipt.expectedRevision === request.expectedSessionContextRevision
        && samePage(receipt.page, request.page);
}
//# sourceMappingURL=session-context-store.js.map