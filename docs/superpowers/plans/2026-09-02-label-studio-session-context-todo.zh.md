# Label Studio Session 上下文实施 TODO

[English](2026-09-02-label-studio-session-context-todo.md) | 中文

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个 DSH Session 独立恢复自己的 Label Studio 项目页、task 页和最近项目，同时保持插件可卸载且不改变模型 prompt。

**Architecture:** 使用 alpha.3 已提供的 `ctx.storageDomain` 保存插件自有 Session 页面记录，以 `{ SessionId, createdAt }` 区分 Session 生命周期；现有浏览器租约继续只保存在线 active task。Client 通过插件 Connection RPC 读取和提交页面，不向 Session 日志写入插件事件。

**Tech Stack:** DSH `0.1.2-alpha.3`、Cordis、TypeScript、React、Connection RPC、`@deepseek-ai/dsh-storage-domain`、Zod、Vitest、pnpm `11.7.0`。

## 全局约束

- 唯一 DSH 基线是 tag `dsh-v0.1.2-alpha.3`、commit `dd6322d604e00eec1ba5e0c8541159906a21094a`。
- 不修改 `packages/core/session/**`、`packages/core/agent-loop/**`、`packages/api/remotes/**`、原 `ui-layout` 或 `vendor/**`。
- 不扩展 `SessionEventMap`，不调用 `Session.append()` 保存页面定位，不改变 `deriveMessages()` 或 prompt 组装。
- 持久记录只包含结构化项目/task/annotation ID、最近项目、revision 和 Session identity，不包含 Token、样本或标注内容。
- Label Studio 页面 Bridge 不在本计划内；不使用 iframe DOM、MutationObserver、反向代理、`postMessage` 或 Python 源码补丁。
- 所有代码步骤严格执行 Red、Green、局部重构、聚焦验证；每个 Task 完成后停止供用户核验。
- 统一类型、状态转换和函数签名以[接口文档](2026-09-02-label-studio-session-context-interfaces.zh.md)为唯一来源，本文件只维护执行清单。

---

### Task 15：迁入插件基线

**Files:**

- 创建 Host 包源码：`src/**`、`tests/**`
- 创建 Client 包源码：`packages/client-ui/**`
- 创建协议包源码：`packages/protocol/**`
- 创建源码验收 overlay：`tests/fixtures/alpha3-web.overlay.yml`
- 修改：`tsconfig.json`、`tsconfig.base.json`、`tsconfig.nodenext-consumer.json`、`pnpm-workspace.yaml`

**Interfaces:**

- Consumes: Task 14 的 Host、Client、协议和 Bundle 源码集合，以及独立包的 alpha.3 compatibility assertions。
- Produces: 不修改 DSH 源码仓库、能够针对 alpha.3 构建、测试和装配的独立插件包。

- [x] **核对来源清单**：逐文件列出旧工作区三个插件目录与 alpha.3 独立包产物，不复制生成的 `.js`、`.d.ts`、`.map` 或真实凭据。
- [x] **编写兼容红测**：把独立包 `tests/alpha3-compat.test.mjs` 的约束迁成源码 manifest 和 built artifact 测试，要求 Client 使用 alpha.3 的 store、session、renderer 和 Connection API，禁止 `@deepseek-ai/dsh-client-runtime`。
- [x] **运行预期失败**：执行 `pnpm exec vitest run tests/manifest.spec.ts packages/client-ui/tests/manifest.spec.ts`，预期因插件源码尚未迁入而失败。
- [x] **迁入最小源码**：只迁入 Task 14 已验收的插件文件，再按 alpha.3 API 修改 import、inject、peer dependency 和 Connection generation 观察接口。
- [x] **验证聚焦通过**：运行 Host、Client、协议 manifest/exports tests 和各 package typecheck，预期全部通过。
- [x] **验证插件装配**：把独立根包安装到 alpha.3 Web Profile 后运行 `dsh web --dump-config`，确认一个 Host、一个 Client 和一个替代 root。
- [x] **汇报基线结果**：列出迁入文件、alpha.3 差异和全部命令结果，停止等待用户批准 Task 16。

### Task 16：固化会话定位

**Files:**

- 修改协议：`packages/protocol/src/index.ts`、`packages/protocol/tests/exports.spec.ts`
- 创建 Host 源码：`src/session-context-spec.ts`、`src/session-context-store.ts`
- 创建 Host 测试：`tests/session-context-spec.spec.ts`、`tests/session-context-store.spec.ts`
- 修改根包构建文件：`package.json`、`tsconfig.json`

**Interfaces:**

- Consumes: `LabelStudioProjectId`、`LabelStudioTaskId`、`LabelStudioAnnotationId`、alpha.3 `ctx.storageDomain` 和 `SessionId`/header `createdAt`。
- Produces: `LabelStudioPageContext`、`LabelStudioSessionContextSnapshot`、`labelStudioSessionContextDomainSpec` 和 `LabelStudioSessionContextStore`。

