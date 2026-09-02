# Label Studio 工作台插件安装

本教程将 `dsh-label-studio-workbench` 安装到 DSH `web` Profile，并验证安装、更新和卸载。插件包同时提供 Host、浏览器 Client、协议类型和 `cordis.patch.yml`；安装只修改 Profile，不修改 DeepSeek Harness 的 `packages/` 源码。`0.2.0-alpha.2` 适配 DSH `0.1.2-alpha.3`，不兼容已经移除 `dsh-client-runtime` 的更早插件构建。

## 1. 检查环境

### 1.1 安装 Node.js 和 pnpm

Node.js 安装通常同时提供 `npm` 和 `npx`，但不保证已经安装 `pnpm`。本插件的安装命令由 DSH 调用 `pnpm` 修改 Profile，因此使用插件前必须确保 `pnpm` 命令可用。先检查现有环境：

```sh
node --version
npm --version
pnpm --version
```

如果找不到 `pnpm`，推荐使用 Node.js 自带的 `npm` 安装 DSH 当前要求的版本：

```sh
npm install --global pnpm@11.7.0
pnpm --version
```

Node.js 通常自带的是 `npm` 和 `npx`；`pnpm` 是需要单独安装的包管理器。Corepack 不是本插件的运行条件，只要 `pnpm --version` 输出 `11.7.0`，后续命令就可以直接使用全局 `pnpm`。

### 1.2 获取 DSH CLI

DeepSeek Harness 源码仓库中的 `pnpm dsh` 是根 `package.json` 提供的开发脚本，只能从源码工作区运行；它不会把 `dsh` 可执行文件安装到系统 `PATH`。普通使用者不需要克隆 DSH 源码，官方的免安装运行方式是：

```sh
npx @deepseek-ai/dsh@0.1.2-alpha.3 web
```

选择全局安装与本插件兼容的 DSH 版本：

```sh
npm install --global @deepseek-ai/dsh@0.1.2-alpha.3
dsh --version
```

全局安装后，`dsh web`、`dsh plugin ...` 等命令都可以在任意目录运行，但仍读取同一个 `$DSH_HOME`，默认是 `~/.dsh`。如果安装成功后终端仍报告找不到 `dsh`，请重新打开终端并确认 npm 的全局可执行文件目录已经加入 `PATH`。插件处于开发阶段时应使用本文明确列出的兼容版本，不要让 `npx` 或全局安装静默选择不兼容的更新版本。

从 DSH 源码仓库开发时，继续使用仓库声明的 pnpm 版本：

```sh
pnpm dsh web
```

### 1.3 检查 Label Studio 环境

DSH CLI、`pnpm` 和全局 Python 必须能够运行。默认启动模式要求 Label Studio 安装在这个 Python 中：

```sh
node --version
pnpm --version
python --version
python -m pip install label-studio
python -c "import label_studio; print(label_studio.__version__)"
```

如果该命令名不是 `python`，或者要使用指定 Python 的绝对路径，请按第 3 节配置。Docker、系统服务或手工启动的 Label Studio 使用外部模式。

## 2. 安装插件

先停止正在运行的 DSH。学员取得课堂发放的 package 压缩包后，必须先完整解压到一个长期保留的目录；不能直接从压缩包预览窗口运行。把变量设为包含 `package.json`、`cordis.patch.yml` 和 `lib/` 的解压后插件根目录：

```sh
LABEL_STUDIO_PLUGIN_PACKAGE=/absolute/path/to/dsh-label-studio-plugin-package
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web add --workspace-root "$LABEL_STUDIO_PLUGIN_PACKAGE"
```

已经全局安装兼容版本 DSH 时，可以把命令缩短为：

```sh
LABEL_STUDIO_PLUGIN_PACKAGE=/absolute/path/to/dsh-label-studio-plugin-package
dsh plugin --profile web add --workspace-root "$LABEL_STUDIO_PLUGIN_PACKAGE"
```

从 DeepSeek Harness 源码仓库运行 CLI 时，写成：

```sh
LABEL_STUDIO_PLUGIN_PACKAGE=/absolute/path/to/dsh-label-studio-plugin-package
pnpm dsh plugin --profile web add --workspace-root "$LABEL_STUDIO_PLUGIN_PACKAGE"
```

Windows PowerShell 使用本地目录的绝对路径：

```powershell
$LabelStudioPluginPackage = 'C:\path\to\dsh-label-studio-plugin-package'
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web add --workspace-root $LabelStudioPluginPackage
```

Windows CMD 使用 `set` 定义变量，并通过 `%变量名%` 读取：

```bat
set "LABEL_STUDIO_PLUGIN_PACKAGE=C:\path\to\dsh-label-studio-plugin-package"
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web add --workspace-root "%LABEL_STUDIO_PLUGIN_PACKAGE%"
```

## 3. 启动并检查页面

