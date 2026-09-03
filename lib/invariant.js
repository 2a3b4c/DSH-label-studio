//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-label-studio`.
* @module @deepseek-ai/dsh-label-studio/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-label-studio";
/** Cordis companion plugin name. */
const name = "label-studio-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the process handle is private to one plugin fiber,
* REST calls have no retained same-process relationship, and slot/tool
* registration lifetime is already authoritative in their owning registries.
*/
const install = () => {};
/** Register this package's invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
