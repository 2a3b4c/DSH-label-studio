# dsh-label-studio-workbench

English | [中文](README.zh.md)

Installable Label Studio Bundle for the DSH Web surface. The root package contains the Host runtime, browser Client, shared protocol declarations, and the patch that replaces the Web root with a compatible layout and right-side Label Studio iframe. Version `0.2.0-alpha.2` targets DSH `0.1.2-alpha.3`.

## Composition

Install this package with the Harness. Its manifest declares both `dsh.bundle` and `dsh.client`. The published `cordis.patch.yml` disables the lower Web Bundle's `ui-layout` row and inserts one Host row; DSH loads the browser Client from the same package:

```yaml
- id: ui-layout
  disabled: true

- insert:
    - id: label-studio
      name: 'dsh-label-studio-workbench'
```

See [`INSTALL.zh.md`](INSTALL.zh.md) for install and removal commands. Once installed, the Bundle patch participates in the Web Profile without modifying DSH source:

```sh
LABEL_STUDIO_PLUGIN_PACKAGE=/absolute/path/to/dsh-label-studio-plugin-package
npx @deepseek-ai/dsh@0.1.2-alpha.3 plugin --profile web add --workspace-root "$LABEL_STUDIO_PLUGIN_PACKAGE"
```

Classroom distribution uses a regular archive of the package directory. Extract it completely, pass the extracted plugin root's absolute path to the install command, and keep that directory in place because the Profile records a `link:` dependency.

The plugin first probes the configured `/health` endpoint. It adopts a healthy service without later stopping it. When the endpoint is unavailable, `python` mode runs Label Studio through the configured global Python executable, while `external` mode fails startup and leaves process ownership to the operator. The plugin waits up to `startupTimeoutMs` for a process it starts and terminates only that process tree.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `baseUrl` | `http://127.0.0.1:8080` | Loopback HTTP(S) endpoint used by the iframe and REST client. Credentials, query strings, fragments, and non-loopback hosts are rejected. |
| `launchMode` | `python` | Behavior when the health probe fails: start through `python`, or require an already healthy `external` service. |
| `pythonExecutable` | `python` | Bare or absolute global Python executable whose environment contains the `label-studio` package. |
| `refreshTokenCredential` | `LABEL_STUDIO_PAT` | Credential reference for the full Label Studio personal-access-token refresh value, resolved through `ctx.credentials` for every authenticated REST operation. `apiKeyEnv` is invalid and rejected. |
| `startupTimeoutMs` | `120000` | Positive readiness deadline; cold database migrations run inside this interval. |
| `shutdownGraceMs` | `5000` | Positive TERM-to-KILL grace for a process started by this plugin. |
| `restResponseMaxBytes` | `8388608` | Positive safe-integer limit applied to the decoded body of every refresh and business REST response before JSON parsing. |
| `activeTaskMaxBytes` | `262144` | Positive safe-integer limit applied to the serialized model ContentBlock array returned by the active-task tool. Oversized results fail without truncation. |
| `focusAckTimeoutMs` | `5000` | Positive safe-integer deadline for the browser to apply and acknowledge a model-requested task URL. |
| `contextLeaseTtlMs` | `30000` | Positive browser lease lifetime renewed only after a persistent DSH Session check succeeds. |
| `eventWaitTimeoutMs` | `25000` | Positive duration of one cancellable event long poll; it must be shorter than `contextLeaseTtlMs`. |
| `eventHistorySize` | `64` | Positive number of revision events retained per DSH Session for reconnect replay. |
| `contextOpenRetryMs` | `1000` | Positive browser delay before retrying an unknown lease open or a recoverable event wait. |
| `contextCloseTimeoutMs` | `1000` | Positive browser deadline for best-effort lease close; lease TTL remains the final cleanup mechanism. |
| `recentProjectLimit` | `10` | Positive safe-integer number of recently visited projects retained per DSH Session; accepted range is 1–100. |
| `currentPageTimeoutMs` | `5000` | Positive safe-integer deadline for one on-demand iframe page inspection. |
| `frameProxyHtmlMaxBytes` | `2097152` | Decoded HTML byte limit buffered before the iframe proxy injects its Bridge. |
| `webhookMode` | `optional` | `required` requires registration, `optional` preserves tools and Bridge on failure, and `off` registers neither route nor Webhook. |
| `webhookPath` | `/api/label-studio/webhook` | Absolute non-root exact path registered on the DSH WebServer. |
| `webhookMaxBodyBytes` | `1048576` | Maximum bytes accepted from one Webhook request. |
| `managedWebhookTimeoutSeconds` | `5` | Label Studio Webhook delivery timeout supplied to a managed Python process. |

