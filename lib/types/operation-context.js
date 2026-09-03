/** Resolve one Label Studio operation target from explicit ids, Session state, or the current iframe page. */
/** Stable failure raised when no verified resource satisfies an operation. */
export class LabelStudioOperationContextError extends Error {
    code;
    /**
     * @param code - stable binding selection failure.
     * @param message - sanitized operator-facing explanation.
     */
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'LabelStudioOperationContextError';
    }
}
/** Applies the shared target precedence and commits bindings only after caller-confirmed success. */
export class LabelStudioOperationContextResolver {
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
        if (!Number.isSafeInteger(currentPageTimeoutMs) || currentPageTimeoutMs <= 0) {
            throw new TypeError('currentPageTimeoutMs must be a positive safe integer');
        }
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
        if (selector.mode === 'explicit') {
            const target = await this.resolveExplicit(selector, signal);
            requireLevel(target, requirement);
            return resolved(identity, target, 'explicit', binding.revision);
        }
        if (selector.mode === 'current-page') {
            const target = await this.resolveCurrentPage(identity, requirement, signal);
            return resolved(identity, target, 'current-page', binding.revision);
        }
        if (binding.target !== undefined && satisfies(binding.target, requirement)) {
            await this.verifyTarget(binding.target, signal);
            return resolved(identity, binding.target, 'binding', binding.revision);
        }
        const target = await this.resolveCurrentPage(identity, requirement, signal);
        return resolved(identity, target, 'current-page', binding.revision);
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
            expectedRevision: expectedBindingRevision,
        });
    }
    async resolveExplicit(selector, signal) {
        if (selector.annotationId !== undefined && selector.taskId === undefined) {
            throw mismatch('an explicit annotation requires a task id');
        }
        if (selector.taskId !== undefined) {
            const task = await this.api.getTask(selector.taskId, signal);
            if (selector.projectId !== undefined && selector.projectId !== task.projectId) {
                throw mismatch('the explicit project does not own the requested task');
            }
            return {
                kind: 'task',
                projectId: task.projectId,
                taskId: task.id,
                ...(selector.annotationId === undefined ? {} : { annotationId: selector.annotationId }),
            };
        }
        if (selector.projectId === undefined)
            throw missing('explicit selection requires a project or task id');
        const project = await this.api.getProject(selector.projectId, signal);
        return { kind: 'project', projectId: project.id };
    }
    async resolveCurrentPage(identity, requirement, signal) {
        const page = await this.currentPages.request(identity, this.currentPageTimeoutMs, signal);
        if (page.view === 'projects')
            throw missing('the current Label Studio page has no project target');
        const target = page.view === 'project'
            ? { kind: 'project', projectId: page.projectId }
            : {
                kind: 'task',
                projectId: page.projectId,
                taskId: page.taskId,
                ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
            };
        requireLevel(target, requirement);
        await this.verifyTarget(target, signal);
        return target;
    }
    async verifyTarget(target, signal) {
        if (target.kind === 'project') {
            await this.api.getProject(target.projectId, signal);
            return;
        }
        const task = await this.api.getTask(target.taskId, signal);
        if (task.projectId !== target.projectId) {
            throw mismatch('the selected project does not own the selected task');
        }
    }
}
function resolved(identity, target, source, expectedBindingRevision) {
    return { identity, target, source, expectedBindingRevision };
}
function satisfies(target, requirement) {
    return requirement === 'project' || target.kind === 'task';
}
function requireLevel(target, requirement) {
    if (!satisfies(target, requirement))
        throw mismatch('the selected target does not identify a task');
}
function missing(message) {
    return new LabelStudioOperationContextError('binding-missing', message);
}
function mismatch(message) {
    return new LabelStudioOperationContextError('binding-target-mismatch', message);
}
//# sourceMappingURL=operation-context.js.map