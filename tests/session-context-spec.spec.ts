import { describe, expect, it } from 'vitest'
import {
  labelStudioPageContextSchema,
  labelStudioSessionContextDomainSpec,
  labelStudioSessionContextRecordSchema,
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
    expect(Object.keys(labelStudioSessionContextDomainSpec.tables)).toEqual(['sessions'])
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
    { sessionCreatedAt: -1, page: { view: 'projects' }, recentProjects: [], revision: 0 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: -1 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: 0, extra: true },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [{ projectId: 7, lastVisitedAt: 1, availability: 'missing' }], revision: 1 },
    { sessionCreatedAt: 1, page: { view: 'projects' }, recentProjects: [], revision: 1, lastCommit: { leaseId: 'not-a-uuid', generation: 1, navigationSequence: 1, expectedRevision: 0, committedRevision: 1, page: { view: 'projects' } } },
  ])('rejects invalid durable JSON %#', (record) => {
    expect(labelStudioSessionContextRecordSchema.safeParse(record).success).toBe(false)
  })
})
