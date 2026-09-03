import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as protocol from '../src/index.ts'
import type {
  LabelStudioActiveContext,
  LabelStudioActiveTarget,
  LabelStudioBrowserEvent,
  LabelStudioLeaseOpenResult,
  LabelStudioEventBatch,
  LabelStudioPageCommit,
  LabelStudioPageCommitRequest,
  LabelStudioPageContext,
  LabelStudioPageContextWire,
  LabelStudioRecentProject,
  LabelStudioRpcOutcome,
  LabelStudioRpcRequestMap,
  LabelStudioRpcResultMap,
  LabelStudioSessionContextSnapshot,
  LabelStudioSessionContextErrorCode,
  LabelStudioTargetState,
} from '../src/index.ts'

describe('Label Studio protocol exports', () => {
  it('keeps the main entry type-only', () => {
    expect(Object.keys(protocol)).toEqual([])
  })

  it('shares client-safe target, lease, and context declarations', () => {
    expectTypeOf<LabelStudioActiveTarget>().toHaveProperty('projectId')
    expectTypeOf<LabelStudioLeaseOpenResult>().toHaveProperty('replayBaseline')
    expectTypeOf<LabelStudioTargetState>().toExtend<
      | { phase: 'vacant'; targetRevision: number }
      | { phase: 'reserved'; targetRevision: number; reservation: unknown }
      | { phase: 'committed'; targetRevision: number; target: LabelStudioActiveTarget }
    >()
    expectTypeOf<LabelStudioActiveContext['sessionId']>().toEqualTypeOf<SessionId>()
    expectTypeOf<LabelStudioRpcRequestMap['events/wait']>().toHaveProperty('afterRevision')
    expectTypeOf<LabelStudioRpcResultMap['events/wait']>().toEqualTypeOf<LabelStudioEventBatch>()
    expectTypeOf<LabelStudioRpcOutcome<LabelStudioLeaseOpenResult>>()
      .toExtend<{ ok: true; value: LabelStudioLeaseOpenResult } | { ok: false; error: unknown }>()
  })

  it('shares exact durable page, history, and commit declarations', () => {
    expectTypeOf<LabelStudioPageContext>().toEqualTypeOf<
      | { readonly view: 'projects' }
      | { readonly view: 'project'; readonly projectId: import('../src/index.ts').LabelStudioProjectId }
      | {
        readonly view: 'task'
        readonly projectId: import('../src/index.ts').LabelStudioProjectId
        readonly taskId: import('../src/index.ts').LabelStudioTaskId
        readonly annotationId?: import('../src/index.ts').LabelStudioAnnotationId
      }
    >()
    expectTypeOf<LabelStudioPageContextWire>().toEqualTypeOf<
      | { readonly view: 'projects' }
      | { readonly view: 'project'; readonly projectId: number }
      | { readonly view: 'task'; readonly projectId: number; readonly taskId: number; readonly annotationId?: number }
    >()
    expectTypeOf<LabelStudioRecentProject>().toHaveProperty('availability')
    expectTypeOf<LabelStudioSessionContextSnapshot>().toHaveProperty('revision')
    expectTypeOf<LabelStudioPageCommitRequest>().toHaveProperty('expectedSessionContextRevision')
    expectTypeOf<LabelStudioPageCommit>().toHaveProperty('navigationSequence')
    expectTypeOf<LabelStudioLeaseOpenResult['sessionContext']>()
      .toEqualTypeOf<LabelStudioSessionContextSnapshot>()
    expectTypeOf<LabelStudioRpcRequestMap['page/commit']>()
      .toEqualTypeOf<LabelStudioPageCommitRequest>()
    expectTypeOf<LabelStudioRpcResultMap['page/commit']>()
      .toEqualTypeOf<LabelStudioSessionContextSnapshot>()
    expectTypeOf<Extract<LabelStudioBrowserEvent, { kind: 'focus-task' }>>()
      .toHaveProperty('expectedSessionContextRevision')
    expectTypeOf<LabelStudioSessionContextErrorCode>()
      .toEqualTypeOf<'session-context-conflict' | 'session-context-unavailable'>()
  })

  it('publishes only the type entry, invariant companion, and declarations', () => {
    const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      name?: string
      exports?: Record<string, unknown>
      files?: string[]
      peerDependencies?: Record<string, string>
    }
    expect(manifest.name).toBe('@deepseek-ai/dsh-label-studio-protocol')
    expect(manifest.exports).toHaveProperty('.')
    expect(manifest.exports).toHaveProperty('./invariant')
    expect(manifest.files).toEqual(['lib/index.js', 'lib/invariant.js', 'lib/types/**/*.d.ts'])
    expect(manifest.peerDependencies).toMatchObject({
      '@deepseek-ai/cordis': '^4.0.2',
      '@deepseek-ai/dsh-brand': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-invariants': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-session': '^0.1.2-alpha.3',
    })
  })
})
