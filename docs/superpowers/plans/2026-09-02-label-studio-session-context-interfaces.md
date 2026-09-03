# Unified Label Studio Session Context Interfaces

English | [中文](2026-09-02-label-studio-session-context-interfaces.zh.md)

This document defines the unified interfaces that let the Label Studio plugin save a page location and recent projects for each DSH Session. The implementation baseline is DSH `0.1.2-alpha.3` (tag `dsh-v0.1.2-alpha.3`, commit `dd6322d604e00eec1ba5e0c8541159906a21094a`). See the [master TODO](2026-09-02-label-studio-session-context-todo.md) for execution order.

## Scope

Each DSH Session saves its own current Label Studio page and recently visited projects. The browser restores that Session's last page after a Session switch or DSH restart; a Session without a record opens the Label Studio project list.

This feature does not implement a Label Studio page Bridge. DSH does not immediately observe a user who freely creates, deletes, or switches projects inside the iframe or in a separate `127.0.0.1:8080` page; only plugin-initiated navigation and later REST validation can update the durable record.

## Session and prompt isolation

The plugin reads only `SessionId` and the Session header's `createdAt` as the durable record identity. It does not modify the `Session` class, `SessionEventMap`, the Session log, or `deriveMessages()`. The `label_studio_context` storage domain does not participate in prompt assembly, so saved page locations, recent projects, and deletion states do not add to or change model context.

When the model calls tools such as `label_studio_get_active_task` or `label_studio_create_prediction`, the tool call and result still enter the Session log through the existing DSH mechanism. This is the only path for model-visible business data and is separate from browser page-location storage.

## State layers

| State | Lifetime | Storage | Purpose |
|---|---|---|---|
| Session page context | Survives DSH restart and browser close | Plugin `label_studio_context` storage domain | Restore the project list, project page, or task page and recent projects |
| Browser lease | While a browser connection is alive | Host-memory `LabelStudioContextRegistry` | Decide which page may represent the current Session |
| Active task | While the current lease has a committed task | Host-memory lease record | Let model tools read the current task |
| Sample and annotation content | Read for each operation | Label Studio REST API | Supply authoritative data, annotations, and predictions |

Closing or expiring a lease clears only the temporary active task and does not delete the Session page context. Removing the plugin leaves the DSH Session log unchanged; reinstalling the plugin can restore the storage-domain records.

## Shared protocol types

File: `packages/protocol/src/index.ts`

```ts
export type LabelStudioPageContext =
  | { readonly view: 'projects' }
  | {
      readonly view: 'project'
      readonly projectId: LabelStudioProjectId
    }
  | {
      readonly view: 'task'
      readonly projectId: LabelStudioProjectId
      readonly taskId: LabelStudioTaskId
      readonly annotationId?: LabelStudioAnnotationId
    }

export type LabelStudioProjectAvailability = 'available' | 'deleted'

export interface LabelStudioRecentProject {
  readonly projectId: LabelStudioProjectId
  readonly lastTaskId?: LabelStudioTaskId
  readonly lastVisitedAt: number
  readonly availability: LabelStudioProjectAvailability
}

export interface LabelStudioSessionContextSnapshot {
  readonly page: LabelStudioPageContext
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
}

export interface LabelStudioPageCommitRequest {
  readonly leaseId: string
  readonly generation: number
  readonly navigationSequence: number
  readonly expectedSessionContextRevision: number
  readonly page: LabelStudioPageContextWire
}

export interface LabelStudioPageCommit {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly navigationSequence: LabelStudioNavigationSequence
  readonly expectedSessionContextRevision: number
  readonly page: LabelStudioPageContext
}
```

`LabelStudioPageContextWire` has the same fields as `LabelStudioPageContext`, but IDs crossing RPC are unbranded positive integers. The Host and Client independently validate JSON, positive safe integers, enum values, and unknown fields at their parsing boundaries.

`revision` is a per-Session monotonic non-negative safe integer. It increments when the page or recent-project state actually changes; restoring the same page does not increment it. The Host writes `lastVisitedAt` as epoch milliseconds, and the browser cannot supply the time.

`recentProjects` is sorted by descending `lastVisitedAt`. Visiting a project or task moves that project to the front; visiting a task also writes `lastTaskId`. A confirmed deleted project remains in history with `deleted` status but cannot become an automatic restore target.

## Host durable record

File: `src/session-context-spec.ts`

