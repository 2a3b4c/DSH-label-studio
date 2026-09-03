# Label Studio 意图绑定接口

> 状态：Tasks 20–25 已实现，Tasks 26–27 待执行。本文中的路径全部相对于独立插件目录 `/Users/xinlongzhang/PycharmProjects/dsh-label-studio-plugin-package`；任何实现都不得修改 `/Users/xinlongzhang/PycharmProjects/deepseek-harness`。

本文定义 Label Studio 数据事件和模型操作意图如何绑定到 DSH Session。执行清单见[意图绑定 TODO](2026-09-03-label-studio-intent-binding-todo.zh.md)。

## 目标语义

插件只在用户产生明确业务操作时更新 Session 绑定。用户仅打开、切换或浏览 Label Studio 页面时不绑定，也不持续采集 URL。

以下行为构成明确操作：

| 行为来源 | 触发条件 | 绑定结果 |
|---|---|---|
| 模型工具 | Label Studio REST 操作成功并返回经过校验的 ID | 把成功操作的 project 或 task 绑定到发起工具调用的 Session |
| Label Studio Webhook | 已认证事件与已有绑定精确匹配；或 annotation 事件只匹配唯一的实时 iframe 页面；或事件确认已绑定资源被删除 | 保持现有目标、绑定唯一匹配的 Session，或清除、降级已失效绑定 |
| 按需页面检查 | 模型调用的工具需要“当前”或“这个”页面，但参数和 Session 绑定不能提供目标 | 一次性读取 iframe 页面，REST 校验后绑定 |

提示词本身不直接修改状态。模型通过选择工具和参数表达意图；Host 只在工具解析、REST 校验和提交点满足后更新绑定。

## 不支持的行为

- 被动浏览不触发绑定，iframe 不安装持续 URL 监听器。
- 单独打开的 `127.0.0.1:8080` 页面不属于任何 DSH Session，按需页面检查不读取该页面。
- Webhook 不携带 DSH Session ID；不能只根据活动 Session 数量确定归属。
- 没有已有精确绑定的 annotation 创建或更新事件会触发一次实时 iframe 检查；只有唯一页面的 project/task 与事件完全一致时才绑定，零个或多个匹配均报告 `unassigned`。
- 未保存的 annotation 草稿不进入 Session 绑定或模型上下文。
- 绑定记录不进入 DSH Session event log，不修改 `SessionEventMap`、`Session.append()`、`deriveMessages()` 或 agent-loop。
- 本功能不直接修改已保存 annotation；预标注继续创建 prediction，由用户在 Label Studio 审阅。

## 可插拔约束

Bundle 继续只通过根目录 `cordis.patch.yml` 装配 Host 和 Client，并在安装期间替换原 `ui-layout`。Host HTTP route、Webhook 注册、按需 Bridge、代理服务、Connection RPC、工具和存储都由本插件的 `ctx.effect()` 注册并返回 disposer。

卸载 Bundle 并重启后，原 DSH 布局恢复，插件 route、RPC、工具、内存租约和代理端口全部消失。插件不得向 DSH 源码仓库复制文件，不得修改 DSH Profile 之外的官方包，也不得把插件类型合并进 DSH Session 类型。

插件在现有 `label_studio_context` storage domain 中保存独立 binding snapshot，卸载后保留，重新安装时可以恢复。删除该持久数据不属于插件卸载的隐式行为。

## 文件职责