Only the fields in this table are accepted; unknown fields fail during plugin configuration instead of being ignored. `allowDirectAnnotationUpdate` is explicitly unsupported because prediction creation is the only model write path in controlled-task V1.

The Bundle patch reads `DSH_LABEL_STUDIO_LAUNCH_MODE` and `DSH_LABEL_STUDIO_PYTHON_EXECUTABLE` before DSH starts. Python mode resolves that executable and runs `python -m label_studio.server`; install Label Studio into the same global Python with `python -m pip install label-studio`. Set an absolute executable when the intended command is not named `python`, including `python3` on some systems. Docker, a system service, or a manually started server uses external mode and must return `{"status":"UP"}` from the configured `/health` endpoint before the plugin loads. Python and Label Studio are runtime dependencies, not dependencies of the TypeScript package.

Configuration carries only the credential reference. Create a personal access token on Label Studio's Account page, copy the complete refresh token when it is shown, then run `npm run configure-pat` from the extracted plugin root. This cross-platform script masks input and adds or replaces `LABEL_STUDIO_PAT` in `$DSH_HOME/.env` without writing an environment file inside the plugin directory; see [`INSTALL.zh.md`](INSTALL.zh.md) for the complete procedure. Label Studio's database retains only a truncated unsigned representation, so the complete value cannot be recovered from `label_studio.sqlite3` later. For each authenticated operation, the plugin resolves the reference again, exchanges the refresh token at `/api/token/refresh/`, and sends the returned access token as `Bearer` authentication. It does not cache either token across operations. Refresh and business responses are counted from the decoded stream and rejected above `restResponseMaxBytes`; errors retain only fixed operation, path, and status facts and never include either token or the response body. Cancellation observed before a business mutation dispatch prevents the write. Once dispatched, transport failure, cancellation, or an invalid success response reports that submission status is unknown and never retries automatically.

## Tools

- `label_studio_status` reads the unauthenticated `/health` endpoint and reports the endpoint and whether this plugin owns the process.
- `label_studio_create_project` creates a project and binds its returned id to the calling DSH Session.
- `label_studio_import_tasks` imports task JSON using an explicit project, the Session binding, or a requested current-page inspection.
- `label_studio_create_prediction` attaches a prediction using an explicit task, the Session binding, or a requested current-page inspection.
- `label_studio_create_active_prediction` creates an explicit prediction for the Session-bound task, falling back to one current-page inspection when needed, and marks that task for browser refresh after REST success.
- `label_studio_focus_task` verifies a project/task association, navigates this Session's workbench, and binds the task after the browser acknowledges the URL.
- `label_studio_update_label_config` replaces only a selected project's `label_config`.
- `label_studio_get_active_task` resolves and verifies the Session task, then reads the authoritative project label config, task data, complete saved annotations, and predictions. If its project read returns HTTP 404, the plugin marks that project deleted in this Session's history, changes the durable page to the project list, and retires the stale live lease.

The model receives numeric project, task, and prediction ids as canonical JSON values. Explicit ids take precedence; `current_page: true` requests one iframe inspection, while omitted ids reuse the calling Session binding and inspect once only when that binding lacks the required resource level. Successful business operations then update the binding with compare-and-swap semantics. A concurrent binding change keeps the business result, returns a `binding-conflict` warning, and never replays the Label Studio mutation. Every binding-aware tool requires a DSH Session. No tool updates a saved annotation; users review, accept, or edit predictions inside Label Studio.

## Browser behavior

The browser package registers an additive action in `conversation.session.header.actions` and supplies the only active `root` occupant while this Bundle is present. That root preserves the original sidebar, conversation, details, and overlay slots and renders the workbench directly; it does not add a public workbench slot. The workbench starts closed. Restoring a Session page may mount its iframe inside the hidden, inert section without opening the right-hand column; after an explicit open, closing retains the iframe so reopening does not reload it. The workbench header's fullscreen control overlays Label Studio across the DSH page; selecting it again, pressing `Escape`, or closing the workbench restores the docked layout. Reload replaces only the iframe, **Open in a new window** uses the configured endpoint, and closing the workbench leaves both the conversation and Label Studio server running.

Label Studio 1.22.0 was verified to serve its login page without `X-Frame-Options` or an enforced `frame-ancestors` directive. A different Label Studio deployment that adds either restriction must allow the DSH Web origin or use the new-window control.

## Context channel

The Host registers `/label-studio` through `ctx.connection.rpc.handle()`; DSH `0.1.2-alpha.3` Connection applies Host, Origin, browser-authentication, and cross-site request checks before plugin code runs. Eight endpoints open and close leases, reserve and publish controlled targets, commit durable pages and one-shot inspection responses, wait for revision events, and acknowledge Host focus requests. Connection's outer `RpcResult` carries a nested Label Studio outcome with stable, sanitized errors. The channel never carries sample data, annotation results, credentials, or tokens.

