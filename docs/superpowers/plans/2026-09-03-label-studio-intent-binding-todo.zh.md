# Label Studio 意图绑定实施 TODO

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只在模型工具或模型按需检查当前 iframe 后建立 DSH Session 绑定；Webhook 只同步已有精确绑定和资源删除，被动浏览不绑定。

**Architecture:** Host 在现有 `label_studio_context` storage domain 中保存独立 binding snapshot，统一操作上下文解析器为所有工具解析并验证 project/task。一次性 `postMessage` Bridge 先提供当前页面能力，工具随后接入；Webhook 不依据活动 Session 数量猜测归属。

**Tech Stack:** DSH `0.1.2-alpha.3`、Cordis、TypeScript、React、Connection RPC、Node HTTP、Label Studio REST/Webhook、Zod、Vitest、pnpm `11.7.0`。

## 全局约束

- [ ] 所有新增和修改只能位于 `/Users/xinlongzhang/PycharmProjects/dsh-label-studio-plugin-package`。
- [ ] `/Users/xinlongzhang/PycharmProjects/deepseek-harness` 只能用于只读接口核对和插件安装测试，`git status --short` 必须始终为空。
- [ ] 不修改 DSH 的 Session、agent-loop、原 `ui-layout`、RPC、Host、WebServer 或 Profile 包源码。
- [ ] 所有 Cordis 注册必须位于插件 `ctx.effect()` 中并返回 disposer；卸载后不得残留 route、RPC、工具、代理监听器或内存请求。
- [ ] 不扩展 `SessionEventMap`，不调用 `Session.append()` 保存绑定，不改变 `deriveMessages()` 或 prompt 组装。
- [ ] 被动 iframe 浏览不更新 binding；不增加持续 URL、click、history、fetch、XHR、DOM 或定时轮询监听。
- [ ] 工具只在 REST 成功且响应关联验证通过后提交 binding；HTTP 失败和 mutation outcome unknown 不提交。
- [ ] Webhook 不得根据活动 Session 数量建立新 binding；创建和更新事件只确认已有精确绑定，删除事件只清除或降级已失效绑定。
- [ ] Webhook、Bridge、RPC、REST 和持久 JSON 边界全部验证输入；日志和错误不得包含 PAT、access token、Webhook secret、样本、标注结果或原始 body。
- [ ] 复用现有 `label_studio_context` Store、事件长轮询、Connection RPC、WebServer、subprocess env 和 `label_studio_status`；不创建第二套 storage domain、通用 RPC、HTTP server 框架或后台轮询。
- [ ] Label Studio mutation 成功后不得因 binding CAS 冲突重放业务请求；工具必须返回业务成功和脱敏 warning。
- [ ] iframe 代理只缓冲 HTML；上传和多模态响应必须流式透传。
- [ ] 每个代码 Task 严格执行 Red、确认预期失败、最小 Green、局部重构、聚焦回归，并在完成后停止供用户核验。
- [ ] 接口、状态转换和默认值以[接口文档](2026-09-03-label-studio-intent-binding-interfaces.zh.md)为唯一来源；本文件只维护执行状态。
- [ ] 禁止批量删除；本计划不删除现有 Store 或 DSH 文件。

---

### Task 20：固化绑定协议

**Files:**

- 修改：`packages/protocol/src/index.ts`
- 新增测试：`packages/protocol/tests/binding-exports.spec.ts`
- 修改测试：`packages/protocol/tests/exports.spec.ts`

**Interfaces:**

- Consumes: 现有品牌化 project、task、annotation、lease 和 navigation ID。
- Produces: binding snapshot/source/target、binding commit outcome、Webhook DTO、按需页面检查 DTO 和稳定错误码。

