# dsh-label-studio-workbench

English | [中文](README.zh.md)

Installable Label Studio Bundle for the DSH Web surface. One tarball contains the Host runtime, browser Client, shared protocol declarations, and the patch that replaces the Web root with a compatible layout and right-side Label Studio iframe.

## Composition

Install this package with the Harness. Its manifest declares both `dsh.bundle` and `dsh.client`. The published `cordis.patch.yml` disables the lower Web Bundle's `ui-layout` row and inserts one Host row; DSH loads the browser Client from the same package:

```yaml
- id: ui-layout
  disabled: true

- insert:
    - id: label-studio
      name: 'dsh-label-studio-workbench'
```

This repository provides the runnable [`examples/label-studio/cordis.yml`](../../../examples/label-studio/cordis.yml) overlay:

```sh
pnpm dsh web --patch examples/label-studio/cordis.yml
```

The plugin first probes the configured `/health` endpoint. It adopts a healthy service without later stopping it. An unavailable endpoint follows `launchMode`: `conda` runs the named environment without depending on shell activation, `executable` runs a Label Studio console executable directly, and `external` leaves process startup to the operator. The plugin waits up to `startupTimeoutMs` and terminates only a process tree it created.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `baseUrl` | `http://127.0.0.1:8080` | Loopback HTTP(S) endpoint used by the iframe and REST client. Credentials, query strings, fragments, and non-loopback hosts are rejected. |
| `launchMode` | `conda` | Behavior when the health probe fails: `conda`, `executable`, or `external`. |
| `condaExecutable` | `conda` | Bare or absolute Conda executable resolved through `ctx.subprocess`. |
| `condaEnvironment` | `label-studio` | Conda environment containing the `label-studio` command. |
| `labelStudioExecutable` | `label-studio` | Bare or absolute console executable used by `executable` mode, including a Windows virtual-environment `.exe`. |
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

Only the fields in this table are accepted; unknown fields fail during plugin configuration instead of being ignored. `allowDirectAnnotationUpdate` is explicitly unsupported because prediction creation is the only model write path in controlled-task V1.

The Bundle patch reads `DSH_LABEL_STUDIO_LAUNCH_MODE`, `DSH_LABEL_STUDIO_EXECUTABLE`, `DSH_LABEL_STUDIO_CONDA_EXECUTABLE`, and `DSH_LABEL_STUDIO_CONDA_ENVIRONMENT` before DSH starts. For a Windows virtual environment, set executable mode and point `DSH_LABEL_STUDIO_EXECUTABLE` at `.venv\\Scripts\\label-studio.exe`. A pip installation whose `label-studio` console script is already on the DSH process `PATH` can use executable mode with its default executable. Docker, a system service, or a manually started server uses external mode. Python is a Label Studio runtime dependency, not a dependency of the TypeScript plugin itself.

Configuration carries only the credential reference. Create a personal access token on Label Studio's Account page, copy the complete refresh token when it is shown, and store it under the referenced DSH credential. Label Studio's database retains only a truncated unsigned representation, so the complete value cannot be recovered from `label_studio.sqlite3` later. For each authenticated operation, the plugin resolves the reference again, exchanges the refresh token at `/api/token/refresh/`, and sends the returned access token as `Bearer` authentication. It does not cache either token across operations. Refresh and business responses are counted from the decoded stream and rejected above `restResponseMaxBytes`; errors retain only fixed operation, path, and status facts and never include either token or the response body. Cancellation observed before a business mutation dispatch prevents the write. Once dispatched, transport failure, cancellation, or an invalid success response reports that submission status is unknown and never retries automatically.

## Tools

- `label_studio_status` reads the unauthenticated `/health` endpoint and reports the endpoint and whether this plugin owns the process.
- `label_studio_create_project` creates a project with optional Label Studio XML and description.
- `label_studio_import_tasks` imports task JSON into a project.
- `label_studio_create_prediction` attaches a Label Studio prediction result to a task for pre-annotation.
- `label_studio_create_active_prediction` creates an explicit prediction for the current Session's active task and marks that task for browser refresh after REST success.
- `label_studio_focus_task` navigates this Session's workbench to a project, task, and optional saved annotation after the browser acknowledges the URL.
- `label_studio_get_active_task` uses the current Session lease to read the authoritative project label config, task data, complete saved annotations, and predictions.

