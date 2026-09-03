/** Session-isolated revision history, long polling, and focus acknowledgements. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioActiveContext,
  LabelStudioActiveTarget,
  LabelStudioBindingSnapshot,
  LabelStudioBrowserEvent,
  LabelStudioChangeReason,
  LabelStudioContextLeaseId,
  LabelStudioFocusCorrelationId,
  LabelStudioPageCommit,
  LabelStudioPageInspectionId,
  LabelStudioProjectId,
  LabelStudioSessionContextSnapshot,
  LabelStudioTargetReservation,
  LabelStudioTaskId,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioContextError, type LabelStudioContextRegistry } from './context-registry.ts'
import { labelStudioNavigationSequence } from './context-types.ts'
import type { LabelStudioSessionIdentity } from './session-context-spec.ts'
import type { LabelStudioSessionContextStore } from './session-context-store.ts'

/** Host-only event suffix returned before the RPC layer adds current context. */
export interface LabelStudioBrokerBatch {
  readonly events: readonly LabelStudioBrowserEvent[]
  readonly latestRevision: number
  readonly resetRequired: boolean
}

interface Waiter {
  settle(): void
  reject(error: unknown): void
}

interface PendingFocus {
  readonly identity: LabelStudioSessionIdentity
  readonly correlationId: LabelStudioFocusCorrelationId
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly targetRevision: number
  readonly target: LabelStudioActiveTarget
  readonly expectedSessionContextRevision: number
  readonly deadlineAt: number
  readonly resolve: (value: LabelStudioActiveContext) => void
  readonly reject: (reason: unknown) => void
  readonly cleanup: () => void
}

interface CompletedFocus {
  readonly correlationId: LabelStudioFocusCorrelationId
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly targetRevision: number
  readonly target: LabelStudioActiveTarget
  readonly context: LabelStudioActiveContext
}

interface SessionState {
  latestRevision: number
  readonly history: LabelStudioBrowserEvent[]
  readonly waiters: Set<Waiter>
  pending: PendingFocus | undefined
  completed: CompletedFocus | undefined
}

function targetsEqual(left: LabelStudioActiveTarget, right: LabelStudioActiveTarget): boolean {
  return left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.annotationId === right.annotationId
}

/** Maintains the browser event stream and focus receipt for each DSH Session. */
export class LabelStudioChangeBroker {
  private readonly states = new Map<SessionId, SessionState>()
  private readonly unsubscribeLeaseEnded: () => void
  private disposed = false

  /**
   * Create a broker and subscribe to authoritative lease removal.
   * @param registry - context registry committing focus targets.
   * @param historySize - positive bounded event count retained per Session.
   * @param sessionContexts - durable page store completed before target publication.
   */
  constructor(
    private readonly registry: LabelStudioContextRegistry,
    private readonly historySize: number,
    private readonly sessionContexts: LabelStudioSessionContextStore,
  ) {
    if (!Number.isSafeInteger(historySize) || historySize <= 0) {
      throw new TypeError('historySize must be a positive safe integer')
    }
    this.unsubscribeLeaseEnded = registry.onLeaseEnded((sessionId) => { this.deleteSession(sessionId) })
  }

  /**
   * Publish a successful task mutation.
   * @param sessionId - Session whose controlled task changed.
   * @param taskId - changed Label Studio task.
   * @param reason - stable mutation reason.
   * @returns the immutable published event.
   */
  publishTaskChanged(
    sessionId: SessionId,
    taskId: LabelStudioTaskId,
    reason: LabelStudioChangeReason,
  ): Extract<LabelStudioBrowserEvent, { kind: 'task-changed' }> {
    const state = this.state(sessionId)
    const event = Object.freeze({
      kind: 'task-changed' as const,
      eventRevision: this.nextRevision(state),
      taskId,
      reason,
    })
    this.append(state, event)
    return event
  }