- [ ] **编写协议红测**：覆盖 project/task binding、source 与 target 同时存在、空 binding、独立页面/binding revision、Webhook 单条与批量 action、inspection request/response、commit conflict 和非法裸 ID。
- [ ] **运行协议红态**：执行 `pnpm exec vitest run packages/protocol/tests/binding-exports.spec.ts packages/protocol/tests/exports.spec.ts`，确认失败来自缺失的新导出。
- [ ] **实现最小类型**：只在 `packages/protocol/src/index.ts` 增加接口文档定义的品牌、联合、DTO 和错误码，不增加运行时依赖。
- [ ] **验证协议绿态**：重跑上述 Vitest 命令，再执行 `pnpm --dir packages/protocol run typecheck`，预期全部通过。
- [ ] **检查导出范围**：确认协议包不导出 Host、React、Node HTTP、凭据或 Label Studio 响应 body 类型。
- [ ] **汇报协议结果**：列出新增类型和 Red/Green 命令结果，停止等待用户批准 Task 21。

### Task 21：扩展会话存储

**Files:**

- 修改：`src/session-context-spec.ts`、`src/session-context-store.ts`
- 修改测试：`tests/session-context-spec.spec.ts`、`tests/session-context-store.spec.ts`
- 修改协议测试：`packages/protocol/tests/binding-exports.spec.ts`、`packages/protocol/tests/exports.spec.ts`

**Interfaces:**

- Consumes: Task 20 的 binding 类型、现有 `LabelStudioSessionContextStore`、`SessionId` 和 Session header `createdAt`。
- Produces: 扩展后的 `LabelStudioSessionContextSnapshot`、`readBinding()`、`commitBinding()`、`reconcileProjectDeleted()` 和 `reconcileTasksDeleted()`。

- [ ] **测试兼容读取**：写红测覆盖旧记录缺少 binding、无记录和 `createdAt` 不匹配，要求读取为空 binding 且不产生写入。
- [ ] **测试独立状态**：写红测确认被动 `page/commit` 只更新页面 revision，`commitBinding()` 只更新 binding revision，两者互不覆盖。
- [ ] **测试提交规则**：写红测覆盖 CAS、相同提交幂等、project/task 切换、binding recent project 上限和现有 per-Session queue 串行。
- [ ] **测试删除同步**：写红测要求 project 删除清除所有关联 binding，task 删除降级到 project，annotation 删除不推断 task，且不影响无关 Session。
- [ ] **运行存储红态**：执行 `pnpm exec vitest run tests/session-context-spec.spec.ts tests/session-context-store.spec.ts packages/protocol/tests/binding-exports.spec.ts packages/protocol/tests/exports.spec.ts`，确认失败来自缺失 binding 字段和方法。
- [ ] **实现最小扩展**：在现有 Zod record 中增加可选持久 binding，并让读取结果总是投影完整空或非空 snapshot；复用现有 domain、table、queue、clock 和 close 生命周期。
- [ ] **实现冲突结果**：`commitBinding()` 用联合结果返回 CAS 冲突，不抛出会掩盖已成功业务操作的通用异常。
- [ ] **验证存储绿态**：重跑上述 Vitest 命令，再执行 `pnpm exec tsc -p tsconfig.json --noEmit && pnpm --dir packages/protocol run typecheck`，预期全部通过。
- [ ] **检查最小范围**：执行 `git diff -- src/session-context-spec.ts src/session-context-store.ts tests/session-context-spec.spec.ts tests/session-context-store.spec.ts packages/protocol`，确认没有新 storage domain、迁移脚本或旧 Store 删除。
- [ ] **汇报存储结果**：展示页面/binding 隔离、CAS、删除同步和测试结果，停止等待用户批准 Task 22。

### Task 22：构建按需桥接

**Files:**

- 新增 Host：`src/current-page-broker.ts`、`src/frame-proxy.ts`、`src/frame-bridge-script.ts`
- 新增 Host 测试：`tests/current-page-broker.spec.ts`、`tests/frame-proxy.spec.ts`、`tests/frame-bridge-script.spec.ts`
- 修改 Host：`src/context-rpc.ts`、`src/change-broker.ts`、`src/boot-config.ts`、`src/index.ts`、`src/lifecycle.ts`
- 修改 Host 测试：`tests/context-rpc.spec.ts`、`tests/change-broker.spec.ts`、`tests/boot-config.spec.ts`、`tests/apply.spec.ts`、`tests/lifecycle.spec.ts`
- 新增 Client：`packages/client-ui/src/client/current-page-bridge.ts`
- 修改 Client：`packages/client-ui/src/client/context-state.ts`、`packages/client-ui/src/client/panel-state.ts`、`packages/client-ui/src/client/index.ts`
- 新增 Client 测试：`packages/client-ui/tests/current-page-bridge.client.spec.ts`
- 修改 Client 测试：`packages/client-ui/tests/context-state.client.spec.ts`、`packages/client-ui/tests/panel-state.client.spec.ts`

