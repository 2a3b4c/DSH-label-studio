/** Session-scoped ownership and target state for the Label Studio browser surface. */

import { randomUUID } from 'node:crypto'
import type {
  LabelStudioActiveContext,
  LabelStudioActiveTarget,
  LabelStudioContextLeaseId,
  LabelStudioContextSourceId,
  LabelStudioFocusCorrelationId,
  LabelStudioLeaseOpenResult,
  LabelStudioLeaseSnapshot,
  LabelStudioNavigationSequence,
  LabelStudioTargetReservation,
  LabelStudioTargetState,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { labelStudioContextLeaseId } from './context-types.ts'

type SessionId = LabelStudioActiveContext['sessionId']

/** Stable failure categories mapped to RPC outcomes by the transport layer. */
export type LabelStudioContextErrorCode =
  | 'invalid-request'
  | 'session-not-found'
  | 'lease-conflict'
  | 'lease-expired'
  | 'stale-generation'
  | 'stale-revision'
  | 'future-revision'
  | 'focus-conflict'
  | 'focus-not-found'

/** Domain failure raised by the synchronous context state machine. */
export class LabelStudioContextError extends Error {
  /**
   * Create a stable context failure.
   * @param code - machine-readable failure category.
   * @param message - operator-facing explanation without request data.
   * @param retryAfterMs - exact remaining lease duration for a conflict.
   */
  constructor(
    readonly code: LabelStudioContextErrorCode,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'LabelStudioContextError'
  }
}

/** Host-only association between a Session, source, lease, and target state. */
export interface LabelStudioLeaseBinding {
  readonly sessionId: SessionId
  readonly sourceId: LabelStudioContextSourceId
  readonly lease: LabelStudioLeaseSnapshot
  readonly context: LabelStudioTargetState
}

interface BrowserNavigationReceipt {
  readonly kind: 'reserve' | 'clear'
  readonly navigationSequence: LabelStudioNavigationSequence
  readonly expectedTargetRevision: number
  readonly targetRevision: number
}

interface LeaseRecord {
  readonly sessionId: SessionId
  readonly sourceId: LabelStudioContextSourceId
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly replayBaseline: number
  expiresAt: number
  context: LabelStudioTargetState
  browserReceipt?: BrowserNavigationReceipt
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LabelStudioContextError('invalid-request', `${name} must be a non-negative safe integer`)
  }
  return value
}

function snapshotTarget(target: LabelStudioActiveTarget): LabelStudioActiveTarget {
  return Object.freeze(target.annotationId === undefined
    ? { projectId: target.projectId, taskId: target.taskId }
    : { projectId: target.projectId, taskId: target.taskId, annotationId: target.annotationId })
}

function targetsEqual(left: LabelStudioActiveTarget, right: LabelStudioActiveTarget): boolean {
  return left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.annotationId === right.annotationId
}

function snapshotState(state: LabelStudioTargetState): LabelStudioTargetState {
  switch (state.phase) {
    case 'vacant':
      return Object.freeze({ phase: 'vacant', targetRevision: state.targetRevision })
    case 'reserved':
      return Object.freeze({
        phase: 'reserved',
        targetRevision: state.targetRevision,
        reservation: Object.freeze({ ...state.reservation }),
      })
    case 'committed':
      return Object.freeze({
        phase: 'committed',
        targetRevision: state.targetRevision,
        target: snapshotTarget(state.target),
      })
  }
}

/** Owns one expiring Label Studio browser lease per DSH Session. */
export class LabelStudioContextRegistry {
  private readonly bySession = new Map<SessionId, LeaseRecord>()
  private readonly byLease = new Map<LabelStudioContextLeaseId, LeaseRecord>()
  private readonly lastGeneration = new Map<SessionId, number>()
  private readonly listeners = new Set<(sessionId: SessionId) => void>()
  private readonly deletingSessions = new Set<SessionId>()
  private disposed = false