| 路径 | 状态 | 单一职责 |
|---|---|---|
| `packages/protocol/src/index.ts` | 修改 | 共享绑定、Webhook 和按需检查 DTO |
| `src/session-context-spec.ts` | 修改 | 在现有 `label_studio_context` 记录中增加独立 binding snapshot |
| `src/session-context-store.ts` | 修改 | 复用现有每 Session 队列完成 binding CAS 和删除同步 |
| `src/operation-context.ts` | 新增 | 工具目标解析、REST 验证和成功后绑定 |
| `src/webhook-payload.ts` | 新增 | 将有限的 Label Studio Webhook JSON 解析为规范事件 |
| `src/webhook-ingress.ts` | 新增 | 已认证、限长的精确 HTTP POST route |
| `src/webhook-registration.ts` | 新增 | 通过 Label Studio API 创建和清理插件自有 Webhook |
| `src/webhook-binding.ts` | 新增 | 匹配已有绑定，并以唯一实时页面归属 annotation 事件 |
| `src/current-page-broker.ts` | 新增 | Host 发起按需检查并等待当前租约回执 |
| `src/frame-proxy.ts` | 新增 | loopback iframe 代理和 Bridge 脚本注入 |
| `src/frame-bridge-script.ts` | 新增 | 生成只响应检查请求的 iframe 脚本 |
| `src/api.ts` | 修改 | Webhook 注册、项目模板更新和目标验证 REST 操作 |
| `src/context-rpc.ts` | 修改 | 按需检查请求和回执 RPC |
| `src/context-registry.ts` | 修改 | 校验按需检查所用的当前 Session 租约 |
| `src/tools.ts` | 修改 | 所有业务工具统一调用操作上下文解析器 |
| `src/runtime.ts` | 修改 | managed 模式配置 Webhook 投递超时 |
| `src/config.ts` | 修改 | Webhook、代理和按需检查配置 |
| `src/boot-config.ts` | 修改 | 向 Client 投影无密钥的 iframe 代理地址和超时 |
| `src/index.ts`、`src/lifecycle.ts` | 修改 | 插件组件装配和逆序卸载 |
| `packages/client-ui/src/client/current-page-bridge.ts` | 新增 | 校验 `postMessage` 并完成一次性页面检查 |
| `packages/client-ui/src/client/context-state.ts` | 修改 | 响应 Host 检查事件，不持续监听页面 |
| `packages/client-ui/src/client/panel-state.ts` | 修改 | 暴露当前 iframe window 并发送检查请求 |

实现复用现有 `src/session-context-spec.ts`、`src/session-context-store.ts` 和 `label_studio_context` storage domain，不创建第二个 binding domain，也不删除现有页面恢复代码。页面 revision 与 binding revision 独立；被动页面提交不得修改 binding。

## 共享绑定类型

文件：`packages/protocol/src/index.ts`

```ts
export type LabelStudioBindingSource =
  | 'tool-result'
  | 'webhook'
  | 'current-page'

export type LabelStudioBindingTarget =
  | {
      readonly kind: 'project'
      readonly projectId: LabelStudioProjectId
    }
  | {
      readonly kind: 'task'
      readonly projectId: LabelStudioProjectId
      readonly taskId: LabelStudioTaskId
      readonly annotationId?: LabelStudioAnnotationId
    }

export type LabelStudioBindingSnapshot = {
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
} & (
  | { readonly target?: never; readonly source?: never; readonly boundAt?: never }
  | {
      readonly target: LabelStudioBindingTarget
      readonly source: LabelStudioBindingSource
      readonly boundAt: number
    }
)

export interface LabelStudioSessionContextSnapshot {
  readonly page: LabelStudioPageContext
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
  readonly binding: LabelStudioBindingSnapshot
}
```

`target` 缺失表示 Session 尚未绑定。`source` 和 `boundAt` 必须与 `target` 同时存在；时间由 Host 写入，浏览器和 Webhook payload 不能提供。

`revision` 是每个 Session 的单调非负 safe integer。只有绑定 target、source、最近项目或删除状态发生变化时才加一；读取和完全相同的重复提交不增加 revision。

## 操作目标选择

文件：`src/operation-context.ts`

```ts
export type LabelStudioOperationKind =
  | 'create-project'
  | 'import-tasks'
  | 'create-prediction'
  | 'update-label-config'
  | 'read-active-task'
  | 'focus-task'

export type LabelStudioTargetRequirement = 'none' | 'project' | 'task'

export type LabelStudioTargetSelector =
  | {
      readonly mode: 'explicit'
      readonly projectId?: LabelStudioProjectId
      readonly taskId?: LabelStudioTaskId
      readonly annotationId?: LabelStudioAnnotationId
    }
  | { readonly mode: 'binding' }
  | { readonly mode: 'current-page' }

export interface LabelStudioResolvedOperationContext {
  readonly identity: LabelStudioSessionIdentity
  readonly target: LabelStudioBindingTarget
  readonly source: 'explicit' | 'binding' | 'current-page'
  readonly expectedBindingRevision: number
}

export type LabelStudioBindingCommitOutcome =
  | {
      readonly kind: 'committed'
      readonly snapshot: LabelStudioBindingSnapshot
    }
  | {
      readonly kind: 'conflict'
      readonly current: LabelStudioBindingSnapshot
    }

export interface LabelStudioCurrentPageReader {
  request(
    identity: LabelStudioSessionIdentity,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LabelStudioPageContext>
}

export class LabelStudioOperationContextResolver {
  constructor(
    store: Pick<LabelStudioSessionContextStore, 'readBinding' | 'commitBinding'>,
    currentPages: LabelStudioCurrentPageReader,
    api: Pick<LabelStudioApi, 'getProject' | 'getTask'>,
    currentPageTimeoutMs: number,
  )

  resolve(
    identity: LabelStudioSessionIdentity,
    requirement: Exclude<LabelStudioTargetRequirement, 'none'>,
    selector: LabelStudioTargetSelector,
    signal: AbortSignal,
  ): Promise<LabelStudioResolvedOperationContext>

  commitSuccessfulResult(
    identity: LabelStudioSessionIdentity,
    target: LabelStudioBindingTarget,
    source: LabelStudioBindingSource,
    expectedBindingRevision: number,
  ): Promise<LabelStudioBindingCommitOutcome>
}
```