**Interfaces:**

- Consumes: Task 20 inspection DTO、当前 Session lease/generation、现有事件长轮询和 iframe panel。
- Produces: 可直接装配的 `LabelStudioCurrentPageBroker`、受限 loopback frame proxy 和只响应请求的 iframe Bridge。

- [ ] **测试请求生命周期**：写红测覆盖 inspection ID、每 Session 单请求、deadline、取消、Session 切换、lease 过期和插件卸载。
- [ ] **测试消息来源**：写 Client 红测覆盖 iframe window、origin、协议、inspection ID、epoch 和重复响应；任一不匹配必须忽略。
- [ ] **测试页面解析**：写红测覆盖 projects、project、task、annotation 和不支持的 Label Studio route，禁止提交任意 URL。
- [ ] **测试被动无监听**：写红测确认 Bridge 脚本只注册 message listener，不包装 history、click、fetch、XHR、MutationObserver 或定时轮询。
- [ ] **测试代理安全**：写红测覆盖 loopback upstream、随机同主机端口、同源外部脚本、CSP 不放宽、redirect/Origin/Referer 改写、Cookie/CSRF、压缩 HTML 和任意主机拒绝。
- [ ] **测试代理流式**：写红测覆盖上传 request body、图片/音频/视频/导出 response、背压、取消和大于 HTML 上限的非 HTML 内容；只有待注入 HTML 受 `frameProxyHtmlMaxBytes` 限制。
- [ ] **测试 Host 回执**：写红测要求 current-page RPC 验证 lease/generation/inspection ID，旧回执不能修改新 Session，Broker 本身不得提交 binding。
- [ ] **运行桥接红态**：执行 `pnpm exec vitest run tests/current-page-broker.spec.ts tests/frame-proxy.spec.ts tests/frame-bridge-script.spec.ts tests/context-rpc.spec.ts tests/change-broker.spec.ts tests/boot-config.spec.ts tests/apply.spec.ts tests/lifecycle.spec.ts packages/client-ui/tests/current-page-bridge.client.spec.ts packages/client-ui/tests/context-state.client.spec.ts packages/client-ui/tests/panel-state.client.spec.ts`，确认失败来自缺失实现。
- [ ] **实现最小 Broker**：复用现有 Session event 通道投递一次检查并等待回执，不建立第二套 RPC 或轮询框架。
- [ ] **实现最小 Bridge**：只在收到匹配请求时解析当前位置并 `postMessage` 回复；脚本由代理同源静态路径提供。
- [ ] **实现受限代理**：只代理配置的 Label Studio loopback origin，只缓冲并注入 HTML，其他请求和响应流式透传。
- [ ] **接通 Client 回执**：Client 收到 Host inspection event 后调用 iframe，验证响应并提交；不更新 binding Store。
- [ ] **验证桥接绿态**：重跑上述 Vitest 命令，再执行 `pnpm exec tsc -p tsconfig.json --noEmit && pnpm --dir packages/client-ui run typecheck && pnpm run build && pnpm run test:artifact`，预期全部通过。
- [ ] **真实按需烟测**：在 iframe 打开未标注 task，确认不产生 binding；发起一次页面检查，确认返回当前 project/task 且没有持续监听。
- [ ] **汇报桥接结果**：展示被动无变化、一次性检查、来源拒绝、流式媒体和卸载关闭，停止等待用户批准 Task 23。

### Task 23：解析操作目标

**Files:**

- 新增：`src/operation-context.ts`
- 新增测试：`tests/operation-context.spec.ts`
- 修改：`src/api.ts`
- 修改测试：`tests/api.spec.ts`

**Interfaces:**

- Consumes: Task 21 的扩展 Store、Task 22 的生产 `LabelStudioCurrentPageBroker` 和现有 `LabelStudioApi.getProject()`/`getTask()`。
- Produces: `LabelStudioOperationContextResolver.resolve()` 和 `commitSuccessfulResult()`。

