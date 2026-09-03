/** Durable per-Session Label Studio page and operation-binding store. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  LabelStudioBindingCommitOutcome,
  LabelStudioBindingSnapshot,
  LabelStudioBindingTarget,
  LabelStudioPageCommit,
  LabelStudioPageContext,
  LabelStudioProjectId,
  LabelStudioRecentProject,
  LabelStudioSessionContextSnapshot,
  LabelStudioSessionContextErrorCode,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'
import {
  labelStudioSessionContextDomainSpec,
  labelStudioWebhookOwnerRecordSchema,
  type LabelStudioBindingCommit,
  type LabelStudioPageCommitReceipt,
  type LabelStudioSessionBindingChange,
  type LabelStudioSessionContextRecord,
  type LabelStudioSessionIdentity,
  type LabelStudioWebhookOwnerRecord,
} from './session-context-spec.ts'

/** Construction options for the durable Session page store. */
export interface LabelStudioSessionContextStoreOptions {
  readonly recentProjectLimit: number
  readonly clock?: () => number
}

/** Stable failure raised when a durable Session page cannot accept a commit. */
export class LabelStudioSessionContextError extends Error {
  /**
   * Create a sanitized Session-context failure.
   * @param code - stable RPC-facing failure category.
   */
  constructor(readonly code: LabelStudioSessionContextErrorCode) {
    super(code === 'session-context-conflict'
      ? 'Label Studio Session context revision conflict'
      : 'Label Studio Session context is unavailable')
    this.name = 'LabelStudioSessionContextError'
  }
}

/** Persists Label Studio navigation and operation bindings independently for each DSH Session. */
export class LabelStudioSessionContextStore {
  private readonly table: KvTable<SessionId, LabelStudioSessionContextRecord>
  private readonly ownerTable: KvTable<'owner', LabelStudioWebhookOwnerRecord>
  private readonly tails = new Map<SessionId, Promise<void>>()
  private ownerTail: Promise<void> = Promise.resolve()
  private closing = false
  private closePromise?: Promise<void>

  private constructor(
    private readonly domain: Domain<typeof labelStudioSessionContextDomainSpec>,
    private readonly recentProjectLimit: number,
    private readonly clock: () => number,
  ) {
    this.table = domain.table('sessions')
    this.ownerTable = domain.table('webhook_owners')
  }

  /**
   * Open the plugin-owned storage domain.
   * @param ctx - Host context providing the storage-domain service.
   * @param options - History limit and optional Host clock.
   * @returns an open Session context store.
   */
  static async open(
    ctx: Pick<Context, 'storageDomain'>,
    options: LabelStudioSessionContextStoreOptions,
  ): Promise<LabelStudioSessionContextStore> {
    if (!Number.isSafeInteger(options.recentProjectLimit) || options.recentProjectLimit <= 0) {
      throw new TypeError('recentProjectLimit must be a positive safe integer')
    }
    const domain = await ctx.storageDomain.open(labelStudioSessionContextDomainSpec)
    return new LabelStudioSessionContextStore(
      domain,
      options.recentProjectLimit,
      options.clock ?? Date.now,
    )
  }

  /**
   * Read the context for one exact Session lifecycle without I/O.
   * @param identity - Session id and creation time.
   * @returns an immutable snapshot, or the empty context when no matching record exists.
   */
  read(identity: LabelStudioSessionIdentity): LabelStudioSessionContextSnapshot {
    const record = this.matchingRecord(identity)
    return record === undefined ? emptySnapshot() : snapshotOf(record)
  }

