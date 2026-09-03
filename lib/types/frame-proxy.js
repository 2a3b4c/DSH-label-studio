/** Restricted loopback reverse proxy that injects the on-demand iframe bridge. */
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest, } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { injectLabelStudioInspectionBridge, LABEL_STUDIO_FRAME_BRIDGE_PATH, renderLabelStudioFrameBridgeScript, } from "./frame-bridge-script.js";
export { LABEL_STUDIO_FRAME_BRIDGE_PATH } from "./frame-bridge-script.js";
const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'forwarded',
]);
/** Owns a fixed-upstream HTTP proxy and all sockets created through it. */
export class LabelStudioFrameProxy {
    options;
    upstream;
    capability = randomBytes(32).toString('base64url');
    sockets = new Set();
    upstreamRequests = new Set();
    server;
    address;
    starting;
    closePromise;
    closing = false;
    /** @param options - fixed loopback upstream, protocol, and decoded HTML limit. */
    constructor(options) {
        this.options = options;
        this.upstream = requireHttpLoopbackOrigin(options.upstreamBaseUrl);
        if (!Number.isSafeInteger(options.htmlMaxBytes) || options.htmlMaxBytes <= 0) {
            throw new TypeError('htmlMaxBytes must be a positive safe integer');
        }
    }
    /** Start once on an operating-system-assigned loopback port. */
    start() {
        if (this.address !== undefined)
            return Promise.resolve(this.address);
        if (this.starting !== undefined)
            return this.starting;
        if (this.closing)
            return Promise.reject(new Error('label-studio: frame proxy is closed'));
        this.starting = new Promise((resolve, reject) => {
            const server = createServer((request, response) => { void this.handle(request, response); });
            this.server = server;
            server.on('connection', (socket) => {
                this.sockets.add(socket);
                socket.once('close', () => { this.sockets.delete(socket); });
            });
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                server.removeListener('error', reject);
                server.on('error', () => undefined);
                const raw = server.address();
                if (raw === null || typeof raw === 'string') {
                    reject(new Error('label-studio: frame proxy address is unavailable'));
                    return;
                }
                const origin = `http://127.0.0.1:${String(raw.port)}`;
                const address = Object.freeze({ baseUrl: origin, origin, capability: this.capability });
                this.address = address;
                resolve(address);
            });
        });
        return this.starting;
    }
    /** Stop accepting work and wait until owned requests and sockets are closed. */
    close() {
        if (this.closePromise !== undefined)
            return this.closePromise;
        this.closing = true;
        this.closePromise = this.stop();
        return this.closePromise;
    }
    async stop() {
        await this.starting?.catch(() => undefined);
        const server = this.server;
        if (server === undefined)
            return;
        for (const request of this.upstreamRequests)
            request.destroy(new Error('frame proxy closed'));
        for (const socket of this.sockets)
            socket.destroy();
        server.closeAllConnections?.();
        if (server.listening) {
            await new Promise((resolve) => { server.close(() => { resolve(); }); });
        }
        this.address = undefined;
    }
    async handle(request, response) {
        try {
            if (this.closing)
                return fail(response, 503);
            const address = this.address;
            if (address === undefined || request.headers.host !== new URL(address.origin).host)
                return fail(response, 400);
            if (request.method === 'CONNECT' || request.headers.upgrade !== undefined)
                return fail(response, 405);
            const path = fixedRequestPath(request.url);
            if (path === LABEL_STUDIO_FRAME_BRIDGE_PATH) {
                response.writeHead(200, {
                    'content-type': 'application/javascript; charset=utf-8',
                    'cache-control': 'no-store',
                });
                response.end(renderLabelStudioFrameBridgeScript(this.options.inspectionProtocol, this.capability));
                return;
            }
            const headers = this.upstreamHeaders(request.headers, address.origin, request.method ?? 'GET');
            if (headers === undefined)
                return fail(response, 403);
            await this.forward(request, response, path, headers, address.origin);
        }
        catch {
            if (!response.headersSent)
                fail(response, 502);
            else
                response.destroy();
        }
    }
    upstreamHeaders(source, proxyOrigin, method) {
        const headers = filteredHeaders(source);
        headers.host = this.upstream.host;
        const origin = singleHeader(source.origin);
        if (origin !== undefined) {
            if (origin !== proxyOrigin && !safeMethod(method))
                return undefined;
            headers.origin = origin === proxyOrigin ? this.upstream.origin : origin;
        }
        const referer = singleHeader(source.referer);
        if (referer !== undefined) {
            let parsed;
            try {
                parsed = new URL(referer);
            }
            catch {
                return undefined;
            }
            if (parsed.origin !== proxyOrigin && !safeMethod(method))
                return undefined;
            headers.referer = parsed.origin === proxyOrigin
                ? `${this.upstream.origin}${parsed.pathname}${parsed.search}${parsed.hash}`
                : referer;
        }
        return headers;
    }
    forward(incoming, outgoing, path, headers, proxyOrigin) {
        return new Promise((resolve, reject) => {
            const upstreamRequest = httpRequest({
                protocol: 'http:',
                hostname: connectionHostname(this.upstream.hostname),
                port: this.upstream.port,
                method: incoming.method,
                path,
                headers,
            });
            this.upstreamRequests.add(upstreamRequest);
            const release = () => { this.upstreamRequests.delete(upstreamRequest); };
            upstreamRequest.once('close', release);
            upstreamRequest.once('error', reject);
            upstreamRequest.once('response', (upstreamResponse) => {
                void this.forwardResponse(upstreamResponse, outgoing, proxyOrigin, incoming.method ?? 'GET').then(resolve, reject);
            });
            void pipeline(incoming, upstreamRequest).catch((error) => {
                upstreamRequest.destroy(error instanceof Error ? error : new Error('request body failed'));
            });
        });
    }
    async forwardResponse(incoming, outgoing, proxyOrigin, requestMethod) {
        const headers = filteredHeaders(incoming.headers);
        rewriteLocation(headers, this.upstream.origin, proxyOrigin);
        const status = incoming.statusCode ?? 502;
        if (!hasBody(status) || requestMethod === 'HEAD') {
            outgoing.writeHead(status, headers);
            outgoing.end();
            incoming.resume();
            return;
        }
        if (!isHtml(incoming.headers['content-type'])) {
            outgoing.writeHead(status, headers);
            await pipeline(incoming, outgoing);
            return;
        }
        const body = await collectDecodedHtml(incoming, incoming.headers['content-encoding'], this.options.htmlMaxBytes);
        const injected = Buffer.from(injectLabelStudioInspectionBridge(body.toString('utf8'), this.options.inspectionProtocol));
        delete headers['content-encoding'];
        delete headers.etag;
        delete headers.digest;
        delete headers['content-md5'];
        headers['content-length'] = String(injected.length);
        outgoing.writeHead(status, headers);
        outgoing.end(injected);
    }
}
function requireHttpLoopbackOrigin(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new TypeError('upstreamBaseUrl must be a loopback HTTP origin');
    }
    if (url.protocol !== 'http:'
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.username !== '' || url.password !== ''
        || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
        throw new TypeError('upstreamBaseUrl must be a loopback HTTP origin');
    }
    return url;
}
function connectionHostname(hostname) {
    if (hostname === 'localhost')
        return '127.0.0.1';
    if (hostname === '[::1]')
        return '::1';
    return hostname;
}
function fixedRequestPath(value) {
    if (value === undefined)
        return '/';
    try {
        const parsed = value.startsWith('//') ? new URL(`http:${value}`) : new URL(value, 'http://fixed.invalid');
        return `${parsed.pathname}${parsed.search}`;
    }
    catch {
        return '/';
    }
}
function filteredHeaders(source) {
    const blocked = new Set(HOP_BY_HOP);
    const connection = singleHeader(source.connection);
    for (const value of connection?.split(',') ?? [])
        blocked.add(value.trim().toLowerCase());
    const target = {};
    for (const [name, value] of Object.entries(source)) {
        const lower = name.toLowerCase();
        if (blocked.has(lower) || lower.startsWith('x-forwarded-') || value === undefined)
            continue;
        target[lower] = value;
    }
    return target;
}
function singleHeader(value) {
    return Array.isArray(value) ? value[0] : value;
}
function safeMethod(method) { return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'; }
function isHtml(value) { return value?.split(';', 1)[0]?.trim().toLowerCase() === 'text/html'; }
function hasBody(status) { return status !== 204 && status !== 304 && status >= 200; }
function rewriteLocation(headers, upstreamOrigin, proxyOrigin) {
    const location = singleHeader(headers.location);
    if (location === undefined)
        return;
    try {
        const parsed = new URL(location);
        if (parsed.origin === upstreamOrigin)
            headers.location = `${proxyOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    catch {
        // Relative redirects already remain inside the proxy origin.
    }
}
async function collectDecodedHtml(source, encoding, limit) {
    const decoder = encoding === undefined || encoding === 'identity'
        ? undefined
        : encoding === 'gzip'
            ? createGunzip()
            : encoding === 'br'
                ? createBrotliDecompress()
                : encoding === 'deflate'
                    ? createInflate()
                    : null;
    if (decoder === null)
        throw new Error('unsupported HTML content encoding');
    const chunks = [];
    let size = 0;
    const sink = new Writable({
        write(chunk, _encoding, callback) {
            const value = Buffer.from(chunk);
            size += value.length;
            if (size > limit)
                callback(new Error('decoded HTML exceeds frameProxyHtmlMaxBytes'));
            else {
                chunks.push(value);
                callback();
            }
        },
    });
    if (decoder === undefined)
        await pipeline(source, sink);
    else
        await pipeline(source, decoder, sink);
    return Buffer.concat(chunks, size);
}
function fail(response, status) {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('Label Studio frame proxy request rejected');
}
//# sourceMappingURL=frame-proxy.js.map