- [ ] **测试选择优先级**：写红测覆盖 explicit、`current_page: true`、现有 binding、无 binding 自动按需检查和禁止全局最近项目回退。
- [ ] **测试层级要求**：写红测要求 project 操作接受 project/task target，task 操作只接受 task target，projects 页面明确失败。
- [ ] **测试 REST 验证**：写红测覆盖 task/project 关联一致、显式 project 交叉检查、404、取消和响应 ID 不匹配。
- [ ] **测试提交时点**：写红测要求 `resolve()` 不写 Store，业务成功才调用提交；失败和 unknown outcome 保持原 binding revision。
- [ ] **测试冲突结果**：写红测要求提交 CAS 冲突返回当前 binding，不抛出需要重放业务请求的异常。
- [ ] **运行解析红态**：执行 `pnpm exec vitest run tests/operation-context.spec.ts tests/api.spec.ts tests/current-page-broker.spec.ts`，确认失败来自缺失解析器或验证方法。
- [ ] **实现最小解析器**：实现单一解析流程和成功提交方法，不在各工具复制目标选择规则，也不创建 Bridge 替身作为生产依赖。
- [ ] **补齐 API 验证**：只增加解析器需要的 project/task 读取和关联检查，不增加 annotation 更新接口。
- [ ] **验证解析绿态**：重跑上述 Vitest 命令，再执行 `pnpm exec tsc -p tsconfig.json --noEmit`，预期全部通过。
- [ ] **汇报解析结果**：展示 explicit、current-page、binding 和缺失目标路径，以及失败不写入和冲突不重放证据，停止等待用户批准 Task 24。

### Task 24：接通工具绑定

**Files:**

- 修改：`src/tools.ts`、`src/api.ts`、`src/present.ts`、`src/index.ts`
- 修改测试：`tests/tools.spec.ts`、`tests/api.spec.ts`、`tests/present.spec.ts`、`tests/apply.spec.ts`
- 修改产物测试：`tests/alpha3-compat.test.mjs`

**Interfaces:**

- Consumes: Task 23 的操作上下文解析器和 binding commit outcome。
- Produces: 所有业务工具的一致 binding 行为，以及新工具 `label_studio_update_label_config`。

- [ ] **测试创建绑定**：写红测要求 `label_studio_create_project` 只在 API 成功且响应 ID 验证后绑定返回 project。
- [ ] **测试导入绑定**：写红测覆盖显式 project、已有 binding、`current_page: true`、批量 task 不猜当前 task、失败和 unknown outcome 不提交。
- [ ] **测试预标绑定**：写红测覆盖显式 task、已有 task binding、按需当前 task、project 关联验证和 prediction 成功提交。
- [ ] **测试读取绑定**：写红测要求 `label_studio_get_active_task` 在缺少 task binding 时按需检查，成功读取后绑定；无 Session 明确失败。
- [ ] **测试模板绑定**：写红测要求新工具只更新 `label_config`，响应 project ID/config 一致后绑定 project。
- [ ] **测试聚焦绑定**：写红测要求 `label_studio_focus_task` 在浏览器 ACK 和 REST 关联都成功后绑定 task。
- [ ] **测试成功冲突**：写红测模拟每一种 mutation 已成功后 binding CAS 冲突，要求返回业务成功和 `binding-conflict` warning，且 API mock 调用次数始终为一次。
- [ ] **运行工具红态**：执行 `pnpm exec vitest run tests/tools.spec.ts tests/api.spec.ts tests/present.spec.ts tests/apply.spec.ts`，确认失败来自未接入解析器和缺失模板工具。
- [ ] **实现统一接线**：注入一个 resolver，删除工具内部重复 fallback，保留现有 operation gate 和错误脱敏。
- [ ] **实现模板 REST**：增加 `PATCH /api/projects/{id}/`，扩展 HTTP 方法联合和 mutation unknown 处理。
- [ ] **更新模型可见说明**：工具 description 明确 ID、Session binding 和 `current_page` 选择规则；在 `tests/alpha3-compat.test.mjs` 检查构建产物，不手改生成目录。
- [ ] **验证工具绿态**：重跑上述 Vitest 命令，再执行 `pnpm exec tsc -p tsconfig.json --noEmit && pnpm run build && node --test tests/alpha3-compat.test.mjs`，预期全部通过。
- [ ] **汇报工具结果**：按创建、导入、预标、读取、模板和聚焦展示 binding 提交点，并展示冲突不重放，停止等待用户批准 Task 25。

