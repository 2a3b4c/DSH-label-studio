/** Durable schema for Label Studio page state associated with DSH Sessions. */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { labelStudioAnnotationId, labelStudioContextLeaseId, labelStudioNavigationSequence, labelStudioProjectId, labelStudioTaskId, } from "./context-types.js";
const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const projectIdSchema = positiveSafeInteger.transform(labelStudioProjectId);
const taskIdSchema = positiveSafeInteger.transform(labelStudioTaskId);
const annotationIdSchema = positiveSafeInteger.transform(labelStudioAnnotationId);
const leaseIdSchema = z.string().uuid().transform(labelStudioContextLeaseId);
const navigationSequenceSchema = nonNegativeSafeInteger.transform(labelStudioNavigationSequence);
const pageContextInputSchema = z.discriminatedUnion('view', [
    z.strictObject({ view: z.literal('projects') }),
    z.strictObject({ view: z.literal('project'), projectId: projectIdSchema }),
    z.strictObject({
        view: z.literal('task'),
        projectId: projectIdSchema,
        taskId: taskIdSchema,
        annotationId: annotationIdSchema.optional(),
    }),
]);
/** Validates and brands a durable Label Studio page. */
export const labelStudioPageContextSchema = pageContextInputSchema.transform((page) => {
    if (page.view !== 'task')
        return page;
    return {
        view: 'task',
        projectId: page.projectId,
        taskId: page.taskId,
        ...(page.annotationId === undefined ? {} : { annotationId: page.annotationId }),
    };
});
const recentProjectSchema = z.strictObject({
    projectId: projectIdSchema,
    lastTaskId: taskIdSchema.optional(),
    lastVisitedAt: nonNegativeSafeInteger,
    availability: z.enum(['available', 'deleted']),
});
const pageCommitReceiptSchema = z.strictObject({
    leaseId: leaseIdSchema,
    generation: nonNegativeSafeInteger,
    navigationSequence: navigationSequenceSchema,
    expectedRevision: nonNegativeSafeInteger,
    committedRevision: nonNegativeSafeInteger,
    page: labelStudioPageContextSchema,
});
const sessionContextRecordInputSchema = z.strictObject({
    sessionCreatedAt: nonNegativeSafeInteger,
    page: labelStudioPageContextSchema,
    recentProjects: z.array(recentProjectSchema),
    revision: nonNegativeSafeInteger,
    lastCommit: pageCommitReceiptSchema.optional(),
});
/** Validates records loaded from the Label Studio Session context domain. */
export const labelStudioSessionContextRecordSchema = sessionContextRecordInputSchema.transform((record) => ({
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
}));
/** Storage-domain declaration for durable per-Session Label Studio navigation. */
export const labelStudioSessionContextDomainSpec = defineDomain({
    name: 'label_studio_context',
    version: 1,
    tables: {
        sessions: domainTable(labelStudioSessionContextRecordSchema),
    },
});
//# sourceMappingURL=session-context-spec.js.map