  /**
   * Create an empty registry.
   * @param leaseTtlMs - positive safe-integer lifetime applied by open and renew.
   * @param clock - epoch-millisecond clock used for deterministic expiry.
   */
  constructor(
    private readonly leaseTtlMs: number,
    private readonly clock: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs <= 0) {
      throw new TypeError('leaseTtlMs must be a positive safe integer')
    }
  }

  /**
   * Open a new Session lease or idempotently recover the current source's lease.
   * @param sessionId - persistent DSH Session identity already verified by the caller.
   * @param sourceId - browser page UUID.
   * @param replayBaseline - broker revision captured before creating the lease.
   * @returns the immutable lease and its original replay baseline.
   */
  openLease(
    sessionId: SessionId,
    sourceId: LabelStudioContextSourceId,
    replayBaseline: number,
  ): Pick<LabelStudioLeaseOpenResult, 'lease' | 'replayBaseline'> {
    this.assertUsable()
    if (this.deletingSessions.has(sessionId)) {
      throw new LabelStudioContextError('invalid-request', 'Session context is being deleted')
    }
    nonNegativeInteger(replayBaseline, 'replayBaseline')
    const current = this.recordForSession(sessionId)
    const now = this.clock()
    if (current !== undefined) {
      if (current.sourceId !== sourceId) {
        const retryAfterMs = Math.max(1, Math.ceil(current.expiresAt - now))
        throw new LabelStudioContextError('lease-conflict', 'another browser source owns this Session', retryAfterMs)
      }
      current.expiresAt = now + this.leaseTtlMs
      return this.openSnapshot(current)
    }

    const priorGeneration = this.lastGeneration.get(sessionId) ?? 0
    if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
      throw new LabelStudioContextError('invalid-request', 'lease generation is exhausted')
    }
    const generation = priorGeneration + 1
    const record: LeaseRecord = {
      sessionId,
      sourceId,
      leaseId: labelStudioContextLeaseId(randomUUID()),
      generation,
      replayBaseline,
      expiresAt: now + this.leaseTtlMs,
      context: Object.freeze({ phase: 'vacant', targetRevision: 0 }),
    }
    this.lastGeneration.set(sessionId, generation)
    this.bySession.set(sessionId, record)
    this.byLease.set(record.leaseId, record)
    return this.openSnapshot(record)
  }

  /**
   * Reserve the next target revision for a browser navigation.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @param navigationSequence - browser-monotonic navigation sequence.
   * @param expectedTargetRevision - compare-and-swap revision observed by the browser.
   * @returns the immutable reservation receipt.
   */
  reserveBrowserTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    navigationSequence: LabelStudioNavigationSequence,
    expectedTargetRevision: number,
  ): LabelStudioTargetReservation {
    const record = this.requireLease(leaseId, generation)
    nonNegativeInteger(expectedTargetRevision, 'expectedTargetRevision')
    const prior = record.browserReceipt
    if (prior !== undefined && navigationSequence <= prior.navigationSequence) {
      if (prior.kind === 'reserve'
        && navigationSequence === prior.navigationSequence
        && expectedTargetRevision === prior.expectedTargetRevision) {
        return this.reservationSnapshot(record, prior.targetRevision, navigationSequence)
      }
      throw new LabelStudioContextError('stale-revision', 'browser navigation sequence is stale')
    }
    if (expectedTargetRevision !== record.context.targetRevision) {
      throw new LabelStudioContextError('stale-revision', 'target revision compare-and-swap failed')
    }
    const targetRevision = this.nextRevision(record.context.targetRevision)
    record.context = Object.freeze({
      phase: 'reserved',
      targetRevision,
      reservation: Object.freeze({ kind: 'browser', navigationSequence }),
    })
    record.browserReceipt = Object.freeze({
      kind: 'reserve', navigationSequence, expectedTargetRevision, targetRevision,
    })
    return this.reservationSnapshot(record, targetRevision, navigationSequence)
  }

  /**
   * Replace the current target with vacant state for a browser navigation.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @param navigationSequence - browser-monotonic navigation sequence.
   * @param expectedTargetRevision - compare-and-swap revision observed before clearing.
   * @returns the immutable vacant state, including the incremented target revision.
   */
  clearBrowserTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    navigationSequence: LabelStudioNavigationSequence,
    expectedTargetRevision: number,
  ): LabelStudioTargetState {
    const record = this.requireLease(leaseId, generation)
    nonNegativeInteger(expectedTargetRevision, 'expectedTargetRevision')
    const prior = record.browserReceipt
    if (prior !== undefined && navigationSequence <= prior.navigationSequence) {
      if (prior.kind === 'clear'
        && navigationSequence === prior.navigationSequence
        && expectedTargetRevision === prior.expectedTargetRevision) {
        return Object.freeze({ phase: 'vacant', targetRevision: prior.targetRevision })
      }
      throw new LabelStudioContextError('stale-revision', 'browser navigation sequence is stale')
    }
    if (expectedTargetRevision !== record.context.targetRevision) {
      throw new LabelStudioContextError('stale-revision', 'target revision compare-and-swap failed')
    }
    const targetRevision = this.nextRevision(record.context.targetRevision)
    record.context = Object.freeze({ phase: 'vacant', targetRevision })
    record.browserReceipt = Object.freeze({
      kind: 'clear', navigationSequence, expectedTargetRevision, targetRevision,
    })
    return snapshotState(record.context)
  }

  /**
   * Reserve the next target revision for a Host focus request.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @param correlationId - Host-issued idempotency key.
   * @returns the immutable reservation receipt.
   */
  reserveFocusTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    correlationId: LabelStudioFocusCorrelationId,
  ): LabelStudioTargetReservation {
    const record = this.requireLease(leaseId, generation)
    if (record.context.phase === 'reserved') {
      if (record.context.reservation.kind === 'focus'
        && record.context.reservation.correlationId === correlationId) {
        return this.reservationSnapshot(record, record.context.targetRevision)
      }
      throw new LabelStudioContextError('focus-conflict', 'another target reservation is pending')
    }
    const targetRevision = this.nextRevision(record.context.targetRevision)
    record.context = Object.freeze({
      phase: 'reserved',
      targetRevision,
      reservation: Object.freeze({ kind: 'focus', correlationId }),
    })
    return this.reservationSnapshot(record, targetRevision)
  }

  /**
   * Convert the current reservation into a committed target.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @param targetRevision - revision returned by the reservation operation.
   * @param target - validated Label Studio identifiers to commit.
   * @returns the immutable active context.
   */
  publishTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    targetRevision: number,
    target: LabelStudioActiveTarget,
  ): LabelStudioActiveContext {
    const record = this.requireLease(leaseId, generation)
    nonNegativeInteger(targetRevision, 'targetRevision')
    if (record.context.phase === 'committed' && record.context.targetRevision === targetRevision) {
      if (!targetsEqual(record.context.target, target)) {
        throw new LabelStudioContextError('stale-revision', 'target revision is already committed')
      }
      return this.activeSnapshot(record)
    }
    if (record.context.phase !== 'reserved' || record.context.targetRevision !== targetRevision) {
      throw new LabelStudioContextError('stale-revision', 'target reservation is not current')
    }
    record.context = Object.freeze({
      phase: 'committed',
      targetRevision,
      target: snapshotTarget(target),
    })
    return this.activeSnapshot(record)
  }

  /**
   * Retire the exact pending focus without advancing the target revision.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @param correlationId - focus id to retire.
   * @returns the resulting immutable target state.
   */
  retireFocusTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    correlationId: LabelStudioFocusCorrelationId,
  ): LabelStudioTargetState {
    const record = this.requireLease(leaseId, generation)
    if (record.context.phase === 'committed') return snapshotState(record.context)
    if (record.context.phase !== 'reserved'
      || record.context.reservation.kind !== 'focus'
      || record.context.reservation.correlationId !== correlationId) {
      throw new LabelStudioContextError('focus-not-found', 'focus reservation is not current')
    }
    record.context = Object.freeze({ phase: 'vacant', targetRevision: record.context.targetRevision })
    return snapshotState(record.context)
  }

  /**
   * Inspect the current lease without extending its expiry.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @returns the immutable Host-only binding.
   */
  inspectLease(leaseId: LabelStudioContextLeaseId, generation: number): LabelStudioLeaseBinding {
    return this.bindingSnapshot(this.requireLease(leaseId, generation))
  }

  /**
   * Extend the current lease from the current clock value.
   * @param leaseId - current Host-issued lease id.
   * @param generation - current lease generation.
   * @returns the renewed immutable Host-only binding.
   */
  renew(leaseId: LabelStudioContextLeaseId, generation: number): LabelStudioLeaseBinding {
    const record = this.requireLease(leaseId, generation)
    record.expiresAt = this.clock() + this.leaseTtlMs
    return this.bindingSnapshot(record)
  }

  /**
   * Close only the exact active lease generation.
   * @param leaseId - Host-issued lease id.
   * @param generation - lease generation to close.
   * @returns true when this call removed the active lease; false when it was already absent.
   */
  closeLease(leaseId: LabelStudioContextLeaseId, generation: number): boolean {
    this.assertUsable()
    const record = this.recordForLease(leaseId)
    if (record === undefined || record.generation !== generation) return false
    this.remove(record)
    return true
  }

  /**
   * Read a Session's current lease, including a vacant or reserved target.
   * @param sessionId - persistent DSH Session identity.
   * @returns the immutable binding, or undefined after close or expiry.
   */
  getLease(sessionId: SessionId): LabelStudioLeaseBinding | undefined {
    if (this.disposed) return undefined
    const record = this.recordForSession(sessionId)
    return record === undefined ? undefined : this.bindingSnapshot(record)
  }

  /**
   * Read a Session's committed target while its lease remains live.
   * @param sessionId - persistent DSH Session identity.
   * @returns the immutable active context, or undefined without a committed target.
   */
  getLive(sessionId: SessionId): LabelStudioActiveContext | undefined {
    if (this.disposed) return undefined
    const record = this.recordForSession(sessionId)
    return record?.context.phase === 'committed' ? this.activeSnapshot(record) : undefined
  }

  /**
   * Subscribe to authoritative lease removal.
   * @param listener - callback isolated from cleanup and sibling callbacks.
   * @returns an idempotent unsubscribe function.
   */
  onLeaseEnded(listener: (sessionId: SessionId) => void): () => void {
    this.assertUsable()
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Remove all context state for a deleted persistent Session.
   * @param sessionId - deleted DSH Session identity.
   */
  deleteSession(sessionId: SessionId): void {
    this.assertUsable()
    this.deletingSessions.add(sessionId)
    try {
      const record = this.bySession.get(sessionId)
      if (record !== undefined) this.remove(record)
      this.lastGeneration.delete(sessionId)
    } finally {
      this.deletingSessions.delete(sessionId)
    }
  }

  /** Remove every lease and listener, permanently rejecting later mutations. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const records = [...this.bySession.values()]
    this.bySession.clear()
    this.byLease.clear()
    this.lastGeneration.clear()
    this.deletingSessions.clear()
    for (const record of records) this.notifyEnded(record.sessionId)
    this.listeners.clear()
  }

  private assertUsable(): void {
    if (this.disposed) throw new LabelStudioContextError('invalid-request', 'context registry is disposed')
  }

  private nextRevision(current: number): number {
    if (current >= Number.MAX_SAFE_INTEGER) {
      throw new LabelStudioContextError('invalid-request', 'target revision is exhausted')
    }
    return current + 1
  }

  private recordForSession(sessionId: SessionId): LeaseRecord | undefined {
    const record = this.bySession.get(sessionId)
    if (record !== undefined && this.clock() >= record.expiresAt) {
      this.remove(record)
      return undefined
    }
    return record
  }

  private recordForLease(leaseId: LabelStudioContextLeaseId): LeaseRecord | undefined {
    const record = this.byLease.get(leaseId)
    if (record !== undefined && this.clock() >= record.expiresAt) {
      this.remove(record)
      return undefined
    }
    return record
  }

  private requireLease(leaseId: LabelStudioContextLeaseId, generation: number): LeaseRecord {
    this.assertUsable()
    nonNegativeInteger(generation, 'generation')
    const record = this.recordForLease(leaseId)
    if (record === undefined) throw new LabelStudioContextError('lease-expired', 'lease is absent or expired')
    if (record.generation !== generation) {
      throw new LabelStudioContextError('stale-generation', 'lease generation is stale')
    }
    return record
  }

  private remove(record: LeaseRecord): void {
    if (this.bySession.get(record.sessionId) !== record) return
    this.bySession.delete(record.sessionId)
    this.byLease.delete(record.leaseId)
    this.notifyEnded(record.sessionId)
  }

  private notifyEnded(sessionId: SessionId): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(sessionId)
      } catch (error) {
        console.error('[label-studio] lease-ended listener threw:', error)
      }
    }
  }

  private leaseSnapshot(record: LeaseRecord): LabelStudioLeaseSnapshot {
    return Object.freeze({
      leaseId: record.leaseId,
      generation: record.generation,
      expiresAt: record.expiresAt,
    })
  }

  private openSnapshot(record: LeaseRecord): Pick<LabelStudioLeaseOpenResult, 'lease' | 'replayBaseline'> {
    return Object.freeze({ lease: this.leaseSnapshot(record), replayBaseline: record.replayBaseline })
  }

  private reservationSnapshot(
    record: LeaseRecord,
    targetRevision: number,
    navigationSequence?: LabelStudioNavigationSequence,
  ): LabelStudioTargetReservation {
    return Object.freeze(navigationSequence === undefined
      ? { lease: this.leaseSnapshot(record), targetRevision }
      : { lease: this.leaseSnapshot(record), targetRevision, navigationSequence })
  }

  private bindingSnapshot(record: LeaseRecord): LabelStudioLeaseBinding {
    return Object.freeze({
      sessionId: record.sessionId,
      sourceId: record.sourceId,
      lease: this.leaseSnapshot(record),
      context: snapshotState(record.context),
    })
  }

  private activeSnapshot(record: LeaseRecord): LabelStudioActiveContext {
    if (record.context.phase !== 'committed') {
      throw new LabelStudioContextError('stale-revision', 'target is not committed')
    }
    return Object.freeze({
      sessionId: record.sessionId,
      sourceId: record.sourceId,
      leaseId: record.leaseId,
      generation: record.generation,
      targetRevision: record.context.targetRevision,
      expiresAt: record.expiresAt,
      target: snapshotTarget(record.context.target),
    })
  }
}
