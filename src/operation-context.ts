/** Resolve one Label Studio operation target from explicit ids, Session state, or the current iframe page. */

import type {
  LabelStudioAnnotationId,
  LabelStudioBindingCommitOutcome,
  LabelStudioBindingErrorCode,
  LabelStudioBindingSource,
  LabelStudioBindingTarget,
  LabelStudioPageContext,
  LabelStudioProjectId,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'
import type { LabelStudioApi } from './api.ts'
import type { LabelStudioSessionIdentity } from './session-context-spec.ts'
import type { LabelStudioSessionContextStore } from './session-context-store.ts'

/** Label Studio operation categories that share Session target selection. */
export type LabelStudioOperationKind =
  | 'create-project'
  | 'import-tasks'
  | 'create-prediction'
  | 'update-label-config'
  | 'read-active-task'
  | 'focus-task'

/** Minimum Label Studio resource level required by one operation. */
export type LabelStudioTargetRequirement = 'none' | 'project' | 'task'

/** Caller-selected source for resolving one Label Studio resource. */
export type LabelStudioTargetSelector =
  | {
    readonly mode: 'explicit'
    readonly projectId?: LabelStudioProjectId
    readonly taskId?: LabelStudioTaskId
    readonly annotationId?: LabelStudioAnnotationId
  }
  | { readonly mode: 'binding' }
  | { readonly mode: 'current-page' }

/** Verified target candidate and the binding revision observed before resolution. */
export interface LabelStudioResolvedOperationContext {
  readonly identity: LabelStudioSessionIdentity
  readonly target: LabelStudioBindingTarget
  readonly source: 'explicit' | 'binding' | 'current-page'
  readonly expectedBindingRevision: number
}

/** Current-page dependency implemented by the Host browser broker. */
export interface LabelStudioCurrentPageReader {
  /**
   * Inspect the current Label Studio iframe route once.
   * @param identity - exact DSH Session lifecycle requesting inspection.
   * @param timeoutMs - positive inspection deadline.
   * @param signal - caller cancellation.
   * @returns structured Label Studio page at response time.
   */
  request(
    identity: LabelStudioSessionIdentity,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LabelStudioPageContext>
}

type BindingStore = Pick<LabelStudioSessionContextStore, 'readBinding' | 'commitBinding'>
type VerificationApi = Pick<LabelStudioApi, 'getProject' | 'getTask'>
type OperationContextErrorCode = Extract<
  LabelStudioBindingErrorCode,
  'binding-missing' | 'binding-target-mismatch'
>

/** Stable failure raised when no verified resource satisfies an operation. */
export class LabelStudioOperationContextError extends Error {
  /**
   * @param code - stable binding selection failure.
   * @param message - sanitized operator-facing explanation.
   */
  constructor(readonly code: OperationContextErrorCode, message: string) {
    super(message)
    this.name = 'LabelStudioOperationContextError'
  }
}

/** Applies the shared target precedence and commits bindings only after caller-confirmed success. */
export class LabelStudioOperationContextResolver {
  /**
   * @param store - durable per-Session binding store.
   * @param currentPages - one-shot current iframe reader.
   * @param api - authoritative project and task reader.
   * @param currentPageTimeoutMs - positive one-shot inspection deadline.
   */
  constructor(
    private readonly store: BindingStore,
    private readonly currentPages: LabelStudioCurrentPageReader,
    private readonly api: VerificationApi,
    private readonly currentPageTimeoutMs: number,
  ) {
    if (!Number.isSafeInteger(currentPageTimeoutMs) || currentPageTimeoutMs <= 0) {
      throw new TypeError('currentPageTimeoutMs must be a positive safe integer')
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
  async resolve(
    identity: LabelStudioSessionIdentity,
    requirement: Exclude<LabelStudioTargetRequirement, 'none'>,
    selector: LabelStudioTargetSelector,
    signal: AbortSignal,
  ): Promise<LabelStudioResolvedOperationContext> {
    const binding = this.store.readBinding(identity)
    if (selector.mode === 'explicit') {
      const target = await this.resolveExplicit(selector, signal)
      requireLevel(target, requirement)
      return resolved(identity, target, 'explicit', binding.revision)
    }
    if (selector.mode === 'current-page') {
      const target = await this.resolveCurrentPage(identity, requirement, signal)
      return resolved(identity, target, 'current-page', binding.revision)
    }
    if (binding.target !== undefined && satisfies(binding.target, requirement)) {
      await this.verifyTarget(binding.target, signal)
      return resolved(identity, binding.target, 'binding', binding.revision)
    }
    const target = await this.resolveCurrentPage(identity, requirement, signal)
    return resolved(identity, target, 'current-page', binding.revision)
  }

  /**
   * Persist a verified target after its business operation has succeeded.
   * @param identity - exact DSH Session lifecycle receiving the binding.
   * @param target - target established by the successful operation.
   * @param source - actor that established the target.
   * @param expectedBindingRevision - revision observed before the business operation.
   * @returns committed snapshot or a newer conflicting snapshot without retrying business work.
   */
  commitSuccessfulResult(
    identity: LabelStudioSessionIdentity,
    target: LabelStudioBindingTarget,
    source: LabelStudioBindingSource,
    expectedBindingRevision: number,
  ): Promise<LabelStudioBindingCommitOutcome> {
    return this.store.commitBinding(identity, {
      target,
      source,
      expectedRevision: expectedBindingRevision,
    })
  }

  private async resolveExplicit(
    selector: Extract<LabelStudioTargetSelector, { readonly mode: 'explicit' }>,
    signal: AbortSignal,
  ): Promise<LabelStudioBindingTarget> {
    if (selector.annotationId !== undefined && selector.taskId === undefined) {
      throw mismatch('an explicit annotation requires a task id')
    }
    if (selector.taskId !== undefined) {
      const task = await this.api.getTask(selector.taskId, signal)
      if (selector.projectId !== undefined && selector.projectId !== task.projectId) {
        throw mismatch('the explicit project does not own the requested task')
      }
      return {
        kind: 'task',
        projectId: task.projectId,
        taskId: task.id,
        ...(selector.annotationId === undefined ? {} : { annotationId: selector.annotationId }),
      }
    }
    if (selector.projectId === undefined) throw missing('explicit selection requires a project or task id')
    const project = await this.api.getProject(selector.projectId, signal)
    return { kind: 'project', projectId: project.id }
  }

  private async resolveCurrentPage(
    identity: LabelStudioSessionIdentity,
    requirement: Exclude<LabelStudioTargetRequirement, 'none'>,
    signal: AbortSignal,
  ): Promise<LabelStudioBindingTarget> {
    const page = await this.currentPages.request(identity, this.currentPageTimeoutMs, signal)
    if (page.view === 'projects') throw missing('the current Label Studio page has no project target')
    const target: LabelStudioBindingTarget = page.view === 'project'
      ? { kind: 'project', projectId: page.projectId }
      : {
        kind: 'task',
        projectId: page.projectId,
        taskId: page.taskId,
        ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
      }
    requireLevel(target, requirement)
    await this.verifyTarget(target, signal)
    return target
  }

  private async verifyTarget(target: LabelStudioBindingTarget, signal: AbortSignal): Promise<void> {
    if (target.kind === 'project') {
      await this.api.getProject(target.projectId, signal)
      return
    }
    const task = await this.api.getTask(target.taskId, signal)
    if (task.projectId !== target.projectId) {
      throw mismatch('the selected project does not own the selected task')
    }
  }
}

function resolved(
  identity: LabelStudioSessionIdentity,
  target: LabelStudioBindingTarget,
  source: LabelStudioResolvedOperationContext['source'],
  expectedBindingRevision: number,
): LabelStudioResolvedOperationContext {
  return { identity, target, source, expectedBindingRevision }
}

function satisfies(
  target: LabelStudioBindingTarget,
  requirement: Exclude<LabelStudioTargetRequirement, 'none'>,
): boolean {
  return requirement === 'project' || target.kind === 'task'
}

function requireLevel(
  target: LabelStudioBindingTarget,
  requirement: Exclude<LabelStudioTargetRequirement, 'none'>,
): void {
  if (!satisfies(target, requirement)) throw mismatch('the selected target does not identify a task')
}

function missing(message: string): LabelStudioOperationContextError {
  return new LabelStudioOperationContextError('binding-missing', message)
}

function mismatch(message: string): LabelStudioOperationContextError {
  return new LabelStudioOperationContextError('binding-target-mismatch', message)
}
