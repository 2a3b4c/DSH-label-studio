/** Durable schema for Label Studio page state associated with DSH Sessions. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioBindingSnapshot, LabelStudioBindingSource, LabelStudioBindingTarget, LabelStudioContextLeaseId, LabelStudioPageContext, LabelStudioSessionContextSnapshot } from '@deepseek-ai/dsh-label-studio-protocol';
import { z } from 'zod';
import { labelStudioNavigationSequence } from './context-types.ts';
/** Validates and brands a durable Label Studio page. */
export declare const labelStudioPageContextSchema: z.ZodType<LabelStudioPageContext>;
/** Identity of the Session lifecycle that owns one durable record. */
export interface LabelStudioSessionIdentity {
    readonly sessionId: SessionId;
    readonly createdAt: number;
}
/** Compare-and-set request for one Session binding. */
export type LabelStudioBindingCommit = {
    readonly expectedRevision: number;
} & ({
    readonly target?: never;
    readonly source?: never;
} | {
    readonly target: LabelStudioBindingTarget;
    readonly source: LabelStudioBindingSource;
});
/** Before-and-after binding projection produced by deletion reconciliation. */
export interface LabelStudioSessionBindingChange {
    readonly sessionId: SessionId;
    readonly before: LabelStudioBindingSnapshot;
    readonly after: LabelStudioBindingSnapshot;
}
/** Singleton UUID used to reconcile Webhooks created by this plugin. */
export interface LabelStudioWebhookOwnerRecord {
    readonly ownerId: string;
}
/** Request identity retained to return an exact lost-response retry. */
export interface LabelStudioPageCommitReceipt {
    readonly leaseId: LabelStudioContextLeaseId;
    readonly generation: number;
    readonly navigationSequence: ReturnType<typeof labelStudioNavigationSequence>;
    readonly expectedRevision: number;
    readonly committedRevision: number;
    readonly page: LabelStudioPageContext;
}
/** Complete durable state stored for one DSH Session lifecycle. */
export interface LabelStudioSessionContextRecord {
    readonly sessionCreatedAt: number;
    readonly page: LabelStudioPageContext;
    readonly recentProjects: LabelStudioSessionContextSnapshot['recentProjects'];
    readonly revision: number;
    readonly binding?: LabelStudioBindingSnapshot;
    readonly lastCommit?: LabelStudioPageCommitReceipt;
}
/** Validates a complete empty or bound Session binding snapshot. */
export declare const labelStudioBindingSnapshotSchema: z.ZodType<LabelStudioBindingSnapshot>;
/** Validates the singleton Webhook owner record. */
export declare const labelStudioWebhookOwnerRecordSchema: z.ZodType<LabelStudioWebhookOwnerRecord>;
/** Validates records loaded from the Label Studio Session context domain. */
export declare const labelStudioSessionContextRecordSchema: z.ZodType<LabelStudioSessionContextRecord>;
/** Storage-domain declaration for durable per-Session Label Studio navigation. */
export declare const labelStudioSessionContextDomainSpec: {
    name: string;
    version: number;
    tables: {
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<SessionId, LabelStudioSessionContextRecord>;
        webhook_owners: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<"owner", LabelStudioWebhookOwnerRecord>;
    };
};
//# sourceMappingURL=session-context-spec.d.ts.map