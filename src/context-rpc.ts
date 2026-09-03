/** Authenticated Connection RPC handlers for browser context synchronization. */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  LabelStudioActiveTarget,
  LabelStudioEventBatch,
  LabelStudioPageCommit,
  LabelStudioPageContext,
  LabelStudioRpcError,
  LabelStudioRpcOutcome,
  LabelStudioRpcResultMap,
} from '@deepseek-ai/dsh-label-studio-protocol'
import type { LabelStudioChangeBroker } from './change-broker.ts'
import { LabelStudioContextError, type LabelStudioContextRegistry } from './context-registry.ts'
import {
  labelStudioAnnotationId,
  labelStudioContextLeaseId,
  labelStudioContextSourceId,
  labelStudioFocusCorrelationId,
  labelStudioNavigationSequence,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'
import { LabelStudioOperationClosedError, type LabelStudioOperationGate } from './lifecycle.ts'
import type { LabelStudioSessionIdentity } from './session-context-spec.ts'
import {
  LabelStudioSessionContextError,
  type LabelStudioSessionContextStore,
} from './session-context-store.ts'

/** Long-poll configuration captured by one RPC registrar. */
export interface LabelStudioContextRpcOptions {
  /** Positive duration of one event wait. */
  readonly eventWaitTimeoutMs: number
}

type Endpoint = keyof LabelStudioRpcResultMap

const ENDPOINTS = new Set<Endpoint>([
  'lease/open',
  'lease/close',
  'context/reserve',
  'context/publish',
  'events/wait',
  'focus/ack',
  'page/commit',
])

const ERROR_MESSAGES: Record<LabelStudioRpcError['code'], string> = {
  'invalid-request': 'request fields are invalid',
  'session-not-found': 'DSH Session does not exist',
  'lease-conflict': 'another browser source owns this Session',
  'lease-expired': 'browser lease is absent or expired',
  'stale-generation': 'browser lease generation is stale',
  'stale-revision': 'context revision is stale',
  'future-revision': 'event cursor is ahead of the Host',
  'focus-conflict': 'another focus request is pending',
  'focus-not-found': 'focus request is absent or does not match',
  'session-context-conflict': 'Session page revision is stale',
  'session-context-unavailable': 'Session page storage is unavailable',
}

/**
 * Register the Label Studio channel on Connection's loopback trust policy.
 * @param ctx - Host context carrying Connection, Session, and persistence services.
 * @param registry - synchronous lease and target state.
 * @param broker - Session event history and focus acknowledgements.
 * @param sessionContexts - durable page state for exact Session lifecycles.
 * @param operations - shared package operation gate.
 * @param options - bounded long-poll settings.
 * @returns asynchronous disposer that closes the route before removing it.
 */
export function registerLabelStudioContextRpc(
  ctx: Context,
  registry: LabelStudioContextRegistry,
  broker: LabelStudioChangeBroker,
  sessionContexts: LabelStudioSessionContextStore,
  operations: LabelStudioOperationGate,
  options: LabelStudioContextRpcOptions,
): () => Promise<void> {
  let closing = false
  const handler: ConnectionRpcHandler = async (rawEndpoint, payload, signal) => {
    if (closing) return outer(failure('invalid-request'))
    if (!ENDPOINTS.has(rawEndpoint as Endpoint)) return outer(failure('invalid-request'))
    try {
      const value = await operations.run(signal, operationSignal => dispatch(
        rawEndpoint as Endpoint,
        payload,
        operationSignal,
        ctx,
        registry,
        broker,
        sessionContexts,
        options,
      ))
      return outer(success(value))
    } catch (error) {
      if (error instanceof LabelStudioContextError) return outer(failure(error.code, error.retryAfterMs))
      if (error instanceof LabelStudioSessionContextError) return outer(failure(error.code))
      if (error instanceof LabelStudioOperationClosedError) return outer(failure('invalid-request'))
      if (error instanceof TypeError) return outer(failure('invalid-request'))
      if (signal.aborted) {
        return { ok: false, error: { code: 'cancelled', message: 'Label Studio context request was cancelled', details: {} } }
      }
      return { ok: false, error: { code: 'internal', message: 'Label Studio context request failed', details: {} } }
    }
  }
  const remove = ctx.connection.rpc.handle('/label-studio', handler)
  return async () => {
    closing = true
    await remove()
  }
}

async function dispatch(
  endpoint: Endpoint,
  payload: unknown,
  signal: AbortSignal,
  ctx: Context,
  registry: LabelStudioContextRegistry,
  broker: LabelStudioChangeBroker,
  sessionContexts: LabelStudioSessionContextStore,
  options: LabelStudioContextRpcOptions,
): Promise<LabelStudioRpcResultMap[Endpoint]> {
  switch (endpoint) {
    case 'lease/open': {
      const request = parseOpen(payload)
      const sessionId = SessionId(request.sessionId)
      const identity = await requirePersistentSession(
        ctx, sessionId, signal, registry, broker, sessionContexts,
      )
      const baseline = broker.latestRevision(sessionId)
      const opened = registry.openLease(sessionId, labelStudioContextSourceId(request.sourceId), baseline)
      const sessionContext = await durableOperation(() => sessionContexts.read(identity))
      return Object.freeze({ ...opened, sessionContext })
    }
    case 'lease/close': {
      const request = parseLease(payload)
      return { closed: registry.closeLease(request.leaseId, request.generation) }
    }
    case 'context/reserve': {
      const request = parseReserve(payload)
      const binding = registry.inspectLease(request.leaseId, request.generation)
      const reservation = registry.reserveBrowserTarget(
        request.leaseId,
        request.generation,
        request.navigationSequence,
        request.expectedTargetRevision,
      )
      broker.retireFocus(binding.sessionId)
      return reservation
    }
    case 'context/publish': {
      const request = parsePublish(payload)
      return registry.publishTarget(
        request.leaseId, request.generation, request.targetRevision, request.target,
      )
    }
    case 'events/wait': {
      const request = parseWait(payload)
      const inspected = registry.inspectLease(request.leaseId, request.generation)
      await requirePersistentSession(
        ctx, inspected.sessionId, signal, registry, broker, sessionContexts,
      )
      registry.renew(request.leaseId, request.generation)
      const batch = await broker.wait(
        inspected.sessionId, request.afterRevision, options.eventWaitTimeoutMs, signal,
      )
      const current = registry.inspectLease(request.leaseId, request.generation)
      return Object.freeze({
        lease: current.lease,
        context: current.context,
        events: batch.events,
        latestRevision: batch.latestRevision,
        resetRequired: batch.resetRequired,
      } satisfies LabelStudioEventBatch)
    }
    case 'focus/ack': {
      const request = parseAck(payload)
      const binding = registry.inspectLease(request.leaseId, request.generation)
      await requirePersistentSession(
        ctx, binding.sessionId, signal, registry, broker, sessionContexts,
      )
      return durableOperation(() => broker.acknowledgeFocus(
        request.leaseId, request.generation, request.correlationId, request.targetRevision, request.target,
      ))
    }
    case 'page/commit': {
      const request = parsePageCommit(payload)
      const binding = registry.inspectLease(request.leaseId, request.generation)
      const identity = await requirePersistentSession(
        ctx, binding.sessionId, signal, registry, broker, sessionContexts,
      )
      if (request.page.view === 'task') {
        if (binding.context.phase !== 'committed' || !pageMatchesTarget(request.page, binding.context.target)) {
          throw new LabelStudioContextError('stale-revision', 'task page does not match the active target')
        }
        try {
          return await durableOperation(() => sessionContexts.commit(identity, request))
        } catch (error) {
          registry.closeLease(request.leaseId, request.generation)
          throw error
        }
      }
      if (binding.context.phase !== 'vacant') {
        registry.clearBrowserTarget(
          request.leaseId,
          request.generation,
          request.navigationSequence,
          binding.context.targetRevision,
        )
        broker.retireFocus(binding.sessionId)
      }
      return durableOperation(() => sessionContexts.commit(identity, request))
    }
  }
}

async function requirePersistentSession(
  ctx: Context,
  sessionId: SessionId,
  signal: AbortSignal,
  registry: LabelStudioContextRegistry,
  broker: LabelStudioChangeBroker,
  sessionContexts: LabelStudioSessionContextStore,
): Promise<LabelStudioSessionIdentity> {
  const live = ctx.sessions.get(sessionId)
  if (live !== undefined) return { sessionId, createdAt: live.header.createdAt }
  const headers = await ctx.sessionPersistence.list(signal)
  const header = headers.find(candidate => candidate.id === sessionId)
  if (header !== undefined) return { sessionId, createdAt: header.createdAt }
  registry.deleteSession(sessionId)
  broker.deleteSession(sessionId)
  await durableOperation(() => sessionContexts.delete(sessionId))
  throw new SessionNotFoundError()
}

async function durableOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof LabelStudioSessionContextError) throw error
    throw new LabelStudioSessionContextError('session-context-unavailable')
  }
}

