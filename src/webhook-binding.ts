/** Safe mapping from Label Studio Webhooks to existing Session bindings. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioBindingSnapshot,
  LabelStudioPageContext,
} from '@deepseek-ai/dsh-label-studio-protocol'
import type { LabelStudioChangeBroker } from './change-broker.ts'
import type { LabelStudioCurrentPageBroker } from './current-page-broker.ts'
import type { LabelStudioSessionContextStore } from './session-context-store.ts'
import type { LabelStudioSessionIdentity } from './session-context-spec.ts'
import type { LabelStudioWebhookEvent } from './webhook-payload.ts'

/** Result of matching or reconciling one authenticated Webhook. */
export type LabelStudioWebhookBindingOutcome =
  | { readonly kind: 'matched-existing'; readonly sessionIds: readonly SessionId[] }
  | { readonly kind: 'bound-from-live-page'; readonly sessionId: SessionId }
  | { readonly kind: 'reconciled-deletion'; readonly affectedSessionIds: readonly SessionId[] }
  | { readonly kind: 'unassigned'; readonly reason: 'no-matching-binding' }

type Store = Pick<
  LabelStudioSessionContextStore,
  'listBindings' | 'readBinding' | 'commitBinding' | 'reconcileProjectDeleted' | 'reconcileTasksDeleted'
>
type Broker = Pick<LabelStudioChangeBroker, 'publishBindingChanged' | 'publishWebhookUnassigned'>

/** Live-browser dependencies used only to attribute an otherwise unbound event. */
export interface LabelStudioWebhookLivePageOptions {
  /** Return every current DSH Session iframe lease. */
  readonly sessionIds: () => readonly SessionId[]
  /** Resolve one current lease to its exact durable Session lifecycle. */
  readonly resolveIdentity: (sessionId: SessionId, signal: AbortSignal) => Promise<LabelStudioSessionIdentity>
  /** Perform the existing one-shot iframe page inspection. */
  readonly currentPages: Pick<LabelStudioCurrentPageBroker, 'request'>
  /** Positive deadline for each concurrent iframe inspection. */
  readonly timeoutMs: number
}

/** Applies deletion events and otherwise confirms only pre-existing exact bindings. */
export class LabelStudioWebhookBindingCoordinator {
  /**
   * @param store - durable binding reader and deletion reconciler.
   * @param broker - browser status publisher.
   */
  constructor(
    private readonly store: Store,
    private readonly broker: Broker,
    private readonly livePages?: LabelStudioWebhookLivePageOptions,
  ) {}

  /**
   * Synchronize one finite authenticated event.
   * @param event - identifier-only Webhook event.
   * @returns matching or deletion outcome without creating a binding.
   */
  async accept(
    event: LabelStudioWebhookEvent,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<LabelStudioWebhookBindingOutcome> {
    switch (event.action) {
      case 'PROJECT_DELETED':
        return this.publishChanges(await this.store.reconcileProjectDeleted(event.projectId))
      case 'TASK_DELETED':
      case 'TASKS_DELETED':
        return this.publishChanges(await this.store.reconcileTasksDeleted(event.projectId, event.taskIds))
      case 'ANNOTATION_DELETED':
      case 'ANNOTATIONS_DELETED':
        return { kind: 'reconciled-deletion', affectedSessionIds: [] }
      case 'ANNOTATION_CREATED':
      case 'ANNOTATIONS_CREATED':
      case 'ANNOTATION_UPDATED': {
        const existing = this.matchingSessionIds((binding) => {
          const target = binding.target
          return target?.kind === 'task'
            && target.projectId === event.projectId
            && event.items.some(item => item.taskId === target.taskId)
        })
        if (existing.length > 0) return { kind: 'matched-existing', sessionIds: existing }
        return this.bindAnnotationFromLivePage(event, signal)
      }
      case 'PROJECT_CREATED':
      case 'PROJECT_UPDATED':
      case 'TASK_CREATED':
      case 'TASKS_CREATED':
        return this.match(binding => binding.target?.projectId === event.projectId)
      default:
        return assertNever(event)
    }
  }

  private match(predicate: (binding: LabelStudioBindingSnapshot) => boolean): LabelStudioWebhookBindingOutcome {
    const sessionIds = this.matchingSessionIds(predicate)
    if (sessionIds.length > 0) return { kind: 'matched-existing', sessionIds }
    this.broker.publishWebhookUnassigned()
    return { kind: 'unassigned', reason: 'no-matching-binding' }
  }

  private matchingSessionIds(predicate: (binding: LabelStudioBindingSnapshot) => boolean): readonly SessionId[] {
    return this.store.listBindings().filter(item => predicate(item.binding)).map(item => item.sessionId)
  }

  private async bindAnnotationFromLivePage(
    event: Extract<LabelStudioWebhookEvent, {
      action: 'ANNOTATION_CREATED' | 'ANNOTATIONS_CREATED' | 'ANNOTATION_UPDATED'
    }>,
    signal: AbortSignal,
  ): Promise<LabelStudioWebhookBindingOutcome> {
    const livePages = this.livePages
    if (livePages === undefined) return this.unassigned()
    const inspected = await Promise.all(livePages.sessionIds().map(async (sessionId) => {
      try {
        const identity = await livePages.resolveIdentity(sessionId, signal)
        const page = await livePages.currentPages.request(identity, livePages.timeoutMs, signal)
        return { identity, page }
      } catch {
        return undefined
      }
    }))
    const matches = inspected.filter((item): item is {
      readonly identity: LabelStudioSessionIdentity
      readonly page: Extract<LabelStudioPageContext, { view: 'task' }>
    } => {
      if (item === undefined || item.page.view !== 'task' || item.page.projectId !== event.projectId) return false
      const taskId = item.page.taskId
      return event.items.some(eventItem => eventItem.taskId === taskId)
    })
    if (matches.length !== 1) return this.unassigned()

    const match = matches[0]!
    const annotation = event.items.find(item => item.taskId === match.page.taskId)!
    const before = this.store.readBinding(match.identity)
    const outcome = await this.store.commitBinding(match.identity, {
      expectedRevision: before.revision,
      target: {
        kind: 'task',
        projectId: event.projectId,
        taskId: match.page.taskId,
        annotationId: annotation.annotationId,
      },
      source: 'webhook',
    })
    if (outcome.kind === 'conflict') return this.unassigned()
    this.broker.publishBindingChanged(match.identity.sessionId, outcome.snapshot)
    return { kind: 'bound-from-live-page', sessionId: match.identity.sessionId }
  }

  private unassigned(): LabelStudioWebhookBindingOutcome {
    this.broker.publishWebhookUnassigned()
    return { kind: 'unassigned', reason: 'no-matching-binding' }
  }

  private publishChanges(changes: Awaited<ReturnType<Store['reconcileProjectDeleted']>>): LabelStudioWebhookBindingOutcome {
    for (const change of changes) this.broker.publishBindingChanged(change.sessionId, change.after)
    return { kind: 'reconciled-deletion', affectedSessionIds: changes.map(change => change.sessionId) }
  }
}

function assertNever(value: never): never {
  throw new Error(`label-studio: unsupported webhook event ${String(value)}`)
}