```ts
export interface LabelStudioSessionIdentity {
  readonly sessionId: SessionId
  readonly createdAt: number
}

export interface LabelStudioPageCommitReceipt {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly navigationSequence: LabelStudioNavigationSequence
  readonly expectedRevision: number
  readonly committedRevision: number
  readonly page: LabelStudioPageContext
}

export interface LabelStudioSessionContextRecord
  extends LabelStudioSessionContextSnapshot {
  readonly sessionCreatedAt: number
  readonly lastCommit?: LabelStudioPageCommitReceipt
}

export const labelStudioSessionContextDomainSpec = defineDomain({
  name: 'label_studio_context',
  version: 1,
  tables: {
    sessions: domainTable<SessionId, LabelStudioSessionContextRecord>(
      labelStudioSessionContextRecordSchema,
    ),
  },
})
```

The alpha.3 `dsh-base` bundle already mounts `storage`, `storage-json`, and `storage-domain`. The default Web profile writes this single-file domain to `$DSH_HOME/storages/label_studio_context.json`; the plugin adds no custom path option and does not call Node.js file APIs directly.

`sessionCreatedAt` prevents a deleted and recreated `SessionId` from inheriting an old page. A read with a mismatched `createdAt` returns the empty context; the first successful commit replaces the old record.

`lastCommit` exists only for exact retries after an RPC response is lost within one lease. A request with the same lease, generation, navigation sequence, expected revision, and page returns the original commit result; any changed field follows normal CAS validation as a new commit.

## Host context store

File: `src/session-context-store.ts`

```ts
export interface LabelStudioSessionContextStoreOptions {
  readonly recentProjectLimit: number
  readonly clock?: () => number
}

export class LabelStudioSessionContextStore {
  static open(
    ctx: Pick<Context, 'storageDomain'>,
    options: LabelStudioSessionContextStoreOptions,
  ): Promise<LabelStudioSessionContextStore>

  read(
    identity: LabelStudioSessionIdentity,
  ): LabelStudioSessionContextSnapshot

  commit(
    identity: LabelStudioSessionIdentity,
    request: LabelStudioPageCommit,
  ): Promise<LabelStudioSessionContextSnapshot>

  markProjectDeleted(
    identity: LabelStudioSessionIdentity,
    projectId: LabelStudioProjectId,
  ): Promise<LabelStudioSessionContextSnapshot>

  delete(
    sessionId: SessionId,
  ): Promise<boolean>

  close(): Promise<void>
}
```

`open()` opens the unique domain and obtains the `sessions` table. The plugin's Cordis effect awaits `close()` during unload; the storage domain persists each write before changing in-memory state and reporting success.

`commit()` applies CAS with `expectedSessionContextRevision` and serializes operations per Session. A revision mismatch throws `session-context-conflict`; an exactly matching `lastCommit` retry returns the committed snapshot. An old request cannot overwrite a page that a later commit has replaced.

`markProjectDeleted()` marks the matching history entry as `deleted`. If the current page points at that project, it atomically falls back to `{ view: 'projects' }` and does not automatically select another historical project.

`delete()` runs only after the Host confirms that the durable DSH Session does not exist. A normal `session/disposed` means that a Session left memory and does not mean that the user deleted it, so it must not delete the record.

## Unified RPC extension

Files: `src/context-rpc.ts`, `packages/protocol/src/index.ts`

```ts
export interface LabelStudioLeaseOpenResult {
  readonly lease: LabelStudioLeaseSnapshot
  readonly replayBaseline: number
  readonly sessionContext: LabelStudioSessionContextSnapshot
}

export interface LabelStudioRpcRequestMap {
  readonly 'page/commit': LabelStudioPageCommitRequest
}

export interface LabelStudioRpcResultMap {
  readonly 'page/commit': LabelStudioSessionContextSnapshot
}
```

After validating the DSH Session, `lease/open` builds `{ sessionId, createdAt }` from the Session header and returns that Session's durable page context. A new Session always receives `{ page: { view: 'projects' }, recentProjects: [], revision: 0 }`.

`page/commit` first validates the lease and generation. A task page must exactly match the lease's current committed target; a project or projects page first makes the lease's active task vacant so model tools cannot keep reading the preceding task, then commits the durable page.

The browser commit order is fixed: reserve the task target (task only), update the iframe URL, confirm that React committed the URL, publish the task target (task only), and call `page/commit`. The UI reports synchronization failure when any step fails, and model tools must not fall back to another Session or historical task.

Before completing an active-target commit, `focus/ack` calls the same Host `commit()` with the `expectedSessionContextRevision` carried by the focus event. The focus tool fails when durable commit fails; an identical ACK retry stays idempotent through the existing receipt and `lastCommit`.

New stable error codes:

```ts
export type LabelStudioSessionContextErrorCode =
  | 'session-context-conflict'
  | 'session-context-unavailable'
```

Errors contain only the operation, Session ID, and stable error code. They do not contain a PAT, access token, REST response body, sample, annotation, or complete durable record.

## Lease registry extension

File: `src/context-registry.ts`

```ts
export class LabelStudioContextRegistry {
  clearBrowserTarget(
    leaseId: LabelStudioContextLeaseId,
    generation: number,
    navigationSequence: LabelStudioNavigationSequence,
    expectedTargetRevision: number,
  ): LabelStudioTargetState
}
```

`clearBrowserTarget()` accepts only the current lease/generation and an increasing navigation sequence. Success increments the target revision and records vacant; retrying the same parameters after a lost response returns the same result. This method does not change the durable Session page; `page/commit` owns that durable commit.

## Client page interfaces

File: `packages/client-ui/src/client/page-url.ts`

```ts
export function buildLabelStudioPageUrl(
  baseUrl: string,
  page: LabelStudioPageContext,
): string
```

The URL rules are fixed: projects uses `baseUrl`, project uses `/projects/{projectId}/data`, task uses `/projects/{projectId}/data?task={taskId}`, and an annotation adds `annotation={annotationId}`. URLs are built only from validated structured IDs; arbitrary URLs are not persisted.

File: `packages/client-ui/src/client/context-state.ts`

```ts
export interface LabelStudioContextSnapshot {
  readonly sessionContext: LabelStudioSessionContextSnapshot
  readonly sessionContextStatus:
    | 'idle'
    | 'restoring'
    | 'ready'
    | 'committing'
    | 'conflict'
    | 'unavailable'
}

export class LabelStudioContextController {
  bindSession(sessionId: SessionId | undefined): void

  selectPage(page: LabelStudioPageContext): Promise<void>

  retrySessionContext(): void
}
```

`bindSession()` closes the old lease, opens the new lease, and applies `lease/open.sessionContext.page` to the iframe. Projects and project pages do not establish an active task; a task page reuses the current reserve/apply/publish flow and finishes an idempotent `page/commit` for the same page.

`selectPage()` handles only navigation initiated by plugin controls or Host focus. After a Session, Connection, or navigation epoch changes, an old Promise cannot modify the new Session's iframe, snapshot, or revision.

The workbench shows the current page and recent projects. Deleted projects are disabled; selecting an available historical project calls `selectPage({ view: 'project', projectId })`. A Session without a durable record shows the Label Studio project list.

## Configuration interfaces

Files: `src/config.ts`, `cordis.patch.yml`, `tests/fixtures/alpha3-web.overlay.yml`

```ts
export const DEFAULT_RECENT_PROJECT_LIMIT = 10

export interface Config {
  recentProjectLimit?: number
}

export interface ResolvedConfig {
  recentProjectLimit: number
}
```

`recentProjectLimit` must be a safe integer from 1 through 100. The Bundle patch and Web composition overlay explicitly set `recentProjectLimit: 10`. This field limits only each Session's recent projects and does not limit projects in the Label Studio service.

The Host manifest adds `@deepseek-ai/dsh-storage-domain` as a peer/dev dependency and `zod` as a runtime dependency. The Bundle does not insert a second storage provider; alpha.3 `dsh-base` already provides `ctx.storageDomain`, and the plugin fails explicitly during load when it is absent.

## State transitions

| Operation | Durable page | Recent projects | Temporary active task |
|---|---|---|---|
| Enter a Session for the first time | projects | Empty | None |
| Select a project | project | Move project to front | None |
| Select a task | task | Move project to front and record task | Present |
| Switch to another Session | Read the other record | Read the other record | Close old lease; decide after restoring new lease |
| Return to the original Session | Restore original page | Keep original history | Reestablish for task page; none for other pages |
| Lease expires | Unchanged | Unchanged | Clear |
| Confirm project deletion | projects | Mark matching project deleted | Clear |
| Unload plugin | Preserve storage domain | Preserve | Clear |

## Deferred page Bridge scope

This phase adds no `postMessage`, reverse proxy, iframe DOM access, MutationObserver, Label Studio frontend patch, or Python source modification. The plugin cannot automatically observe arbitrary iframe clicks, unsaved annotation drafts, or navigation in an external browser page.

When the model asks for the "current project," the Host can answer only with the last page/active task successfully committed by the plugin for that DSH Session, and it must state that this is not live observation of arbitrary iframe navigation. A Label Studio page Bridge requires a separate enhancement task that revalidates the target version and event mechanism.