class SessionNotFoundError extends LabelStudioContextError {
  constructor() {
    super('session-not-found', 'DSH Session does not exist')
  }
}

function outer(value: LabelStudioRpcOutcome<unknown>): { ok: true; value: LabelStudioRpcOutcome<unknown> } {
  return { ok: true, value }
}

function success<T>(value: T): LabelStudioRpcOutcome<T> {
  return { ok: true, value }
}

function failure(code: LabelStudioRpcError['code'], retryAfterMs?: number): LabelStudioRpcOutcome<never> {
  if (code === 'lease-conflict') {
    return {
      ok: false,
      error: { code, message: ERROR_MESSAGES[code], details: { retryAfterMs: Math.max(1, retryAfterMs ?? 1) } },
    }
  }
  return { ok: false, error: { code, message: ERROR_MESSAGES[code], details: {} } }
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('payload must be an object')
  const result = value as Record<string, unknown>
  if (Object.keys(result).some(key => !keys.includes(key))) throw new TypeError('payload has unknown fields')
  return result
}

function stringField(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new TypeError('field must be a non-empty string')
  return value
}

function nonNegative(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError('field must be a non-negative safe integer')
  return value as number
}

function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new TypeError('field must be a positive safe integer')
  return value as number
}

function parseOpen(payload: unknown): { sessionId: string; sourceId: string } {
  const value = record(payload, ['sessionId', 'sourceId'])
  return { sessionId: stringField(value.sessionId), sourceId: stringField(value.sourceId) }
}