### Task 25：接入事件同步

**Files:**

- 新增：`src/webhook-payload.ts`、`src/webhook-ingress.ts`、`src/webhook-registration.ts`、`src/webhook-binding.ts`
- 新增 fixture：`tests/fixtures/label-studio-1.22-webhooks.ts`
- 新增测试：`tests/webhook-payload.spec.ts`、`tests/webhook-ingress.spec.ts`、`tests/webhook-registration.spec.ts`、`tests/webhook-binding.spec.ts`
- 修改：`src/api.ts`、`src/session-context-spec.ts`、`src/session-context-store.ts`、`src/change-broker.ts`、`src/runtime.ts`、`src/config.ts`、`src/index.ts`、`src/lifecycle.ts`、`src/tools.ts`
- 修改测试：`tests/api.spec.ts`、`tests/session-context-spec.spec.ts`、`tests/session-context-store.spec.ts`、`tests/change-broker.spec.ts`、`tests/runtime.spec.ts`、`tests/config.spec.ts`、`tests/apply.spec.ts`、`tests/lifecycle.spec.ts`、`tests/tools.spec.ts`

**Interfaces:**

- Consumes: Task 20 Webhook DTO、Task 21 扩展 Store、alpha.3 `ctx.webServer.register()`、subprocess `env` 和 Label Studio Webhook API。
- Produces: 已认证 route、可对账的插件自有 Webhook 注册、已有 binding 同步和删除清理。

- [ ] **测试真实 payload**：用 `tests/fixtures/label-studio-1.22-webhooks.ts` 覆盖 `TASKS_CREATED`、`TASKS_DELETED`、`ANNOTATION_CREATED`、`ANNOTATIONS_CREATED`、`ANNOTATION_UPDATED`、`ANNOTATIONS_DELETED`、项目事件、额外字段和非法 ID。
- [ ] **测试删除字段**：要求 annotation 删除只解析 project/annotation IDs，不要求或推断 task ID；批量 annotation 创建涉及多个 task 时不生成单一 task target。
- [ ] **测试 HTTP 边界**：覆盖 POST、JSON content type、声明/实际 body 上限、无效 UTF-8、认证 header 常量时间比较和固定状态码。
- [ ] **测试安全归属**：创建和更新事件只匹配已有精确 project/task binding；没有匹配时返回 `unassigned`；独立 8080 页面、其他浏览器和外部 API 事件不能建立或替换 binding。
- [ ] **测试删除同步**：project 删除清除所有关联 binding，task 删除降级精确 task binding，annotation 删除不修改 binding。
- [ ] **测试显式注册字段**：创建请求必须包含 `is_active: true`、`project: null`、`send_for_all_actions: false`、`send_payload: true`、八类事件的可用 action、owner header 和独立 secret header；缺少任一事件类别按模式失败或 unavailable。
- [ ] **测试崩溃对账**：覆盖 owner ID 持久化、正常卸载删除、遗留注册清理、create/delete unknown outcome、重复启动只保留一个精确 owner 注册，以及不删除 callback URL 相同但 owner 不同的用户 Webhook。
- [ ] **测试运行模式**：managed Python 设置 `LABEL_STUDIO_ALLOW_ORGANIZATION_WEBHOOKS=true` 和解析后的 `WEBHOOK_TIMEOUT`；external required 失败加载，optional 显示 unavailable，off 不注册。
- [ ] **测试凭证恢复**：optional 启动缺少 PAT 时工具和 Bridge 可用；配置凭证后调用现有 `label_studio_status`，只重试一次并恢复 ready。
- [ ] **运行事件红态**：执行 `pnpm exec vitest run tests/webhook-payload.spec.ts tests/webhook-ingress.spec.ts tests/webhook-registration.spec.ts tests/webhook-binding.spec.ts tests/api.spec.ts tests/session-context-spec.spec.ts tests/session-context-store.spec.ts tests/change-broker.spec.ts tests/runtime.spec.ts tests/config.spec.ts tests/apply.spec.ts tests/lifecycle.spec.ts tests/tools.spec.ts`，确认失败来自缺失组件。
- [ ] **实现有限解析**：只保留 action 和关联 ID，支持官方单条名称与 1.22.0 实际批量名称，不保存或记录完整 payload。
- [ ] **实现已认证入口**：注册一个精确 route，限制 body，在持久同步完成后返回 `204`；错误使用接口文档固定响应。
- [ ] **实现安全同步**：创建和更新事件只查询已有 binding 并报告匹配，不修改 target/source/revision；删除事件调用 Store 的全记录同步方法。
- [ ] **实现可对账注册**：持久化随机 owner ID，列举 action/Webhook，按 owner header 精确清理残留，再创建一个显式关闭 all-actions 的注册。
- [ ] **实现恢复入口**：启动尝试一次注册；optional 失败后由 `label_studio_status` 调用同一幂等 `ensureInstalled()`，不增加轮询或新工具。
- [ ] **验证事件绿态**：重跑上述 Vitest 命令，再执行 `pnpm exec tsc -p tsconfig.json --noEmit`，预期全部通过。
- [ ] **真实 Webhook 烟测**：在 Label Studio 1.22.x 创建项目、导入任务并提交 annotation，确认无已有 binding 时不自动绑定、已有精确 binding 只报告匹配、删除事件正确清理；记录外部模式需配置 `WEBHOOK_TIMEOUT` 且官方不重试。
- [ ] **汇报事件结果**：展示认证、精确匹配、unassigned、崩溃对账、凭证恢复和卸载清理，停止等待用户批准 Task 26。

