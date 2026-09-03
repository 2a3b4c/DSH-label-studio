/** Authenticated bounded HTTP ingress for Label Studio Webhooks. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseLabelStudioWebhook } from "./webhook-payload.js";
/** Convert secret bytes to the exact opaque header value installed in Label Studio. */
export function encodeWebhookSecret(secret) {
    return Buffer.from(secret).toString('base64url');
}
/**
 * Create an exact-route handler that authenticates before parsing or synchronizing an event.
 * @param coordinator - durable binding synchronization owner.
 * @param options - request limit, route path, and ephemeral secret.
 * @returns Node HTTP handler owning every response.
 */
export function createLabelStudioWebhookHandler(coordinator, options) {
    const expected = digest(encodeWebhookSecret(options.secret));
    return async (req, res) => {
        if (req.method !== 'POST')
            return finish(res, 405);
        const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
        if (mediaType !== 'application/json')
            return finish(res, 415);
        if (!authenticated(req.headers['x-dsh-label-studio-webhook'], expected))
            return finish(res, 401);
        const declared = req.headers['content-length'];
        if (declared !== undefined && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(options.maxBodyBytes))) {
            req.resume();
            return finish(res, 413);
        }
        let bytes;
        try {
            bytes = await readBounded(req, options.maxBodyBytes);
        }
        catch {
            return finish(res, 413);
        }
        let input;
        try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            input = JSON.parse(text);
            await coordinator.accept(parseLabelStudioWebhook(input));
        }
        catch (error) {
            const status = input === undefined || isPayloadError(error) ? 400 : 503;
            return finish(res, status);
        }
        finish(res, 204);
    };
}
function authenticated(value, expected) {
    const received = digest(typeof value === 'string' ? value : '');
    return timingSafeEqual(received, expected) && typeof value === 'string';
}
function digest(value) {
    return createHash('sha256').update(value).digest();
}
async function readBounded(stream, maxBytes) {
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maxBytes)
            throw new Error('too large');
        chunks.push(bytes);
    }
    return Buffer.concat(chunks, total);
}
function isPayloadError(error) {
    return error instanceof SyntaxError
        || error instanceof TypeError
        || (error instanceof Error && error.message === 'label-studio: invalid webhook payload');
}
function finish(res, status) {
    res.statusCode = status;
    res.setHeader('Content-Length', '0');
    res.end();
}
//# sourceMappingURL=webhook-ingress.js.map