目标解析顺序固定如下：

1. 工具参数包含明确 ID 时使用 `explicit`，并通过 REST 读取 task/project 验证关联。
2. 工具参数明确要求 `current_page` 时使用 `current-page`，即使 Session 已存在旧绑定也要重新检查 iframe。
3. 工具没有明确 ID 且未要求当前页面时使用现有 Session `binding`。
4. Session 没有满足工具层级的绑定时，工具可以按其接口声明自动降级到一次 `current-page` 检查；不能选择 Label Studio 全局最近项目。

`resolve()` 只返回候选目标，不持久化。REST 业务操作成功后调用 `commitSuccessfulResult()`；业务请求返回失败或 mutation outcome unknown 时不得更新绑定。

业务请求成功与绑定提交是两个独立结果。成功 mutation 遇到 binding revision 冲突时，工具必须保留业务成功结果并附加 `binding-conflict` 警告，不得重放创建项目、导入、prediction 或模板更新请求；较新的现有绑定保持不变。

## 工具参数与绑定提交

文件：`src/tools.ts`

| 工具 | 目标输入 | 按需检查 | 成功提交 |
|---|---|---|---|
| `label_studio_status` | 无 | 否 | 不修改绑定；optional Webhook unavailable 时重试注册 |
| `label_studio_create_project` | 无 | 否 | API 返回的 project |
| `label_studio_import_tasks` | `project_id?`、`current_page?` | 无 ID、无可用绑定，或 `current_page: true` | project；批量导入不猜测当前 task |
| `label_studio_create_prediction` | `task_id?`、`project_id?`、`current_page?` | 无 task 绑定，或 `current_page: true` | 已验证 project + task |
| `label_studio_create_active_prediction` | `current_page?` | 没有 task 绑定时自动检查；`current_page: true` 强制刷新 | 已验证 project + task |
| `label_studio_get_active_task` | `current_page?` | 没有 task 绑定时自动检查；`current_page: true` 强制刷新 | 成功读取的 project + task |
| `label_studio_focus_task` | 必填 project/task ID | 否 | 浏览器确认应用且 REST 关联验证成功的 task |
| `label_studio_update_label_config` | `label_config`、`project_id?`、`current_page?` | 无 project 绑定，或 `current_page: true` | 更新成功的 project |

`current_page` 只表达“用户明确指向当前 iframe 页面”。模型在用户使用“当前”“这个页面”“正在标注的任务”等指代时设置它；普通的后续操作优先复用同一 Session 已绑定 target。

每个工具必须从 `exec.agent.id` 和 `exec.agent.session.header.createdAt` 构造 Session identity。没有 DSH Session 的调用必须失败，不得绑定到最后一个活动 Session。

## Session 绑定存储

文件：`src/session-context-spec.ts`、`src/session-context-store.ts`

```ts
export interface LabelStudioSessionIdentity {
  readonly sessionId: SessionId
  readonly createdAt: number
}

export interface LabelStudioBindingCommit {
  readonly expectedRevision: number
  readonly target?: LabelStudioBindingTarget
  readonly source?: LabelStudioBindingSource
}

export interface LabelStudioSessionBindingChange {
  readonly sessionId: SessionId
  readonly before: LabelStudioBindingSnapshot
  readonly after: LabelStudioBindingSnapshot
}

export interface LabelStudioSessionContextRecord {
  readonly sessionCreatedAt: number
  readonly page: LabelStudioPageContext
  readonly recentProjects: readonly LabelStudioRecentProject[]
  readonly revision: number
  readonly binding?: LabelStudioBindingSnapshot
  readonly lastCommit?: LabelStudioPageCommitReceipt
}

export class LabelStudioSessionContextStore {
  readBinding(identity: LabelStudioSessionIdentity): LabelStudioBindingSnapshot

  commitBinding(
    identity: LabelStudioSessionIdentity,
    request: LabelStudioBindingCommit,
  ): Promise<LabelStudioBindingCommitOutcome>

  reconcileProjectDeleted(
    projectId: LabelStudioProjectId,
  ): Promise<readonly LabelStudioSessionBindingChange[]>

  reconcileTasksDeleted(
    projectId: LabelStudioProjectId,
    taskIds: readonly LabelStudioTaskId[],
  ): Promise<readonly LabelStudioSessionBindingChange[]>

  ensureWebhookOwnerId(candidate: string): Promise<string>
}
```

