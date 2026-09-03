import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  apply as applyConnection,
  inject as connectionInject,
  type ConnectionRpcHandler,
  type HostConnectionHandle,
} from '@deepseek-ai/dsh-client-connection'
import type { WebRoute, WebServer, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, vi } from 'vitest'
import type {
  LabelStudioPageCommit,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { LabelStudioChangeBroker } from '../src/change-broker.ts'
import { LabelStudioContextRegistry } from '../src/context-registry.ts'
import { registerLabelStudioContextRpc } from '../src/context-rpc.ts'
import { LabelStudioCurrentPageBroker } from '../src/current-page-broker.ts'
import {
  labelStudioFocusCorrelationId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'
import { LabelStudioOperationGate } from '../src/lifecycle.ts'
import type { LabelStudioSessionIdentity } from '../src/session-context-spec.ts'
import {
  LabelStudioSessionContextError,
  type LabelStudioSessionContextStore,
} from '../src/session-context-store.ts'

const SESSION = SessionId('rpc-session')
const SOURCE = 'e58087ad-63d3-454e-9fc7-927be1fb14d0'
const TARGET = { projectId: 228, taskId: 486 }
const CREATED_AT = 100
const EMPTY_CONTEXT: LabelStudioSessionContextSnapshot = {
  page: { view: 'projects' }, recentProjects: [], revision: 0,
}

function contextStore(initial: LabelStudioSessionContextSnapshot = EMPTY_CONTEXT) {
  let snapshot = initial
  const read = vi.fn((_identity: LabelStudioSessionIdentity) => snapshot)
  const commit = vi.fn(async (_identity: LabelStudioSessionIdentity, request: LabelStudioPageCommit) => {
    if (request.expectedSessionContextRevision !== snapshot.revision) {
      throw new LabelStudioSessionContextError('session-context-conflict')
    }
    snapshot = { page: request.page, recentProjects: [], revision: snapshot.revision + 1 }
    return snapshot
  })
  const deleteSession = vi.fn(async () => true)
  return {
    read,
    commit,
    deleteSession,
    store: { read, commit, delete: deleteSession } as unknown as LabelStudioSessionContextStore,
  }
}

function webServer(routes: WebRoute[]): Pick<WebServer, 'register' | 'registerUpgrade' | 'tapIndex' | 'port'> {
  return {
    register(route) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    },
    registerUpgrade(_route: WebUpgradeRoute) { return () => undefined },
    tapIndex: () => () => undefined,
    port: 0,
  }
}

function post(headers: Record<string, string>, request: { method: string; [key: string]: unknown }): IncomingMessage {
  const input = Readable.from([Buffer.from(JSON.stringify(request))]) as unknown as IncomingMessage
  Object.assign(input, {
    url: `/label-studio/${request.method}`,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  })
  return input
}

function responseRecorder() {
  const state: { status?: number; headers?: Record<string, string>; body?: string } = {}
  const chunks: Buffer[] = []
  const response = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status
      if (headers !== undefined) state.headers = headers
      return this
    },
    write(value: string | Uint8Array) { chunks.push(Buffer.from(value)); return true },
    end(this: { writableEnded: boolean }, value?: string | Uint8Array) {
      if (value !== undefined) chunks.push(Buffer.from(value))
      state.body = Buffer.concat(chunks).toString()
      this.writableEnded = true
      return this
    },
  }) as unknown as ServerResponse
  return { state, response }
}

function provideConnectionCredentials(ctx: Context): void {
  let record: CredentialRecord | undefined
  ctx.provide('credentials', {
    readRecord: async () => record,
    modifyRecord: async (
      _key: unknown,
      mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
    ) => {
      record = await mutate(record)
      return record
    },
  } as unknown as CredentialProvider)
}

