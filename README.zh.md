# dsh-label-studio-workbench

[English](README.md) | 中文

面向 DSH Web 界面的可安装 Label Studio Bundle。仓库根包同时包含 Host 运行时、浏览器 Client、共享协议声明，以及用兼容布局和右侧 Label Studio iframe 替换 Web 根组件的 patch。`0.2.0-alpha.2` 适配 DSH `0.1.2-alpha.3`。

## 装配

将该包与 Harness 一起安装。其 manifest 同时声明 `dsh.bundle` 和 `dsh.client`。发布的 `cordis.patch.yml` 会禁用较低 Web Bundle 中的 `ui-layout` 行并插入一条 Host 行；DSH 从同一个包加载浏览器 Client：

```yaml
- id: ui-layout
  disabled: true

- insert:
    - id: label-studio
      name: 'dsh-label-studio-workbench'
```

安装和卸载命令见 [`INSTALL.zh.md`](INSTALL.zh.md)。安装后的 Bundle patch 会自动参与 Web Profile 装配，无需修改 DSH 源码：

```sh
LABEL_STUDIO_PLUGIN_PACKAGE=/absolute/path/to/dsh-label-studio-plugin-package
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web add --workspace-root "$LABEL_STUDIO_PLUGIN_PACKAGE"
```

课堂上发放普通 package 压缩包；学员必须先完整解压，再把解压后插件根目录的绝对路径传给安装命令。本地目录安装会在 Profile 中保存 `link:` 依赖，因此安装后必须保留该插件目录。

插件先检查配置的 `/health` 端点。服务健康时直接复用，并且不会在退出时停止它。端点不可用时，`python` 模式通过配置的全局 Python 可执行文件运行 Label Studio，`external` 模式则让启动失败并由操作者管理进程。插件会在 `startupTimeoutMs` 内等待自己启动的进程就绪，并且只终止该进程树。

## 配置

| 字段 | 默认值 | 含义 |
|---|---:|---|
| `baseUrl` | `http://127.0.0.1:8080` | iframe 和 REST 客户端使用的 loopback HTTP(S) 端点。包含凭据、查询串、片段或非 loopback 主机时会被拒绝。 |
| `launchMode` | `python` | 健康检查失败时通过 `python` 启动，或要求已经健康的 `external` 服务。 |
| `pythonExecutable` | `python` | 所在环境已经安装 `label-studio` 包的全局 Python 命令名或绝对路径。 |
| `refreshTokenCredential` | `LABEL_STUDIO_PAT` | Label Studio 完整 Personal Access Token refresh 值的凭据引用；每次认证 REST 操作都通过 `ctx.credentials` 解析。`apiKeyEnv` 是非法字段，会被明确拒绝。 |
| `startupTimeoutMs` | `120000` | 正数就绪期限；首次数据库迁移也在该时段内执行。 |
| `shutdownGraceMs` | `5000` | 终止本插件所启动进程时，从 TERM 到 KILL 的正数宽限时间。 |
| `restResponseMaxBytes` | `8388608` | 每个 refresh 和业务 REST 响应在 JSON 解析前允许读取的解码正文字节上限；该值必须是正安全整数。 |
| `activeTaskMaxBytes` | `262144` | 当前任务工具返回的模型 ContentBlock 数组在序列化后的正安全整数字节上限；超限时直接失败，不截断内容。 |
| `focusAckTimeoutMs` | `5000` | 浏览器应用并确认模型请求的任务 URL 时使用的正安全整数期限。 |
| `contextLeaseTtlMs` | `30000` | 浏览器租约的正生命周期；只有持久 DSH Session 检查成功后才续期。 |
| `eventWaitTimeoutMs` | `25000` | 单次可取消事件长轮询的正持续时间；必须短于 `contextLeaseTtlMs`。 |
| `eventHistorySize` | `64` | 每个 DSH Session 为重连回放保留的正 revision 事件数量。 |
| `contextOpenRetryMs` | `1000` | 租约 open 结果未知或事件 wait 可恢复失败后，浏览器再次尝试前等待的正时长。 |
| `contextCloseTimeoutMs` | `1000` | 浏览器尽力关闭租约时使用的正期限；最终清理由租约 TTL 保证。 |

