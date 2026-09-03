# Label Studio Session 上下文统一接口

[English](2026-09-02-label-studio-session-context-interfaces.md) | 中文

本文定义 Label Studio 插件按 DSH Session 保存页面定位和最近项目的统一接口。实现基线固定为 DSH `0.1.2-alpha.3`（tag `dsh-v0.1.2-alpha.3`，commit `dd6322d604e00eec1ba5e0c8541159906a21094a`）。执行顺序见[总 TODO](2026-09-02-label-studio-session-context-todo.zh.md)。

## 范围

每个 DSH Session 独立保存当前 Label Studio 页面和最近访问项目。切换 Session 或重启 DSH 后，浏览器恢复该 Session 的最后页面；没有记录的 Session 打开 Label Studio 项目列表。

本功能不实现 Label Studio 页面 Bridge。用户在 iframe 内部或单独打开的 `127.0.0.1:8080` 页面中自由创建、删除或切换项目时，DSH 不会立即感知；只有插件发起的导航以及后续 REST 校验可以更新持久记录。

## Session 与 prompt 隔离

插件只读取 `SessionId` 和 Session header 的 `createdAt` 作为持久记录身份，不修改 `Session` 类、`SessionEventMap`、Session 日志或 `deriveMessages()`。`label_studio_context` storage domain 不参与 prompt 组装，因此保存页面定位、最近项目和删除状态不会增加或改变模型上下文。

当模型调用 `label_studio_get_active_task`、`label_studio_create_prediction` 等工具时，工具调用和工具结果仍按 DSH 原有机制写入 Session 日志。这是模型可见业务数据的唯一入口，与浏览器页面定位存储分离。

## 状态分层

| 状态 | 生命周期 | 存储位置 | 用途 |
|---|---|---|---|
| Session 页面上下文 | DSH 重启、浏览器关闭后保留 | 插件 `label_studio_context` storage domain | 恢复项目列表、项目页或 task 页及最近项目 |
| 浏览器租约 | 浏览器连接存活期间 | Host 内存 `LabelStudioContextRegistry` | 判断哪个页面可以代表当前 Session |
| active task | 当前租约且 task 已提交期间 | Host 内存租约记录 | 供模型工具读取当前 task |
| 样本和标注内容 | 每次操作读取 | Label Studio REST API | 提供权威 data、annotation 和 prediction |

关闭或过期租约只清除临时 active task，不删除 Session 页面上下文。删除插件后，DSH Session 日志保持原样；重新安装插件时，storage domain 仍可恢复记录。

## 共享协议类型

文件：`packages/protocol/src/index.ts`

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

`LabelStudioPageContextWire` 与 `LabelStudioPageContext` 字段一致，但跨 RPC 的 ID 使用未品牌化的正整数。Host 和 Client 分别在自己的解析边界校验 JSON、正 safe integer、枚举值和未知字段。

`revision` 是每个 Session 的单调非负 safe integer。页面或最近项目状态发生实际变化时加一；恢复同一页面不增加 revision。`lastVisitedAt` 由 Host 使用 epoch milliseconds 写入，浏览器不能提供时间。

`recentProjects` 按 `lastVisitedAt` 降序排列。访问 project 或 task 时，该 project 移到首位；访问 task 时同步写入 `lastTaskId`。项目被确认删除后保留在历史中并标记 `deleted`，但不能作为自动恢复目标。

## Host 持久记录

文件：`src/session-context-spec.ts`

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

alpha.3 的 `dsh-base` 已装配 `storage`、`storage-json` 和 `storage-domain`。默认 Web profile 将单文件 domain 写入 `$DSH_HOME/storages/label_studio_context.json`；插件不增加自定义路径配置，也不直接调用 Node.js 文件 API。

`sessionCreatedAt` 防止被删除后重新创建的相同 `SessionId` 继承旧页面。读取发现 `createdAt` 不匹配时返回空上下文；第一次成功提交覆盖旧记录。

`lastCommit` 只解决同一租约内 RPC 响应丢失后的精确重试。相同 lease、generation、navigation sequence、expected revision 和 page 返回原提交结果；任一字段不同则按新提交执行 CAS 校验。

## Host 上下文存储

文件：`src/session-context-store.ts`

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

`open()` 打开唯一 domain 并取得 `sessions` table。插件的 Cordis effect 在卸载时等待 `close()`；写操作由 storage domain 先持久化，再更新内存和返回成功。

`commit()` 以 `expectedSessionContextRevision` 做 CAS，并按 Session 串行执行。revision 不匹配时抛出 `session-context-conflict`；完全相同的 `lastCommit` 重试返回已提交 snapshot。一个页面已经由后续提交替换时，旧请求不能重新覆盖它。

`markProjectDeleted()` 把对应历史项标记为 `deleted`。如果当前 page 指向该项目，则 page 原子回退为 `{ view: 'projects' }`，但不会自动切换到另一个历史项目。

`delete()` 只在 DSH 持久 Session 已确认不存在时调用。普通 `session/disposed` 表示 Session 离开内存，不代表用户删除 Session，因此不得删除记录。

## RPC 统一扩展

文件：`src/context-rpc.ts`、`packages/protocol/src/index.ts`

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