  /**
   * Publish one on-demand iframe inspection through the existing Session event stream.
   * @param sessionId - Session whose browser lease owns the iframe.
   * @param inspectionId - Host-generated one-shot request identity.
   * @param deadlineAt - absolute response deadline.
   * @returns the immutable published event.
   */
  publishCurrentPageInspection(
    sessionId: SessionId,
    inspectionId: LabelStudioPageInspectionId,
    deadlineAt: number,
  ): Extract<LabelStudioBrowserEvent, { kind: 'inspect-current-page' }> {
    if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= 0) {
      throw new LabelStudioContextError('invalid-request', 'inspection deadline must be a positive safe integer')
    }
    const state = this.state(sessionId)
    const event = Object.freeze({
      kind: 'inspect-current-page' as const,
      inspectionId,
      deadlineAt,
      eventRevision: this.nextRevision(state),
    })
    this.append(state, event)
    return event
  }

  /** Publish a complete binding after Host-side deletion reconciliation. */
  publishBindingChanged(
    sessionId: SessionId,
    binding: LabelStudioBindingSnapshot,
  ): Extract<LabelStudioBrowserEvent, { kind: 'binding-changed' }> {
    const state = this.state(sessionId)
    const event = Object.freeze({
      kind: 'binding-changed' as const,
      binding,
      eventRevision: this.nextRevision(state),
    })
    this.append(state, event)
    return event
  }

  /** Broadcast a non-sensitive unmatched-Webhook status to every current plugin lease. */
  publishWebhookUnassigned(): void {
    for (const sessionId of this.registry.sessionIds()) {
      const state = this.state(sessionId)
      this.append(state, Object.freeze({
        kind: 'webhook-unassigned' as const,
        reason: 'no-matching-binding' as const,
        eventRevision: this.nextRevision(state),
      }))
    }
  }

  /** Broadcast current optional Webhook availability to every current plugin lease. */
  publishWebhookStatus(status: 'ready' | 'unavailable'): void {
    for (const sessionId of this.registry.sessionIds()) {
      const state = this.state(sessionId)
      this.append(state, Object.freeze({
        kind: 'webhook-status' as const,
        status,
        eventRevision: this.nextRevision(state),
      }))
    }
  }

  /**
   * Read the current event cursor without modifying the Session.
   * @param sessionId - DSH Session identity.
   * @returns current revision, or zero before the first event.
   */
  latestRevision(sessionId: SessionId): number {
    if (this.disposed) return 0
    return this.states.get(sessionId)?.latestRevision ?? 0
  }

  /**
   * Retire the current focus receipt after a newer successful reservation.
   * @param sessionId - Session whose old receipt is superseded.
   */
  retireFocus(sessionId: SessionId): void {
    const state = this.states.get(sessionId)
    if (state === undefined) return
    if (state.pending !== undefined) {
      this.cancelPending(state, state.pending, new LabelStudioContextError(
        'focus-not-found', 'focus request was superseded',
      ))
    }
    state.completed = undefined
    this.wake(state)
  }

  /**
   * Delete all event and pending state for a Session.
   * @param sessionId - persistent Session identity.
   */
  deleteSession(sessionId: SessionId): void {
    const state = this.states.get(sessionId)
    if (state === undefined) return
    this.states.delete(sessionId)
    const error = new LabelStudioContextError('lease-expired', 'lease ended')
    for (const waiter of [...state.waiters]) waiter.reject(error)
    state.waiters.clear()
    if (state.pending !== undefined) this.cancelPending(state, state.pending, error, false)
  }

  /**
   * Mark a confirmed missing project in durable Session history and retire its live lease.
   * @param identity - exact Session lifecycle that observed the missing project.
   * @param projectId - project confirmed missing by an authenticated REST read.
   * @returns updated durable page snapshot with project-list fallback.
   */
  async markProjectDeleted(
    identity: LabelStudioSessionIdentity,
    projectId: LabelStudioProjectId,
  ): Promise<LabelStudioSessionContextSnapshot> {
    const snapshot = await this.sessionContexts.markProjectDeleted(identity, projectId)
    this.registry.deleteSession(identity.sessionId)
    return snapshot
  }

  /**
   * Publish one focus request and await its matching browser ACK.
   * @param identity - exact Session lifecycle owning the browser lease.
   * @param correlationId - Host-generated idempotency key.
   * @param reservation - registry focus reservation.
   * @param target - target the browser must apply.
   * @param timeoutMs - positive ACK deadline duration.
   * @param signal - caller/package cancellation.
   * @returns committed active context after ACK.
   */
  requestFocus(
    identity: LabelStudioSessionIdentity,
    correlationId: LabelStudioFocusCorrelationId,
    reservation: LabelStudioTargetReservation,
    target: LabelStudioActiveTarget,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LabelStudioActiveContext> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      return Promise.reject(new LabelStudioContextError('invalid-request', 'focus timeout must be positive'))
    }
    const state = this.state(identity.sessionId)
    if (state.pending !== undefined) {
      return Promise.reject(new LabelStudioContextError('focus-conflict', 'another focus request is pending'))
    }
    signal.throwIfAborted()
    state.completed = undefined
    const expectedSessionContextRevision = this.sessionContexts.read(identity).revision
    const deadlineAt = Date.now() + timeoutMs
    const promise = new Promise<LabelStudioActiveContext>((resolve, reject) => {
      const onAbort = () => {
        const pending = state.pending
        if (pending?.correlationId === correlationId) this.cancelPending(state, pending, signal.reason)
      }
      const timer = setTimeout(() => {
        const pending = state.pending
        if (pending?.correlationId === correlationId) {
          this.cancelPending(state, pending, new LabelStudioContextError('focus-not-found', 'focus ACK timed out'))
        }
      }, timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
      state.pending = {
        identity,
        correlationId,
        leaseId: reservation.lease.leaseId,
        generation: reservation.lease.generation,
        targetRevision: reservation.targetRevision,
        target: Object.freeze({ ...target }),
        expectedSessionContextRevision,
        deadlineAt,
        resolve,
        reject,
        cleanup,
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    const event = Object.freeze({
      kind: 'focus-task' as const,
      eventRevision: this.nextRevision(state),
      correlationId,
      targetRevision: reservation.targetRevision,
      target: Object.freeze({ ...target }),
      expectedSessionContextRevision,
      deadlineAt,
      committed: false,
    })
    this.append(state, event)
    return promise
  }

  /**
   * Wait for events after a Session cursor.
   * @param sessionId - DSH Session identity.
   * @param afterRevision - last continuously observed event revision.
   * @param timeoutMs - positive long-poll deadline duration.
   * @param signal - cancellation signal.
   * @returns missing event suffix or an empty timeout batch.
   */
  async wait(
    sessionId: SessionId,
    afterRevision: number,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LabelStudioBrokerBatch> {
    this.assertUsable()
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) {
      throw new LabelStudioContextError('invalid-request', 'afterRevision must be a non-negative safe integer')
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new LabelStudioContextError('invalid-request', 'wait timeout must be a positive safe integer')
    }
    signal.throwIfAborted()
    const state = this.state(sessionId)
    const immediate = this.snapshot(state, afterRevision)
    if (immediate.resetRequired || immediate.events.length > 0) return immediate
    return new Promise<LabelStudioBrokerBatch>((resolve, reject) => {
      let settled = false
      const finish = (action: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        state.waiters.delete(waiter)
        action()
      }
      const waiter: Waiter = {
        settle: () => { finish(() => {
          try {
            resolve(this.snapshot(state, afterRevision))
          } catch (error) {
            reject(asError(error, 'event wait failed'))
          }
        }) },
        reject: (error) => { finish(() => { reject(asError(error, 'event wait was cancelled')) }) },
      }
      const onAbort = () => { waiter.reject(signal.reason) }
      const timer = setTimeout(() => { waiter.settle() }, timeoutMs)
      state.waiters.add(waiter)
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * Commit or recover the exact matching focus ACK.
   * @param leaseId - current browser lease id.
   * @param generation - current lease generation.
   * @param correlationId - focus request identity.
   * @param targetRevision - reserved target revision.
   * @param target - browser-applied target.
   * @returns committed active context.
   */
  async acknowledgeFocus(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    correlationId: LabelStudioFocusCorrelationId,
    targetRevision: number,
    target: LabelStudioActiveTarget,
  ): Promise<LabelStudioActiveContext> {
    const binding = this.registry.inspectLease(leaseId, generation)
    const state = this.states.get(binding.sessionId)
    if (state === undefined) {
      throw new LabelStudioContextError('focus-not-found', 'focus ACK does not match a pending request')
    }
    const completed = state.completed
    if (completed !== undefined
      && completed.leaseId === leaseId
      && completed.generation === generation
      && completed.correlationId === correlationId
      && completed.targetRevision === targetRevision
      && targetsEqual(completed.target, target)) {
      return completed.context
    }
    const pending = state.pending
    if (pending === undefined
      || pending.leaseId !== leaseId
      || pending.generation !== generation
      || pending.correlationId !== correlationId
      || pending.targetRevision !== targetRevision
      || !targetsEqual(pending.target, target)) {
      throw new LabelStudioContextError('focus-not-found', 'focus ACK does not match a pending request')
    }
    const pageCommit: LabelStudioPageCommit = {
      leaseId,
      generation,
      navigationSequence: labelStudioNavigationSequence(targetRevision),
      expectedSessionContextRevision: pending.expectedSessionContextRevision,
      page: {
        view: 'task',
        projectId: target.projectId,
        taskId: target.taskId,
        ...(target.annotationId === undefined ? {} : { annotationId: target.annotationId }),
      },
    }
    await this.sessionContexts.commit(pending.identity, pageCommit)
    const context = this.registry.publishTarget(leaseId, generation, targetRevision, target)
    pending.cleanup()
    state.pending = undefined
    state.completed = Object.freeze({
      correlationId, leaseId, generation, targetRevision, target: Object.freeze({ ...target }), context,
    })
    pending.resolve(context)
    this.wake(state)
    return context
  }

  /** Unsubscribe, reject pending work, and clear all event histories. */
  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.disposed = true
    this.unsubscribeLeaseEnded()
    const error = new Error('label-studio: change broker is disposed')
    for (const [sessionId, state] of [...this.states]) {
      this.states.delete(sessionId)
      for (const waiter of [...state.waiters]) waiter.reject(error)
      state.waiters.clear()
      if (state.pending !== undefined) this.cancelPending(state, state.pending, error, false)
    }
    return Promise.resolve()
  }

  private state(sessionId: SessionId): SessionState {
    this.assertUsable()
    let state = this.states.get(sessionId)
    if (state === undefined) {
      state = { latestRevision: 0, history: [], waiters: new Set(), pending: undefined, completed: undefined }
      this.states.set(sessionId, state)
    }
    return state
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('label-studio: change broker is disposed')
  }

  private nextRevision(state: SessionState): number {
    if (state.latestRevision >= Number.MAX_SAFE_INTEGER) {
      throw new LabelStudioContextError('invalid-request', 'event revision is exhausted')
    }
    state.latestRevision += 1
    return state.latestRevision
  }

  private append(state: SessionState, event: LabelStudioBrowserEvent): void {
    state.history.push(event)
    if (state.history.length > this.historySize) state.history.shift()
    this.wake(state)
  }

  private wake(state: SessionState): void {
    for (const waiter of [...state.waiters]) waiter.settle()
  }

  private snapshot(state: SessionState, afterRevision: number): LabelStudioBrokerBatch {
    if (afterRevision > state.latestRevision) {
      throw new LabelStudioContextError('future-revision', 'event cursor is ahead of the Host')
    }
    const first = state.history[0]?.eventRevision
    if (first !== undefined && afterRevision < first - 1) {
      return { events: [], latestRevision: state.latestRevision, resetRequired: true }
    }
    const pending = state.pending
    if (pending !== undefined && Date.now() >= pending.deadlineAt) {
      this.cancelPending(state, pending, new LabelStudioContextError('focus-not-found', 'focus ACK timed out'))
    }
    const events = state.history
      .filter(event => event.eventRevision > afterRevision)
      .flatMap((event): LabelStudioBrowserEvent[] => {
        if (event.kind !== 'focus-task') return [event]
        const activePending = state.pending?.correlationId === event.correlationId
        const completed = state.completed?.correlationId === event.correlationId
        if (!activePending && !completed) return []
        return [completed ? Object.freeze({ ...event, committed: true }) : event]
      })
    return { events, latestRevision: state.latestRevision, resetRequired: false }
  }

  private cancelPending(
    state: SessionState,
    pending: PendingFocus,
    reason: unknown,
    retire = true,
  ): void {
    if (state.pending !== pending) return
    state.pending = undefined
    pending.cleanup()
    if (retire) {
      try {
        this.registry.retireFocusTarget(
          pending.leaseId, pending.generation, pending.correlationId,
        )
      } catch (error) {
        if (!(error instanceof LabelStudioContextError)) throw error
      }
    }
    pending.reject(reason)
    this.wake(state)
  }
}

function asError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback)
}