配置只接受表中字段；未知字段会在插件配置阶段失败，不会被静默忽略。`allowDirectAnnotationUpdate` 会被明确拒绝，因为 controlled-task V1 的模型写入路径只有 prediction 创建。

Bundle patch 会在 DSH 启动前读取 `DSH_LABEL_STUDIO_LAUNCH_MODE` 和 `DSH_LABEL_STUDIO_PYTHON_EXECUTABLE`。Python 模式会解析这个可执行文件并运行 `python -m label_studio.server`；使用 `python -m pip install label-studio` 把 Label Studio 安装到同一个全局 Python 中。如果目标命令不叫 `python`，例如部分系统中的 `python3`，应配置其绝对路径。Docker、系统服务或手工启动的服务使用 `external` 模式，并且必须在插件加载前让配置的 `/health` 端点返回 `{"status":"UP"}`。Python 和 Label Studio 是运行依赖，不是 TypeScript 包的依赖。

配置中只保存凭据引用。请在 Label Studio 的 Account 页面创建 Personal Access Token，在完整 refresh token 显示时立即复制，然后在解压后的插件根目录运行 `npm run configure-pat`。这个跨平台脚本隐藏输入并新增或替换 `$DSH_HOME/.env` 中的 `LABEL_STUDIO_PAT`，不修改插件目录中的环境文件；详细步骤见 [`INSTALL.zh.md`](INSTALL.zh.md)。Label Studio 数据库只保留截断且不含签名的表示，因此之后无法从 `label_studio.sqlite3` 恢复完整值。每次认证操作都会重新解析引用、在 `/api/token/refresh/` 交换 refresh token，并以返回的 access token 进行 `Bearer` 认证；插件不会跨操作缓存任一种 token。refresh 和业务响应都按解码后的数据流计数，超过 `restResponseMaxBytes` 就拒绝；错误只保留固定的操作、路径和状态信息，不包含任何 token 或响应正文。业务变更在 dispatch 前发现取消时不会写入；一旦 dispatch，传输失败、取消或无效成功响应都会报告提交状态未知，并且绝不自动重试。

## 工具

- `label_studio_status` 读取无需认证的 `/health` 端点，并报告端点及其进程是否由本插件管理。
- `label_studio_create_project` 创建项目，可同时提供 Label Studio XML 和说明。
- `label_studio_import_tasks` 向项目导入任务 JSON。
- `label_studio_create_prediction` 为任务写入 Label Studio prediction result，实现预标注。
- `label_studio_create_active_prediction` 为当前 Session 的 active task 创建显式 prediction，并只在 REST 成功后通知浏览器回刷该任务。
- `label_studio_focus_task` 在浏览器确认 URL 后，把当前 Session 的工作台导航到指定项目、任务和可选已保存 annotation。
- `label_studio_get_active_task` 使用当前 Session 租约读取权威的项目 label config、任务数据、完整已保存 annotation 和 prediction。

模型会以规范 JSON 值获得项目、任务和 prediction 的数值 id。任务导航要求当前 Session 具有实时浏览器租约，分发前清空旧 target，并且只在浏览器应用请求 URL 后成功；该结果不声称 iframe 网络加载已经完成。读取当前任务时，Host REST 客户端只使用租约中的 id 重新获取数据，并拒绝 project、task、annotation 或 prediction 关联不一致的响应。当前任务预标工具不接收 task id：它会验证租约中的 task/project 关联，在 dispatch 前复查租约 generation 和 target revision，把调用方显式提供的 tag-specific `result` 传给 Label Studio，并只在成功响应后发布 `prediction-created`。该工具不会从旧 annotation 推断结果，也不声称 raw label-config XML 能验证所有模态。没有工具会更新已保存 annotation；用户应在 Label Studio 中审阅、接受或修改 prediction。iframe 只负责呈现：创建项目、读取任务和预标注都不依赖跨域 DOM 访问或浏览器自动化。

## 浏览器行为

浏览器包向 `conversation.session.header.actions` 注册可叠加操作，并在该 Bundle 生效期间提供唯一活动的 `root` occupant。这个根组件保留原 sidebar、conversation、details 和 overlay 四个 slot，并直接渲染工作台，不新增公共 workbench slot。第一次打开前不存在 iframe；关闭后 iframe 仍保留在 hidden、inert 的区域中。重新加载只替换 iframe，**在新窗口打开**使用同一个配置端点，关闭工作台不会中断对话或停止 Label Studio 服务。