### Task 26：完善界面状态

**Files:**

- 修改：`packages/client-ui/src/client/LabelStudioPanel.tsx`、`packages/client-ui/src/client/LabelStudioPanel.module.css`、`packages/client-ui/src/client/locales.ts`、`packages/client-ui/src/client/context-state.ts`
- 修改测试：`packages/client-ui/tests/panel.client.spec.tsx`、`packages/client-ui/tests/session-page-context.client.spec.ts`、`packages/client-ui/tests/root.client.spec.tsx`、`packages/client-ui/tests/layout-css.spec.ts`、`packages/client-ui/tests/apply.client.spec.ts`

**Interfaces:**

- Consumes: 持久 binding snapshot、Webhook availability/unassigned、inspection 状态和现有 workbench。
- Produces: 当前 binding、来源、按需检查进度、Webhook unavailable/unassigned 和删除降级的可见状态。

- [ ] **测试绑定展示**：写红测覆盖未绑定、project、task、source、最近项目和 deleted。
- [ ] **测试检查状态**：写红测覆盖 inspecting、timeout、unsupported、Session 切换取消和成功后恢复 ready。
- [ ] **测试 Webhook 状态**：写红测覆盖 ready、optional unavailable 和 no-matching-binding unassigned，文本全部来自 locale 字典。
- [ ] **测试被动浏览**：改变模拟 iframe 内部位置但不发送 inspection，确认 binding snapshot/revision 不变；现有页面恢复状态允许独立变化。
- [ ] **运行界面红态**：执行 `pnpm exec vitest run packages/client-ui/tests/panel.client.spec.tsx packages/client-ui/tests/session-page-context.client.spec.ts packages/client-ui/tests/root.client.spec.tsx packages/client-ui/tests/layout-css.spec.ts packages/client-ui/tests/apply.client.spec.ts`，确认失败来自缺失状态或文案。
- [ ] **实现最小展示**：在现有 context bar 显示 binding 和同步状态，不增加第二个布局 root、公共 slot 或状态管理框架。
- [ ] **保留显式定位**：顶部 ID 输入保留显式定位能力，但成功后通过统一 resolver 提交 binding，不把它描述为唯一方式。
- [ ] **验证界面绿态**：重跑上述 Vitest 命令，再执行 `pnpm --dir packages/client-ui run typecheck && pnpm run build && pnpm run test:artifact`，预期全部通过。
- [ ] **汇报界面结果**：提供未绑定、工具绑定、按需检查和 Webhook unavailable/unassigned 截图，停止等待用户批准 Task 27。

