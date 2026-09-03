# @deepseek-ai/dsh-client-ui-label-studio

English | [中文](README.zh.md)

Browser package for the Label Studio Bundle. It replaces the Web `root` occupant while preserving the original sidebar, conversation, details, and overlay slots, then renders the Label Studio workbench as a private fifth child of that root.

The package provides the same public `ctx.layout` methods used by the shipped sidebar and conversation plugins: `toggleSidebar()`, `openDetails()`, and `closeDetails()`. Workbench open and close actions remain package-private; the package does not register a public workbench slot or extend the public layout interface.

The workbench iframe is lazy and keep-alive. No iframe exists before the first open. After the first open, closing the panel keeps the iframe mounted inside a hidden, inert section, so reopening does not reload the Label Studio page. The header's fullscreen control overlays the workbench across the DSH page; selecting it again, pressing `Escape`, or closing the workbench restores the docked layout. The replacement root retains the original four slot render sites and closes details only when selection changes from one non-blank live Session to another.

The root binds the selected DSH Session to a browser-source lease after React commits. Lease open returns that Session's durable projects, project, or task page and its bounded recent-project list; switching A→B→A therefore restores each page independently. A Session without a record opens the Label Studio project list. The page bar accepts a project id, or a positive project and task id plus an optional annotation id, and displays synchronization state. Deleted recent projects remain visible but disabled.

Task selection reserves a monotonic navigation revision through the fixed `/label-studio` Connection channel, applies `/projects/{projectId}/data?task={taskId}` to the iframe, and publishes only after React commits that URL. Project-list and project selection clear the live task target and commit the general page. Host `label_studio_focus_task` requests use the same serial queue and are acknowledged only after the iframe URL commits.

One cancellable long poll observes revision events for the active lease. The controller keeps observed and committed cursors separate while a focus acknowledgement has an unknown transport outcome, resumes an unexpired lease across Connection generations, and reopens an expired lease from the Host replay baseline. A matching `prediction-created` task event reloads the current iframe once; an event-history reset also reloads the current target once. A disconnected poll has no callback into the Host mutation, so it cannot turn a committed prediction into a tool failure. Buffered events are limited by the Host-projected `eventHistorySize`; overflow closes or expires the old lease before rebuilding it.

Install `@deepseek-ai/dsh-label-studio` rather than this package directly. The Host/Bundle package depends on this browser package and activates it through its `cordis.patch.yml`; removing that Bundle restores the lower Web Bundle's original `ui-layout` row on the next start.

## Model Experience

None, as browser synchronization carries only Session, lease, revision, project, task, and optional annotation ids without adding model input, tools, or Session events. Page navigation leaves `deriveMessages()` unchanged.

#### KV Cache effect

None. Opening, closing, resizing, or reloading the iframe does not alter a model request.

## Known Limitations and Deferred Work

- The replacement root intentionally duplicates the shipped layout behavior. Maintainers must compare it with `@deepseek-ai/dsh-client-ui-layout` when the original sidebar, details, theme, resizing, or narrow-screen behavior changes.
- The iframe still depends on Label Studio allowing embedding and on an authenticated browser session. The browser package does not exchange credentials or proxy Label Studio.
- The active target registry contains identifiers only. DeepSeek cannot read task data or saved annotations until a Host tool re-reads those identifiers through Label Studio's authenticated REST API.
- Free navigation and unsaved draft state inside the cross-origin iframe are invisible to DSH. The workbench therefore exposes no saved-state confirmation or direct annotation mutation control; the model creates predictions for review instead.
- Project deletion is recognized only when a plugin-controlled Host REST read receives HTTP 404. The Client does not claim immediate deletion detection from an iframe click.
