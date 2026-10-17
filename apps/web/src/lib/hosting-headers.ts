/**
 * The response headers a host should send for the static build (plan 023, ADR 0040, ADR 0038,
 * `architecture/hosting.md`). Pure: the serve script (`scripts/serve.ts`) and the tests use it, and
 * the documentation prints its output. A static host cannot compute the inline-script hashes, so
 * the script derives them from the built HTML.
 */

/** `sha256-<base64>` of `text` as a CSP source (the same form as in the sandbox document). */
export async function sha256Source(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	let binary = '';
	for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
	return `sha256-${btoa(binary)}`;
}

/** The text of every inline `<script>` (no `src`) in an HTML document. */
export function inlineScripts(html: string): string[] {
	const out: string[] = [];
	for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
		if (m[1] !== undefined && m[1].trim() !== '') out.push(m[1]);
	}
	return out;
}

/**
 * The Content-Security-Policy of a game page. `inline` are the hashes of the page's own inline
 * scripts (the SvelteKit bootstrap) and of the script sandbox bootstrap (a srcdoc iframe inherits
 * the page's policy as well as its own, ADR 0038). `blob:` is for mod packages (ADR 0057: a mod is
 * imported from a blob URL) and the sandbox's blob Worker; `connect-src https:` lets the player
 * download a mod package from an address they type. `style-src 'unsafe-inline'` is for the inline
 * styles Svelte and the canvas widgets set.
 */
export function contentSecurityPolicy(inline: readonly string[]): string {
	const hashes = inline.map((h) => `'${h}'`).join(' ');
	return [
		"default-src 'self'",
		`script-src 'self' 'wasm-unsafe-eval' blob: ${hashes}`.trim(),
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		"connect-src 'self' https: blob: data:",
		"worker-src 'self' blob:",
		'frame-src about:',
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'self'"
	].join('; ');
}

/** Headers for every response; `csp` only for HTML documents. */
export function securityHeaders(): Record<string, string> {
	return {
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'no-referrer',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
		'Cross-Origin-Opener-Policy': 'same-origin'
	};
}

/** Cache policy by path: hashed assets for a year, everything else revalidated. */
export function cacheControl(pathname: string): string {
	return pathname.startsWith('/_app/immutable/')
		? 'public, max-age=31536000, immutable'
		: 'no-cache';
}
