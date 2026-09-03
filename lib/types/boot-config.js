/** Host-injected browser endpoint for the Label Studio iframe. */
function script(config) {
    const json = JSON.stringify(config)
        .replaceAll('<', '\\u003c')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029');
    return `<script>window.__DSH_LABEL_STUDIO__=${json}</script>`;
}
/**
 * Insert the browser endpoint before the application module starts.
 * @param html - raw application index HTML.
 * @param config - validated browser synchronization fields.
 * @returns HTML containing the boot assignment.
 */
export function injectLabelStudioBootConfig(html, config) {
    const source = script(config);
    const body = /<body(?:\s[^>]*)?>/i.exec(html);
    if (body === null)
        return `${html}${source}`;
    const at = body.index + body[0].length;
    return `${html.slice(0, at)}${source}${html.slice(at)}`;
}
//# sourceMappingURL=boot-config.js.map