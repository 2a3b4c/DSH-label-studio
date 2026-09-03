/** Typed browser caller for the Label Studio Connection channel. */

import type {
  ConnectionGeneration,
  ConnectionHandle,
  ConnectionRpcFailure,
  ConnectionRpcResult,
} from '@deepseek-ai/dsh-client-connection/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioActiveContext,
  LabelStudioActiveTarget,
  LabelStudioEventBatch,
  LabelStudioFocusCorrelationId,
  LabelStudioContextSourceId,
  LabelStudioLeaseOpenResult,
  LabelStudioLeaseSnapshot,
  LabelStudioNavigationSequence,
  LabelStudioPageContext,
  LabelStudioInspectPageEvent,
  LabelStudioInspectPageResponse,
  LabelStudioRpcError,
  LabelStudioRpcOutcome,
  LabelStudioTargetReservation,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'

/** Browser dependencies for one logical Label Studio channel. */
export interface LabelStudioBridgeClientOptions {
  readonly connection: Pick<ConnectionHandle, 'rpc' | 'generation'>
  readonly channel: '/label-studio'
}

/** Deterministic failure returned by the Connection framework. */
export class LabelStudioFrameworkFailure extends Error {
  /** Stable failure category. */
  readonly kind = 'framework'
  /** @param error - sanitized Connection failure. */
  constructor(readonly error: ConnectionRpcFailure) { super(error.message) }
}
/** Deterministic failure returned by the Label Studio plugin. */
export class LabelStudioPluginFailure extends Error {
  /** Stable failure category. */
  readonly kind = 'plugin'
  /** @param error - sanitized plugin failure. */
  constructor(readonly error: LabelStudioRpcError) { super(error.message) }
}
/** Dispatched request whose commit outcome cannot be inferred. */
export class LabelStudioTransportUnknown extends Error {
  /** Stable failure category. */
  readonly kind = 'transport-unknown'
  /** @param cause - transport or response-validation failure. */
  constructor(override readonly cause: unknown) { super('Label Studio RPC outcome is unknown', { cause }) }
}
/** Request cancelled before dispatch, or a cancelled read-only wait. */
export class LabelStudioCancellationFailure extends Error {
  /** Stable failure category. */
  readonly kind = 'cancelled'
  constructor() { super('Label Studio RPC was cancelled') }
}
/** Classified Label Studio browser channel failure. */
export type LabelStudioBridgeFailure =
  | LabelStudioFrameworkFailure
  | LabelStudioPluginFailure
  | LabelStudioTransportUnknown
  | LabelStudioCancellationFailure

/**
 * Identify failures classified by the browser RPC bridge.
 * @param error - caught value.
 * @returns whether it is a classified bridge failure.
 */
export function isLabelStudioBridgeFailure(error: unknown): error is LabelStudioBridgeFailure {
  return isRecord(error) && ['framework', 'plugin', 'transport-unknown', 'cancelled'].includes(String(error.kind))
}
/**
 * Identify a dispatched request whose commit outcome is unknown.
 * @param error - caught value.
 * @returns whether the dispatched outcome is unknown.
 */
export function isLabelStudioTransportUnknown(error: unknown): error is LabelStudioTransportUnknown {
  return isRecord(error) && error.kind === 'transport-unknown'
}
/**
 * Identify a deterministic rejection from the Label Studio Host plugin.
 * @param error - caught value.
 * @returns whether the plugin rejected the request.
 */
export function isLabelStudioPluginFailure(error: unknown): error is LabelStudioPluginFailure {
  return isRecord(error) && error.kind === 'plugin'
}

type Parser<T> = (value: unknown) => T

/** Calls and validates the plugin's eight fixed RPC endpoints. */
export class LabelStudioContextBridge {
  private readonly connection: Pick<ConnectionHandle, 'rpc' | 'generation'>
  private readonly channel: '/label-studio'

  /** @param options - Connection source and fixed plugin channel. */
  constructor(options: LabelStudioBridgeClientOptions) {
    this.connection = options.connection
    this.channel = options.channel
  }

  /**
   * Read the current connected Host generation.
   * @returns connected Host generation, or absence during disconnection.
   */
  currentHost(): ConnectionGeneration | undefined { return this.connection.generation.getSnapshot() }
  /**
   * Subscribe to Host generation replacement and loss.
   * @param listener - generation-change callback.
   * @returns listener disposer.
   */
  onHostChanged(listener: () => void): () => void { return this.connection.generation.subscribe(listener) }

