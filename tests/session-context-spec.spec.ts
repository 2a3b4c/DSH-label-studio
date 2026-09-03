import { describe, expect, it } from 'vitest'
import {
  labelStudioPageContextSchema,
  labelStudioSessionContextDomainSpec,
  labelStudioSessionContextRecordSchema,
  labelStudioWebhookOwnerRecordSchema,
} from '../src/session-context-spec.ts'

const leaseId = '123e4567-e89b-42d3-a456-426614174000'

describe('Label Studio Session context storage specification', () => {
  it.each([
    { view: 'projects' },
    { view: 'project', projectId: 7 },
    { view: 'task', projectId: 7, taskId: 11 },
    { view: 'task', projectId: 7, taskId: 11, annotationId: 13 },
  ])('accepts the exact $view page form', (page) => {
    expect(labelStudioPageContextSchema.parse(page)).toEqual(page)
  })

  it.each([
    { view: 'projects', projectId: 7 },
    { view: 'project' },
    { view: 'project', projectId: 0 },
    { view: 'project', projectId: 1.5 },
    { view: 'task', projectId: 7 },
    { view: 'task', projectId: 7, taskId: Number.MAX_SAFE_INTEGER + 1 },
    { view: 'task', projectId: 7, taskId: 11, annotationId: -1 },
    { view: 'unknown' },
  ])('rejects an invalid page %#', (page) => {
    expect(labelStudioPageContextSchema.safeParse(page).success).toBe(false)
  })

  it('declares one versioned sessions table', () => {
    expect(labelStudioSessionContextDomainSpec.name).toBe('label_studio_context')
    expect(labelStudioSessionContextDomainSpec.version).toBe(1)
    expect(Object.keys(labelStudioSessionContextDomainSpec.tables)).toEqual(['sessions', 'webhook_owners'])
  })

  it('projects an old record without a binding as an empty binding', () => {
    const parsed = labelStudioSessionContextRecordSchema.parse({
      sessionCreatedAt: 1,
      page: { view: 'projects' },
      recentProjects: [],
      revision: 0,
    })
    expect(parsed.binding).toEqual({ recentProjects: [], revision: 0 })
  })

  it('requires a UUID for the durable Webhook owner id', () => {
    expect(labelStudioWebhookOwnerRecordSchema.safeParse({ ownerId: 'not-a-uuid' }).success).toBe(false)
    expect(labelStudioWebhookOwnerRecordSchema.safeParse({
      ownerId: '123e4567-e89b-42d3-a456-426614174000',
    }).success).toBe(true)
  })

  it('accepts a complete record including history and the last commit receipt', () => {
    const record = {
      sessionCreatedAt: 1_788_000_000_000,
      page: { view: 'task', projectId: 7, taskId: 11, annotationId: 13 },
      recentProjects: [{
        projectId: 7,
        lastTaskId: 11,
        lastVisitedAt: 1_788_000_000_100,
        availability: 'available',
      }],
      revision: 4,
      binding: {
        target: { kind: 'task', projectId: 7, taskId: 11, annotationId: 13 },
        source: 'tool-result',
        boundAt: 1_788_000_000_200,
        recentProjects: [{
          projectId: 7,
          lastTaskId: 11,
          lastVisitedAt: 1_788_000_000_200,
          availability: 'available',
        }],
        revision: 2,
      },
      lastCommit: {
        leaseId,
        generation: 2,
        navigationSequence: 3,
        expectedRevision: 3,
        committedRevision: 4,
        page: { view: 'task', projectId: 7, taskId: 11, annotationId: 13 },
      },
    }
    expect(labelStudioSessionContextRecordSchema.parse(record)).toEqual(record)
  })

  it.each([
    { target: { kind: 'project', projectId: 7 }, recentProjects: [], revision: 1 },
    { source: 'tool-result', boundAt: 1, recentProjects: [], revision: 1 },
    { target: { kind: 'project', projectId: 7 }, source: 'tool-result', recentProjects: [], revision: 1 },
    { target: { kind: 'project', projectId: 0 }, source: 'tool-result', boundAt: 1, recentProjects: [], revision: 1 },
    { target: { kind: 'task', projectId: 7, taskId: -1 }, source: 'tool-result', boundAt: 1, recentProjects: [], revision: 1 },
    { target: { kind: 'project', projectId: 7 }, source: 'browser', boundAt: 1, recentProjects: [], revision: 1 },
    { target: { kind: 'project', projectId: 7 }, source: 'tool-result', boundAt: -1, recentProjects: [], revision: 1 },
  ])('rejects an invalid binding %#', (binding) => {
    expect(labelStudioSessionContextRecordSchema.safeParse({
      sessionCreatedAt: 1,
      page: { view: 'projects' },
      recentProjects: [],
      revision: 0,
      binding,
    }).success).toBe(false)
  })

  it.each([
    { sessionCreatedAt: -1, page: { view: 'projects' }, recentProjects: [], revision: 0 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: -1 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: 0, extra: true },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [{ projectId: 7, lastVisitedAt: 1, availability: 'missing' }], revision: 1 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: 1, lastCommit: { leaseId: 'not-a-uuid', generation: 1, navigationSequence: 1, expectedRevision: 0, committedRevision: 1, page: { view: 'projects' } } },
  ])('rejects invalid durable JSON %#', (record) => {
    expect(labelStudioSessionContextRecordSchema.safeParse(record).success).toBe(false)
  })
})