  /**
   * Read the binding for one exact Session lifecycle without I/O.
   * @param identity - Session id and creation time.
   * @returns an immutable empty or bound snapshot.
   */
  readBinding(identity: LabelStudioSessionIdentity): LabelStudioBindingSnapshot {
    const record = this.matchingRecord(identity)
    return record?.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding)
  }

  /**
   * List every durable non-empty binding without creating or changing a Session record.
   * @returns immutable Session ids and binding snapshots in table iteration order.
   */
  listBindings(): readonly { readonly sessionId: SessionId; readonly binding: LabelStudioBindingSnapshot }[] {
    return [...this.table.entries()].flatMap(([sessionId, record]) => record.binding?.target === undefined
      ? []
      : [{ sessionId, binding: bindingSnapshotOf(record.binding) }])
  }

  /**
   * Commit a browser page under revision compare-and-swap semantics.
   * @param identity - Session lifecycle receiving the page.
   * @param request - Validated lease request and expected context revision.
   * @returns the committed context snapshot.
   */
  commit(
    identity: LabelStudioSessionIdentity,
    request: LabelStudioPageCommit,
  ): Promise<LabelStudioSessionContextSnapshot> {
    return this.enqueue(identity.sessionId, async () => {
      const record = this.matchingRecord(identity)
      if (record !== undefined && exactRetry(record.lastCommit, request)) return snapshotOf(record)

      const current = record === undefined ? emptySnapshot() : snapshotOf(record)
      if (current.revision !== request.expectedSessionContextRevision) {
        throw new LabelStudioSessionContextError('session-context-conflict')
      }
      if (samePage(current.page, request.page)) return current

      const revision = current.revision + 1
      const recentProjects = visitProject(
        current.recentProjects,
        request.page,
        this.clock(),
        this.recentProjectLimit,
      )
      const next: LabelStudioSessionContextRecord = {
        sessionCreatedAt: identity.createdAt,
        page: request.page,
        recentProjects,
        revision,
        binding: current.binding,
        lastCommit: receiptOf(request, revision),
      }
      await this.table.put(identity.sessionId, next)
      return snapshotOf(next)
    })
  }

  /**
   * Commit an operation binding with an independent revision.
   * @param identity - Session lifecycle receiving the binding.
   * @param request - Expected binding revision and optional new target.
   * @returns the committed snapshot or the newer conflicting snapshot.
   */
  commitBinding(
    identity: LabelStudioSessionIdentity,
    request: LabelStudioBindingCommit,
  ): Promise<LabelStudioBindingCommitOutcome> {
    return this.enqueue(identity.sessionId, async () => {
      const record = this.matchingRecord(identity)
      const current = record?.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding)
      if (sameBindingRequest(current, request)) return { kind: 'committed', snapshot: current }
      if (current.revision !== request.expectedRevision) return { kind: 'conflict', current }

      const nextBinding = bindingAfterCommit(
        current,
        request,
        this.clock(),
        this.recentProjectLimit,
      )
      const next: LabelStudioSessionContextRecord = record === undefined
        ? {
          sessionCreatedAt: identity.createdAt,
          page: { view: 'projects' },
          recentProjects: [],
          revision: 0,
          binding: nextBinding,
        }
        : { ...record, binding: nextBinding }
      await this.table.put(identity.sessionId, next)
      return { kind: 'committed', snapshot: bindingSnapshotOf(nextBinding) }
    })
  }

  /**
   * Clear or update every binding that refers to a deleted project.
   * @param projectId - Confirmed deleted Label Studio project.
   * @returns changed Session bindings in table iteration order.
   */
  reconcileProjectDeleted(
    projectId: LabelStudioProjectId,
  ): Promise<readonly LabelStudioSessionBindingChange[]> {
    return this.reconcileRecords(record => projectDeletedRecord(record, projectId))
  }

  /**
   * Downgrade bindings whose exact task was deleted.
   * @param projectId - Project that owned the deleted tasks.
   * @param taskIds - Confirmed deleted task identifiers.
   * @returns changed Session bindings in table iteration order.
   */
  reconcileTasksDeleted(
    projectId: LabelStudioProjectId,
    taskIds: readonly LabelStudioTaskId[],
  ): Promise<readonly LabelStudioSessionBindingChange[]> {
    const deleted = new Set(taskIds)
    if (deleted.size === 0) return Promise.resolve([])
    const now = this.clock()
    return this.reconcileRecords(record => tasksDeletedRecord(record, projectId, deleted, now))
  }

  /**
   * Persist the first generated Webhook owner id and return it thereafter.
   * @param candidate - Non-empty owner identity proposed by this process.
   * @returns the durable first owner identity.
   */
  ensureWebhookOwnerId(candidate: string): Promise<string> {
    const owner = labelStudioWebhookOwnerRecordSchema.parse({ ownerId: candidate })
    if (this.closing) return Promise.reject(new Error('Label Studio Session context store is closing'))
    const result = this.ownerTail.then(async () => {
      const existing = this.ownerTable.get('owner')
      if (existing !== undefined) return existing.ownerId
      await this.ownerTable.put('owner', owner)
      return owner.ownerId
    })
    this.ownerTail = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * Mark one known project deleted in page recovery state and the Session binding.
   * @param identity - Session lifecycle owning the history.
   * @param projectId - Confirmed deleted Label Studio project.
   * @returns the resulting context snapshot.
   */
  markProjectDeleted(
    identity: LabelStudioSessionIdentity,
    projectId: LabelStudioProjectId,
  ): Promise<LabelStudioSessionContextSnapshot> {
    return this.enqueue(identity.sessionId, async () => {
      const record = this.matchingRecord(identity)
      if (record === undefined) return emptySnapshot()
      const reconciliation = projectDeletedRecord(record, projectId)
      if (reconciliation === undefined) return snapshotOf(record)
      await this.table.put(identity.sessionId, reconciliation.record)
      return snapshotOf(reconciliation.record)
    })
  }

  /**
   * Delete one Session's durable Label Studio context.
   * @param sessionId - Session record key to remove.
   * @returns whether a record existed.
   */
  delete(sessionId: SessionId): Promise<boolean> {
    return this.enqueue(sessionId, () => this.table.delete(sessionId))
  }

  /**
   * Drain queued operations and close the owned domain handle once.
   * @returns resolution after storage shutdown.
   */
  close(): Promise<void> {
    this.closePromise ??= this.runClose()
    return this.closePromise
  }

  private async runClose(): Promise<void> {
    this.closing = true
    await Promise.all([...this.tails.values(), this.ownerTail])
    await this.domain.close()
  }

  private async reconcileRecords(
    transform: (record: LabelStudioSessionContextRecord) => RecordReconciliation | undefined,
  ): Promise<readonly LabelStudioSessionBindingChange[]> {
    const changes = await Promise.all([...this.table.keys()].map(sessionId =>
      this.enqueue(sessionId, async (): Promise<LabelStudioSessionBindingChange | undefined> => {
        const record = this.table.get(sessionId)
        if (record === undefined) return undefined
        const before = record.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding)
        const reconciliation = transform(record)
        if (reconciliation === undefined) return undefined
        await this.table.put(sessionId, reconciliation.record)
        if (!reconciliation.bindingChanged) return undefined
        return {
          sessionId,
          before,
          after: reconciliation.record.binding === undefined
            ? emptyBinding()
            : bindingSnapshotOf(reconciliation.record.binding),
        }
      }),
    ))
    return changes.filter(change => change !== undefined)
  }

  private matchingRecord(identity: LabelStudioSessionIdentity): LabelStudioSessionContextRecord | undefined {
    const record = this.table.get(identity.sessionId)
    return record?.sessionCreatedAt === identity.createdAt ? record : undefined
  }

  private enqueue<T>(sessionId: SessionId, operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Label Studio Session context store is closing'))
    const previous = this.tails.get(sessionId) ?? Promise.resolve()
    const result = previous.then(operation)
    const settled = result.then(() => undefined, () => undefined)
    this.tails.set(sessionId, settled)
    void settled.then(() => {
      if (this.tails.get(sessionId) === settled) this.tails.delete(sessionId)
    })
    return result
  }
}

