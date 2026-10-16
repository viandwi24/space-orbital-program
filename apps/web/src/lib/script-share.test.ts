import { describe, expect, it } from 'vitest';
import {
	checkImportedText,
	decodeScript,
	encodeScript,
	MAX_SCRIPT_BYTES,
	scriptFileName,
	shareUrl,
	tokenFromHash
} from './script-share';

const sample = "ship.throttle = 1;\nstage();\nawait wait(5);\nprint('héllo ✓', ship.altitude);\n";

describe('script links', () => {
	it('round-trips text, including non-ASCII', async () => {
		const token = await encodeScript(sample);
		expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
		expect(await decodeScript(token!)).toEqual({ ok: true, source: sample });
	});

	it('carries the token in the fragment only', () => {
		const url = shareUrl('https://orbital.example/flight?x=1#old', 'v1.abc');
		expect(url).toBe('https://orbital.example/flight#script=v1.abc');
		expect(tokenFromHash('#script=v1.abc')).toBe('v1.abc');
		expect(tokenFromHash('#other=1')).toBeNull();
		expect(tokenFromHash('')).toBeNull();
	});

	it('refuses a script over the cap when sharing', async () => {
		expect(await encodeScript('a'.repeat(MAX_SCRIPT_BYTES + 1))).toBeNull();
	});

	it('refuses damaged, foreign and wrong-version links with a reason', async () => {
		for (const token of ['', 'v1.', 'v1.!!!', 'v2.AAAA', 'garbage', 'v1.AAAA']) {
			const r = await decodeScript(token);
			expect(r.ok).toBe(false);
		}
	});

	it('does not expand a decompression bomb into memory', async () => {
		// 10 MB of zeros packs to about 10 KB: under the token cap, far over the script cap.
		const { deflateRawSync } = await import('node:zlib');
		const bomb = deflateRawSync(Buffer.alloc(10 * 1024 * 1024));
		const token = `v1.${bomb.toString('base64url')}`;
		const r = await decodeScript(token);
		expect(r).toEqual({ ok: false, reason: expect.stringContaining('larger than') });
	});

	it('refuses an oversized token before decoding', async () => {
		const r = await decodeScript(`v1.${'A'.repeat(60_000)}`);
		expect(r.ok).toBe(false);
	});

	it('refuses bytes that are not UTF-8 text', async () => {
		const { deflateRawSync } = await import('node:zlib');
		const token = `v1.${deflateRawSync(Buffer.from([0xff, 0xfe, 0xfd])).toString('base64url')}`;
		expect(await decodeScript(token)).toEqual({
			ok: false,
			reason: 'the link does not contain text'
		});
	});
});

describe('imported text and files', () => {
	it('normalises line endings and refuses binary and oversized files', () => {
		expect(checkImportedText('a\r\nb\rc')).toEqual({ ok: true, source: 'a\nb\nc' });
		expect(checkImportedText('abc\u0000def').ok).toBe(false);
		expect(checkImportedText('x'.repeat(MAX_SCRIPT_BYTES + 1)).ok).toBe(false);
	});

	it('names download files from the design name', () => {
		expect(scriptFileName('Two-stage Lander #2')).toBe('two-stage-lander-2.orbital.js');
		expect(scriptFileName('///')).toBe('script.orbital.js');
	});
});