- [x] **测试协议类型**：写 compile-time 和 runtime parser 红测，覆盖 projects/project/task、正整数 ID、未知字段、非法 view 和 `revision`。
- [x] **测试存储格式**：写红测，覆盖 domain 名称/版本、完整记录 schema、Session identity、last commit receipt 和非法持久 JSON。
- [x] **测试默认读取**：写红测，要求缺失记录或 `createdAt` 不匹配时返回 projects、空历史和 revision 0，且读取不产生写入。
- [x] **测试提交排序**：写红测，覆盖项目置顶、task 记录、历史上限、同页面无 revision 增长、CAS 冲突和逐 Session 串行。
- [x] **测试响应重试**：写红测，要求完全相同 commit receipt 幂等，字段不同或旧 revision 不能覆盖新页面。
- [x] **测试项目删除**：写红测，要求 active project/task 回退 projects、历史标记 deleted、不自动选择其他项目。
- [x] **运行预期失败**：执行 `pnpm exec vitest run packages/protocol/tests/exports.spec.ts tests/session-context-spec.spec.ts tests/session-context-store.spec.ts`，失败必须来自缺失类型或实现。
- [x] **实现最小存储**：按接口文档实现 Zod schema、domain spec、store、per-Session queue、CAS、幂等 receipt、最近项目和 close disposer。
- [x] **补齐依赖配置**：Host 增加 `@deepseek-ai/dsh-storage-domain` peer/dev dependency 和 `zod` dependency，不插入新的 storage provider。
- [x] **验证测试通过**：重跑三个 focused tests，再运行 Host 和协议 package typecheck，预期全部通过。
- [x] **汇报存储结果**：展示 Red/Green、domain 记录示例和 prompt 零变更路径，停止等待用户批准 Task 17。

### Task 17：接通页面提交

**Files:**

- 修改 Host 状态与 RPC：`src/context-registry.ts`、`src/context-rpc.ts`、`src/change-broker.ts`、`src/session-context-store.ts`
- 修改 Host 接线与生命周期：`src/index.ts`、`src/lifecycle.ts`、`src/tools.ts`、`src/config.ts`
- 修改共享协议：`packages/protocol/src/index.ts`
- 修改 Client RPC caller：`packages/client-ui/src/client/context-bridge.ts`
- 测试 Host 行为：`tests/context-registry.spec.ts`、`tests/context-rpc.spec.ts`、`tests/change-broker.spec.ts`、`tests/lifecycle.spec.ts`、`tests/focus-task.spec.ts`、`tests/apply.spec.ts`、`tests/config.spec.ts`
- 测试协议与 Client：`packages/protocol/tests/exports.spec.ts`、`packages/client-ui/tests/context-bridge.client.spec.ts`
- 测试构建产物消费：`tests/nodenext-consumer.ts`、`tsconfig.nodenext-consumer.json`、`package.json`

**Interfaces:**

- Consumes: Task 16 的 Session context store、现有 lease/generation/target revision 和 Connection RPC outcome。
- Produces: `lease/open.sessionContext`、`page/commit` endpoint、`clearBrowserTarget()` 和带 Session context revision 的 focus ACK。

- [x] **测试租约返回**：写红测，要求 `lease/open` 验证 Session 后返回对应持久 snapshot，新 Session 返回固定默认值。
- [x] **测试页面提交**：写红测，覆盖 project/projects 清除 active task、task 必须匹配 committed target、CAS 冲突和持久写失败。
- [x] **测试清空幂等**：写红测，覆盖 `clearBrowserTarget()` 的 sequence、target revision、响应丢失重试、旧 generation 和并发 focus。
- [x] **测试聚焦提交**：写红测，要求 focus event 携带 expected Session context revision，ACK 只在页面和持久记录同时提交后成功。
- [x] **测试错误脱敏**：写红测，覆盖 storage unavailable、context conflict 和非法 payload，错误不得包含持久记录、PAT、REST body 或 annotation。
- [x] **运行预期失败**：执行 Host registry、RPC、broker 和协议 focused tests，预期因 endpoint、字段或方法缺失而失败。
- [x] **实现统一提交**：最小扩展 registry、RPC parser/handler、broker focus DTO 和 plugin apply 接线；所有持久更新只调用 store。
- [x] **测试卸载清理**：验证 handler 先拒绝新请求，再结束 wait/focus，最后等待 store close；持久 domain 数据保留。
- [x] **验证测试通过**：重跑 focused tests、Host/协议 typecheck 和 built NodeNext consumer smoke，预期全部通过。
- [x] **汇报通道结果**：展示 RPC 请求/结果、失败原子性和卸载结果，停止等待用户批准 Task 18。

### Task 18：恢复项目页面

**Files:**