`commitBinding()` 复用现有 Store 的 per-Session queue，并对 binding revision 执行 CAS；它不修改页面 revision。项目删除会清除所有指向该项目的绑定，task 删除只把指向被删除 task 的绑定降级为 project，不影响其他 Session。已确认的 project 或 task 删除在同一 Session 队列和同一次持久写入中同步修正失效的页面恢复状态；页面 revision 与 binding revision 仍分别按各自变化递增。

现有页面 snapshot、页面提交回执和页面恢复接口保持不变。`binding` 在旧记录中缺失时解析为空 snapshot，从而不需要第二个 storage domain 或迁移程序；被动 `page/commit` 只能更新页面状态，不能更新 binding。现有 domain 增加一个单例 owner table，`ensureWebhookOwnerId()` 原子保留首次写入的随机 UUID owner ID，且不读取或修改任何 Session record。

`sessionCreatedAt` 防止复用 Session ID 继承旧记录。持久记录只包含页面状态、ID、来源、时间、最近项目和 revision，不保存 PAT、Webhook secret、样本、label config、annotation、prediction 或完整 Webhook payload。

## 按需 iframe 检查协议

文件：`packages/protocol/src/index.ts`

```ts
export type LabelStudioPageInspectionId = Branded<'LabelStudioPageInspectionId'>

export interface LabelStudioInspectPageEvent {
  readonly kind: 'inspect-current-page'
  readonly inspectionId: LabelStudioPageInspectionId
  readonly deadlineAt: number
  readonly eventRevision: number
}

export interface LabelStudioWebhookUnassignedEvent {
  readonly kind: 'webhook-unassigned'
  readonly reason: 'no-matching-binding'
  readonly eventRevision: number
}

export interface LabelStudioBindingChangedEvent {
  readonly kind: 'binding-changed'
  readonly binding: LabelStudioBindingSnapshot
  readonly eventRevision: number
}

export interface LabelStudioWebhookStatusEvent {
  readonly kind: 'webhook-status'
  readonly status: 'ready' | 'unavailable'
  readonly eventRevision: number
}

export interface LabelStudioInspectPageRequest {
  readonly protocol: 'dsh-label-studio-page/v1'
  readonly kind: 'inspect-current-page'
  readonly inspectionId: string
  readonly capability: string
}

export interface LabelStudioInspectPageResponse {
  readonly protocol: 'dsh-label-studio-page/v1'
  readonly kind: 'current-page'
  readonly inspectionId: string
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContextWire }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}

export interface LabelStudioInspectPageCommitRequest {
  readonly leaseId: string
  readonly generation: number
  readonly inspectionId: string
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContextWire }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}

export interface LabelStudioInspectPageCommit {
  readonly leaseId: LabelStudioContextLeaseId
  readonly generation: number
  readonly inspectionId: LabelStudioPageInspectionId
  readonly outcome:
    | { readonly kind: 'page'; readonly page: LabelStudioPageContext }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'unsupported' }
}
```

Host 的 `LabelStudioCurrentPageBroker.request()` 把 `inspect-current-page` 事件投递给当前 Session 租约并等待一次回执。Client 收到事件后才向 iframe 发送 `postMessage`；Bridge 脚本只解析当时的 `location.pathname` 和 `location.search` 并回复，不监听 history、click、fetch、XHR 或 annotation 状态。

`binding-changed`、`webhook-status` 和 `webhook-unassigned` 复用现有 `LabelStudioBrowserEvent` 长轮询。它们只投影插件状态，不写入 DSH Session event log；工具提交或删除同步后由 Host 发布完整 binding snapshot，Client 不自行推测新状态。

Client 必须同时校验 `event.source === iframe.contentWindow`、`event.origin === frameBaseUrl.origin`、协议常量、inspection ID、当前 Session epoch 和 deadline。Host 收到回执后再次验证 lease/generation，只把严格解析的页面交还请求方；Task 23 的操作上下文解析器负责通过 REST 确认 project/task 关联，`projects` 页面不能满足 project/task 操作。