function parseLease(payload: unknown) {
  const value = record(payload, ['leaseId', 'generation'])
  return { leaseId: labelStudioContextLeaseId(stringField(value.leaseId)), generation: positive(value.generation) }
}

function parseReserve(payload: unknown) {
  const value = record(payload, ['leaseId', 'generation', 'navigationSequence', 'expectedTargetRevision'])
  return {
    ...parseLease({ leaseId: value.leaseId, generation: value.generation }),
    navigationSequence: labelStudioNavigationSequence(nonNegative(value.navigationSequence)),
    expectedTargetRevision: nonNegative(value.expectedTargetRevision),
  }
}

function parseTarget(value: unknown): LabelStudioActiveTarget {
  const target = record(value, ['projectId', 'taskId', 'annotationId'])
  return Object.freeze(target.annotationId === undefined
    ? { projectId: labelStudioProjectId(positive(target.projectId)), taskId: labelStudioTaskId(positive(target.taskId)) }
    : {
      projectId: labelStudioProjectId(positive(target.projectId)),
      taskId: labelStudioTaskId(positive(target.taskId)),
      annotationId: labelStudioAnnotationId(positive(target.annotationId)),
    })
}

function parsePublish(payload: unknown) {
  const value = record(payload, ['leaseId', 'generation', 'targetRevision', 'target'])
  return {
    ...parseLease({ leaseId: value.leaseId, generation: value.generation }),
    targetRevision: nonNegative(value.targetRevision),
    target: parseTarget(value.target),
  }
}

function parseWait(payload: unknown) {
  const value = record(payload, ['leaseId', 'generation', 'afterRevision'])
  return {
    ...parseLease({ leaseId: value.leaseId, generation: value.generation }),
    afterRevision: nonNegative(value.afterRevision),
  }
}

function parseAck(payload: unknown) {
  const value = record(payload, ['leaseId', 'generation', 'correlationId', 'targetRevision', 'target'])
  return {
    ...parseLease({ leaseId: value.leaseId, generation: value.generation }),
    correlationId: labelStudioFocusCorrelationId(stringField(value.correlationId)),
    targetRevision: nonNegative(value.targetRevision),
    target: parseTarget(value.target),
  }
}

function parsePageCommit(payload: unknown): LabelStudioPageCommit {
  const value = record(payload, [
    'leaseId', 'generation', 'navigationSequence', 'expectedSessionContextRevision', 'page',
  ])
  return {
    ...parseLease({ leaseId: value.leaseId, generation: value.generation }),
    navigationSequence: labelStudioNavigationSequence(nonNegative(value.navigationSequence)),
    expectedSessionContextRevision: nonNegative(value.expectedSessionContextRevision),
    page: parsePage(value.page),
  }
}

function parsePage(value: unknown): LabelStudioPageContext {
  const base = record(value, ['view', 'projectId', 'taskId', 'annotationId'])
  if (base.view === 'projects') {
    record(value, ['view'])
    return { view: 'projects' }
  }
  if (base.view === 'project') {
    record(value, ['view', 'projectId'])
    return { view: 'project', projectId: labelStudioProjectId(positive(base.projectId)) }
  }
  if (base.view === 'task') {
    record(value, ['view', 'projectId', 'taskId', 'annotationId'])
    return {
      view: 'task',
      projectId: labelStudioProjectId(positive(base.projectId)),
      taskId: labelStudioTaskId(positive(base.taskId)),
      ...(base.annotationId === undefined
        ? {}
        : { annotationId: labelStudioAnnotationId(positive(base.annotationId)) }),
    }
  }
  throw new TypeError('page view is invalid')
}

function pageMatchesTarget(
  page: Extract<LabelStudioPageContext, { view: 'task' }>,
  target: LabelStudioActiveTarget,
): boolean {
  return page.projectId === target.projectId
    && page.taskId === target.taskId
    && page.annotationId === target.annotationId
}
