import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { LabelStudioRootInjected } from '../index.ts';
import { NS } from '../locales.ts';
import type { createLabelStudioLayoutStore } from './store.ts';
/** Testable replacement-root props assembled by the slot runtime. */
export type LabelStudioRootProps = PropsRuntime<'root'> & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'> & PropsStore<ReturnType<typeof createLabelStudioLayoutStore>> & PropsLocale<typeof NS> & InjectFace<LabelStudioRootInjected>;
/** Render the original four child slots and the package-private workbench in one root. */
export declare function LabelStudioRoot({ useStore, actions, useSessions, renderSlot, useLabelStudioPanel, useLabelStudioContext, baseUrl, bindSession, confirmApplied, selectTarget, close, reload, openExternal, t, }: LabelStudioRootProps): import("react").JSX.Element;
//# sourceMappingURL=LabelStudioRoot.d.ts.map