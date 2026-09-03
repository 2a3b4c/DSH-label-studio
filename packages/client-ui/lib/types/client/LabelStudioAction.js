import { jsx as _jsx } from "react/jsx-runtime";
/** Render the Session-header workbench toggle. */
export function LabelStudioAction({ useLabelStudioPanel, toggle, t }) {
    const open = useLabelStudioPanel(snapshot => snapshot.open);
    const label = t(open ? 'action.close' : 'action.open');
    return _jsx("button", { type: "button", "aria-label": label, "aria-pressed": open, title: label, onClick: toggle, children: "Label Studio" });
}
//# sourceMappingURL=LabelStudioAction.js.map