文件：`src/current-page-broker.ts`

```ts
export class LabelStudioCurrentPageBroker {
  request(
    identity: LabelStudioSessionIdentity,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<LabelStudioPageContext>

  commit(
    request: LabelStudioInspectPageCommit,
    identity: LabelStudioSessionIdentity,
  ): { readonly accepted: true }

  cancelSession(sessionId: SessionId): void

  dispose(): void
}
```

同一 Session 同时只允许一个检查请求。Host 同时核对 Session `createdAt`、lease、lease generation 和 inspection ID；Client 通过 epoch 与 `AbortSignal` 隔离 Connection generation。任一生命周期发生变化时，旧请求必须失败，不能把旧 iframe 页面提交给新 Session。

## iframe Bridge 载体

文件：`src/frame-proxy.ts`、`src/frame-bridge-script.ts`

```ts
export interface LabelStudioFrameProxyOptions {
  readonly upstreamBaseUrl: string
  readonly inspectionProtocol: 'dsh-label-studio-page/v1'
  readonly htmlMaxBytes: number
}

export interface LabelStudioFrameProxyAddress {
  readonly baseUrl: string
  readonly origin: string
  readonly capability: string
}

export class LabelStudioFrameProxy {
  start(): Promise<LabelStudioFrameProxyAddress>
  close(): Promise<void>
}

export function injectLabelStudioInspectionBridge(
  html: string,
  protocol: 'dsh-label-studio-page/v1',
): string
```

代理只监听 loopback 随机端口，只转发到经过配置校验的 Label Studio loopback HTTP origin；Task 22 不支持 HTTPS upstream，因为插件未拥有下游 TLS 证书和 Secure Cookie 保真方案。它重写 upstream `Location`、`Origin` 和 `Referer`，并把固定 Bridge 脚本作为同源静态资源注入 HTML；它不得转发到请求参数指定的任意主机，也不得放宽 Label Studio 的 CSP、CSP-Report-Only 或 X-Frame-Options。

`htmlMaxBytes` 只限制需要缓冲和注入的 HTML。上传请求以及图片、音频、视频、导出文件和其他非 HTML 响应使用背压感知的流式透传，不受该限制；gzip、Brotli 和 deflate HTML 必须在注入前安全解码并更新响应编码与长度。不兼容的 nonce/hash-only CSP 或 frame policy 保持原样并失败关闭，不能用放宽策略换取 Bridge 执行。

Client iframe 使用 `frameBaseUrl`，Host REST API 仍使用原 `baseUrl`。代理保留登录 Cookie，改写跨端口 CSRF 所需的来源 header，并透传取消信号。代理的监听器、活动请求和 socket 必须在插件卸载时关闭；关闭失败不能阻止其他 disposer 执行。

## Webhook 规范事件

文件：`src/webhook-payload.ts`

```ts
export type LabelStudioWebhookEvent =
  | { readonly action: 'PROJECT_CREATED' | 'PROJECT_UPDATED'; readonly projectId: LabelStudioProjectId }
  | { readonly action: 'PROJECT_DELETED'; readonly projectId: LabelStudioProjectId }
  | { readonly action: 'TASK_CREATED' | 'TASKS_CREATED'; readonly projectId: LabelStudioProjectId; readonly taskIds: readonly [LabelStudioTaskId, ...LabelStudioTaskId[]] }
  | { readonly action: 'TASK_DELETED' | 'TASKS_DELETED'; readonly projectId: LabelStudioProjectId; readonly taskIds: readonly [LabelStudioTaskId, ...LabelStudioTaskId[]] }
  | { readonly action: 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED'; readonly projectId: LabelStudioProjectId; readonly items: readonly [{ readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId }] }
  | { readonly action: 'ANNOTATIONS_CREATED'; readonly projectId: LabelStudioProjectId; readonly items: readonly [{ readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId }, ...{ readonly taskId: LabelStudioTaskId; readonly annotationId: LabelStudioAnnotationId }[]] }
  | { readonly action: 'ANNOTATION_DELETED' | 'ANNOTATIONS_DELETED'; readonly projectId: LabelStudioProjectId; readonly annotationIds: readonly [LabelStudioAnnotationId, ...LabelStudioAnnotationId[]] }

export function parseLabelStudioWebhook(
  input: unknown,
): LabelStudioWebhookEvent
```

