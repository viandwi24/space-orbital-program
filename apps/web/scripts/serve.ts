/**
 * Serves the static build the way a real host should (plan 023, `docs/architecture/hosting.md`):
 * the Content-Security-Policy and the other headers of `src/lib/hosting-headers.ts`, gzip for text,
 * immutable caching for hashed assets, `/flight` and friends without `.html`, unknown paths to
 * `200.html` (the SPA fallback). Used for the end-to-end suite against real headers
 * (`E2E_HEADERS=1`) and as a reference for a host's own configuration.
 *
 *   bun scripts/serve.ts [port]          (after `bun run build`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import {
	cacheControl,
	contentSecurityPolicy,
	inlineScripts,
	securityHeaders,
	sha256Source
} from '../src/lib/hosting-headers';

const root = join(import.meta.dir, '../build');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const types: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.wasm': 'application/wasm',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.txt': 'text/plain; charset=utf-8'
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg', '.wasm', '.txt']);

// The script sandbox's bootstrap is inlined into the iframe's srcdoc; the page policy must allow its hash.
const bootstrap = readFileSync(join(root, 'sandbox/script-sandbox-frame-main.js'), 'utf8');
const bootstrapHash = await sha256Source(bootstrap);
const policyCache = new Map<string, string>();
async function policyFor(file: string): Promise<string> {
	let policy = policyCache.get(file);
	if (policy === undefined) {
		const hashes = await Promise.all(
			inlineScripts(readFileSync(file, 'utf8')).map((s) => sha256Source(s))
		);
		policy = contentSecurityPolicy([...hashes, bootstrapHash]);
		policyCache.set(file, policy);
	}
	return policy;
}

function resolve(pathname: string): string {
	const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
	const direct = join(root, clean);
	if (extname(clean) && existsSync(direct)) return direct;
	const page = join(root, `${clean.replace(/\/$/, '') || '/index'}.html`);
	if (existsSync(page)) return page;
	return join(root, '200.html');
}

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		const file = resolve(url.pathname);
		const ext = extname(file);
		const headers = new Headers(securityHeaders());
		headers.set('Content-Type', types[ext] ?? 'application/octet-stream');
		headers.set('Cache-Control', cacheControl(url.pathname));
		if (ext === '.html') headers.set('Content-Security-Policy', await policyFor(file));
		let body: Uint8Array = readFileSync(file);
		if (compressible.has(ext) && (req.headers.get('accept-encoding') ?? '').includes('gzip')) {
			body = Bun.gzipSync(body);
			headers.set('Content-Encoding', 'gzip');
		}
		headers.set('Content-Length', String(body.byteLength));
		return new Response(req.method === 'HEAD' ? null : body, { headers });
	}
});
console.log(`serving ${root} on http://localhost:${port} with the production headers`);
