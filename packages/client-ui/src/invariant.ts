/** Package invariant companion for the Label Studio browser plugin. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-label-studio'

/** Cordis companion plugin name. */
export const name = 'client-ui-label-studio-invariant'
/** Service required for package ownership registration. */
export const inject = ['invariants']

/** No runtime invariant: package behavior is asserted by its state, layout, and transport specs. */
const install: InvariantInstaller = () => {}

/**
 * Register the package ownership companion.
 * @param ctx - context carrying the invariant registry.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
