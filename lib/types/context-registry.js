/** Session-scoped ownership and target state for the Label Studio browser surface. */
import { randomUUID } from 'node:crypto';
import { labelStudioContextLeaseId } from "./context-types.js";
/** Domain failure raised by the synchronous context state machine. */
export class LabelStudioContextError extends Error {
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
        this.name = 'LabelStudioContextError';
    }
}
function nonNegativeInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new LabelStudioContextError('invalid-request', `${name} must be a non-negative safe integer`);
    }
    return value;
}
function snapshotTarget(target) {
    return Object.freeze(target.annotationId === undefined
        ? { projectId: target.projectId, taskId: target.taskId }
        : { projectId: target.projectId, taskId: target.taskId, annotationId: target.annotationId });
}
function targetsEqual(left, right) {
    return left.projectId === right.projectId
        && left.taskId === right.taskId
        && left.annotationId === right.annotationId;
}
function snapshotState(state) {
    switch (state.phase) {
        case 'vacant':
            return Object.freeze({ phase: 'vacant', targetRevision: state.targetRevision });
        case 'reserved':
            return Object.freeze({
                phase: 'reserved',
                targetRevision: state.targetRevision,
                reservation: Object.freeze({ ...state.reservation }),
            });
        case 'committed':
            return Object.freeze({
                phase: 'committed',
                targetRevision: state.targetRevision,
                target: snapshotTarget(state.target),
            });
    }
}
/** Owns one expiring Label Studio browser lease per DSH Session. */
export class LabelStudioContextRegistry {
    leaseTtlMs;
    clock;
    bySession = new Map();
    byLease = new Map();
    lastGeneration = new Map();
    listeners = new Set();
    deletingSessions = new Set();
    disposed = false;
    /**
     * Create an empty registry.
     * @param leaseTtlMs - positive safe-integer lifetime applied by open and renew.
     * @param clock - epoch-millisecond clock used for deterministic expiry.
     */
    constructor(leaseTtlMs, clock = Date.now) {
        this.leaseTtlMs = leaseTtlMs;
        this.clock = clock;
        if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 0) {
            throw new TypeError('leaseTtlMs must be a positive safe integer');
        }
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
        if (this.deletingSessions.has(sessionId)) {
            throw new LabelStudioContextError('invalid-request', 'Session context is being deleted');
        }
        nonNegativeInteger(replayBaseline, 'replayBaseline');
        const current = this.recordForSession(sessionId);
        const now = this.clock();
        if (current !== undefined) {
            if (current.sourceId !== sourceId) {
                const retryAfterMs = Math.max(1, Math.ceil(current.expiresAt - now));
                throw new LabelStudioContextError('lease-conflict', 'another browser source owns this Session', retryAfterMs);
            }
            current.expiresAt = now + this.leaseTtlMs;
            return this.openSnapshot(current);
        }
        const priorGeneration = this.lastGeneration.get(sessionId) ?? 0;
        if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
            throw new LabelStudioContextError('invalid-request', 'lease generation is exhausted');
        }
        const generation = priorGeneration + 1;
        const record = {
            sessionId,
            sourceId,
            leaseId: labelStudioContextLeaseId(randomUUID()),
            generation,
            replayBaseline,
            expiresAt: now + this.leaseTtlMs,
            context: Object.freeze({ phase: 'vacant', targetRevision: 0 }),
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
        nonNegativeInteger(expectedTargetRevision, 'expectedTargetRevision');
        const prior = record.browserReceipt;
        if (prior !== undefined && navigationSequence <= prior.navigationSequence) {
            if (prior.kind === 'reserve'
                && navigationSequence === prior.navigationSequence
                && expectedTargetRevision === prior.expectedTargetRevision) {
                return this.reservationSnapshot(record, prior.targetRevision, navigationSequence);
            }
            throw new LabelStudioContextError('stale-revision', 'browser navigation sequence is stale');
        }
        if (expectedTargetRevision !== record.context.targetRevision) {
            throw new LabelStudioContextError('stale-revision', 'target revision compare-and-swap failed');
        }
        const targetRevision = this.nextRevision(record.context.targetRevision);
        record.context = Object.freeze({
            phase: 'reserved',
            targetRevision,
            reservation: Object.freeze({ kind: 'browser', navigationSequence }),
        });
        record.browserReceipt = Object.freeze({
            kind: 'reserve', navigationSequence, expectedTargetRevision, targetRevision,
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
        nonNegativeInteger(expectedTargetRevision, 'expectedTargetRevision');
        const prior = record.browserReceipt;
        if (prior !== undefined && navigationSequence <= prior.navigationSequence) {
            if (prior.kind === 'clear'
                && navigationSequence === prior.navigationSequence
                && expectedTargetRevision === prior.expectedTargetRevision) {
                return Object.freeze({ phase: 'vacant', targetRevision: prior.targetRevision });
            }
            throw new LabelStudioContextError('stale-revision', 'browser navigation sequence is stale');
        }
        if (expectedTargetRevision !== record.context.targetRevision) {
            throw new LabelStudioContextError('stale-revision', 'target revision compare-and-swap failed');
        }
        const targetRevision = this.nextRevision(record.context.targetRevision);
        record.context = Object.freeze({ phase: 'vacant', targetRevision });
        record.browserReceipt = Object.freeze({
            kind: 'clear', navigationSequence, expectedTargetRevision, targetRevision,
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
        if (record.context.phase === 'reserved') {
            if (record.context.reservation.kind === 'focus'
                && record.context.reservation.correlationId === correlationId) {
                return this.reservationSnapshot(record, record.context.targetRevision);
            }
            throw new LabelStudioContextError('focus-conflict', 'another target reservation is pending');
        }
        const targetRevision = this.nextRevision(record.context.targetRevision);
        record.context = Object.freeze({
            phase: 'reserved',
            targetRevision,
            reservation: Object.freeze({ kind: 'focus', correlationId }),
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
        nonNegativeInteger(targetRevision, 'targetRevision');
        if (record.context.phase === 'committed' && record.context.targetRevision === targetRevision) {
            if (!targetsEqual(record.context.target, target)) {
                throw new LabelStudioContextError('stale-revision', 'target revision is already committed');
            }
            return this.activeSnapshot(record);
        }
        if (record.context.phase !== 'reserved' || record.context.targetRevision !== targetRevision) {
            throw new LabelStudioContextError('stale-revision', 'target reservation is not current');
        }
        record.context = Object.freeze({
            phase: 'committed',
            targetRevision,
            target: snapshotTarget(target),
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
        if (record.context.phase === 'committed')
            return snapshotState(record.context);
        if (record.context.phase !== 'reserved'
            || record.context.reservation.kind !== 'focus'
            || record.context.reservation.correlationId !== correlationId) {
            throw new LabelStudioContextError('focus-not-found', 'focus reservation is not current');
        }
        record.context = Object.freeze({ phase: 'vacant', targetRevision: record.context.targetRevision });
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
        if (record === undefined || record.generation !== generation)
            return false;
        this.remove(record);
        return true;
    }
    /**
     * Read a Session's current lease, including a vacant or reserved target.
     * @param sessionId - persistent DSH Session identity.
     * @returns the immutable binding, or undefined after close or expiry.
     */
    getLease(sessionId) {
        if (this.disposed)
            return undefined;
        const record = this.recordForSession(sessionId);
        return record === undefined ? undefined : this.bindingSnapshot(record);
    }
    /**
     * Read a Session's committed target while its lease remains live.
     * @param sessionId - persistent DSH Session identity.
     * @returns the immutable active context, or undefined without a committed target.
     */
    getLive(sessionId) {
        if (this.disposed)
            return undefined;
        const record = this.recordForSession(sessionId);
        return record?.context.phase === 'committed' ? this.activeSnapshot(record) : undefined;
    }
    /** Return every current, unexpired Session lease id. */
    sessionIds() {
        if (this.disposed)
            return [];
        return [...this.bySession.keys()].filter(sessionId => this.recordForSession(sessionId) !== undefined);
    }
    /**
     * Subscribe to authoritative lease removal.
     * @param listener - callback isolated from cleanup and sibling callbacks.
     * @returns an idempotent unsubscribe function.
     */
    onLeaseEnded(listener) {
        this.assertUsable();
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
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
            if (record !== undefined)
                this.remove(record);
            this.lastGeneration.delete(sessionId);
        }
        finally {
            this.deletingSessions.delete(sessionId);
        }
    }
    /** Remove every lease and listener, permanently rejecting later mutations. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        const records = [...this.bySession.values()];
        this.bySession.clear();
        this.byLease.clear();
        this.lastGeneration.clear();
        this.deletingSessions.clear();
        for (const record of records)
            this.notifyEnded(record.sessionId);
        this.listeners.clear();
    }
    assertUsable() {
        if (this.disposed)
            throw new LabelStudioContextError('invalid-request', 'context registry is disposed');
    }
    nextRevision(current) {
        if (current >= Number.MAX_SAFE_INTEGER) {
            throw new LabelStudioContextError('invalid-request', 'target revision is exhausted');
        }
        return current + 1;
    }
    recordForSession(sessionId) {
        const record = this.bySession.get(sessionId);
        if (record !== undefined && this.clock() >= record.expiresAt) {
            this.remove(record);
            return undefined;
        }
        return record;
    }
    recordForLease(leaseId) {
        const record = this.byLease.get(leaseId);
        if (record !== undefined && this.clock() >= record.expiresAt) {
            this.remove(record);
            return undefined;
        }
        return record;
    }
    requireLease(leaseId, generation) {
        this.assertUsable();
        nonNegativeInteger(generation, 'generation');
        const record = this.recordForLease(leaseId);
        if (record === undefined)
            throw new LabelStudioContextError('lease-expired', 'lease is absent or expired');
        if (record.generation !== generation) {
            throw new LabelStudioContextError('stale-generation', 'lease generation is stale');
        }
        return record;
    }
    remove(record) {
        if (this.bySession.get(record.sessionId) !== record)
            return;
        this.bySession.delete(record.sessionId);
        this.byLease.delete(record.leaseId);
        this.notifyEnded(record.sessionId);
    }
    notifyEnded(sessionId) {
        for (const listener of [...this.listeners]) {
            try {
                listener(sessionId);
            }
            catch (error) {
                console.error('[label-studio] lease-ended listener threw:', error);
            }
        }
    }
    leaseSnapshot(record) {
        return Object.freeze({
            leaseId: record.leaseId,
            generation: record.generation,
            expiresAt: record.expiresAt,
        });
    }
    openSnapshot(record) {
        return Object.freeze({ lease: this.leaseSnapshot(record), replayBaseline: record.replayBaseline });
    }
    reservationSnapshot(record, targetRevision, navigationSequence) {
        return Object.freeze(navigationSequence === undefined
            ? { lease: this.leaseSnapshot(record), targetRevision }
            : { lease: this.leaseSnapshot(record), targetRevision, navigationSequence });
    }
    bindingSnapshot(record) {
        return Object.freeze({
            sessionId: record.sessionId,
            sourceId: record.sourceId,
            lease: this.leaseSnapshot(record),
            context: snapshotState(record.context),
        });
    }
    activeSnapshot(record) {
        if (record.context.phase !== 'committed') {
            throw new LabelStudioContextError('stale-revision', 'target is not committed');
        }
        return Object.freeze({
            sessionId: record.sessionId,
            sourceId: record.sourceId,
            leaseId: record.leaseId,
            generation: record.generation,
            targetRevision: record.context.targetRevision,
            expiresAt: record.expiresAt,
            target: snapshotTarget(record.context.target),
        });
    }
}
//# sourceMappingURL=context-registry.js.map