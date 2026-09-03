/** One-shot current-page requests carried by the existing browser event channel. */
import { randomUUID } from 'node:crypto';
import { labelStudioPageInspectionId } from "./context-types.js";
/** Stable failure from one on-demand iframe inspection. */
export class LabelStudioCurrentPageError extends Error {
    code;
    /**
     * @param code - model-independent failure category.
     * @param message - sanitized operator-facing explanation.
     */
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'LabelStudioCurrentPageError';
    }
}
/** Coordinates one concurrent current-page inspection per DSH Session. */
export class LabelStudioCurrentPageBroker {
    registry;
    changes;
    clock;
    states = new Map();
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
        this.unsubscribeLeaseEnded = registry.onLeaseEnded(sessionId => { this.cancelSession(sessionId); });
    }
    /**
     * Ask the current Session iframe for its structured Label Studio route.
     * @param identity - exact persistent Session lifecycle selected by the tool.
     * @param timeoutMs - positive one-shot response deadline.
     * @param signal - caller and plugin cancellation.
     * @returns current structured page without writing a binding.
     */
    request(identity, timeoutMs, signal) {
        if (this.disposed)
            return Promise.reject(unavailable('current-page broker is disposed'));
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
            return Promise.reject(new TypeError('currentPageTimeoutMs must be a positive safe integer'));
        }
        try {
            signal.throwIfAborted();
        }
        catch (error) {
            return Promise.reject(error);
        }
        const binding = this.registry.getLease(identity.sessionId);
        if (binding === undefined)
            return Promise.reject(unavailable('this Session has no active browser lease'));
        const state = this.states.get(identity.sessionId) ?? { pending: undefined, completed: undefined };
        if (state.pending !== undefined) {
            return Promise.reject(unavailable('another current-page inspection is pending'));
        }
        state.completed = undefined;
        this.states.set(identity.sessionId, state);
        const inspectionId = labelStudioPageInspectionId(randomUUID());
        const deadlineAt = this.clock() + timeoutMs;
        const promise = new Promise((resolve, reject) => {
            const onAbort = () => { this.finish(identity.sessionId, inspectionId, () => { reject(signal.reason); }); };
            const timer = setTimeout(() => {
                this.finish(identity.sessionId, inspectionId, () => {
                    reject(new LabelStudioCurrentPageError('current-page-timeout', 'current page inspection timed out'));
                });
            }, timeoutMs);
            const cleanup = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
            };
            state.pending = {
                identity,
                leaseId: binding.lease.leaseId,
                generation: binding.lease.generation,
                inspectionId,
                resolve,
                reject,
                cleanup,
            };
            signal.addEventListener('abort', onAbort, { once: true });
        });
        try {
            this.changes.publishCurrentPageInspection(identity.sessionId, inspectionId, deadlineAt);
        }
        catch (error) {
            const pending = this.states.get(identity.sessionId)?.pending;
            if (pending !== undefined) {
                pending.cleanup();
                state.pending = undefined;
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
        if (binding.sessionId !== identity.sessionId) {
            throw unavailable('inspection response belongs to another Session');
        }
        const state = this.states.get(binding.sessionId);
        const completed = state?.completed;
        if (completed !== undefined && sameCommit(completed, commit))
            return { accepted: true };
        const pending = state?.pending;
        if (state === undefined || pending === undefined
            || pending.leaseId !== commit.leaseId
            || pending.generation !== commit.generation
            || pending.inspectionId !== commit.inspectionId
            || pending.identity.createdAt !== identity.createdAt) {
            throw unavailable('inspection response does not match a pending request');
        }
        pending.cleanup();
        state.pending = undefined;
        state.completed = Object.freeze({
            leaseId: commit.leaseId,
            generation: commit.generation,
            inspectionId: commit.inspectionId,
            outcome: commit.outcome,
        });
        switch (commit.outcome.kind) {
            case 'page':
                pending.resolve(commit.outcome.page);
                break;
            case 'unavailable':
                pending.reject(unavailable('the Label Studio iframe is unavailable'));
                break;
            case 'unsupported':
                pending.reject(new LabelStudioCurrentPageError('current-page-unsupported', 'the current Label Studio route is unsupported'));
                break;
        }
        return { accepted: true };
    }
    /** Cancel a Session's pending request and idempotency receipt. */
    cancelSession(sessionId) {
        const state = this.states.get(sessionId);
        if (state === undefined)
            return;
        this.states.delete(sessionId);
        const pending = state.pending;
        if (pending !== undefined) {
            pending.cleanup();
            pending.reject(unavailable('the browser lease ended'));
        }
    }
    /** Cancel all requests and permanently reject new work. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.unsubscribeLeaseEnded();
        for (const sessionId of [...this.states.keys()])
            this.cancelSession(sessionId);
    }
    finish(sessionId, inspectionId, settle) {
        const state = this.states.get(sessionId);
        if (state?.pending?.inspectionId !== inspectionId)
            return;
        state.pending.cleanup();
        state.pending = undefined;
        settle();
    }
}
function unavailable(message) {
    return new LabelStudioCurrentPageError('current-page-unavailable', message);
}
function sameCommit(completed, commit) {
    if (completed.leaseId !== commit.leaseId
        || completed.generation !== commit.generation
        || completed.inspectionId !== commit.inspectionId
        || completed.outcome.kind !== commit.outcome.kind)
        return false;
    if (completed.outcome.kind !== 'page' || commit.outcome.kind !== 'page')
        return true;
    return JSON.stringify(completed.outcome.page) === JSON.stringify(commit.outcome.page);
}
//# sourceMappingURL=current-page-broker.js.map