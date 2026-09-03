/** Durable schema for Label Studio page state associated with DSH Sessions. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  LabelStudioBindingSnapshot,
  LabelStudioBindingSource,
  LabelStudioBindingTarget,
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

/** Compare-and-set request for one Session binding. */
export type LabelStudioBindingCommit = { readonly expectedRevision: number } & (
  | { readonly target?: never; readonly source?: never }
  | { readonly target: LabelStudioBindingTarget; readonly source: LabelStudioBindingSource }
)

/** Before-and-after binding projection produced by deletion reconciliation. */
export interface LabelStudioSessionBindingChange {
  readonly sessionId: SessionId
  readonly before: LabelStudioBindingSnapshot
  readonly after: LabelStudioBindingSnapshot
}

/** Singleton UUID used to reconcile Webhooks created by this plugin. */
export interface LabelStudioWebhookOwnerRecord {
  readonly ownerId: string
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
export interface LabelStudioSessionContextRecord {
  readonly sessionCreatedAt: number
  readonly page: LabelStudioPageContext
  readonly recentProjects: LabelStudioSessionContextSnapshot['recentProjects']
  readonly revision: number
  readonly binding?: LabelStudioBindingSnapshot
  readonly lastCommit?: LabelStudioPageCommitReceipt
}

const recentProjectInputSchema = z.strictObject({
  projectId: projectIdSchema,
  lastTaskId: taskIdSchema.optional(),
  lastVisitedAt: nonNegativeSafeInteger,
  availability: z.enum(['available', 'deleted']),
})

const recentProjectSchema = recentProjectInputSchema.transform((recent) => ({
  projectId: recent.projectId,
  ...(recent.lastTaskId === undefined ? {} : { lastTaskId: recent.lastTaskId }),
  lastVisitedAt: recent.lastVisitedAt,
  availability: recent.availability,
}))

const bindingTargetInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('project'), projectId: projectIdSchema }),
  z.strictObject({
    kind: z.literal('task'),
    projectId: projectIdSchema,
    taskId: taskIdSchema,
    annotationId: annotationIdSchema.optional(),
  }),
])

const bindingTargetSchema: z.ZodType<LabelStudioBindingTarget> =
  bindingTargetInputSchema.transform((target): LabelStudioBindingTarget => {
    if (target.kind === 'project') return target
    return {
      kind: 'task',
      projectId: target.projectId,
      taskId: target.taskId,
      ...(target.annotationId === undefined ? {} : { annotationId: target.annotationId }),
    }
  })

const bindingSourceSchema: z.ZodType<LabelStudioBindingSource> = z.enum([
  'tool-result',
  'webhook',
  'current-page',
])

const emptyBindingSchema = z.strictObject({
  recentProjects: z.array(recentProjectSchema),
  revision: nonNegativeSafeInteger,
})

const boundBindingSchema = z.strictObject({
  target: bindingTargetSchema,
  source: bindingSourceSchema,
  boundAt: nonNegativeSafeInteger,
  recentProjects: z.array(recentProjectSchema),
  revision: nonNegativeSafeInteger,
})

/** Validates a complete empty or bound Session binding snapshot. */
export const labelStudioBindingSnapshotSchema: z.ZodType<LabelStudioBindingSnapshot> =
  z.union([emptyBindingSchema, boundBindingSchema]).transform((binding): LabelStudioBindingSnapshot => {
    const recentProjects = binding.recentProjects.map(recent => ({ ...recent }))
    if (!('target' in binding)) return { recentProjects, revision: binding.revision }
    return {
      target: binding.target,
      source: binding.source,
      boundAt: binding.boundAt,
      recentProjects,
      revision: binding.revision,
    }
  })

/** Validates the singleton Webhook owner record. */
export const labelStudioWebhookOwnerRecordSchema: z.ZodType<LabelStudioWebhookOwnerRecord> =
  z.strictObject({ ownerId: z.string().uuid() })

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
  binding: labelStudioBindingSnapshotSchema.optional(),
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
    binding: record.binding ?? { recentProjects: [], revision: 0 },
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
    webhook_owners: domainTable<'owner', LabelStudioWebhookOwnerRecord>(
      labelStudioWebhookOwnerRecordSchema,
    ),
  },
})
