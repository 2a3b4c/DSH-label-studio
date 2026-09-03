/** Durable per-Session Label Studio page store. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  LabelStudioPageCommit,
  LabelStudioPageContext,
  LabelStudioProjectId,
  LabelStudioRecentProject,
  LabelStudioSessionContextSnapshot,
  LabelStudioSessionContextErrorCode,
} from '@deepseek-ai/dsh-label-studio-protocol'
import {
  labelStudioSessionContextDomainSpec,
  type LabelStudioPageCommitReceipt,
  type LabelStudioSessionContextRecord,
  type LabelStudioSessionIdentity,
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

/** Persists Label Studio navigation independently for each DSH Session. */
export class LabelStudioSessionContextStore {
  private readonly table: KvTable<SessionId, LabelStudioSessionContextRecord>
  private readonly tails = new Map<SessionId, Promise<void>>()
  private closing = false
  private closePromise?: Promise<void>

  private constructor(
    private readonly domain: Domain<typeof labelStudioSessionContextDomainSpec>,
    private readonly recentProjectLimit: number,
    private readonly clock: () => number,
  ) {
    this.table = domain.table('sessions')
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
        lastCommit: receiptOf(request, revision),
      }
      await this.table.put(identity.sessionId, next)
      return snapshotOf(next)
    })
  }

  /**
   * Mark one known project deleted and clear it if it is the current page.
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
      const pageUsesProject = record.page.view !== 'projects' && record.page.projectId === projectId
      let historyChanged = false
      const recentProjects = record.recentProjects.map((recent) => {
        if (recent.projectId !== projectId || recent.availability === 'deleted') return recent
        historyChanged = true
        return { ...recent, availability: 'deleted' as const }
      })
      if (!pageUsesProject && !historyChanged) return snapshotOf(record)
      const next: LabelStudioSessionContextRecord = {
        sessionCreatedAt: identity.createdAt,
        page: pageUsesProject ? { view: 'projects' } : record.page,
        recentProjects,
        revision: record.revision + 1,
      }
      await this.table.put(identity.sessionId, next)
      return snapshotOf(next)
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
    await Promise.all(this.tails.values())
    await this.domain.close()
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

function emptySnapshot(): LabelStudioSessionContextSnapshot {
  return { page: { view: 'projects' }, recentProjects: [], revision: 0 }
}

function snapshotOf(record: LabelStudioSessionContextSnapshot): LabelStudioSessionContextSnapshot {
  return {
    page: copyPage(record.page),
    recentProjects: record.recentProjects.map(recent => ({ ...recent })),
    revision: record.revision,
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
