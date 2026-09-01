# DSH alpha.3 插件适配实施计划

**目标：** 只修改独立插件仓库，使其可在 `/Users/xinlongzhang/Documents/deepseek-harness` 的 `0.1.2-alpha.3` 运行时安装、加载、卸载和重新安装。

**边界：** `Documents/deepseek-harness` 仅作为只读运行宿主；所有 DSH 配置、profile 和会话状态均写入 `/private/tmp` 下的临时 `DSH_HOME`。

**最小改动：** 将已移除的 `dsh-client-runtime/client` 依赖迁移到 `dsh-client-store` 与现有 alpha.3 类型来源；将连接就绪观察量从 `hostDescription` 迁移到 `generation`；同步客户端注入清单和 peer 版本；不改 Label Studio 业务逻辑。

## 验收清单

- [x] 兼容性测试先复现旧 runtime 与旧连接属性问题。
- [x] 独立插件测试通过，发布文件不再引用旧 runtime。
- [x] 临时 profile 可以安装插件并合成禁用原 `ui-layout` 的配置。
- [x] Web 宿主能加载插件客户端模块且无 module-table 错误。
- [x] 卸载后原 `ui-layout` 恢复，重新安装后替代布局再次生效。
- [x] `Documents/deepseek-harness` 测试前后 `git status --short` 均为空。
