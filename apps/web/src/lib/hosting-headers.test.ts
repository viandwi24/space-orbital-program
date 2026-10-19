import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	cacheControl,
	contentSecurityPolicy,
	injectMetaCsp,
	inlineScripts,
	metaPolicy,
	securityHeaders,
	sha256Source
} from './hosting-headers';

const here = dirname(fileURLToPath(import.meta.url));

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

describe('_headers and the meta policy (plan 202)', () => {
	/** A small build: two pages with their own bootstrap scripts, and the sandbox bootstrap. */
	function fixture(): string {
		const root = mkdtempSync(join(tmpdir(), 'orbital-headers-'));
		mkdirSync(join(root, 'sandbox'));
		const page = (boot: string) =>
			`<!doctype html><html><head><meta charset="utf-8" /><script>${boot}</script></head><body></body></html>`;
		writeFileSync(join(root, 'index.html'), page('start("/")'));
		writeFileSync(join(root, 'flight.html'), page('start("/flight")'));
		writeFileSync(join(root, '200.html'), page('start(location.pathname)'));
		writeFileSync(join(root, 'sandbox/script-sandbox-frame-main.js'), 'frame()');
		return root;
	}
	const cspLine = (file: string): string =>
		file
			.split('\n')
			.find((l) => l.trim().startsWith('Content-Security-Policy:'))!
			.trim();

	it('the emitted _headers carries the same policy and hashes as scripts/serve.ts', async () => {
		const root = fixture();
		const emit = spawnSync('bun', [join(here, '../../scripts/emit-headers.ts'), root]);
		expect(emit.status).toBe(0);
		const file = readFileSync(join(root, '_headers'), 'utf8');
		const policy = cspLine(file).slice('Content-Security-Policy: '.length);
		for (const script of [
			'start("/")',
			'start("/flight")',
			'start(location.pathname)',
			'frame()'
		]) {
			expect(policy).toContain(`'${await sha256Source(script)}'`);
		}
		expect(file).toContain('/_app/*\n  ! Content-Security-Policy');
		expect(file).toContain(
			'/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable'
		);
		// the reference server sends the same header for every page
		const port = 5248;
		const server = spawn('bun', [join(here, '../../scripts/serve.ts'), String(port)], {
			env: { ...process.env, SERVE_ROOT: root },
			stdio: 'ignore'
		});
		try {
			let served: string | null = null;
			for (let i = 0; i < 100 && served === null; i++) {
				served = await fetch(`http://localhost:${port}/flight`)
					.then((r) => r.headers.get('content-security-policy'))
					.catch(() => null);
				if (served === null) await new Promise((r) => setTimeout(r, 100));
			}
			expect(served).toBe(policy);
			const home = await fetch(`http://localhost:${port}/`);
			expect(home.headers.get('content-security-policy')).toBe(policy);
		} finally {
			server.kill();
			rmSync(root, { recursive: true, force: true });
		}
	}, 30_000);

	it('the meta fallback has no frame-ancestors and comes before every script', async () => {
		const policy = contentSecurityPolicy([await sha256Source('x')]);
		expect(policy).toContain('frame-ancestors');
		expect(metaPolicy(policy)).not.toContain('frame-ancestors');
		const html = injectMetaCsp(
			'<html><head><meta charset="utf-8" /><script>boot()</script></head></html>',
			policy
		);
		const meta = html.indexOf('http-equiv="Content-Security-Policy"');
		expect(meta).toBeGreaterThan(html.indexOf('charset'));
		expect(meta).toBeLessThan(html.indexOf('<script>'));
		expect(html).not.toContain('frame-ancestors');
		// once only, and the scripts (and their hashes) are untouched
		expect(injectMetaCsp(html, policy)).toBe(html);
		expect(inlineScripts(html)).toEqual(['boot()']);
	});
});
