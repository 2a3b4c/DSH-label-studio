/** Parent-page half of the one-shot Label Studio iframe inspection protocol. */
/** Validates iframe responses and submits exactly one matching Host receipt. */
export class LabelStudioCurrentPageBridge {
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
        if (this.disposed)
            throw new Error('label-studio client: current-page bridge disposed');
        signal.throwIfAborted();
        if (this.clock() >= event.deadlineAt)
            throw new Error('label-studio client: inspection expired');
        if (this.pending !== undefined)
            throw new Error('label-studio client: inspection already active');
        const frame = this.frame();
        if (frame === undefined) {
            await this.rpc.commitInspection(lease, event.inspectionId, { kind: 'unavailable' }, signal);
            return 'unavailable';
        }
        return new Promise((resolve, reject) => {
            const abort = new AbortController();
            const onAbort = () => { this.rejectPending(signal.reason instanceof Error ? signal.reason : new Error('label-studio client: inspection cancelled')); };
            const remaining = Math.max(1, event.deadlineAt - this.clock());
            const timer = setTimeout(() => {
                this.rejectPending(new Error('label-studio client: inspection expired'));
            }, remaining);
            const cleanup = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
                window.removeEventListener('message', this.onMessage);
            };
            this.pending = { event, lease, frame, abort, signal, cleanup, resolve, reject };
            signal.addEventListener('abort', onAbort, { once: true });
            window.addEventListener('message', this.onMessage);
            try {
                frame.postMessage({
                    protocol: this.protocol,
                    capability: this.capability,
                    kind: 'inspect-current-page',
                    inspectionId: event.inspectionId,
                }, this.frameOrigin);
            }
            catch {
                const pending = this.takePending();
                if (pending === undefined)
                    return;
                void this.rpc.commitInspection(lease, event.inspectionId, { kind: 'unavailable' }, signal).then(() => { pending.resolve('unavailable'); }, pending.reject);
            }
        });
    }
    /** Cancel the current Session or Connection generation. */
    cancel() { this.rejectPending(new Error('label-studio client: inspection cancelled')); }
    /** Remove listeners and permanently reject later work. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.rejectPending(new Error('label-studio client: current-page bridge disposed'));
    }
    onMessage = (event) => {
        const pending = this.pending;
        if (pending === undefined || event.source !== pending.frame || event.origin !== this.frameOrigin)
            return;
        const outcome = parseResponse(event.data, this.protocol, String(pending.event.inspectionId));
        if (outcome === undefined)
            return;
        const accepted = this.takePending();
        if (accepted === undefined)
            return;
        void this.rpc.commitInspection(accepted.lease, accepted.event.inspectionId, outcome, AbortSignal.any([accepted.signal, accepted.abort.signal])).then(() => { accepted.resolve(inspectionStatus(outcome)); }, accepted.reject);
    };
    rejectPending(reason) {
        const pending = this.takePending();
        if (pending !== undefined) {
            pending.abort.abort(reason);
            pending.reject(reason);
        }
    }
    takePending() {
        const pending = this.pending;
        if (pending === undefined)
            return undefined;
        this.pending = undefined;
        pending.cleanup();
        return pending;
    }
}
function inspectionStatus(outcome) {
    return outcome.kind === 'page' ? 'ready' : outcome.kind;
}
function parseResponse(value, protocol, inspectionId) {
    if (!record(value)
        || value.protocol !== protocol
        || value.kind !== 'current-page'
        || value.inspectionId !== inspectionId
        || !record(value.outcome))
        return undefined;
    if (value.outcome.kind === 'unsupported')
        return { kind: 'unsupported' };
    if (value.outcome.kind === 'unavailable')
        return { kind: 'unavailable' };
    if (value.outcome.kind !== 'page')
        return undefined;
    const page = parsePage(value.outcome.page);
    return page === undefined ? undefined : { kind: 'page', page };
}
function parsePage(value) {
    if (!record(value))
        return undefined;
    if (value.view === 'projects' && exactKeys(value, ['view']))
        return { view: 'projects' };
    if (value.view === 'project' && exactKeys(value, ['view', 'projectId']) && positive(value.projectId)) {
        return { view: 'project', projectId: value.projectId };
    }
    if (value.view !== 'task'
        || !exactKeys(value, value.annotationId === undefined
            ? ['view', 'projectId', 'taskId']
            : ['view', 'projectId', 'taskId', 'annotationId'])
        || !positive(value.projectId) || !positive(value.taskId)
        || (value.annotationId !== undefined && !positive(value.annotationId)))
        return undefined;
    return {
        view: 'task', projectId: value.projectId, taskId: value.taskId,
        ...(value.annotationId === undefined ? {} : { annotationId: value.annotationId }),
    };
}
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positive(value) { return Number.isSafeInteger(value) && Number(value) > 0; }
function exactKeys(value, keys) {
    return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
//# sourceMappingURL=current-page-bridge.js.map