function setup(options: {
  live?: boolean
  cold?: boolean
  sessionContext?: LabelStudioSessionContextSnapshot
} = { live: true }) {
  const ctx = new Context()
  let handler: ConnectionRpcHandler | undefined
  const remove = vi.fn(async () => undefined)
  const handle = vi.fn((_channel, registered: ConnectionRpcHandler, _options) => {
    handler = registered
    return remove
  })
  ctx.provide('connection', { rpc: { handle } } as unknown as HostConnectionHandle)
  ctx.provide('sessions', {
    get: (id: string) => options.live === true && id === SESSION
      ? { header: { id: SESSION, createdAt: CREATED_AT } }
      : undefined,
  } as never)
  const list = vi.fn(async (signal?: AbortSignal) => {
    signal?.throwIfAborted()
    return options.cold === true ? [{ id: SESSION, createdAt: CREATED_AT }] : []
  })
  ctx.provide('sessionPersistence', { list } as never)
  const registry = new LabelStudioContextRegistry(30_000)
  const sessionContexts = contextStore(options.sessionContext)
  const broker = new LabelStudioChangeBroker(registry, 8, sessionContexts.store)
  const currentPages = new LabelStudioCurrentPageBroker(registry, broker)
  const gate = new LabelStudioOperationGate()
  const dispose = registerLabelStudioContextRpc(
    ctx, registry, broker, sessionContexts.store, gate, { eventWaitTimeoutMs: 5 }, currentPages,
  )
  expect(handle).toHaveBeenCalledWith('/label-studio', expect.any(Function))
  return {
    ctx,
    registry,
    broker,
    currentPages,
    gate,
    list,
    sessionContexts,
    remove,
    dispose,
    call: (endpoint: string, payload: unknown, signal = new AbortController().signal) =>
      handler!(endpoint, payload, signal),
  }
}

function inner(result: Awaited<ReturnType<ConnectionRpcHandler>>) {
  expect(result.ok).toBe(true)
  return (result as { ok: true; value: { ok: boolean; value?: unknown; error?: unknown } }).value
}

