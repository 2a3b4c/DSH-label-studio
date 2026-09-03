/** Durable schema for Label Studio page state associated with DSH Sessions. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  LabelStudioContextLeaseId,
  LabelStudioPageContext,
  LabelStudioSessionContextSnapshot,
} from '@deepseek-ai/dsh-label-studio-protocol'
import { z } from 'zod'
import {
  labelStudioAnnotationId,
  labelStudioContextLeaseId,
  labelStudioNavigationSequence,
  labelStudioProjectId,
  labelStudioTaskId,
} from './context-types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const projectIdSchema = positiveSafeInteger.transform(labelStudioProjectId)
const taskIdSchema = positiveSafeInteger.transform(labelStudioTaskId)
const annotationIdSchema = positiveSafeInteger.transform(labelStudioAnnotationId)
const leaseIdSchema = z.string().uuid().transform(labelStudioContextLeaseId)
const navigationSequenceSchema = nonNegativeSafeInteger.transform(labelStudioNavigationSequence)

const pageContextInputSchema = z.discriminatedUnion('view', [
  z.strictObject({ view: z.literal('projects') }),
  z.strictObject({ view: z.literal('project'), projectId: projectIdSchema }),
  z.strictObject({
    view: z.literal('task'),
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    annotationId: annotationIdSchema.optional(),
  }),
])

/** Validates and brands a durable Label Studio page. */
export const labelStudioPageContextSchema: z.ZodType<LabelStudioPageContext> =
  pageContextInputSchema.transform((page): LabelStudioPageContext => {
    if (page.view !== 'task') return page
    return {
      view: 'task',
      projectId: page.projectId,
      taskId: page.taskId,
      ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
    }
  })

/** Identity of the Session lifecycle that owns one durable record. */
export interface LabelStudioSessionIdentity {
  readonly sessionId: SessionId
  readonly createdAt: number
}

/** Request identity retained to return an exact lost-response retry. */
export interface LabelStudioPageCommitReceipt {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly navigationSequence: ReturnType<typeof labelStudioNavigationSequence>
  readonly expectedRevision: number
  readonly committedRevision: number
  readonly page: LabelStudioPageContext
}

/** Complete durable state stored for one DSH Session lifecycle. */
export interface LabelStudioSessionContextRecord extends LabelStudioSessionContextSnapshot {
  readonly sessionCreatedAt: number
  readonly lastCommit?: LabelStudioPageCommitReceipt
}

const recentProjectSchema = z.strictObject({
  projectId: projectIdSchema,
  lastTaskId: taskIdSchema.optional(),
  lastVisitedAt: nonNegativeSafeInteger,
  availability: z.enum(['available', 'deleted']),
})

const pageCommitReceiptSchema: z.ZodType<LabelStudioPageCommitReceipt> = z.strictObject({
  leaseId: leaseIdSchema,
  generation: nonNegativeSafeInteger,
  navigationSequence: navigationSequenceSchema,
  expectedRevision: nonNegativeSafeInteger,
  committedRevision: nonNegativeSafeInteger,
  page: labelStudioPageContextSchema,
})

const sessionContextRecordInputSchema = z.strictObject({
  sessionCreatedAt: nonNegativeSafeInteger,
  page: labelStudioPageContextSchema,
  recentProjects: z.array(recentProjectSchema),
  revision: nonNegativeSafeInteger,
  lastCommit: pageCommitReceiptSchema.optional(),
})

/** Validates records loaded from the Label Studio Session context domain. */
export const labelStudioSessionContextRecordSchema: z.ZodType<LabelStudioSessionContextRecord> =
  sessionContextRecordInputSchema.transform((record): LabelStudioSessionContextRecord => ({
    sessionCreatedAt: record.sessionCreatedAt,
    page: record.page,
    recentProjects: record.recentProjects.map(recent => ({
      projectId: recent.projectId,
      ...(recent.lastTaskId === undefined ? {} : { lastTaskId: recent.lastTaskId }),
      lastVisitedAt: recent.lastVisitedAt,
      availability: recent.availability,
    })),
    revision: record.revision,
    ...(record.lastCommit === undefined ? {} : { lastCommit: record.lastCommit }),
  }))

/** Storage-domain declaration for durable per-Session Label Studio navigation. */
export const labelStudioSessionContextDomainSpec = defineDomain({
  name: 'label_studio_context',
  version: 1,
  tables: {
    sessions: domainTable<SessionId, LabelStudioSessionContextRecord>(
      labelStudioSessionContextRecordSchema,
    ),
  },
})