实际检查确认 Label Studio 1.22.0 的登录页不发送 `X-Frame-Options`，也没有强制执行 `frame-ancestors`。如果其他 Label Studio 部署添加了这类限制，就必须允许 DSH Web origin，或改用新窗口入口。

## 上下文通道

Host 通过 `ctx.connection.rpc.handle()` 注册 `/label-studio`；DSH `0.1.2-alpha.3` 的 Connection 会在插件代码运行前统一应用 Host、Origin、浏览器认证和跨站请求检查。六个端点分别用于打开和关闭租约、预留和发布受控 target、等待 revision 事件，以及确认 Host focus 请求。Connection 的外层 `RpcResult` 携带内嵌的 Label Studio outcome，其中错误码稳定且信息已经脱敏。这个通道绝不携带样本数据、annotation result、凭据或 Token。

`LabelStudioContextRegistry` 允许每个 DSH Session 持有一个有过期时间的浏览器 source 租约。打开租约和每次等待都会验证实时 `ctx.sessions` 条目或冷态 `ctx.sessionPersistence` 元数据；持久化读取失败或被取消时不会续期。`LabelStudioChangeBroker` 保存有界且按 Session 隔离的 revision 后缀，能够报告回放重置，并支持可取消长轮询和幂等 focus 确认。异步释放插件时，共享操作门会先一起关闭工具和 RPC，再释放 broker、注册表和运行时状态。

浏览器会在 React commit 后绑定当前选中的 Session 并打开租约，手动选择 target 与 Host focus 请求共用一个串行队列。它先应用已经确认的 Label Studio task URL，再发布或确认 target；确认结果不确定时分别保留 observed 和 committed 事件游标；Session 或 Connection 更换时取消当前世代的请求。`prediction-created` 事件只有在 task id 与 active target 匹配时才让 iframe 回刷一次；回放重置则让当前 target 回刷一次。boot 投影会提供 `eventHistorySize`、`contextOpenRetryMs` 和 `contextCloseTimeoutMs`，但绝不包含凭据或任务内容。

## 模型体验

### Label Studio 工具 schema

#### 模型看到的内容

该插件装配后，生成的[工具目录](../../../docs/tool-catalog.md#deepseek-aidsh-label-studio)中列出的七个工具 schema 和说明会进入模型上下文。工具结果报告端点可用性、稳定的 REST id 与 URL、已确认的任务导航、当前任务 prediction 创建结果，或完整的当前 project/task JSON；认证失败只会指出尚未解析的凭据引用。

#### Token 影响

插件装配期间影响固定：Native Tool 请求包含七个工具 schema；Code Mode 则包含相应的生成 SDK 声明。当前任务结果的大小取决于所选任务，并受 `activeTaskMaxBytes` 限制。

#### KV Cache 影响

包配置和可见工具集不变时前缀稳定。添加、删除或替换该插件会改变后续请求中的工具 schema 部分。

## 已知限制和延后工作

- **只允许 loopback 端点** — MVP 会主动拒绝远程 Label Studio 主机；远程部署需要单独设计信任、认证和 iframe origin。
- **不做 iframe DOM 自动化** — 模型通过 REST API 操控项目、导入和 prediction，但不会点击任意 Label Studio 控件，也不会读取浏览器中尚未保存的表单状态。
- **不直接更新 annotation** — controlled-task V1 不注册 annotation PATCH 工具，也不接受用于启用该能力的配置开关；prediction 必须由用户在 Label Studio 中审阅。
- **浏览器上下文只含标识符** — 同步会发布当前 project、task 和可选 annotation id，但不会发布 task data、已保存 annotation、prediction、凭据或 Token。
- **登录和数据存储由 Label Studio 负责** — iframe 可能显示其登录页；插件不会修改 Label Studio 数据库、媒体目录、用户管理或本地文件服务配置。
- **窄屏会挤压两个应用** — 详情栏关闭且工作台达到常规拖动下限后，会话区可能变得很窄；极端宽度下，工作台的渲染宽度也会低于该下限，以确保网格不超出框架。