  /**
   * Open the selected Session for this browser page.
   * @param sessionId - selected DSH Session.
   * @param sourceId - browser page id.
   * @param signal - cancellation.
   * @returns opened lease and event replay baseline.
   */
  openLease(sessionId: SessionId, sourceId: LabelStudioContextSourceId, signal?: AbortSignal): Promise<LabelStudioLeaseOpenResult> {
    return this.mutate('lease/open', { sessionId, sourceId }, parseOpen, signal)
  }
  /**
   * Close an active browser lease without assuming the outcome after dispatch failure.
   * @param lease - active lease.
   * @param signal - cancellation.
   * @returns whether the Host closed that lease.
   */
  closeLease(lease: LabelStudioLeaseSnapshot, signal?: AbortSignal): Promise<boolean> {
    return this.mutate('lease/close', leaseFields(lease), value => recordBoolean(value, 'closed'), signal)
  }
  /**
   * Reserve the next controlled target revision.
   * @param lease - active lease.
   * @param navigationSequence - monotonic page sequence.
   * @param expectedTargetRevision - CAS revision.
   * @param signal - cancellation.
   * @returns Host reservation.
   */
  reserveTarget(
    lease: LabelStudioLeaseSnapshot,
    navigationSequence: LabelStudioNavigationSequence,
    expectedTargetRevision: number,
    signal?: AbortSignal,
  ): Promise<LabelStudioTargetReservation> {
    return this.mutate('context/reserve', {
      ...leaseFields(lease), navigationSequence, expectedTargetRevision,
    }, parseReservation, signal)
  }
  /**
   * Publish a target after its URL has committed in the browser.
   * @param lease - active lease.
   * @param targetRevision - reserved revision.
   * @param target - controlled target.
   * @param signal - cancellation.
   * @returns committed context.
   */
  publishTarget(
    lease: LabelStudioLeaseSnapshot,
    targetRevision: number,
    target: LabelStudioActiveTarget,
    signal?: AbortSignal,
  ): Promise<LabelStudioActiveContext> {
    return this.mutate('context/publish', {
      ...leaseFields(lease), targetRevision, target: targetWire(target),
    }, parseActiveContext, signal)
  }
  /**
   * Persist the selected page after browser target synchronization completes.
   * @param lease - active lease.
   * @param navigationSequence - browser-monotonic navigation sequence.
   * @param expectedSessionContextRevision - durable page revision observed by the browser.
   * @param page - structured Label Studio page to commit.
   * @param signal - cancellation.
   * @returns committed durable Session context.
   */
  commitPage(
    lease: LabelStudioLeaseSnapshot,
    navigationSequence: LabelStudioNavigationSequence,
    expectedSessionContextRevision: number,
    page: LabelStudioPageContext,
    signal?: AbortSignal,
  ): Promise<LabelStudioSessionContextSnapshot> {
    return this.mutate('page/commit', {
      ...leaseFields(lease), navigationSequence, expectedSessionContextRevision, page: pageWire(page),
    }, parseSessionContext, signal)
  }
  /**
   * Wait for events after the observed revision.
   * @param lease - active lease.
   * @param afterRevision - observed event cursor.
   * @param signal - required wait cancellation.
   * @returns next event batch.
   */
  waitEvents(lease: LabelStudioLeaseSnapshot, afterRevision: number, signal: AbortSignal): Promise<LabelStudioEventBatch> {
    return this.call('events/wait', { ...leaseFields(lease), afterRevision }, (value) => {
      const batch = parseEventBatch(value)
      if (batch.latestRevision < afterRevision
        || batch.events.some(event => event.eventRevision > batch.latestRevision)) {
        throw new Error('invalid event revision range')
      }
      return batch
    }, signal, false)
  }
  /**
   * Confirm a Host focus request after its URL has committed in the browser.
   * @param lease - active lease.
   * @param correlationId - focus receipt.
   * @param targetRevision - focus reservation revision.
   * @param target - applied target.
   * @param signal - cancellation.
   * @returns committed context.
   */
  acknowledgeFocus(
    lease: LabelStudioLeaseSnapshot,
    correlationId: LabelStudioFocusCorrelationId,
    targetRevision: number,
    target: LabelStudioActiveTarget,
    signal?: AbortSignal,
  ): Promise<LabelStudioActiveContext> {
    return this.mutate('focus/ack', {
      ...leaseFields(lease), correlationId, targetRevision, target: targetWire(target),
    }, parseActiveContext, signal)
  }

