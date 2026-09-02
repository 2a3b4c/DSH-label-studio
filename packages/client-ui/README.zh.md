# @deepseek-ai/dsh-client-ui-label-studio

[English](README.md) | 中文

Label Studio Bundle 的浏览器包。它替换 Web 的 `root` occupant，同时保留原有 sidebar、conversation、details 和 overlay 四个 slot，并把 Label Studio 工作台作为该根组件私有的第五个子节点直接渲染。

该包提供原 sidebar 和 conversation 插件使用的同一组公共 `ctx.layout` 方法：`toggleSidebar()`、`openDetails()` 和 `closeDetails()`。工作台开关只属于包内部；该包不会注册公共工作台 slot，也不会扩展公共布局接口。

工作台 iframe 采用延迟挂载和关闭保活。第一次打开前不会创建 iframe；第一次打开后，关闭只会把承载区域设为 hidden 和 inert，iframe 仍保持挂载，因此再次打开不会重新加载 Label Studio 页面。标题栏的全屏按钮让工作台覆盖整个 DSH 页面；再次点击、按 `Esc` 或关闭工作台都会恢复原布局。替代根保留四个原 slot 的固定渲染位置，并且只在一个非 blank 的 live Session 切换到另一个非 blank 的 live Session 时关闭 details。

替代根在 React commit 后把当前选中的 DSH Session 绑定到浏览器 source 租约。顶部 target 控件接受正整数 project id、task id 和可选 annotation id，通过固定的 `/label-studio` Connection 通道预留单调递增的导航 revision，把 `/projects/{projectId}/data?task={taskId}` 应用到 iframe，并且只在 React 提交该 URL 后发布。Host `label_studio_focus_task` 请求使用同一个串行队列，也只在 iframe URL 提交后确认。

一个可取消的长轮询负责观察当前租约的 revision 事件。当 focus 确认的传输结果未知时，控制器会分别保存 observed 游标和 committed 游标；Connection 世代变化时续接未过期租约，租约过期时则从 Host replay baseline 重新打开。匹配的 `prediction-created` task 事件会让当前 iframe 回刷一次；事件历史重置也会让当前 target 回刷一次。断开的长轮询没有回调 Host 变更的路径，因此不能把已提交的 prediction 变成工具失败。事件缓冲以 Host 投影的 `eventHistorySize` 为上限；超限后先关闭旧租约或等待其过期，再重建租约。

请安装 `@deepseek-ai/dsh-label-studio`，不要单独安装本包。Host/Bundle 包会依赖本浏览器包，并通过自己的 `cordis.patch.yml` 激活它；移除该 Bundle 后，下次启动会恢复较低 Web Bundle 中原来的 `ui-layout` 行。

## 模型体验

无，因为浏览器同步只携带 Session、租约、revision、project、task 和可选 annotation id，不会新增模型输入、工具或 Session 事件。

#### KV Cache 影响

无。打开、关闭、调整宽度或重新加载 iframe 都不会改变模型请求。

## 已知限制与后续工作

- 替代根有意复现随附布局的行为。原 sidebar、details、主题、拖动或窄屏行为变化时，维护者必须与 `@deepseek-ai/dsh-client-ui-layout` 比较并决定是否同步。
- iframe 仍依赖 Label Studio 允许嵌入以及浏览器已经登录。浏览器包不交换凭据，也不反向代理 Label Studio。
- 活跃 target 注册表只保存标识符。只有 Host 工具根据这些标识符通过 Label Studio 认证 REST API 重新读取后，DeepSeek 才能获得 task data 或已保存 annotation。
- DSH 无法观察跨源 iframe 内的自由导航和未保存草稿状态。因此工作台不提供已保存确认或直接修改 annotation 的控件；模型只创建供用户审阅的 prediction。