解析器只保留 action 和关联 ID。它允许官方 payload 增加无关字段，但拒绝缺失字段、非正 safe integer ID、未知 action 和 project/task 关联字段不一致；annotation 删除 payload 没有 task ID 时不得推断 task。完整 payload 不写日志、不写存储。

解析器接受官方参考出现的单条和批量 action 名称，注册器只订阅 `GET /api/webhooks/info/` 返回的可用交集。Label Studio 1.22.0 的真实 fixture 必须覆盖 `TASKS_CREATED`、`TASKS_DELETED`、`ANNOTATION_CREATED`、`ANNOTATIONS_CREATED`、`ANNOTATION_UPDATED` 和 `ANNOTATIONS_DELETED`；organization project 事件需要启用 organization webhook。参考：[Webhook 配置](https://labelstud.io/guide/webhooks.html)、[事件字段](https://labelstud.io/guide/webhook_reference)、[可用 action API](https://api.labelstud.io/api-reference/api-reference/webhooks/info?explorer=true)、[创建 Webhook API](https://api.labelstud.io/api-reference/api-reference/webhooks/create)。

## Webhook HTTP 入口

文件：`src/webhook-ingress.ts`

```ts
export interface LabelStudioWebhookIngressOptions {
  readonly path: string
  readonly maxBodyBytes: number
  readonly secret: Uint8Array
}

export function createLabelStudioWebhookHandler(
  coordinator: LabelStudioWebhookBindingCoordinator,
  options: LabelStudioWebhookIngressOptions,
): WebRoute['handler']
```

入口只接受精确 route 的 `POST application/json`。它限制 `Content-Length` 和实际读取字节数，使用常量时间比较校验插件创建 Webhook 时配置的 `X-DSH-Label-Studio-Webhook` header，并在返回成功前等待本地绑定提交完成。

固定响应：成功 `204`；方法错误 `405`；content type 错误 `415`；body 超限 `413`；JSON/事件错误 `400`；认证失败 `401`；插件关闭或存储不可用 `503`。响应和日志不得包含 secret、PAT、payload、样本或 annotation result。

## Webhook 注册

文件：`src/webhook-registration.ts`、`src/api.ts`

```ts
export interface LabelStudioWebhookRegistration {
  readonly id: number
  readonly projectId: LabelStudioProjectId
  readonly url: string
  readonly ownerId: string
}

export interface LabelStudioWebhookOwnerRecord {
  readonly ownerId: string
}

export class LabelStudioWebhookRegistrar {
  ensureInstalled(
    callbackUrl: string,
    secret: Uint8Array,
    signal: AbortSignal,
  ): Promise<readonly LabelStudioWebhookRegistration[]>

  dispose(signal?: AbortSignal): Promise<void>
}

export interface CreateWebhookInput {
  readonly url: string
  readonly actions: readonly LabelStudioWebhookEvent['action'][]
  readonly headers: Readonly<Record<string, string>>
  readonly is_active: true
  readonly project: LabelStudioProjectId
  readonly send_for_all_actions: false
  readonly send_payload: true
}
```

`ensureInstalled()` 先列举已有项目和当前 Label Studio 支持的 action，再为每个项目创建启用 payload 的 project webhook。请求必须显式提交 `is_active: true`、对应 `project` ID、`send_for_all_actions: false` 和 `send_payload: true`，并设置随机认证 secret 与持久 owner ID 两个独立 header；插件不得复用 PAT 作为任一值。

项目级可用 action 必须覆盖 project 更新、task 创建/删除、annotation 创建/更新/删除七个语义类别；单条与批量名称属于同一类别。Label Studio 1.22 Community 不允许 project webhook 订阅 organization-only 的 project 创建/删除事件；缺少项目级任一类别时按 `webhookMode` 报 required 失败或 optional unavailable。

owner ID 在插件现有 storage domain 的单例记录中生成并持久化，不进入 Session binding。启动时只对账 owner header 完全匹配的 Webhook：删除残留后按已有项目创建注册；创建或删除结果未知时重新列举并按 owner ID、callback URL 和 project ID 精确收敛，禁止修改用户创建的 Webhook。

managed Python 模式在启动进程时提供配置解析后的 `WEBHOOK_TIMEOUT`。external 模式不能修改外部进程；`webhookMode: 'required'` 时注册失败导致插件加载失败，`optional` 时工具和按需 Bridge 保持可用，但 UI 必须显示 Webhook unavailable。

正常卸载时 `dispose()` 删除内存记录的精确 Webhook ID。optional 模式允许在启动时缺少 PAT；凭证配置完成后，现有 `label_studio_status` 工具调用 `ensureInstalled()` 重试注册。Label Studio 不重试失败投递，因此入口在本地持久同步完成前不得返回成功；崩溃期间的事件可能丢失，后续工具和按需检查仍会重新验证目标。

## Webhook 归属规则

文件：`src/webhook-binding.ts`、`src/context-registry.ts`

```ts
export type LabelStudioWebhookBindingOutcome =
  | { readonly kind: 'matched-existing'; readonly sessionIds: readonly SessionId[] }
  | { readonly kind: 'bound-from-live-page'; readonly sessionId: SessionId }
  | { readonly kind: 'reconciled-deletion'; readonly affectedSessionIds: readonly SessionId[] }
  | { readonly kind: 'unassigned'; readonly reason: 'no-matching-binding' }

export class LabelStudioWebhookBindingCoordinator {
  accept(
    event: LabelStudioWebhookEvent,
  ): Promise<LabelStudioWebhookBindingOutcome>
}

```

项目和 task import 事件只匹配相同 project 的已有绑定。annotation 创建或更新事件先匹配相同 project/task 的已有 task binding；若不存在，则并发请求每个存活 DSH iframe 返回结构化当前页面，仅当一个页面与事件 project/task 完全一致时，以 `source: 'webhook'` 绑定该 Session。

`PROJECT_DELETED` 根据 project ID 清除所有已有绑定，不依赖活动租约。task 删除把所有精确指向被删除 task 的绑定降级为 project；annotation 删除没有 task ID，不修改绑定。

task 删除产生的 project binding 使用 `source: 'webhook'` 和 Host 当前时间，并递增 binding revision。project 删除产生空 binding；空 binding 不保留 source 或 boundAt。

annotation 事件没有页面匹配或有多个页面匹配时返回 `unassigned`，并向当前插件租约广播不含 project/task/annotation 数据的状态事件；它不缓存 payload，也不在之后补猜归属。多个 Session 已有相同精确绑定时可以同时报告匹配，因为 target 不发生变化。

## REST API 增量

文件：`src/api.ts`

```ts
export interface UpdatedProjectLabelConfig {
  readonly id: LabelStudioProjectId
  readonly labelConfig: string
}

export class LabelStudioApi {
  updateProjectLabelConfig(
    projectId: LabelStudioProjectId,
    labelConfig: string,
    signal?: AbortSignal,
  ): Promise<UpdatedProjectLabelConfig>

  createWebhook(
    input: CreateWebhookInput,
    signal?: AbortSignal,
  ): Promise<LabelStudioWebhookRegistration>

  listWebhookActions(
    signal?: AbortSignal,
  ): Promise<ReadonlySet<LabelStudioWebhookEvent['action']>>

  listWebhooks(
    signal?: AbortSignal,
  ): Promise<readonly LabelStudioWebhookRegistration[]>

  deleteWebhook(
    webhookId: number,
    signal?: AbortSignal,
  ): Promise<void>
}
```

HTTP 方法联合增加 `PATCH` 和 `DELETE`。模板更新只提交 `label_config` 并要求响应 project ID 和 label config 与请求一致；失败或响应无法验证时不更新 Session 绑定。

## 配置接口

文件：`src/config.ts`、`cordis.patch.yml`、`tests/fixtures/alpha3-web.overlay.yml`

```ts
export type LabelStudioWebhookMode = 'required' | 'optional' | 'off'

export interface Config {
  webhookMode?: LabelStudioWebhookMode
  webhookPath?: string
  webhookMaxBodyBytes?: number
  managedWebhookTimeoutSeconds?: number
  currentPageTimeoutMs?: number
  frameProxyHtmlMaxBytes?: number
}

export interface ResolvedConfig {
  webhookMode: LabelStudioWebhookMode
  webhookPath: string
  webhookMaxBodyBytes: number
  managedWebhookTimeoutSeconds: number
  currentPageTimeoutMs: number
  frameProxyHtmlMaxBytes: number
}
```

默认值由 `resolveConfig()` 一次性确定：`webhookMode: 'optional'`、`webhookPath: '/api/label-studio/webhook'`、`webhookMaxBodyBytes: 1048576`、`managedWebhookTimeoutSeconds: 5`、`currentPageTimeoutMs: 5000`、`frameProxyHtmlMaxBytes: 2097152`。路径必须是无查询、无片段、无尾部斜杠的绝对非根路径；字节和超时字段必须是正 safe integer。

Bundle patch 和 alpha.3 overlay 显式写出这些字段。`off` 不注册 Webhook route 或 Label Studio Webhook，但模型工具和按需 Bridge 仍工作。

## Client 启动配置

文件：`src/boot-config.ts`、`packages/client-ui/src/client/index.ts`

```ts
export interface LabelStudioBootConfig {
  readonly baseUrl: string
  readonly frameBaseUrl: string
  readonly frameCapability: string
  readonly currentPageTimeoutMs: number
  readonly inspectionProtocol: 'dsh-label-studio-page/v1'
  readonly contextOpenRetryMs: number
  readonly contextCloseTimeoutMs: number
  readonly eventHistorySize: number
  readonly webhookStatus?: 'disabled' | 'ready' | 'unavailable'
}
```

`baseUrl` 只供外部打开链接和显示使用；iframe 使用 `frameBaseUrl`。`frameCapability` 是每次代理启动随机生成、只存在于内存和浏览器启动配置中的 256-bit 临时能力值，iframe Bridge 必须在返回当前页面前验证它。Task 22 保留已有的重试、关闭和事件历史字段；Task 25 在真实 Webhook 注册状态可用后增加 `webhookStatus`。启动配置不得包含 PAT、access token、Webhook secret、Session ID 或 Label Studio 数据。

## 状态转换

| 事件 | 原绑定 | 新绑定 |
|---|---|---|
| 被动浏览任意页面 | 任意 | 不变 |
| 创建项目工具成功 | 任意 | 新 project |
| 导入任务工具成功 | 任意 | 目标 project |
| prediction 工具成功 | 任意 | 已验证 project + task |
| 模板更新工具成功 | 任意 | 已验证 project |
| `current_page` 检查 + 业务操作成功 | 任意 | 检查并验证后的 project/task |
| 创建或更新 Webhook 与已有绑定精确匹配 | 相同 project/task | 不变并报告 matched-existing |
| annotation Webhook 没有已有绑定且唯一实时页面匹配 | 任意 | 绑定该页面的 Session 并报告 bound-from-live-page |
| annotation Webhook 有零个或多个实时页面匹配 | 任意 | 不变并报告 unassigned |
| project 删除事件 | 指向该 project | 未绑定 |
| task 删除事件 | 指向该 task | 同 project 的 project 绑定 |
| annotation 删除事件 | 任意 | 不变；payload 没有 task ID 时不得推断 |
| REST mutation outcome unknown | 任意 | 不变，等待 Webhook 或显式复核 |
| REST mutation 成功但 binding CAS 冲突 | 任意 | 保留较新绑定，返回业务成功和 binding-conflict 警告 |
| 插件卸载 | 持久绑定保留 | 内存租约、route、代理和工具清除 |

## 错误接口

共享错误码增加：

```ts
export type LabelStudioBindingErrorCode =
  | 'binding-missing'
  | 'binding-conflict'
  | 'binding-target-mismatch'
  | 'current-page-unavailable'
  | 'current-page-timeout'
  | 'current-page-unsupported'
  | 'webhook-unavailable'
  | 'webhook-unassigned'
```

错误信息只说明失败组件、操作和稳定错误码。不得包含凭据、Webhook secret、原始 HTTP body、完整 Webhook payload、样本或标注结果。

## 验收条件

1. 两个 DSH Session 分别通过模型工具创建或操作不同项目后，切换和重启仍恢复各自绑定。
2. 用户只在 iframe 浏览项目或 task，Session 绑定保持不变。
3. 用户说“给当前任务生成预标注”时，模型工具触发一次页面检查，验证并绑定后创建 prediction。
4. 创建项目、导入数据、生成 prediction 和更新模板的成功结果都会更新发起 Session；失败和 unknown outcome 不更新。
5. Webhook 确认已有精确绑定；未绑定 annotation 只有在唯一存活 DSH iframe 同时显示相同 project/task 时才能建立绑定，零个或多个匹配均不得猜测。
6. 卸载插件并重启后原布局恢复，DSH 源码、Session 日志和 prompt 结果不发生结构变化。
7. 重新安装插件后从 `label_studio_context` 恢复 binding；启动对账确保同一 owner ID 对每个已有项目最多一个 Webhook，并且插件只有一个代理和一个 route。
8. 真实组合以 DSH `0.1.2-alpha.3` 和插件声明支持的 Label Studio 版本完成浏览器验收。