interface RecordReconciliation {
  readonly record: LabelStudioSessionContextRecord
  readonly bindingChanged: boolean
}

function emptySnapshot(): LabelStudioSessionContextSnapshot {
  return { page: { view: 'projects' }, recentProjects: [], revision: 0, binding: emptyBinding() }
}

function snapshotOf(record: LabelStudioSessionContextRecord): LabelStudioSessionContextSnapshot {
  return {
    page: copyPage(record.page),
    recentProjects: record.recentProjects.map(recent => ({ ...recent })),
    revision: record.revision,
    binding: record.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding),
  }
}

function emptyBinding(): LabelStudioBindingSnapshot {
  return { recentProjects: [], revision: 0 }
}

function bindingSnapshotOf(binding: LabelStudioBindingSnapshot): LabelStudioBindingSnapshot {
  const recentProjects = binding.recentProjects.map(recent => ({ ...recent }))
  if (binding.target === undefined) return { recentProjects, revision: binding.revision }
  return {
    target: copyBindingTarget(binding.target),
    source: binding.source,
    boundAt: binding.boundAt,
    recentProjects,
    revision: binding.revision,
  }
}

function copyBindingTarget(target: LabelStudioBindingTarget): LabelStudioBindingTarget {
  if (target.kind === 'project') return { kind: 'project', projectId: target.projectId }
  return {
    kind: 'task',
    projectId: target.projectId,
    taskId: target.taskId,
    ...(target.annotationId === undefined ? {} : { annotationId: target.annotationId }),
  }
}

