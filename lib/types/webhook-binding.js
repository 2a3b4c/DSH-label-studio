/** Safe mapping from Label Studio Webhooks to existing Session bindings. */
/** Applies deletion events and otherwise confirms only pre-existing exact bindings. */
export class LabelStudioWebhookBindingCoordinator {
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
            case 'PROJECT_DELETED':
                return this.publishChanges(await this.store.reconcileProjectDeleted(event.projectId));
            case 'TASK_DELETED':
            case 'TASKS_DELETED':
                return this.publishChanges(await this.store.reconcileTasksDeleted(event.projectId, event.taskIds));
            case 'ANNOTATION_DELETED':
            case 'ANNOTATIONS_DELETED':
                return { kind: 'reconciled-deletion', affectedSessionIds: [] };
            case 'ANNOTATION_CREATED':
            case 'ANNOTATIONS_CREATED':
            case 'ANNOTATION_UPDATED': {
                const existing = this.matchingSessionIds((binding) => {
                    const target = binding.target;
                    return target?.kind === 'task'
                        && target.projectId === event.projectId
                        && event.items.some(item => item.taskId === target.taskId);
                });
                if (existing.length > 0)
                    return { kind: 'matched-existing', sessionIds: existing };
                return this.bindAnnotationFromLivePage(event, signal);
            }
            case 'PROJECT_CREATED':
            case 'PROJECT_UPDATED':
            case 'TASK_CREATED':
            case 'TASKS_CREATED':
                return this.match(binding => binding.target?.projectId === event.projectId);
            default:
                return assertNever(event);
        }
    }
    match(predicate) {
        const sessionIds = this.matchingSessionIds(predicate);
        if (sessionIds.length > 0)
            return { kind: 'matched-existing', sessionIds };
        this.broker.publishWebhookUnassigned();
        return { kind: 'unassigned', reason: 'no-matching-binding' };
    }
    matchingSessionIds(predicate) {
        return this.store.listBindings().filter(item => predicate(item.binding)).map(item => item.sessionId);
    }
    async bindAnnotationFromLivePage(event, signal) {
        const livePages = this.livePages;
        if (livePages === undefined)
            return this.unassigned();
        const inspected = await Promise.all(livePages.sessionIds().map(async (sessionId) => {
            try {
                const identity = await livePages.resolveIdentity(sessionId, signal);
                const page = await livePages.currentPages.request(identity, livePages.timeoutMs, signal);
                return { identity, page };
            }
            catch {
                return undefined;
            }
        }));
        const matches = inspected.filter((item) => {
            if (item === undefined || item.page.view !== 'task' || item.page.projectId !== event.projectId)
                return false;
            const taskId = item.page.taskId;
            return event.items.some(eventItem => eventItem.taskId === taskId);
        });
        if (matches.length !== 1)
            return this.unassigned();
        const match = matches[0];
        const annotation = event.items.find(item => item.taskId === match.page.taskId);
        const before = this.store.readBinding(match.identity);
        const outcome = await this.store.commitBinding(match.identity, {
            expectedRevision: before.revision,
            target: {
                kind: 'task',
                projectId: event.projectId,
                taskId: match.page.taskId,
                annotationId: annotation.annotationId,
            },
            source: 'webhook',
        });
        if (outcome.kind === 'conflict')
            return this.unassigned();
        this.broker.publishBindingChanged(match.identity.sessionId, outcome.snapshot);
        return { kind: 'bound-from-live-page', sessionId: match.identity.sessionId };
    }
    unassigned() {
        this.broker.publishWebhookUnassigned();
        return { kind: 'unassigned', reason: 'no-matching-binding' };
    }
    publishChanges(changes) {
        for (const change of changes)
            this.broker.publishBindingChanged(change.sessionId, change.after);
        return { kind: 'reconciled-deletion', affectedSessionIds: changes.map(change => change.sessionId) };
    }
}
function assertNever(value) {
    throw new Error(`label-studio: unsupported webhook event ${String(value)}`);
}
//# sourceMappingURL=webhook-binding.js.map