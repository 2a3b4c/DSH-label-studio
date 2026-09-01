/** Package invariant companion for the Label Studio browser plugin. */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "client-ui-label-studio-invariant";
/** Service required for package ownership registration. */
export declare const inject: string[];
/**
 * Register the package ownership companion.
 * @param ctx - context carrying the invariant registry.
 * @returns the registration disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map