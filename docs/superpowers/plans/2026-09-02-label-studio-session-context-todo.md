# Label Studio Session Context Implementation TODO

English | [中文](2026-09-02-label-studio-session-context-todo.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each DSH Session independently restore its Label Studio project page, task page, and recent projects while keeping the plugin removable and leaving the model prompt unchanged.

**Architecture:** Use the alpha.3 `ctx.storageDomain` service to store plugin-owned Session page records, with `{ SessionId, createdAt }` distinguishing Session lifecycles; keep the existing browser lease responsible only for the online active task. The Client reads and commits pages through the plugin's Connection RPC without writing plugin events to the Session log.

**Tech Stack:** DSH `0.1.2-alpha.3`, Cordis, TypeScript, React, Connection RPC, `@deepseek-ai/dsh-storage-domain`, Zod, Vitest, and pnpm `11.7.0`.

## Global constraints

- The only DSH baseline is tag `dsh-v0.1.2-alpha.3`, commit `dd6322d604e00eec1ba5e0c8541159906a21094a`.
- Do not modify `packages/core/session/**`, `packages/core/agent-loop/**`, `packages/api/remotes/**`, the original `ui-layout`, or `vendor/**`.
- Do not extend `SessionEventMap`, call `Session.append()` to save page location, or change `deriveMessages()` or prompt assembly.
- Durable records contain only structured project/task/annotation IDs, recent projects, revision, and Session identity; they contain no token, sample, or annotation content.
- The Label Studio page Bridge is outside this plan; do not use iframe DOM access, MutationObserver, a reverse proxy, `postMessage`, or Python source patches.
- Every code step follows Red, Green, local refactoring, and focused verification; stop after each Task for user review.
- The [interface document](2026-09-02-label-studio-session-context-interfaces.md) is the sole owner of shared types, state transitions, and function signatures; this file contains only the execution checklist.

---

### Task 15: Import the plugin baseline

**Files:**

- Create Host package source: `src/**`, `tests/**`
- Create Client package source: `packages/client-ui/**`
- Create protocol package source: `packages/protocol/**`
- Create source acceptance overlay: `tests/fixtures/alpha3-web.overlay.yml`
- Modify: `tsconfig.json`, `tsconfig.base.json`, `tsconfig.nodenext-consumer.json`, `pnpm-workspace.yaml`

**Interfaces:**

- Consumes: The Task 14 Host, Client, protocol, and Bundle source set plus the standalone alpha.3 compatibility assertions.
- Produces: An independent plugin package that builds, tests, and composes against alpha.3 without modifying the DSH source repository.

- [x] **Audit source files:** List every file in the three plugin directories and alpha.3 standalone artifacts; do not copy generated `.js`, `.d.ts`, `.map`, or real credentials.
- [x] **Write compatibility red tests:** Move the standalone `tests/alpha3-compat.test.mjs` constraints into source manifest and built-artifact tests; require alpha.3 Client store, Session, renderer, and Connection APIs and forbid `@deepseek-ai/dsh-client-runtime`.
- [x] **Run the expected failure:** Run `pnpm exec vitest run tests/manifest.spec.ts packages/client-ui/tests/manifest.spec.ts`; expect failure because plugin sources are not imported.
- [x] **Import minimal sources:** Import only the plugin files accepted at Task 14, then adapt imports, inject lists, peer dependencies, and Connection generation observation to alpha.3 APIs.
- [x] **Verify focused tests:** Run Host, Client, and protocol manifest/exports tests and each package typecheck; expect all to pass.
- [x] **Verify plugin composition:** Install the standalone root in the alpha.3 Web Profile and run `dsh web --dump-config`; confirm one Host, one Client, and one replacement root.
- [x] **Report the baseline result:** List imported files, alpha.3 differences, and every command result, then stop for user approval before Task 16.

### Task 16: Persist Session location

**Files:**

- Modify protocol: `packages/protocol/src/index.ts`, `packages/protocol/tests/exports.spec.ts`
- Create Host source: `src/session-context-spec.ts`, `src/session-context-store.ts`
- Create Host tests: `tests/session-context-spec.spec.ts`, `tests/session-context-store.spec.ts`
- Modify root package build files: `package.json`, `tsconfig.json`

**Interfaces:**

- Consumes: `LabelStudioProjectId`, `LabelStudioTaskId`, `LabelStudioAnnotationId`, alpha.3 `ctx.storageDomain`, and `SessionId`/header `createdAt`.
- Produces: `LabelStudioPageContext`, `LabelStudioSessionContextSnapshot`, `labelStudioSessionContextDomainSpec`, and `LabelStudioSessionContextStore`.

- [x] **Test protocol types:** Write compile-time and runtime parser red tests for projects/project/task, positive integer IDs, unknown fields, invalid views, and `revision`.
- [x] **Test storage format:** Write red tests for domain name/version, the full record schema, Session identity, the last commit receipt, and invalid durable JSON.
- [x] **Test default reads:** Write red tests requiring a missing record or mismatched `createdAt` to return projects, empty history, and revision 0 without performing a write.
- [x] **Test commit ordering:** Write red tests for moving a project to the front, recording a task, enforcing the history limit, avoiding revision growth for the same page, CAS conflict, and per-Session serialization.
- [x] **Test response retries:** Write red tests requiring an exactly matching commit receipt to be idempotent and preventing changed fields or an old revision from overwriting a newer page.
- [x] **Test project deletion:** Write red tests requiring an active project/task to fall back to projects, mark history as deleted, and avoid automatically selecting another project.
- [x] **Run the expected failure:** Run `pnpm exec vitest run packages/protocol/tests/exports.spec.ts tests/session-context-spec.spec.ts tests/session-context-store.spec.ts`; the failure must come from missing types or implementation.
- [x] **Implement minimal storage:** Implement the Zod schema, domain spec, store, per-Session queue, CAS, idempotent receipt, recent projects, and close disposer exactly as the interface document defines.
- [x] **Complete dependency configuration:** Add `@deepseek-ai/dsh-storage-domain` as a Host peer/dev dependency and `zod` as a dependency; do not insert another storage provider.
- [x] **Verify tests pass:** Rerun the three focused tests and the Host and protocol package typechecks; expect all to pass.
- [x] **Report the storage result:** Show Red/Green evidence, a domain record example, and the zero-change prompt path, then stop for user approval before Task 17.

### Task 17: Connect page commits

**Files:**

- Modify Host state and RPC: `src/context-registry.ts`, `src/context-rpc.ts`, `src/change-broker.ts`, `src/session-context-store.ts`
- Modify Host wiring and lifecycle: `src/index.ts`, `src/lifecycle.ts`, `src/tools.ts`, `src/config.ts`
- Modify shared protocol: `packages/protocol/src/index.ts`
- Modify Client RPC caller: `packages/client-ui/src/client/context-bridge.ts`
- Test Host behavior: `tests/context-registry.spec.ts`, `tests/context-rpc.spec.ts`, `tests/change-broker.spec.ts`, `tests/lifecycle.spec.ts`, `tests/focus-task.spec.ts`, `tests/apply.spec.ts`, `tests/config.spec.ts`
- Test protocol and Client: `packages/protocol/tests/exports.spec.ts`, `packages/client-ui/tests/context-bridge.client.spec.ts`
- Test built consumption: `tests/nodenext-consumer.ts`, `tsconfig.nodenext-consumer.json`, `package.json`

**Interfaces:**

- Consumes: Task 16's Session context store, the existing lease/generation/target revision, and Connection RPC outcome.
- Produces: `lease/open.sessionContext`, the `page/commit` endpoint, `clearBrowserTarget()`, and focus ACK with a Session context revision.

- [x] **Test the lease result:** Write red tests requiring `lease/open` to return the matching durable snapshot after Session validation and the fixed default for a new Session.
- [x] **Test page commits:** Write red tests for project/projects clearing the active task, task exactly matching the committed target, CAS conflict, and durable write failure.
- [x] **Test idempotent clearing:** Write red tests for `clearBrowserTarget()` sequence, target revision, lost-response retry, stale generation, and concurrent focus.
- [x] **Test focus commits:** Write red tests requiring the focus event to carry the expected Session context revision and ACK to succeed only after both the page and durable record commit.
- [x] **Test sanitized errors:** Write red tests for unavailable storage, context conflict, and invalid payloads; errors must not contain the durable record, PAT, REST body, or annotation.
- [x] **Run the expected failure:** Run the focused Host registry, RPC, broker, and protocol tests; expect failure because the endpoint, fields, or method are absent.
- [x] **Implement unified commit:** Minimally extend the registry, RPC parser/handler, broker focus DTO, and plugin apply wiring; route every durable update through the store.
- [x] **Test unload cleanup:** Verify that the handler rejects new requests first, ends waits/focus next, and awaits store close last while retaining durable domain data.
- [x] **Verify tests pass:** Rerun focused tests, Host/protocol typechecks, and the built NodeNext consumer smoke; expect all to pass.
- [x] **Report the channel result:** Show RPC requests/results, failure atomicity, and unload behavior, then stop for user approval before Task 18.

### Task 18: Restore project pages

**Files:**

- Replace under `packages/client-ui/`: `src/client/task-url.ts` with `src/client/page-url.ts`
- Modify Client state and panel: `src/client/context-state.ts`, `src/client/panel-state.ts`, `src/client/LabelStudioPanel.tsx`, `src/client/LabelStudioPanel.module.css`, `src/client/locales.ts`, `src/client/index.ts`, `src/client/layout/LabelStudioRoot.tsx`
- Test under `packages/client-ui/`: `tests/page-url.client.spec.ts`, `tests/session-page-context.client.spec.ts`, `tests/context-state.client.spec.ts`, `tests/panel-state.client.spec.ts`, `tests/panel.client.spec.tsx`, `tests/root.client.spec.tsx`

**Interfaces:**

- Consumes: Task 17's `lease/open.sessionContext`, `page/commit`, focus ACK, and existing target reserve/publish.
- Produces: `buildLabelStudioPageUrl()`, `selectPage()`, automatic Session restoration, and recent-project UI.

- [x] **Test page URLs:** Write red tests for projects, project, task, annotation, base origin, and invalid arbitrary URLs.
- [x] **Test Session restoration:** Write red tests for Session A's text project, Session B's image project, A→B→A switching, a Session without a record, and browser reconnection.
- [x] **Test commit ordering:** Write red tests requiring task to call reserve, apply, publish, and page commit in order, and project/projects to call apply, clear target, and page commit in order.
- [x] **Test stale-operation isolation:** Write red tests for Session epoch, Connection generation, navigation epoch, unknown RPC outcome, and CAS conflict; old operations cannot modify the new page.
- [x] **Test history controls:** Write red tests for recent-project ordering, deleted-item disabling, project selection, synchronization status, and keyboard access.
- [x] **Run the expected failure:** Run the page URL, context controller, and panel focused tests; expect failure because the general page interface is absent.
- [x] **Implement page restoration:** Minimally implement the general URL builder, bridge caller, controller state machine, panel current location, and recent-project selector.
- [x] **Preserve cross-origin limits:** State in the UI that only plugin-controlled navigation is synchronized; do not claim to observe arbitrary iframe clicks or unsaved drafts.
- [x] **Verify tests pass:** Rerun focused Client tests, Client typecheck, Bundle build, and browser artifact smoke; expect all to pass.
- [x] **Report the restoration result:** Show evidence for automatic A/B Session restoration and recent-project UI, then stop for user approval before Task 19.

### Task 19: Complete compatibility acceptance

**Files:**

- Modify Host source: `src/config.ts`, `src/api.ts`, `src/change-broker.ts`, `src/tools.ts`, `src/index.ts`
- Modify Bundle layer: `cordis.patch.yml`
- Add alpha.3 source fixture: `tests/fixtures/alpha3-web.overlay.yml`
- Modify Host tests: `tests/config.spec.ts`, `tests/manifest.spec.ts`, `tests/api.spec.ts`, `tests/tools.spec.ts`, `tests/session-context-store.spec.ts`
- Modify the paired English and Chinese READMEs for the standalone Host/Bundle, Client, and protocol packages.

**Interfaces:**

- Consumes: The complete Session context feature from Tasks 16–18.
- Produces: `recentProjectLimit` configuration, alpha.3-installable artifacts, and acceptance evidence for install/remove, restart, and Session isolation.

- [x] **Test configuration red state:** Write red tests requiring default 10, range 1–100, rejection of fractions/unknown fields, and matching fields in the Bundle patch and source overlay.
- [x] **Implement the config field:** Add only `recentProjectLimit` and pass its resolved value to the store; add no path, Bridge, or Session-log switch.
- [x] **Verify configuration green state:** Run config, patch manifest, and overlay tests; expect all to pass.
- [ ] **Test the real composition:** Create two DSH Sessions in alpha.3 Web, commit a text project to one and an image project to the other, then verify that switching and restart restore each independently.
- [x] **Test deletion handling:** Delete the fixture project through REST or use a missing fixture; confirm that the next plugin-controlled access/read marks it deleted and falls back to the project list without claiming immediate iframe deletion detection.
- [x] **Test prompt isolation:** Compare Session event types and `deriveMessages()` output before and after navigation; they must be identical except for tool calls the user explicitly initiates.
- [x] **Test plugin removal:** Remove the Bundle and restart; confirm restoration of the original layout, removal of RPC/leases, readability of the original Session, and absence of unknown event types.
- [x] **Test reinstallation:** Reinstall the plugin and restart; confirm that the storage domain restores every Session's page record.
- [x] **Synchronize formal documentation:** Update the three package README pairs with behavior, configuration, limits, and installation instructions; describe the page Bridge only as unsupported capability.
- [x] **Run final checks:** Run the three plugin packages' focused tests/typechecks/builds, alpha.3 compatibility test, Web composition test, `pnpm run test:docs`, and `git diff --check`; report only observed results.
- [x] **Report the final result:** Provide an acceptance matrix for the config dump, install/remove recovery, A/B Sessions, prompt isolation, and remaining Bridge limit without committing or publishing automatically.