```sh
npx @deepseek-ai/dsh@0.1.2-alpha.3 web
```

源码方式使用 `pnpm dsh web`；全局安装兼容版本 DSH 后也可以使用 `dsh web`。打开终端输出的地址，默认是 `http://127.0.0.1:3080`，然后检查：

1. Session 顶部出现 `Label Studio` 入口。
2. 打开入口后，右侧显示 Label Studio，左侧对话保持可用。
3. sidebar、conversation、details、设置和主题切换保持可用。
4. 配置 `LABEL_STUDIO_PAT` 后，`label_studio_*` 工具能够读取当前任务并执行写操作。

插件默认连接 `http://127.0.0.1:8080`。该地址已有健康的 Label Studio 时插件复用它；否则默认通过全局 `python` 运行 `python -m label_studio.server` 并管理子进程。

Windows PowerShell 可以指定全局 Python 的绝对路径：

```powershell
$env:DSH_LABEL_STUDIO_PYTHON_EXECUTABLE = 'C:\Python313\python.exe'
npx @deepseek-ai/dsh@0.1.2-alpha.3 web
```

macOS 或 Linux 的命令名是 `python3` 时，把 `DSH_LABEL_STUDIO_PYTHON_EXECUTABLE` 设为 `python3` 或其绝对路径。Label Studio 由 Docker、系统服务或手工命令启动时使用外部模式：

```sh
DSH_LABEL_STUDIO_LAUNCH_MODE=external npx @deepseek-ai/dsh@0.1.2-alpha.3 web
```

环境变量必须在启动 DSH 的同一个终端中设置；源码运行方式使用 `pnpm dsh web`。`external` 模式不会创建进程；配置地址的 `/health` 必须返回 `{"status":"UP"}`，否则插件加载失败。

## 4. 配置 LABEL_STUDIO_PAT

只查看嵌入页面不需要 API 凭据。让模型读取任务、创建项目或创建 prediction 前，需要把 Label Studio Account 页面生成的完整 Personal Access Token refresh 值保存为 DSH 凭据 `LABEL_STUDIO_PAT`；不要把真实值写入插件目录、命令参数、聊天记录或 Git。

先停止 DSH，在解压后的插件根目录执行同一条跨平台命令：

```sh
npm run configure-pat
```

该命令适用于 Windows CMD、Windows PowerShell、macOS zsh 和 Linux bash。脚本会隐藏输入字符，只在内存中接收 PAT，然后新增或替换 `$DSH_HOME/.env` 中的 `LABEL_STUDIO_PAT`，保留文件里的其他变量；`DSH_HOME` 未设置时使用 Windows 的 `%USERPROFILE%\.dsh\.env` 或 macOS/Linux 的 `~/.dsh/.env`。脚本不会把 PAT 写入插件目录或打印到终端。

看到“凭证已保存”后重新启动 DSH。环境文件在启动时读取，因此正在运行的 DSH 不会获得刚写入的值。如果 `$DSH_HOME/.credentials.yaml` 已经包含同名凭证，该文件的优先级高于 `.env`；课堂新环境不需要处理这种旧配置。

## 5. 卸载并恢复原布局

停止 DSH，然后按 manifest 中的包名卸载，不要传本地插件目录：

```sh
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web remove --workspace-root dsh-label-studio-workbench
npx @deepseek-ai/dsh@0.1.2-alpha.3 web --dump-config
npx @deepseek-ai/dsh@0.1.2-alpha.3 web
```

卸载成功后，Profile 不再包含 `dsh-label-studio-workbench`，原 `ui-layout` 恢复启用，Label Studio 入口和工具消失。关闭右侧面板只会隐藏标注界面，不等于卸载插件。

## 常见错误

| 第一条具体错误 | 处理方法 |
|---|---|
| `ERR_PNPM_ADDING_TO_ROOT` | 安装或卸载命令缺少 `--workspace-root`。 |
| `client-modules: require("@deepseek-ai/dsh-client-runtime/client") missed the module table` | 安装了适配旧 DSH 的插件；升级到 `0.2.0-alpha.2` 或更新版本。 |
| `LABEL_STUDIO_PAT is not configured` | 页面仍可使用，但 REST 工具不可认证；在 DSH 凭据系统中配置完整 refresh 值。 |
| `EADDRINUSE` | 明确停止占用 3080 或 8080 的旧进程后重试。 |
| 找不到 `python` | 把 `DSH_LABEL_STUDIO_PYTHON_EXECUTABLE` 设为全局 Python 命令或绝对路径。 |
| `No module named label_studio` | 使用该 Python 执行 `python -m pip install label-studio`。 |
| `external service is unavailable` | 先启动 Label Studio，并确认配置地址的 `/health` 返回 `{"status":"UP"}`。 |
| `ELIFECYCLE Command failed with exit code 1` | 这只是 pnpm 汇总；向上查找并处理第一条具体错误。 |