describe('Label Studio context RPC', () => {
  it('reuses the real Connection loopback Host, Origin, and cross-site trust fence', async () => {
    const ctx = new Context()
    const routes: WebRoute[] = []
    provideConnectionCredentials(ctx)
    ctx.provide('webServer', webServer(routes) as WebServer)
    const connection = ctx.plugin({ inject: [...connectionInject], apply: applyConnection })
    await connection.await()
    ctx.provide('sessions', {
      get: () => ({ header: { id: SESSION, createdAt: CREATED_AT } }),
    } as never)
    ctx.provide('sessionPersistence', { list: async () => [] } as never)
    const registry = new LabelStudioContextRegistry(30_000)
    const sessionContexts = contextStore()
    const broker = new LabelStudioChangeBroker(registry, 8, sessionContexts.store)
    const gate = new LabelStudioOperationGate()
    const dispose = registerLabelStudioContextRpc(
      ctx, registry, broker, sessionContexts.store, gate, { eventWaitTimeoutMs: 5 },
    )
    const route = routes.find(candidate => candidate.path === '/label-studio')!
    const hostConnection = ctx.get('connection') as HostConnectionHandle
    const launch = new URL(hostConnection.authenticatedUrl('http://127.0.0.1:3080'))
    const login = responseRecorder()
    hostConnection.authorizeIndex({
      method: 'GET',
      url: `${launch.pathname}${launch.search}`,
      headers: { host: '127.0.0.1:3080' },
    }, login.response)
    const cookie = login.state.headers?.['set-cookie']?.split(';', 1)[0]
    if (cookie === undefined) throw new Error('test browser authentication did not issue a cookie')
    const request = {
      type: 'client-request',
      rpcId: 'label-studio-trust',
      method: 'lease/open',
      payload: { sessionId: SESSION, sourceId: SOURCE },
    }
    for (const headers of [
      { host: 'harness.example' },
      { host: '127.0.0.1:3080', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    ]) {
      const denied = responseRecorder()
      await route.handler(post(headers, request), denied.response)
      expect(denied.state).toMatchObject({ status: 403, body: 'forbidden' })
    }
    const allowed = responseRecorder()
    await route.handler(post({ host: '127.0.0.1:3080', cookie }, request), allowed.response)
    expect(JSON.parse(allowed.state.body!)).toMatchObject({
      result: { ok: true, value: { ok: true, value: { lease: { generation: 1 } } } },
    })
    await dispose()
    await broker.dispose()
    registry.dispose()
    await connection.dispose()
  })

  it('opens live and cold persistent Sessions with an immutable replay baseline', async () => {
    for (const options of [{ live: true }, { live: false, cold: true }]) {
      const fixture = setup(options)
      fixture.broker.publishTaskChanged(SESSION, labelStudioTaskId(1), 'prediction-created')
      const first = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE }))
      expect(first).toMatchObject({
        ok: true,
        value: { replayBaseline: 1, lease: { generation: 1 }, sessionContext: EMPTY_CONTEXT },
      })
      expect(fixture.sessionContexts.read).toHaveBeenCalledWith({ sessionId: SESSION, createdAt: CREATED_AT })
      fixture.broker.publishTaskChanged(SESSION, labelStudioTaskId(2), 'prediction-created')
      const retry = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE }))
      expect(retry).toMatchObject({
        ok: true,
        value: {
          replayBaseline: 1,
          lease: {
            leaseId: (first as { value: { lease: { leaseId: string } } }).value.lease.leaseId,
            generation: 1,
          },
        },
      })
      const lease = (first as { value: { lease: { leaseId: string; generation: number } } }).value.lease
      const correlation = labelStudioFocusCorrelationId('a720928b-a03b-4e47-a019-b2f217f38d77')
      const reservation = fixture.registry.reserveFocusTarget(lease.leaseId as never, lease.generation, correlation)
      const cancel = new AbortController()
      const focus = fixture.broker.requestFocus(
        { sessionId: SESSION, createdAt: CREATED_AT },
        correlation,
        reservation,
        { projectId: labelStudioProjectId(228), taskId: labelStudioTaskId(486) },
        1_000,
        cancel.signal,
      )
      const events = await fixture.broker.wait(SESSION, 1, 10, new AbortController().signal)
      expect(events.events.find(event => event.kind === 'focus-task')?.eventRevision).toBe(3)
      cancel.abort(new Error('baseline focus cleanup'))
      await expect(focus).rejects.toThrow('baseline focus cleanup')
      await fixture.dispose()
      await fixture.broker.dispose()
    }
  })

  it('supports reserve, publish, wait and idempotent close without exposing request bodies', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = { leaseId: opened.value.lease.leaseId, generation: opened.value.lease.generation }
    const reserved = inner(await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 0,
    })) as { value: { targetRevision: number } }
    expect(reserved.value.targetRevision).toBe(1)
    expect(inner(await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 0,
    }))).toEqual(reserved)
    const published = inner(await fixture.call('context/publish', {
      ...lease, targetRevision: 1, target: TARGET,
    }))
    expect(published).toMatchObject({ ok: true, value: { target: TARGET } })
    expect(inner(await fixture.call('context/publish', {
      ...lease, targetRevision: 1, target: TARGET,
    }))).toEqual(published)
    expect(inner(await fixture.call('context/publish', {
      ...lease, targetRevision: 1, target: { projectId: 228, taskId: 487 },
    }))).toMatchObject({ ok: false, error: { code: 'stale-revision' } })
    const waited = inner(await fixture.call('events/wait', { ...lease, afterRevision: 0 }))
    expect(waited).toMatchObject({ ok: true, value: { context: { phase: 'committed', target: TARGET } } })
    expect(inner(await fixture.call('lease/close', lease))).toEqual({ ok: true, value: { closed: true } })
    expect(inner(await fixture.call('lease/close', lease))).toEqual({ ok: true, value: { closed: false } })

    const secret = 'DO_NOT_ECHO_THIS_BODY'
    const invalid = inner(await fixture.call('context/publish', { secret }))
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-request', details: {} } })
    expect(JSON.stringify(invalid)).not.toContain(secret)
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('validates and accepts only the exact current-page inspection receipt', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
    }
    const pending = fixture.currentPages.request(
      { sessionId: SESSION, createdAt: CREATED_AT }, 1_000, new AbortController().signal,
    )
    const event = (await fixture.broker.wait(SESSION, 0, 10, new AbortController().signal))
      .events.find(candidate => candidate.kind === 'inspect-current-page')
    if (event?.kind !== 'inspect-current-page') throw new Error('inspection event missing')
    expect(inner(await fixture.call('inspection/commit', {
      ...lease,
      inspectionId: event.inspectionId,
      outcome: { kind: 'page', page: { view: 'task', projectId: 228, taskId: 486 } },
    }))).toEqual({ ok: true, value: { accepted: true } })
    await expect(pending).resolves.toEqual({ view: 'task', projectId: 228, taskId: 486 })
    expect(inner(await fixture.call('inspection/commit', {
      ...lease,
      inspectionId: event.inspectionId,
      outcome: { kind: 'page', page: { view: 'task', projectId: 228 } },
    }))).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
    fixture.currentPages.dispose()
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('validates focus ACK fields and preserves an idempotent completed receipt', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = { leaseId: opened.value.lease.leaseId, generation: opened.value.lease.generation }
    const correlation = labelStudioFocusCorrelationId('29a29b79-2eb8-4a75-bc2d-90452899217a')
    const reservation = fixture.registry.reserveFocusTarget(
      lease.leaseId as never, lease.generation, correlation,
    )
    const pending = fixture.broker.requestFocus(
      { sessionId: SESSION, createdAt: CREATED_AT },
      correlation,
      reservation,
      { projectId: labelStudioProjectId(228), taskId: labelStudioTaskId(486) },
      1_000,
      new AbortController().signal,
    )
    expect(inner(await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 99,
    }))).toMatchObject({ ok: false, error: { code: 'stale-revision' } })
    const payload = { ...lease, correlationId: correlation, targetRevision: reservation.targetRevision, target: TARGET }
    const acknowledged = inner(await fixture.call('focus/ack', payload))
    expect(acknowledged).toMatchObject({ ok: true, value: { target: TARGET } })
    expect(inner(await fixture.call('focus/ack', payload))).toEqual(acknowledged)
    await expect(pending).resolves.toMatchObject({ target: TARGET })
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('does not renew a lease when persistent validation fails or is cancelled', async () => {
    const fixture = setup({ live: false, cold: true })
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number; expiresAt: number } }
    }
    const before = fixture.registry.inspectLease(
      opened.value.lease.leaseId as never, opened.value.lease.generation,
    ).lease.expiresAt
    fixture.list.mockRejectedValueOnce(new Error('listing failed'))
    await expect(fixture.call('events/wait', {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
      afterRevision: 0,
    })).resolves.toEqual({
      ok: false,
      error: { code: 'internal', message: 'Label Studio context request failed', details: {} },
    })
    expect(fixture.registry.inspectLease(
      opened.value.lease.leaseId as never, opened.value.lease.generation,
    ).lease.expiresAt).toBe(before)
    fixture.list.mockImplementationOnce(async (signal?: AbortSignal) => {
      await new Promise<undefined>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('cancelled'))
        }, { once: true })
      })
      return []
    })
    const cancelled = new AbortController()
    const cancelledWait = fixture.call('events/wait', {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
      afterRevision: 0,
    }, cancelled.signal)
    cancelled.abort(new Error('cancel persistence check'))
    await expect(cancelledWait).resolves.toEqual({
      ok: false,
      error: { code: 'cancelled', message: 'Label Studio context request was cancelled', details: {} },
    })
    expect(fixture.registry.inspectLease(
      opened.value.lease.leaseId as never, opened.value.lease.generation,
    ).lease.expiresAt).toBe(before)
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('reads the current target after a wait settles and rejects a replaced generation', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = { leaseId: opened.value.lease.leaseId, generation: opened.value.lease.generation }
    const waiting = fixture.call('events/wait', { ...lease, afterRevision: 0 })
    await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 0,
    })
    await fixture.call('context/publish', { ...lease, targetRevision: 1, target: TARGET })
    expect(inner(await waiting)).toMatchObject({
      ok: true,
      value: { context: { phase: 'committed', targetRevision: 1, target: TARGET } },
    })

    const staleWait = fixture.call('events/wait', { ...lease, afterRevision: 0 })
    await fixture.call('lease/close', lease)
    await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })
    expect(inner(await staleWait)).toMatchObject({ ok: false, error: { code: 'lease-expired' } })
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('rejects an absent persistent Session and clears its event history', async () => {
    const fixture = setup({ live: false, cold: false })
    fixture.broker.publishTaskChanged(SESSION, labelStudioTaskId(7), 'prediction-created')
    expect(inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })))
      .toMatchObject({ ok: false, error: { code: 'session-not-found' } })
    expect(fixture.broker.latestRevision(SESSION)).toBe(0)
    expect(fixture.sessionContexts.deleteSession).toHaveBeenCalledWith(SESSION)
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('commits project and task pages only for the lease Session and target', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
    }
    const reserved = inner(await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 0,
    })) as { value: { targetRevision: number } }
    await fixture.call('context/publish', { ...lease, targetRevision: reserved.value.targetRevision, target: TARGET })

    const taskCommit = inner(await fixture.call('page/commit', {
      ...lease,
      navigationSequence: 1,
      expectedSessionContextRevision: 0,
      page: { view: 'task', ...TARGET },
    }))
    expect(taskCommit).toMatchObject({ ok: true, value: { page: { view: 'task', ...TARGET }, revision: 1 } })
    expect(fixture.sessionContexts.commit).toHaveBeenLastCalledWith(
      { sessionId: SESSION, createdAt: CREATED_AT },
      expect.objectContaining({ page: { view: 'task', ...TARGET } }),
    )

    const projectCommit = inner(await fixture.call('page/commit', {
      ...lease,
      navigationSequence: 2,
      expectedSessionContextRevision: 1,
      page: { view: 'project', projectId: TARGET.projectId },
    }))
    expect(projectCommit).toMatchObject({
      ok: true, value: { page: { view: 'project', projectId: TARGET.projectId }, revision: 2 },
    })
    expect(fixture.registry.getLive(SESSION)).toBeUndefined()

    expect(inner(await fixture.call('page/commit', {
      ...lease,
      navigationSequence: 3,
      expectedSessionContextRevision: 2,
      page: { view: 'task', projectId: TARGET.projectId, taskId: TARGET.taskId + 1 },
    }))).toMatchObject({ ok: false, error: { code: 'stale-revision' } })
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('returns sanitized Session context conflicts and storage failures', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const request = {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
      navigationSequence: 1,
      expectedSessionContextRevision: 9,
      page: { view: 'project', projectId: 7 },
    }
    const conflict = inner(await fixture.call('page/commit', request))
    expect(conflict).toMatchObject({ ok: false, error: { code: 'session-context-conflict', details: {} } })

    const secret = 'DO_NOT_ECHO_STORAGE_BODY'
    fixture.sessionContexts.commit.mockRejectedValueOnce(new Error(secret))
    const unavailable = inner(await fixture.call('page/commit', { ...request, expectedSessionContextRevision: 0 }))
    expect(unavailable).toMatchObject({ ok: false, error: { code: 'session-context-unavailable', details: {} } })
    expect(JSON.stringify(unavailable)).not.toContain(secret)
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('removes a published task lease when its durable page commit fails', async () => {
    const fixture = setup()
    const opened = inner(await fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE })) as {
      value: { lease: { leaseId: string; generation: number } }
    }
    const lease = {
      leaseId: opened.value.lease.leaseId,
      generation: opened.value.lease.generation,
    }
    const reserved = inner(await fixture.call('context/reserve', {
      ...lease, navigationSequence: 1, expectedTargetRevision: 0,
    })) as { value: { targetRevision: number } }
    await fixture.call('context/publish', {
      ...lease, targetRevision: reserved.value.targetRevision, target: TARGET,
    })
    fixture.sessionContexts.commit.mockRejectedValueOnce(new Error('durability failed'))

    expect(inner(await fixture.call('page/commit', {
      ...lease,
      navigationSequence: 1,
      expectedSessionContextRevision: 0,
      page: { view: 'task', ...TARGET },
    }))).toMatchObject({ ok: false, error: { code: 'session-context-unavailable' } })
    expect(fixture.registry.getLease(SESSION)).toBeUndefined()
    await fixture.dispose()
    await fixture.broker.dispose()
  })

  it('marks the route closing before awaiting the asynchronous channel disposer', async () => {
    const fixture = setup()
    const removal = Promise.withResolvers<undefined>()
    fixture.remove.mockImplementation(async () => removal.promise)
    const disposing = fixture.dispose()
    await expect(fixture.call('lease/open', { sessionId: SESSION, sourceId: SOURCE }))
      .resolves.toMatchObject({ ok: true, value: { ok: false, error: { code: 'invalid-request' } } })
    removal.resolve(undefined)
    await disposing
    await fixture.broker.dispose()
  })
})
