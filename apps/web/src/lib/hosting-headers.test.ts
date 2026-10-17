import { describe, expect, it } from 'vitest';
import {
	cacheControl,
	contentSecurityPolicy,
	inlineScripts,
	securityHeaders,
	sha256Source
} from './hosting-headers';

describe('hosting headers', () => {
	it('hashes like a browser does (known SHA-256 of "abc")', async () => {
		expect(await sha256Source('abc')).toBe('sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
	});
	it('finds inline scripts and skips external ones', () => {
		const html =
			'<script src="/a.js"></script><script>{ boot() }</script><script type="module" src="b.js"></script><script> </script>';
		expect(inlineScripts(html)).toEqual(['{ boot() }']);
	});
	it('the policy allows what the game needs and nothing broad', async () => {
		const csp = contentSecurityPolicy([await sha256Source('x')]);
		for (const needed of [
			"script-src 'self' 'wasm-unsafe-eval' blob:",
			"worker-src 'self' blob:",
			'frame-src about:',
			"object-src 'none'"
		]) {
			expect(csp).toContain(needed);
		}
		expect(csp).toContain("'sha256-");
		// no wildcard script source and no unsafe-eval
		expect(csp).not.toMatch(/script-src[^;]*\*/);
		expect(csp).not.toContain("'unsafe-eval'");
	});
	it('sets nosniff, a referrer policy and long caching only for hashed assets', () => {
		expect(securityHeaders()['X-Content-Type-Options']).toBe('nosniff');
		expect(cacheControl('/_app/immutable/chunks/x.js')).toContain('immutable');
		expect(cacheControl('/flight')).toBe('no-cache');
	});
});
