# Label Studio 工作台插件安装

本教程将预构建的 `dsh-label-studio-workbench` tarball 安装到 DSH `web` Profile，并验证安装、更新和卸载。插件包同时提供 Host、浏览器 Client、协议类型和 `cordis.patch.yml`；安装只修改 Profile，不修改 DeepSeek Harness 的 `packages/` 源码。

## 1. 检查环境

DSH 必须能够运行，`pnpm` 必须在 `PATH` 中。Label Studio 可以来自 Conda、pip／venv、Docker 或外部服务；插件本身不要求 Conda。仓库默认配置使用名为 `label-studio` 的 Conda 环境：

```sh
node --version
pnpm --version
conda run -n label-studio label-studio --version
```

Windows venv 通常生成 `C:\\project\\.venv\\Scripts\\label-studio.exe`。使用该路径或其他外部服务的方法见第 3 节。

只查看嵌入页面不需要 API 凭据。让模型读取任务、创建项目或创建 prediction 前，需要把 Label Studio Account 页面生成的完整 Personal Access Token refresh 值保存为 DSH 凭据 `LABEL_STUDIO_PAT`；不要把真实值写入插件目录、命令参数、聊天记录或 Git。

DSH 默认从 `~/.dsh/.credentials.yaml` 读取受管凭据。文件是一个 YAML mapping，并且在 macOS/Linux 上必须只有当前用户可读写：

```yaml
LABEL_STUDIO_PAT: "在本机填写完整 refresh 值"
```

```sh
chmod 600 ~/.dsh/.credentials.yaml
```

## 2. 安装 tarball

先停止正在运行的 DSH。将变量设为收到的 `.tgz` 文件绝对路径：

```sh
LABEL_STUDIO_TARBALL=/absolute/path/to/dsh-label-studio-workbench-0.1.0-rc.8.tgz
dsh plugin --profile web add --workspace-root "$LABEL_STUDIO_TARBALL"
```

在 DeepSeek Harness 源码仓库中运行 CLI 时，使用仓库声明的 pnpm 版本：

```sh
LABEL_STUDIO_TARBALL=/absolute/path/to/dsh-label-studio-workbench-0.1.0-rc.8.tgz
corepack pnpm dsh plugin --profile web add --workspace-root "$LABEL_STUDIO_TARBALL"
```

`dsh plugin` 把后续参数转发给 Profile 目录内的 pnpm。`--workspace-root` 允许 pnpm 修改该 Profile 工作区的根 `package.json`，它不是 Bundle 配置字段。

安装成功时，输出包含 `dependencies: + dsh-label-studio-workbench`。下面的配置检查应显示 `# == dsh-label-studio-workbench`、disabled 的原 `ui-layout` 和新增的 `label-studio` 行，不应出现单独的 `client-ui-label-studio` 行：

```sh
dsh web --dump-config
```

源码方式使用：

```sh
corepack pnpm dsh web --dump-config
```

## 3. 启动并检查页面

```sh
dsh web
```

源码方式使用 `corepack pnpm dsh web`。打开终端输出的地址，默认是 `http://127.0.0.1:3080`，然后检查：

1. Session 顶部出现 `Label Studio` 入口。
2. 打开入口后，右侧显示 Label Studio，左侧对话保持可用。
3. sidebar、conversation、details、设置和主题切换保持可用。
4. 配置 `LABEL_STUDIO_PAT` 后，`label_studio_*` 工具能够读取当前任务并执行写操作。

插件默认连接 `http://127.0.0.1:8080`。该地址已有 Label Studio 时插件复用它；否则默认通过 `conda run -n label-studio` 启动并管理子进程。

Windows PowerShell 可直接运行 venv 控制台程序：

```powershell
$env:DSH_LABEL_STUDIO_LAUNCH_MODE = 'executable'
$env:DSH_LABEL_STUDIO_EXECUTABLE = 'C:\project\.venv\Scripts\label-studio.exe'
dsh web
```

pip 生成的 `label-studio` 已位于 DSH 进程 `PATH` 时，只需把 mode 设为 `executable`。Label Studio 由 Docker、系统服务或手工命令启动时使用外部模式：

```sh
DSH_LABEL_STUDIO_LAUNCH_MODE=external dsh web
```

环境变量必须在启动 DSH 的同一个终端中设置；源码运行方式仍在 `dsh` 前加 `corepack pnpm`。

## 4. 更新插件

停止 DSH，取得版本号更高的新 tarball，然后再次执行 `add`：

```sh
NEW_LABEL_STUDIO_TARBALL=/absolute/path/to/dsh-label-studio-workbench-NEW_VERSION.tgz
dsh plugin --profile web add --workspace-root "$NEW_LABEL_STUDIO_TARBALL"
dsh web
```

源码方式仍在命令前加 `corepack pnpm`。正式分发的每个构建都应提升版本号；只有调试同版本本地产物时才增加 pnpm 的 `--force` 参数。

## 5. 卸载并恢复原布局

停止 DSH，然后按 manifest 中的包名卸载，不要传 tarball 文件名：

```sh
dsh plugin --profile web remove --workspace-root dsh-label-studio-workbench
dsh web --dump-config
dsh web
```

卸载成功后，Profile 不再包含 `dsh-label-studio-workbench`，原 `ui-layout` 恢复启用，Label Studio 入口和工具消失。关闭右侧面板只会隐藏 iframe，不等于卸载插件。

## 6. 独立包如何生成

独立包不是第四套源码。维护者先在 `deepseek-harness` 中编译三个源码包：Host `packages/extensions/label-studio`、浏览器 Client `packages/client/ui-label-studio` 和共享协议 `packages/util/label-studio-protocol`。然后把三者的 `lib/` 与 `.d.ts` 汇集到本目录，执行两项机械转换：浏览器模块 id 改为顶层包名 `dsh-label-studio-workbench`；Host 和 Client 声明中的协议引用改为顶层导出 `dsh-label-studio-workbench/protocol`。

本目录的 `package.json` 是最终分发 manifest：`dsh.bundle.patch` 指向 `cordis.patch.yml`，`dsh.client` 声明同一个包也提供浏览器模块，`exports` 暴露 Host、Client、协议和 patch。完成构建产物汇集、版本更新和 manifest 检查后，在本目录执行：

```sh
corepack pnpm pack --pack-destination ./dist
```

将 `dist/` 中新生成的 `.tgz` 交给使用者即可。tarball 已包含运行所需的 Host、Client 和协议产物，安装时不需要执行 TypeScript 构建脚本。

## 常见错误

| 第一条具体错误 | 处理方法 |
|---|---|
| `ERR_PNPM_ADDING_TO_ROOT` | 安装或卸载命令缺少 `--workspace-root`。 |
| `LABEL_STUDIO_PAT is not configured` | 页面仍可使用，但 REST 工具不可认证；在 DSH 凭据系统中配置完整 refresh 值。 |
| `EADDRINUSE` | 明确停止占用 3080 或 8080 的旧进程后重试。 |
| `Conda environment ... not found` | 确认 `conda run -n label-studio label-studio --version` 成功。 |
| Windows 找不到 `label-studio` | 使用 `executable` 模式，并把 `DSH_LABEL_STUDIO_EXECUTABLE` 设为 venv 中 `.exe` 的绝对路径。 |
| `ELIFECYCLE Command failed with exit code 1` | 这只是 pnpm 汇总；向上查找并处理第一条具体错误。 |