  /**
   * Submit one exact current-page inspection outcome.
   * @param lease - active browser lease.
   * @param inspectionId - Host-issued inspection identity.
   * @param outcome - validated structured iframe result.
   * @param signal - Session/Connection generation cancellation.
   * @returns idempotent Host acceptance receipt.
   */
  commitInspection(
    lease: LabelStudioLeaseSnapshot,
    inspectionId: LabelStudioInspectPageEvent['inspectionId'],
    outcome: LabelStudioInspectPageResponse['outcome'],
    signal?: AbortSignal,
  ): Promise<{ readonly accepted: true }> {
    return this.mutate('inspection/commit', {
      ...leaseFields(lease), inspectionId, outcome,
    }, (value) => {
      const object = record(value, 'inspection receipt')
      if (object.accepted !== true) throw new Error('invalid inspection receipt')
      return { accepted: true }
    }, signal)
  }

  private mutate<T>(endpoint: string, payload: unknown, parse: Parser<T>, signal?: AbortSignal): Promise<T> {
    return this.call(endpoint, payload, parse, signal, true)
  }

  private async call<T>(
    endpoint: string,
    payload: unknown,
    parse: Parser<T>,
    signal: AbortSignal | undefined,
    commitUnknown: boolean,
  ): Promise<T> {
    if (signal?.aborted === true) throw new LabelStudioCancellationFailure()
    let result: ConnectionRpcResult<unknown>
    try {
      result = await this.connection.rpc.call(this.channel, endpoint, payload, signal)
    } catch (cause) {
      if (!commitUnknown && isAborted(signal)) {
        throw new LabelStudioCancellationFailure()
      }
      throw new LabelStudioTransportUnknown(cause)
    }
    if (!isRecord(result) || typeof result.ok !== 'boolean') {
      throw new LabelStudioTransportUnknown(new Error('invalid Connection RPC result'))
    }
    if (!result.ok) throw new LabelStudioFrameworkFailure(result.error)
    const outcome = result.value as LabelStudioRpcOutcome<unknown>
    if (!isRecord(outcome) || typeof outcome.ok !== 'boolean') {
      throw new LabelStudioTransportUnknown(new Error('invalid Label Studio RPC outcome'))
    }
    if (!outcome.ok) {
      if (!isPluginError(outcome.error)) {
        throw new LabelStudioTransportUnknown(new Error('invalid Label Studio RPC error'))
      }
      throw new LabelStudioPluginFailure(outcome.error)
    }
    try {
      return parse(outcome.value)
    } catch (cause) {
      throw new LabelStudioTransportUnknown(cause)
    }
  }
}

