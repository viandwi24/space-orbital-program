import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SANDBOX_ATTRIBUTE } from './script-sandbox';
import { buildSandboxDocument, cspHash } from './script-sandbox-document';

const template = readFileSync(
	new URL('../../static/sandbox/script-sandbox.html', import.meta.url),
	'utf8'
);

/** The policy in the final document, as directive -> sources. */
function policyOf(html: string): Map<string, string[]> {
	const content = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
	if (!content) throw new Error('no CSP meta in the sandbox document');
	return new Map(
		content
			.split(';')
			.map((d) => d.trim().split(/\s+/))
			.filter((d) => d[0])
			.map(([name, ...sources]) => [name!, sources])
	);
}

describe('sandbox document', () => {
	const bootstrap = 'window.addEventListener("message", () => {}); /* $& $1 */';

	it('inlines the bootstrap and names exactly that script by its SHA-256', async () => {
		const html = await buildSandboxDocument(template, bootstrap);
		expect(html).toContain(`<script>${bootstrap}</script>`);
		const expected = `sha256-${createHash('sha256').update(bootstrap).digest('base64')}`;
		expect(await cspHash(bootstrap)).toBe(expected);
		expect(policyOf(html).get('script-src')).toEqual([`'${expected}'`, "'wasm-unsafe-eval'"]);
		expect(html).not.toContain('{{');
	});

	it('forbids every network request and loads nothing', async () => {
		const policy = policyOf(await buildSandboxDocument(template, bootstrap));
		expect(policy.get('default-src')).toEqual(["'none'"]);
		expect(policy.get('connect-src')).toEqual(["'none'"]);
		// Only blob: workers, and nothing that reaches the network or the game origin.
		expect(policy.get('worker-src')).toEqual(['blob:']);
		for (const directive of [
			'img-src',
			'style-src',
			'font-src',
			'media-src',
			'object-src',
			'frame-src'
		]) {
			expect(policy.get(directive), directive).toEqual(["'none'"]);
		}
		const everything = [...policy.values()].flat().join(' ');
		expect(everything).not.toMatch(/'self'|'unsafe-inline'|'unsafe-eval'|https?:|\*/);
	});

	it('refuses a bootstrap that would end the inline script, and a template without markers', async () => {
		await expect(buildSandboxDocument(template, 'a</script><script>b')).rejects.toThrow('inlined');
		await expect(buildSandboxDocument(template, 'x<!--y')).rejects.toThrow('inlined');
		await expect(buildSandboxDocument('<html></html>', 'x')).rejects.toThrow('markers');
	});

	it('the frame attribute never adds same-origin (that would give the frame the game origin)', () => {
		expect(SANDBOX_ATTRIBUTE.split(/\s+/)).toEqual(['allow-scripts']);
	});
});
