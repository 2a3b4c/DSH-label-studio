import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  LabelStudioAnnotationId,
  LabelStudioBindingChangedEvent,
  LabelStudioBindingCommitOutcome,
  LabelStudioBindingErrorCode,
  LabelStudioBindingSnapshot,
  LabelStudioBindingSource,
  LabelStudioBindingTarget,
  LabelStudioBrowserEvent,
  LabelStudioInspectPageCommit,
  LabelStudioInspectPageCommitRequest,
  LabelStudioInspectPageEvent,
  LabelStudioInspectPageRequest,
  LabelStudioInspectPageResponse,
  LabelStudioPageInspectionId,
  LabelStudioProjectId,
  LabelStudioTaskId,
  LabelStudioWebhookEvent,
  LabelStudioWebhookStatusEvent,
  LabelStudioWebhookUnassignedEvent,
  LabelStudioRpcRequestMap,
  LabelStudioRpcResultMap,
} from '../src/index.ts'

describe('Label Studio intent-binding protocol exports', () => {
  it('exports the complete type-only binding surface', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    for (const name of [
      'LabelStudioBindingSource',
      'LabelStudioBindingTarget',
      'LabelStudioBindingSnapshot',
      'LabelStudioBindingCommitOutcome',
      'LabelStudioPageInspectionId',
      'LabelStudioInspectPageEvent',
      'LabelStudioWebhookUnassignedEvent',
      'LabelStudioBindingChangedEvent',
      'LabelStudioWebhookStatusEvent',
      'LabelStudioInspectPageRequest',
      'LabelStudioInspectPageResponse',
      'LabelStudioInspectPageCommitRequest',
      'LabelStudioInspectPageCommit',
      'LabelStudioWebhookEvent',
      'LabelStudioBindingErrorCode',
    ]) {
      expect(source).toMatch(new RegExp(`export (?:type|interface) ${name}\\b`))
    }
  })

  it('distinguishes empty, project, and task bindings', () => {
    expectTypeOf<LabelStudioBindingSource>()
      .toEqualTypeOf<'tool-result' | 'webhook' | 'current-page'>()
    expectTypeOf<Extract<LabelStudioBindingTarget, { kind: 'project' }>>()
      .toHaveProperty('projectId')
    expectTypeOf<Extract<LabelStudioBindingTarget, { kind: 'task' }>>()
      .toHaveProperty('taskId')

    expectTypeOf<LabelStudioProjectId>().not.toEqualTypeOf<number>()
    expectTypeOf<LabelStudioTaskId>().not.toEqualTypeOf<number>()
    expectTypeOf<LabelStudioAnnotationId>().not.toEqualTypeOf<number>()

    const empty = { recentProjects: [], revision: 0 } as const satisfies LabelStudioBindingSnapshot
    const project = {
      target: { kind: 'project', projectId: 1 as LabelStudioProjectId },
      source: 'tool-result',
      boundAt: 1,
      recentProjects: [],
      revision: 1,
    } as const satisfies LabelStudioBindingSnapshot
    // @ts-expect-error A source without a target and boundAt is not a binding.
    const sourceOnly = { source: 'webhook', recentProjects: [], revision: 1 } satisfies LabelStudioBindingSnapshot
    // @ts-expect-error A target without its source and boundAt is not a binding.
    const targetOnly = { target: project.target, recentProjects: [], revision: 1 } satisfies LabelStudioBindingSnapshot
    // @ts-expect-error A bound target must include its timestamp.
    const missingBoundAt = { target: project.target, source: 'tool-result', recentProjects: [], revision: 1 } satisfies LabelStudioBindingSnapshot
    // @ts-expect-error Raw Label Studio ids must cross the boundary through a validator.
    const rawProjectId = {
      target: { kind: 'project', projectId: 1 },
      source: 'tool-result',
      boundAt: 1,
      recentProjects: [],
      revision: 1,
    } satisfies LabelStudioBindingSnapshot
    expect(empty).not.toHaveProperty('target')
    expect(project.source).toBe('tool-result')
    expect(sourceOnly).toHaveProperty('source')
    expect(targetOnly).toHaveProperty('target')
    expect(missingBoundAt).toHaveProperty('target')
    expect(rawProjectId).toHaveProperty('target')
  })

  it('keeps page inspection request, event, response, and commit identities distinct', () => {
    expectTypeOf<LabelStudioPageInspectionId>().not.toEqualTypeOf<string>()
    expectTypeOf<LabelStudioInspectPageEvent>().toHaveProperty('deadlineAt')
    expectTypeOf<LabelStudioInspectPageRequest['protocol']>()
      .toEqualTypeOf<'dsh-label-studio-page/v1'>()
    expectTypeOf<LabelStudioInspectPageRequest>().toHaveProperty('capability')
    expectTypeOf<LabelStudioInspectPageResponse>().toHaveProperty('page')
    expectTypeOf<LabelStudioInspectPageCommitRequest['inspectionId']>().toEqualTypeOf<string>()
    expectTypeOf<LabelStudioInspectPageCommit['inspectionId']>()
      .toEqualTypeOf<LabelStudioPageInspectionId>()
    expectTypeOf<Extract<LabelStudioBrowserEvent, { kind: 'inspect-current-page' }>>()
      .toEqualTypeOf<LabelStudioInspectPageEvent>()
    expectTypeOf<LabelStudioRpcRequestMap['inspection/commit']>()
      .toEqualTypeOf<LabelStudioInspectPageCommitRequest>()
    expectTypeOf<LabelStudioRpcResultMap['inspection/commit']>()
      .toEqualTypeOf<{ readonly accepted: true }>()
  })

  it('covers browser status events and binding commit conflicts', () => {
    expectTypeOf<LabelStudioBindingChangedEvent>().toHaveProperty('binding')
    expectTypeOf<LabelStudioWebhookStatusEvent['status']>()
      .toEqualTypeOf<'ready' | 'unavailable'>()
    expectTypeOf<LabelStudioWebhookUnassignedEvent['reason']>()
      .toEqualTypeOf<'no-matching-binding'>()
    expectTypeOf<Extract<LabelStudioBindingCommitOutcome, { kind: 'conflict' }>>()
      .toHaveProperty('current')
  })

  it('represents single and batch webhook actions with branded ids', () => {
    expectTypeOf<Extract<LabelStudioWebhookEvent, { action: 'PROJECT_CREATED' }>>()
      .toHaveProperty('projectId')
    expectTypeOf<Extract<LabelStudioWebhookEvent, { action: 'TASKS_CREATED' }>>()
      .toHaveProperty('taskIds')
    expectTypeOf<Extract<LabelStudioWebhookEvent, { action: 'ANNOTATION_CREATED' }>>()
      .toHaveProperty('items')
    expectTypeOf<Extract<LabelStudioWebhookEvent, { action: 'ANNOTATIONS_DELETED' }>>()
      .not.toHaveProperty('taskIds')
  })

  it('publishes stable binding failure codes', () => {
    expectTypeOf<LabelStudioBindingErrorCode>().toEqualTypeOf<
      | 'binding-missing'
      | 'binding-conflict'
      | 'binding-target-mismatch'
      | 'current-page-unavailable'
      | 'current-page-timeout'
      | 'current-page-unsupported'
      | 'webhook-unavailable'
      | 'webhook-unassigned'
    >()
  })
})