function leaseFields(lease: LabelStudioLeaseSnapshot): { leaseId: string; generation: number } {
  return { leaseId: lease.leaseId, generation: lease.generation }
}
function targetWire(target: LabelStudioActiveTarget): { projectId: number; taskId: number; annotationId?: number } {
  return {
    projectId: target.projectId,
    taskId: target.taskId,
    ...(target.annotationId === undefined ? {} : { annotationId: target.annotationId }),
  }
}
function pageWire(page: LabelStudioPageContext): unknown {
  if (page.view === 'projects') return { view: 'projects' }
  if (page.view === 'project') return { view: 'project', projectId: page.projectId }
  return {
    view: 'task',
    projectId: page.projectId,
    taskId: page.taskId,
    ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
  }
}
function isAborted(signal: AbortSignal | undefined): boolean { return signal?.aborted === true }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`invalid ${field}`)
  return Number(value)
}
function positive(value: unknown, field: string): number {
  const result = integer(value, field)
  if (result === 0) throw new Error(`invalid ${field}`)
  return result
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`invalid ${field}`)
  return value
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`invalid ${field}`)
  return value
}
function recordBoolean(value: unknown, field: string): boolean {
  const object = record(value, 'result')
  if (typeof object[field] !== 'boolean') throw new Error(`invalid ${field}`)
  return object[field]
}
function parseLease(value: unknown): LabelStudioLeaseSnapshot {
  const object = record(value, 'lease')
  return { leaseId: string(object.leaseId, 'leaseId') as never, generation: integer(object.generation, 'generation'), expiresAt: positive(object.expiresAt, 'expiresAt') }
}
function parseOpen(value: unknown): LabelStudioLeaseOpenResult {
  const object = record(value, 'open result')
  return {
    lease: parseLease(object.lease),
    replayBaseline: integer(object.replayBaseline, 'replayBaseline'),
    sessionContext: parseSessionContext(object.sessionContext),
  }
}
function parsePage(value: unknown): LabelStudioPageContext {
  const object = record(value, 'page')
  if (object.view === 'projects') return { view: 'projects' }
  if (object.view === 'project') {
    return { view: 'project', projectId: positive(object.projectId, 'projectId') as never }
  }
  if (object.view === 'task') {
    return {
      view: 'task',
      projectId: positive(object.projectId, 'projectId') as never,
      taskId: positive(object.taskId, 'taskId') as never,
      ...(object.annotationId === undefined
        ? {}
        : { annotationId: positive(object.annotationId, 'annotationId') as never }),
    }
  }
  throw new Error('invalid page view')
}
function parseSessionContext(value: unknown): LabelStudioSessionContextSnapshot {
  const object = record(value, 'session context')
  return {
    page: parsePage(object.page),
    recentProjects: parseRecentProjects(object.recentProjects),
    revision: integer(object.revision, 'revision'),
    binding: parseBinding(object.binding),
  }
}
function parseRecentProjects(value: unknown): LabelStudioSessionContextSnapshot['recentProjects'] {
  if (!Array.isArray(value)) throw new Error('invalid recentProjects')
  return value.map((entry) => {
    const recent = record(entry, 'recent project')
    if (recent.availability !== 'available' && recent.availability !== 'deleted') {
      throw new Error('invalid project availability')
    }
    return {
      projectId: positive(recent.projectId, 'projectId') as never,
      ...(recent.lastTaskId === undefined
        ? {}
        : { lastTaskId: positive(recent.lastTaskId, 'lastTaskId') as never }),
      lastVisitedAt: integer(recent.lastVisitedAt, 'lastVisitedAt'),
      availability: recent.availability,
    }
  })
}
function parseBinding(value: unknown): LabelStudioSessionContextSnapshot['binding'] {
  const object = record(value, 'binding')
  const recentProjects = parseRecentProjects(object.recentProjects)
  const revision = integer(object.revision, 'binding revision')
  if (object.target === undefined) {
    if (object.source !== undefined || object.boundAt !== undefined) throw new Error('invalid empty binding')
    return { recentProjects, revision }
  }
  if (object.source !== 'tool-result' && object.source !== 'webhook' && object.source !== 'current-page') {
    throw new Error('invalid binding source')
  }
  const target = record(object.target, 'binding target')
  const projectId = positive(target.projectId, 'projectId') as never
  if (target.kind === 'project') {
    return {
      target: { kind: 'project', projectId },
      source: object.source,
      boundAt: integer(object.boundAt, 'boundAt'),
      recentProjects,
      revision,
    }
  }
  if (target.kind !== 'task') throw new Error('invalid binding target kind')
  return {
    target: {
      kind: 'task',
      projectId,
      taskId: positive(target.taskId, 'taskId') as never,
      ...(target.annotationId === undefined
        ? {}
        : { annotationId: positive(target.annotationId, 'annotationId') as never }),
    },
    source: object.source,
    boundAt: integer(object.boundAt, 'boundAt'),
    recentProjects,
    revision,
  }
}
function parseTarget(value: unknown): LabelStudioActiveTarget {
  const object = record(value, 'target')
  return {
    projectId: positive(object.projectId, 'projectId') as never,
    taskId: positive(object.taskId, 'taskId') as never,
    ...(object.annotationId === undefined ? {} : { annotationId: positive(object.annotationId, 'annotationId') as never }),
  }
}
function parseReservation(value: unknown): LabelStudioTargetReservation {
  const object = record(value, 'reservation')
  return {
    lease: parseLease(object.lease),
    targetRevision: integer(object.targetRevision, 'targetRevision'),
    ...(object.navigationSequence === undefined ? {} : { navigationSequence: integer(object.navigationSequence, 'navigationSequence') as never }),
  }
}
function parseActiveContext(value: unknown): LabelStudioActiveContext {
  const object = record(value, 'active context')
  return {
    sessionId: string(object.sessionId, 'sessionId') as never,
    sourceId: string(object.sourceId, 'sourceId') as never,
    leaseId: string(object.leaseId, 'leaseId') as never,
    generation: integer(object.generation, 'generation'),
    targetRevision: integer(object.targetRevision, 'targetRevision'),
    expiresAt: positive(object.expiresAt, 'expiresAt'),
    target: parseTarget(object.target),
  }
}
function parseTargetState(value: unknown): LabelStudioEventBatch['context'] {
  const object = record(value, 'target state')
  const targetRevision = integer(object.targetRevision, 'targetRevision')
  if (object.phase === 'vacant') return { phase: 'vacant', targetRevision }
  if (object.phase === 'committed') return { phase: 'committed', targetRevision, target: parseTarget(object.target) }
  if (object.phase !== 'reserved') throw new Error('invalid target phase')
  const reservation = record(object.reservation, 'reservation identity')
  if (reservation.kind === 'browser') {
    return { phase: 'reserved', targetRevision, reservation: { kind: 'browser', navigationSequence: integer(reservation.navigationSequence, 'navigationSequence') as never } }
  }
  if (reservation.kind === 'focus') {
    return { phase: 'reserved', targetRevision, reservation: { kind: 'focus', correlationId: string(reservation.correlationId, 'correlationId') as never } }
  }
  throw new Error('invalid reservation kind')
}
function parseEvent(value: unknown): LabelStudioEventBatch['events'][number] {
  const object = record(value, 'event')
  const eventRevision = positive(object.eventRevision, 'eventRevision')
  if (object.kind === 'task-changed') {
    if (object.reason !== 'prediction-created') throw new Error('invalid change reason')
    return { kind: 'task-changed', eventRevision, taskId: positive(object.taskId, 'taskId') as never, reason: object.reason }
  }
  if (object.kind === 'inspect-current-page') {
    return {
      kind: 'inspect-current-page',
      eventRevision,
      inspectionId: string(object.inspectionId, 'inspectionId') as never,
      deadlineAt: positive(object.deadlineAt, 'deadlineAt'),
    }
  }
  if (object.kind === 'webhook-unassigned') {
    if (object.reason !== 'no-matching-binding') throw new Error('invalid Webhook unassigned reason')
    return { kind: 'webhook-unassigned', eventRevision, reason: object.reason }
  }
  if (object.kind === 'webhook-status') {
    if (object.status !== 'ready' && object.status !== 'unavailable') throw new Error('invalid Webhook status')
    return { kind: 'webhook-status', eventRevision, status: object.status }
  }
  if (object.kind === 'binding-changed') {
    return { kind: 'binding-changed', eventRevision, binding: parseBinding(object.binding) }
  }
  if (object.kind !== 'focus-task' || typeof object.committed !== 'boolean') throw new Error('invalid event kind')
  return {
    kind: 'focus-task', eventRevision,
    correlationId: string(object.correlationId, 'correlationId') as never,
    targetRevision: integer(object.targetRevision, 'targetRevision'),
    target: parseTarget(object.target),
    expectedSessionContextRevision: integer(
      object.expectedSessionContextRevision,
      'expectedSessionContextRevision',
    ),
    deadlineAt: positive(object.deadlineAt, 'deadlineAt'),
    committed: object.committed,
  }
}
function parseEventBatch(value: unknown): LabelStudioEventBatch {
  const object = record(value, 'event batch')
  if (!Array.isArray(object.events) || typeof object.resetRequired !== 'boolean') throw new Error('invalid event batch')
  return {
    lease: parseLease(object.lease), context: parseTargetState(object.context),
    events: object.events.map(parseEvent), latestRevision: integer(object.latestRevision, 'latestRevision'),
    resetRequired: object.resetRequired,
  }
}
function isPluginError(value: unknown): value is LabelStudioRpcError {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string' || !isRecord(value.details)) return false
  const known = [
    'invalid-request', 'session-not-found', 'lease-conflict', 'lease-expired', 'stale-generation',
    'stale-revision', 'future-revision', 'focus-conflict', 'focus-not-found',
    'session-context-conflict', 'session-context-unavailable',
    'binding-missing', 'binding-conflict', 'binding-target-mismatch',
    'current-page-unavailable', 'current-page-timeout', 'current-page-unsupported',
    'webhook-unavailable', 'webhook-unassigned',
  ].includes(value.code)
  if (!known) return false
  return value.code !== 'lease-conflict'
    || (Number.isSafeInteger(value.details.retryAfterMs) && Number(value.details.retryAfterMs) > 0)
}