function sameBindingTarget(left: LabelStudioBindingTarget, right: LabelStudioBindingTarget): boolean {
  if (left.kind !== right.kind || left.projectId !== right.projectId) return false
  if (left.kind === 'project' || right.kind === 'project') return true
  return left.taskId === right.taskId && left.annotationId === right.annotationId
}

function sameBindingRequest(
  current: LabelStudioBindingSnapshot,
  request: LabelStudioBindingCommit,
): boolean {
  if (request.target === undefined) return current.target === undefined
  return current.target !== undefined
    && sameBindingTarget(current.target, request.target)
    && current.source === request.source
}

function bindingAfterCommit(
  current: LabelStudioBindingSnapshot,
  request: LabelStudioBindingCommit,
  now: number,
  limit: number,
): LabelStudioBindingSnapshot {
  const revision = current.revision + 1
  if (request.target === undefined) {
    return { recentProjects: current.recentProjects.map(recent => ({ ...recent })), revision }
  }
  return {
    target: copyBindingTarget(request.target),
    source: request.source,
    boundAt: now,
    recentProjects: visitBindingProject(current.recentProjects, request.target, now, limit),
    revision,
  }
}

function visitBindingProject(
  current: readonly LabelStudioRecentProject[],
  target: LabelStudioBindingTarget,
  now: number,
  limit: number,
): readonly LabelStudioRecentProject[] {
  const previous = current.find(recent => recent.projectId === target.projectId)
  const visited: LabelStudioRecentProject = {
    projectId: target.projectId,
    ...(target.kind === 'task'
      ? { lastTaskId: target.taskId }
      : previous?.lastTaskId === undefined
        ? {}
        : { lastTaskId: previous.lastTaskId }),
    lastVisitedAt: now,
    availability: 'available',
  }
  return [visited, ...current.filter(recent => recent.projectId !== target.projectId)].slice(0, limit)
}

function projectDeletedBinding(
  current: LabelStudioBindingSnapshot,
  projectId: LabelStudioProjectId,
): LabelStudioBindingSnapshot | undefined {
  const targetDeleted = current.target?.projectId === projectId
  let historyChanged = false
  const recentProjects = current.recentProjects.map((recent) => {
    if (recent.projectId !== projectId || recent.availability === 'deleted') return recent
    historyChanged = true
    return { ...recent, availability: 'deleted' as const }
  })
  if (!targetDeleted && !historyChanged) return undefined
  const revision = current.revision + 1
  if (targetDeleted) return { recentProjects, revision }
  if (current.target === undefined) return { recentProjects, revision }
  return {
    target: copyBindingTarget(current.target),
    source: current.source,
    boundAt: current.boundAt,
    recentProjects,
    revision,
  }
}

function projectDeletedRecord(
  record: LabelStudioSessionContextRecord,
  projectId: LabelStudioProjectId,
): RecordReconciliation | undefined {
  const pageUsesProject = record.page.view !== 'projects' && record.page.projectId === projectId
  let pageHistoryChanged = false
  const recentProjects = record.recentProjects.map((recent) => {
    if (recent.projectId !== projectId || recent.availability === 'deleted') return recent
    pageHistoryChanged = true
    return { ...recent, availability: 'deleted' as const }
  })
  const currentBinding = record.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding)
  const binding = projectDeletedBinding(currentBinding, projectId)
  const pageChanged = pageUsesProject || pageHistoryChanged
  if (!pageChanged && binding === undefined) return undefined
  return {
    record: reconciledRecord(
      record,
      pageUsesProject ? { view: 'projects' } : record.page,
      recentProjects,
      pageChanged,
      binding,
    ),
    bindingChanged: binding !== undefined,
  }
}

function tasksDeletedBinding(
  current: LabelStudioBindingSnapshot,
  projectId: LabelStudioProjectId,
  taskIds: ReadonlySet<LabelStudioTaskId>,
  now: number,
): LabelStudioBindingSnapshot | undefined {
  const targetDeleted = current.target?.kind === 'task'
    && current.target.projectId === projectId
    && taskIds.has(current.target.taskId)
  let historyChanged = false
  const recentProjects = current.recentProjects.map((recent) => {
    if (recent.projectId !== projectId || recent.lastTaskId === undefined || !taskIds.has(recent.lastTaskId)) {
      return recent
    }
    historyChanged = true
    const { lastTaskId: _lastTaskId, ...project } = recent
    return project
  })
  if (!targetDeleted && !historyChanged) return undefined
  const revision = current.revision + 1
  if (targetDeleted) {
    return {
      target: { kind: 'project', projectId },
      source: 'webhook',
      boundAt: now,
      recentProjects,
      revision,
    }
  }
  return current.target === undefined
    ? { recentProjects, revision }
    : {
      target: copyBindingTarget(current.target),
      source: current.source,
      boundAt: current.boundAt,
      recentProjects,
      revision,
    }
}

