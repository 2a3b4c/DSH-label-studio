# @deepseek-ai/dsh-label-studio-protocol

English | [中文](README.zh.md)

Type-only declarations shared by the Label Studio Host and browser plugins. The package keeps browser-safe context ids and lease DTOs independent from both executable plugins, so neither runtime imports symbols from the other.

## Published declarations

The main entry exports branded project, task, annotation, prediction, source, lease, correlation, and navigation-sequence types. It also exports the active target, lease snapshot, reservation, target-state, browser-event, event-batch, RPC request/result map, nested outcome, and sanitized error declarations used by the controlled-task channel. `SessionId` is imported from the client-safe `@deepseek-ai/dsh-session/types` entry.

The main entry has no runtime values. Host and browser consumers own their JSON parsers and construct branded values only after validating the corresponding wire fields. The package's separate invariant companion only reserves package ownership with the runtime invariant registry.

The Connection transport owns its outer `RpcResult`; `LabelStudioRpcOutcome` is the inner business result. This separation keeps plugin error codes out of Connection's closed framework error set. The declarations contain identifiers, revisions, lease state, and change reasons only; they do not define fields for credentials, tokens, sample data, or annotation results.

## Model Experience

### Shared context declarations

#### What the model sees

The package contributes no `ContentBlock`, system prompt, tool schema, or tool result. Executable Label Studio consumers own any later model-visible behavior.

#### Token effect

Zero direct token effect because every main-entry declaration is erased during compilation.

#### KV Cache effect

No direct effect. Changes to these declarations affect only executable consumers that separately alter model-visible content.

## Known Limitations and Deferred Work

- **No runtime parser** — each process validates untrusted JSON locally; adding runtime parsing here would turn the neutral type library into a shared executable dependency.
