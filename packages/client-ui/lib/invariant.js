//#region lib/types/invariant.js
const PACKAGE_NAME = "@deepseek-ai/dsh-client-ui-label-studio";
/** Cordis companion plugin name. */
const name = "client-ui-label-studio-invariant";
/** Service required for package ownership registration. */
const inject = ["invariants"];
const install = () => {};
/**
* Register the package ownership companion.
* @param ctx - context carrying the invariant registry.
* @returns the registration disposer.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