function tasksDeletedRecord(
  record: LabelStudioSessionContextRecord,
  projectId: LabelStudioProjectId,
  taskIds: ReadonlySet<LabelStudioTaskId>,
  now: number,
): RecordReconciliation | undefined {
  const pageUsesTask = record.page.view === 'task'
    && record.page.projectId === projectId
    && taskIds.has(record.page.taskId)
  let pageHistoryChanged = false
  const recentProjects = record.recentProjects.map((recent) => {
    if (recent.projectId !== projectId || recent.lastTaskId === undefined || !taskIds.has(recent.lastTaskId)) {
      return recent
    }
    pageHistoryChanged = true
    const { lastTaskId: _lastTaskId, ...project } = recent
    return project
  })
  const currentBinding = record.binding === undefined ? emptyBinding() : bindingSnapshotOf(record.binding)
  const binding = tasksDeletedBinding(currentBinding, projectId, taskIds, now)
  const pageChanged = pageUsesTask || pageHistoryChanged
  if (!pageChanged && binding === undefined) return undefined
  return {
    record: reconciledRecord(
      record,
      pageUsesTask ? { view: 'project', projectId } : record.page,
      recentProjects,
      pageChanged,
      binding,
    ),
    bindingChanged: binding !== undefined,
  }
}

function reconciledRecord(
  record: LabelStudioSessionContextRecord,
  page: LabelStudioPageContext,
  recentProjects: readonly LabelStudioRecentProject[],
  pageChanged: boolean,
  binding: LabelStudioBindingSnapshot | undefined,
): LabelStudioSessionContextRecord {
  return {
    sessionCreatedAt: record.sessionCreatedAt,
    page: copyPage(page),
    recentProjects,
    revision: pageChanged ? record.revision + 1 : record.revision,
    ...(binding === undefined
      ? record.binding === undefined ? {} : { binding: record.binding }
      : { binding }),
    ...(!pageChanged && record.lastCommit !== undefined ? { lastCommit: record.lastCommit } : {}),
  }
}

function copyPage(page: LabelStudioPageContext): LabelStudioPageContext {
  if (page.view === 'projects') return { view: 'projects' }
  if (page.view === 'project') return { view: 'project', projectId: page.projectId }
  return {
    view: 'task',
    projectId: page.projectId,
    taskId: page.taskId,
    ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
  }
}

function samePage(left: LabelStudioPageContext, right: LabelStudioPageContext): boolean {
  if (left.view !== right.view) return false
  if (left.view === 'projects' || right.view === 'projects') return true
  if (left.projectId !== right.projectId) return false
  if (left.view === 'project' || right.view === 'project') return true
  return left.taskId === right.taskId && left.annotationId === right.annotationId
}

function visitProject(
  current: readonly LabelStudioRecentProject[],
  page: LabelStudioPageContext,
  now: number,
  limit: number,
): readonly LabelStudioRecentProject[] {
  if (page.view === 'projects') return current.map(recent => ({ ...recent }))
  const previous = current.find(recent => recent.projectId === page.projectId)
  const visited: LabelStudioRecentProject = {
    projectId: page.projectId,
    ...(page.view === 'task'
      ? { lastTaskId: page.taskId }
      : previous?.lastTaskId === undefined
        ? {}
        : { lastTaskId: previous.lastTaskId }),
    lastVisitedAt: now,
    availability: 'available',
  }
  return [visited, ...current.filter(recent => recent.projectId !== page.projectId)].slice(0, limit)
}

function receiptOf(request: LabelStudioPageCommit, committedRevision: number): LabelStudioPageCommitReceipt {
  return {
    leaseId: request.leaseId,
    generation: request.generation,
    navigationSequence: request.navigationSequence,
    expectedRevision: request.expectedSessionContextRevision,
    committedRevision,
    page: copyPage(request.page),
  }
}

function exactRetry(receipt: LabelStudioPageCommitReceipt | undefined, request: LabelStudioPageCommit): boolean {
  return receipt !== undefined
    && receipt.leaseId === request.leaseId
    && receipt.generation === request.generation
    && receipt.navigationSequence === request.navigationSequence
    && receipt.expectedRevision === request.expectedSessionContextRevision
    && samePage(receipt.page, request.page)
}
