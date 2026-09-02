# Cross-platform PAT configurator implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners configure `LABEL_STUDIO_PAT` from CMD, PowerShell, zsh, or bash with the same `npm run configure-pat` command.

**Architecture:** A dependency-free Node.js CLI prompts for the PAT without accepting it as a command argument, resolves `$DSH_HOME` with the same tilde and relative-path rules as DSH, and updates only `LABEL_STUDIO_PAT` in `$DSH_HOME/.env`. Pure document and path functions remain exported for tests; filesystem tests use temporary directories and never touch the real DSH home.

**Tech Stack:** Node.js ESM, `node:test`, built-in filesystem/path/readline modules.

## Global Constraints

- Modify only `/Users/xinlongzhang/PycharmProjects/dsh-label-studio-plugin-package`.
- Do not modify DeepSeek Harness source, Host, Client, protocol, or Bundle patch code.
- Do not store, print, or accept a real PAT in a command-line argument.
- Preserve unrelated `.env` entries and use `0600` file permissions on POSIX.
- Keep one command across Windows CMD, PowerShell, macOS zsh, and Linux bash.

---

### Task 1: PAT storage library and CLI

**Files:**
- Create: `configure-pat.mjs`
- Create: `tests/configure-pat.test.mjs`

**Interfaces:**
- Produces: `resolveDshHome(env, userHome, cwd): string`.
- Produces: `updateEnvDocument(source, token): string`.
- Produces: `storePat(token, options?): Promise<string>` returning the written `.env` path.
- Produces: interactive `main()` used only when `configure-pat.mjs` is the process entry.

- [x] **Step 1: Write failing tests** for default and overridden DSH homes, append/replace/preserve behavior, invalid token rejection, temporary-directory storage, and POSIX file mode.
- [x] **Step 2: Run `node --test tests/configure-pat.test.mjs`** and confirm failure because `configure-pat.mjs` does not exist.
- [x] **Step 3: Implement the minimal dependency-free module** with hidden terminal input, safe validation, deterministic `.env` updates, recursive home creation, and owner-only POSIX permissions.
- [x] **Step 4: Run `node --test tests/configure-pat.test.mjs`** and confirm all configurator tests pass.

### Task 2: Package command and learner documentation

**Files:**
- Modify: `package.json`
- Modify: `INSTALL.zh.md`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.i18n.yaml`

**Interfaces:**
- Consumes: `node configure-pat.mjs` from Task 1.
- Produces: `npm run configure-pat` as the platform-neutral classroom command.

- [x] **Step 1: Add the package script and published file entry** without adding a runtime dependency.
- [x] **Step 2: Replace manual credential-file editing instructions** with the single cross-platform command, its destination, restart requirement, and security warning.
- [x] **Step 3: Update both README languages and recompute their blob hashes** in `README.i18n.yaml`.
- [x] **Step 4: Run `npm test`, `git diff --check`, and a temporary-home CLI smoke** and confirm no real `~/.dsh` path was modified.