### Task 27：验收插件装卸

**Files:**

- 修改：`cordis.patch.yml`、`tests/fixtures/alpha3-web.overlay.yml`
- 修改：`src/config.ts`、`src/invariant.ts`、`packages/client-ui/src/invariant.ts`
- 修改测试：`tests/config.spec.ts`、`tests/manifest.spec.ts`、`tests/apply.spec.ts`、`tests/alpha3-compat.test.mjs`、`tests/fullscreen-mode.test.mjs`、`tests/docs.spec.ts`
- 修改文档：`README.md`、`README.zh.md`、`packages/client-ui/README.md`、`packages/client-ui/README.zh.md`、`packages/protocol/README.md`、`packages/protocol/README.zh.md`、`INSTALL.zh.md`

**Interfaces:**

- Consumes: Tasks 20–26 的协议、扩展 Store、Bridge、resolver、工具、Webhook 和 UI。
- Produces: alpha.3 可安装、可卸载、可重新安装的完整插件与真实验收记录。

- [ ] **测试配置字段**：写红测覆盖 `webhookMode`、`webhookPath`、`webhookMaxBodyBytes`、`managedWebhookTimeoutSeconds`、`currentPageTimeoutMs`、`frameProxyHtmlMaxBytes` 的默认值、合法边界、非法路径、非法数字和未知字段。
- [ ] **更新 Bundle patch**：在 `cordis.patch.yml` 和 `tests/fixtures/alpha3-web.overlay.yml` 显式填写接口文档默认值，并由 `tests/manifest.spec.ts` 比较一致。
- [ ] **测试组合关系**：验证一个 Host、一个 Client、一个替代 root、一个 Webhook route 和一个 frame proxy；禁止第二个 DSH core provider、storage domain 或 RPC transport。
- [ ] **测试不改 Session**：比较 binding、Webhook 和按需检查前后的 Session event types 与 `deriveMessages()`，除用户主动工具调用外保持一致。
- [ ] **测试完整卸载**：卸载 Bundle 并重启，确认原布局恢复、route/RPC/tools/proxy/lease 消失、持久 binding 保留、Label Studio 外部服务不被错误停止。
- [ ] **测试重新安装**：重新安装并重启，确认每个 Session 的 binding 恢复，owner 对账后 Webhook、代理和 route 各只有一个。
- [ ] **测试真实意图链**：执行“创建标注项目→导入数据→修改模板→当前 task 预标注”，确认成功操作更新同一 Session，CAS warning 不重放 mutation。
- [ ] **测试双 Session**：Session A 操作文本项目、Session B 操作图像项目；切换和重启后保持独立，不依赖手工输入 ID。
- [ ] **测试被动浏览**：在 A 的 iframe 浏览其他项目后切换 Session，确认 A binding 不变；随后说“操作当前项目”才进行一次检查并替换 binding。
- [ ] **测试外部事件**：独立 8080 页面、其他浏览器和外部 API 创建或标注时不得建立 DSH binding；已绑定资源删除时所有相关 Session 正确清理。
- [ ] **同步正式文档**：更新三组 README 和安装文档，明确 Webhook 只同步已有绑定、按需 Bridge、被动无监听、Label Studio 1.22.x 验证基线、其他版本 action 探测、失败恢复和卸载行为。
- [ ] **运行源码检查**：执行 `pnpm run typecheck && pnpm run test:source && pnpm run test:docs`，只报告实际结果。
- [ ] **运行产物检查**：执行 `pnpm run build && pnpm run test:artifact && pnpm run test:nodenext-consumer`，只报告实际结果。
- [ ] **运行格式检查**：执行 `git diff --check`，确认独立插件差异只包含计划内文件。
- [ ] **核验官方仓库**：在 `/Users/xinlongzhang/PycharmProjects/deepseek-harness` 执行只读 `git status --short`，预期无输出。
- [ ] **提交验收矩阵**：汇报工具 binding、按需 Bridge、Webhook 同步、双 Session、外部事件隔离、被动浏览、卸载/重装、prompt 隔离和已知限制；不自动提交或发布。
