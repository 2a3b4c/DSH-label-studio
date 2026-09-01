# @deepseek-ai/dsh-label-studio-protocol

[English](README.md) | 中文

Label Studio Host 与浏览器插件共享的仅类型声明。该包让浏览器安全的上下文 id 和租约 DTO 独立于两个可执行插件，因此两个运行时都不需要从对方导入 symbol。

## 发布的声明

主入口导出带品牌的 project、task、annotation、prediction、source、lease、correlation 和 navigation sequence 类型，同时导出 controlled-task 通道使用的 active target、lease snapshot、reservation、target state、浏览器事件、事件 batch、RPC 请求/结果 map、内嵌 outcome 和脱敏错误声明。`SessionId` 从浏览器安全的 `@deepseek-ai/dsh-session/types` 入口导入。

主入口不包含运行时值。Host 与浏览器 consumer 分别拥有自己的 JSON parser，并且只在对应 wire 字段通过验证后构造品牌值。独立的 invariant companion 只在运行时 invariant registry 中登记包所有权。

Connection transport 负责外层 `RpcResult`，`LabelStudioRpcOutcome` 是内层业务结果。这种分层不会把插件错误码加入 Connection 的闭合框架错误集合。声明只包含 id、revision、租约状态和变更原因；它们不定义凭据、Token、样本数据或 annotation result 字段。

## 模型体验

### 共享上下文声明

#### 模型看到的内容

该包不提供 `ContentBlock`、system prompt、工具 schema 或工具结果。后续任何模型可见行为均由 Label Studio 的可执行 consumer 负责。

#### Token 影响

直接 Token 影响为零，因为主入口的所有声明都会在编译时擦除。

#### KV Cache 影响

没有直接影响。声明变更只会通过另外修改模型可见内容的可执行 consumer 产生影响。

## 已知限制和延后工作

- **不提供运行时 parser** — 每个进程自行验证不可信 JSON；如果在这里增加运行时解析，原本中立的类型库就会变成共享的可执行依赖。
