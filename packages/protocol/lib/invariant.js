//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-label-studio-protocol`.
* @module @deepseek-ai/dsh-label-studio-protocol/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-label-studio-protocol";
/** Cordis companion plugin name. */
const name = "label-studio-protocol-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this package only publishes compile-time declarations;
* Host and browser parsers enforce their respective JSON inputs.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