The model receives numeric project, task, and prediction ids as canonical JSON values. Task focus requires a live Session browser lease, clears the previous target before dispatch, and succeeds only after the browser applies the requested URL; it does not claim that the iframe network load finished. Active-task reads re-fetch by the leased ids through the Host REST client and reject project, task, annotation, or prediction association mismatches. Active prediction creation accepts no task id: it validates the leased task/project association, rechecks the lease generation and target revision before dispatch, passes the caller's explicit tag-specific `result` to Label Studio, and publishes `prediction-created` only after a successful response. It never infers a result from saved annotations or claims that raw label-config XML validates every modality. No tool updates a saved annotation; users review, accept, or edit predictions inside Label Studio. The iframe is presentation only: project creation, task reads, and pre-annotation never depend on cross-origin DOM access or browser automation.

## Browser behavior

The browser package registers an additive action in `conversation.session.header.actions` and supplies the only active `root` occupant while this Bundle is present. That root preserves the original sidebar, conversation, details, and overlay slots and renders the workbench directly; it does not add a public workbench slot. The iframe is absent before first open and remains mounted inside a hidden, inert section after close. Reload replaces only the iframe, **Open in a new window** uses the configured endpoint, and closing the workbench leaves both the conversation and Label Studio server running.

Label Studio 1.22.0 was verified to serve its login page without `X-Frame-Options` or an enforced `frame-ancestors` directive. A different Label Studio deployment that adds either restriction must allow the DSH Web origin or use the new-window control.

## Context channel

The Host registers `/label-studio` through `ctx.connection.rpc.handle()` with `authority: loopback`; Connection applies its Host, Origin, and cross-site request checks before plugin code runs. Six endpoints open and close leases, reserve and publish controlled targets, wait for revision events, and acknowledge Host focus requests. Connection's outer `RpcResult` carries a nested Label Studio outcome with stable, sanitized errors. The channel never carries sample data, annotation results, credentials, or tokens.

`LabelStudioContextRegistry` permits one expiring browser-source lease per DSH Session. Open and every wait validate either a live `ctx.sessions` entry or cold `ctx.sessionPersistence` metadata; a failed or cancelled persistence read does not renew the lease. `LabelStudioChangeBroker` keeps a bounded, Session-isolated revision suffix, reports replay resets, and supports cancellable long polling and idempotent focus acknowledgements. The shared operation gate closes tools and RPC together during asynchronous package disposal before broker, registry, and runtime state is released.

The browser binds the selected Session after React commits, opens the lease, and uses a serial queue for manual target selection and Host focus requests. It applies the confirmed Label Studio task URL before publishing or acknowledging the target, keeps observed and committed event cursors separate during uncertain acknowledgements, and cancels generation-scoped requests on Session or Connection replacement. A `prediction-created` event reloads the iframe once only when its task id matches the active target; a replay reset reloads the current target once. The boot projection supplies `eventHistorySize`, `contextOpenRetryMs`, and `contextCloseTimeoutMs`; it never contains credentials or task content.

## Model Experience

### Label Studio tool schemas

#### What the model sees

The seven tool schemas and descriptions listed in the generated [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-label-studio) are present while this plugin is composed. Tool results report endpoint availability, stable REST ids and URLs, acknowledged task navigation, active-task prediction creation, or the complete active project/task JSON; authentication failures name only the unresolved credential reference.

#### Token effect

Fixed while the plugin is composed: the seven tool schemas are included in each native tool request, or their generated SDK declarations are included under Code Mode. Active-task result size depends on the selected task and is bounded by `activeTaskMaxBytes`.

#### KV Cache effect

Prefix-stable while the package configuration and visible tool set stay unchanged. Adding, removing, or replacing this plugin changes the tool-schema portion of later requests.

## Known Limitations and Deferred Work

- **Loopback-only endpoint** — the MVP deliberately rejects remote Label Studio hosts; a remote deployment needs an explicit trust, authentication, and iframe-origin design.
- **No iframe DOM automation** — the model controls projects, imports, and predictions through the REST API but does not click arbitrary Label Studio controls or inspect unsaved browser form state.
- **No direct annotation update** — controlled-task V1 does not register an annotation PATCH tool or accept a configuration switch that enables one; predictions remain subject to user review in Label Studio.
- **Identifiers only in browser context** — synchronization publishes the current project, task, and optional annotation ids, not task data, saved annotations, predictions, credentials, or tokens.
- **Label Studio owns login and data storage** — the iframe may show its login page, and the plugin does not change Label Studio's database, media directory, user management, or local-file serving configuration.
- **Narrow screens squeeze both applications** — after details closes and the workbench reaches its normal drag floor, the conversation may become very narrow; at extreme widths the rendered workbench also drops below that floor to keep the grid inside the frame.
# DSH-label-studio