`lease/open` 在验证 DSH Session 后，用 Session header 组成 `{ sessionId, createdAt }`，返回该 Session 的持久页面上下文。新 Session 的固定结果是 `{ page: { view: 'projects' }, recentProjects: [], revision: 0 }`。

`page/commit` 先验证 lease 和 generation。task 页面必须与该租约当前 committed target 完全一致；project 或 projects 页面先把租约中的 active task 置为 vacant，避免模型继续读取上一 task，然后提交持久页面。

浏览器提交顺序固定为：预留 task target（仅 task）、更新 iframe URL、确认 React 已提交 URL、发布 task target（仅 task）、调用 `page/commit`。任一步失败时 UI 显示同步失败，模型工具不得回退到其他 Session 或历史 task。

`focus/ack` 在完成 active target 提交前，使用 focus 事件携带的 `expectedSessionContextRevision` 调用同一个 Host `commit()`。持久提交失败时 focus 工具失败；相同 ACK 重试通过现有 receipt 和 `lastCommit` 保持幂等。

新增稳定错误码：

```ts
export type LabelStudioSessionContextErrorCode =
  | 'session-context-conflict'
  | 'session-context-unavailable'
```

错误只包含操作、Session ID 和稳定错误码，不包含 PAT、access token、REST response body、样本、annotation 或完整持久记录。

## 租约注册表扩展

文件：`src/context-registry.ts`

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

`clearBrowserTarget()` 只接受当前 lease/generation 和递增 navigation sequence。成功后递增 target revision 并写入 vacant；响应丢失后的相同参数重试返回相同结果。该方法不修改持久 Session 页面，`page/commit` 才拥有持久提交。

## Client 页面接口

文件：`packages/client-ui/src/client/page-url.ts`

```ts
export function buildLabelStudioPageUrl(
  baseUrl: string,
  page: LabelStudioPageContext,
): string
```

URL 规则固定为：projects 使用 `baseUrl`，project 使用 `/projects/{projectId}/data`，task 使用 `/projects/{projectId}/data?task={taskId}`，存在 annotation 时追加 `annotation={annotationId}`。URL 只由校验后的结构化 ID 构造，不持久保存任意 URL。

文件：`packages/client-ui/src/client/context-state.ts`

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

`bindSession()` 关闭旧租约并打开新租约，然后把 `lease/open.sessionContext.page` 应用到 iframe。projects 和 project 页面不建立 active task；task 页面复用现有 reserve/apply/publish 流程，并以相同页面完成幂等 `page/commit`。

`selectPage()` 只处理插件控件或 Host focus 发起的导航。Session、Connection 或 navigation epoch 变化后，旧 Promise 不能修改新 Session 的 iframe、snapshot 或 revision。

工作台显示当前 page 和最近项目。已删除项目显示为不可选择状态；点击 available 历史项目调用 `selectPage({ view: 'project', projectId })`。没有持久记录时显示 Label Studio 项目列表。

## 配置接口

文件：`src/config.ts`、`cordis.patch.yml`、`tests/fixtures/alpha3-web.overlay.yml`

```ts
export const DEFAULT_RECENT_PROJECT_LIMIT = 10

export interface Config {
  recentProjectLimit?: number
}

export interface ResolvedConfig {
  recentProjectLimit: number
}
```

`recentProjectLimit` 必须是 1 到 100 的 safe integer。Bundle patch 和 Web composition overlay 显式写 `recentProjectLimit: 10`。该字段只限制每个 Session 的最近项目数量，不限制 Label Studio 服务中的项目数量。

Host manifest 新增 `@deepseek-ai/dsh-storage-domain` peer/dev dependency 和 `zod` runtime dependency。Bundle 不插入第二个 storage provider；alpha.3 的 `dsh-base` 已提供 `ctx.storageDomain`，缺失时插件在加载阶段明确失败。

## 状态转换

| 操作 | 持久 page | 最近项目 | 临时 active task |
|---|---|---|---|
| 首次进入 Session | projects | 空 | 无 |
| 选择项目 | project | 项目置顶 | 无 |
| 选择 task | task | 项目置顶并记录 task | 有 |
| 切换到另一 Session | 读取另一记录 | 读取另一记录 | 旧租约关闭，新租约恢复后决定 |
| 返回原 Session | 恢复原 page | 保持原历史 | task 页重新建立，其他页面无 |
| 租约过期 | 不变 | 不变 | 清除 |
| 确认项目已删除 | projects | 对应项目标记 deleted | 清除 |
| 插件卸载 | storage domain 保留 | 保留 | 清除 |

## 页面 Bridge 延后范围

本阶段不增加 `postMessage`、反向代理、iframe DOM 读取、MutationObserver、Label Studio 前端补丁或 Python 源码修改。插件不能自动观察任意 iframe 点击、未保存 annotation 草稿或外部浏览器页面切换。

如果模型询问“当前项目”，Host 只能回答该 DSH Session 最后一次由插件成功提交的 page/active task，并明确这不是对 iframe 任意导航的实时观测。Label Studio 页面 Bridge 必须作为独立增强任务重新验证目标版本和事件机制。