`LabelStudioContextRegistry` permits one expiring browser-source lease per DSH Session. Open and every wait validate either a live `ctx.sessions` entry or cold `ctx.sessionPersistence` metadata; a failed or cancelled persistence read does not renew the lease. `LabelStudioChangeBroker` keeps a bounded, Session-isolated revision suffix, reports replay resets, and supports cancellable long polling and idempotent focus acknowledgements. The shared operation gate closes tools and RPC together during asynchronous package disposal before broker, registry, and runtime state is released.

The `label_studio_context` storage domain keeps the current projects, project, or task page plus bounded recent-project metadata outside the DSH Session event log. Session id and creation time prevent a recycled id from reading an older record. Removing the Bundle removes its root, RPC handlers, tools, leases, and plugin runtime state on restart but leaves this domain intact; a Label Studio service not started by the plugin remains running. Reinstalling the Bundle restores each matching Session independently.

Webhook delivery uses an independent random secret on one exact POST route, while a durable owner UUID limits reconciliation and cleanup to registrations created by this plugin. Label Studio 1.22 Community uses project-scoped Webhooks, so startup installs one for each existing project. An annotation create or update without an existing binding performs one inspection of every live DSH iframe and binds only when exactly one Session shows the same project and task. Existing exact bindings remain unchanged; task deletion downgrades an exact task binding to its project, and annotation deletion never infers a task. After optional startup failure, the existing `label_studio_status` tool makes one attempt through the same idempotent registrar on each call.

The browser binds the selected Session after React commits, opens the lease, restores that Session's durable page, and uses a serial queue for manual page selection and Host focus requests. It applies the confirmed Label Studio task URL before publishing or acknowledging the target, keeps observed and committed event cursors separate during uncertain acknowledgements, and cancels generation-scoped requests on Session or Connection replacement. Its page bar shows synchronization state and the bounded recent-project list; deleted projects remain visible but disabled. A `prediction-created` event reloads the iframe once only when its task id matches the active target; a replay reset reloads the current target once. The boot projection supplies `eventHistorySize`, `contextOpenRetryMs`, and `contextCloseTimeoutMs`; it never contains credentials or task content.

The context bar also shows the durable binding, its source, the last on-demand inspection outcome, and optional Webhook availability. Passive iframe browsing never changes the binding: only a successful validated tool operation or a uniquely matched annotation Webhook does so. An authenticated Webhook that cannot be assigned to exactly one Session is reported as `unassigned` without changing any binding.

## Model Experience

### Label Studio tool schemas

#### What the model sees

The eight tool schemas and descriptions listed in the generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-label-studio) are present while this plugin is composed. Tool results report endpoint availability, stable REST ids and URLs, acknowledged task navigation, label-config updates, prediction creation, or the complete active project/task JSON; authentication failures name only the unresolved credential reference.

#### Token effect

Fixed while the plugin is composed: the eight tool schemas are included in each native tool request, or their generated SDK declarations are included under Code Mode. Active-task result size depends on the selected task and is bounded by `activeTaskMaxBytes`.

Page selection and restoration add no Session events and do not change `deriveMessages()` output. Only an explicitly invoked model tool adds the ordinary tool call and result events owned by DSH.

#### KV Cache effect

Prefix-stable while the package configuration and visible tool set stay unchanged. Adding, removing, or replacing this plugin changes the tool-schema portion of later requests.

## Known Limitations and Deferred Work

- **Loopback-only endpoint** — the MVP deliberately rejects remote Label Studio hosts; a remote deployment needs an explicit trust, authentication, and iframe-origin design.
- **No iframe DOM automation** — the model controls projects, imports, and predictions through the REST API but does not click arbitrary Label Studio controls or inspect unsaved browser form state.
- **No direct annotation update** — controlled-task V1 does not register an annotation PATCH tool or accept a configuration switch that enables one; predictions remain subject to user review in Label Studio.
- **Identifiers only in browser context** — synchronization publishes the current project, task, and optional annotation ids, not task data, saved annotations, predictions, credentials, or tokens.
- **Label Studio owns login and data storage** — the iframe may show its login page, and the plugin does not change Label Studio's database, media directory, user management, or local-file serving configuration.
- **Narrow screens squeeze both applications** — after details closes and the workbench reaches its normal drag floor, the conversation may become very narrow; at extreme widths the rendered workbench also drops below that floor to keep the grid inside the frame.
- **Label Studio 1.22.0 Community Webhook scope** — this version rejects organization registrations with `project: null`, so the plugin creates project-scoped Webhooks for projects that exist at startup. A project created only through the Label Studio UI while the plugin is already running is included after the next plugin restart; model tools still bind their successful operations directly.
# DSH-label-studio
