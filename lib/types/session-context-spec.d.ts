/** Durable schema for Label Studio page state associated with DSH Sessions. */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { LabelStudioContextLeaseId, LabelStudioPageContext, LabelStudioSessionContextSnapshot } from '@deepseek-ai/dsh-label-studio-protocol';
import { z } from 'zod';
import { labelStudioNavigationSequence } from './context-types.ts';
/** Validates and brands a durable Label Studio page. */
export declare const labelStudioPageContextSchema: z.ZodType<LabelStudioPageContext>;
/** Identity of the Session lifecycle that owns one durable record. */
export interface LabelStudioSessionIdentity {
    readonly sessionId: SessionId;
    readonly createdAt: number;
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
export interface LabelStudioSessionContextRecord extends LabelStudioSessionContextSnapshot {
    readonly sessionCreatedAt: number;
    readonly lastCommit?: LabelStudioPageCommitReceipt;
}
/** Validates records loaded from the Label Studio Session context domain. */
export declare const labelStudioSessionContextRecordSchema: z.ZodType<LabelStudioSessionContextRecord>;
/** Storage-domain declaration for durable per-Session Label Studio navigation. */
export declare const labelStudioSessionContextDomainSpec: {
    name: string;
    version: number;
    tables: {
        sessions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<SessionId, LabelStudioSessionContextRecord>;
    };
};
//# sourceMappingURL=session-context-spec.d.ts.map