- 在 `packages/client-ui/` 下替换：用 `src/client/page-url.ts` 替换 `src/client/task-url.ts`
- 修改 Client 状态与面板：`src/client/context-state.ts`、`src/client/panel-state.ts`、`src/client/LabelStudioPanel.tsx`、`src/client/LabelStudioPanel.module.css`、`src/client/locales.ts`、`src/client/index.ts`、`src/client/layout/LabelStudioRoot.tsx`
- 在 `packages/client-ui/` 下测试：`tests/page-url.client.spec.ts`、`tests/session-page-context.client.spec.ts`、`tests/context-state.client.spec.ts`、`tests/panel-state.client.spec.ts`、`tests/panel.client.spec.tsx`、`tests/root.client.spec.tsx`

**Interfaces:**

- Consumes: Task 17 的 `lease/open.sessionContext`、`page/commit`、focus ACK 和 existing target reserve/publish。
- Produces: `buildLabelStudioPageUrl()`、`selectPage()`、Session 自动恢复和最近项目 UI。

- [x] **测试页面地址**：写红测，覆盖 projects、project、task、annotation、base origin 和非法任意 URL。
- [x] **测试会话恢复**：写红测，覆盖 A 文本项目、B 图像项目、切换 A→B→A、无记录 Session 和浏览器重连。
- [x] **测试提交顺序**：写红测，要求 task 依次 reserve、apply、publish、page commit，project/projects 依次 apply、clear target、page commit。
- [x] **测试旧请求隔离**：写红测，覆盖 Session epoch、Connection generation、navigation epoch、RPC unknown 和 CAS conflict，旧操作不能修改新页面。
- [x] **测试历史控件**：写红测，覆盖最近项目排序、deleted 禁用、选择 project、同步状态和键盘访问。
- [x] **运行预期失败**：执行 page URL、context controller 和 panel focused tests，预期因通用页面接口缺失而失败。
- [x] **实现页面恢复**：最小实现通用 URL builder、bridge caller、controller 状态机、panel 当前定位和最近项目选择器。
- [x] **保留跨源限制**：UI 明确说明只同步插件控制的导航，不声称观察 iframe 内任意点击或未保存草稿。
- [x] **验证测试通过**：重跑 Client focused tests、Client typecheck、bundle build 和 browser artifact smoke，预期全部通过。
- [x] **汇报恢复结果**：展示 A/B Session 自动恢复和最近项目 UI 证据，停止等待用户批准 Task 19。

### Task 19：完成兼容验收

**Files:**

- 修改 Host 源码：`src/config.ts`、`src/api.ts`、`src/change-broker.ts`、`src/tools.ts`、`src/index.ts`
- 修改 Bundle 层：`cordis.patch.yml`
- 新增 alpha.3 源码 fixture：`tests/fixtures/alpha3-web.overlay.yml`
- 修改 Host 测试：`tests/config.spec.ts`、`tests/manifest.spec.ts`、`tests/api.spec.ts`、`tests/tools.spec.ts`、`tests/session-context-store.spec.ts`
- 修改独立 Host/Bundle、Client 和协议包的中英文 README 配对文件。

**Interfaces:**

- Consumes: Tasks 16–18 的完整 Session context 功能。
- Produces: `recentProjectLimit` 配置、alpha.3 可安装产物、装卸/重启/Session 隔离验收证据。

- [x] **测试配置红态**：写红测，要求默认 10、范围 1–100、拒绝小数/未知字段，并检查 Bundle patch 和源码示例字段一致。
- [x] **实现配置字段**：只增加 `recentProjectLimit`，把解析值传给 store；不增加路径、Bridge 或 Session 日志开关。
- [x] **验证配置绿态**：运行 config、patch manifest 和 overlay tests，预期全部通过。
- [ ] **测试真实组合**：在 alpha.3 Web 中创建两个 DSH Session，分别提交文本和图像项目，切换并重启后确认各自恢复。
- [x] **测试删除处理**：通过 REST 删除测试项目或使用不存在 fixture，确认下一次插件控制的访问/读取将其标记 deleted 并回退项目列表；不宣称即时感知 iframe 删除。
- [x] **测试 prompt 隔离**：比较导航前后的 Session event types 与 `deriveMessages()` 结果，除用户主动发起的工具调用外必须完全一致。
- [x] **测试插件卸载**：卸载 Bundle 并重启，确认原布局恢复、RPC/租约消失、原 Session 可读取且不存在未知 event type。
- [x] **测试重新安装**：重新安装插件并重启，确认 storage domain 恢复每个 Session 的页面记录。
- [x] **同步正式文档**：更新三包 README 的行为、配置、限制和安装说明；页面 Bridge 仅作为明确的未支持能力。
- [x] **运行最终检查**：执行三个插件包 focused tests/typecheck/build、alpha.3 compatibility test、Web composition test、`pnpm run test:docs` 和 `git diff --check`，只报告实际结果。
- [x] **汇报最终结果**：提交配置 dump、装卸恢复、A/B Session、prompt 隔离和剩余 Bridge 限制的验收矩阵，不自动提交或发布。
