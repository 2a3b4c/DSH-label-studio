/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-label-studio`.
 * @module @deepseek-ai/dsh-label-studio/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-label-studio'

/** Cordis companion plugin name. */
export const name = 'label-studio-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the process handle is private to one plugin fiber,
 * REST calls have no retained same-process relationship, and slot/tool
 * registration lifetime is already authoritative in their owning registries.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
