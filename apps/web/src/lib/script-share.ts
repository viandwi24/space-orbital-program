/**
 * Sharing scripts as text, as a link or as a file (plan 030). A link carries the script in the URL
 * fragment (`#script=v1.<base64url of deflate-raw>`): the fragment is never sent to a server.
 * Everything that comes in is untrusted: the size is capped before and after decompression (a
 * small link must not expand into memory), and the result is only ever *shown*; running it needs
 * the player's explicit confirmation (the script panel).
 */

/** Longest script accepted from outside, bytes of UTF-8 (the sample ascent is about 6 KB). */
export const MAX_SCRIPT_BYTES = 64 * 1024;
/** Longest fragment payload accepted, characters. */
export const MAX_TOKEN_CHARS = 48 * 1024;
export const SHARE_PARAM = 'script';
const VERSION = 'v1';

/** Where the text in the editor came from when it did not come from the player. */
export interface ImportInfo {
	from: 'file' | 'link' | 'text';
	/** File name, for a file. */
	name?: string;
}

export type Decoded = { ok: true; source: string } | { ok: false; reason: string };

const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(binary, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

async function collect(
	stream: ReadableStream<Uint8Array>,
	limit: number
): Promise<Uint8Array | null> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(size);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.byteLength;
	}
	return out;
}

async function pipe(
	bytes: Uint8Array,
	transform: CompressionStream | DecompressionStream,
	limit: number
): Promise<Uint8Array | null> {
	const writer = transform.writable.getWriter();
	// Writing and reading must overlap or a large input stalls on back-pressure. A corrupt input
	// rejects both sides; the reader's rejection is the one reported.
	const writing = writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close());
	writing.catch(() => {});
	try {
		return await collect(transform.readable, limit);
	} finally {
		await writing.catch(() => {});
	}
}

/** The fragment payload for `source`, or null when the script is over the size cap. */
export async function encodeScript(source: string): Promise<string | null> {
	const raw = textEncoder.encode(source);
	if (raw.byteLength > MAX_SCRIPT_BYTES) return null;
	const packed = await pipe(raw, new CompressionStream('deflate-raw'), MAX_SCRIPT_BYTES * 2);
	return packed ? `${VERSION}.${toBase64Url(packed)}` : null;
}

export async function decodeScript(token: string): Promise<Decoded> {
	if (token.length > MAX_TOKEN_CHARS)
		return { ok: false, reason: 'the link is too long to be a script' };
	const dot = token.indexOf('.');
	if (dot === -1 || token.slice(0, dot) !== VERSION) {
		return {
			ok: false,
			reason: 'the link is not a script link from this version of Space Orbital Program'
		};
	}
	const packed = fromBase64Url(token.slice(dot + 1));
	if (!packed) return { ok: false, reason: 'the link is damaged (not valid base64)' };
	let raw: Uint8Array | null;
	try {
		raw = await pipe(packed, new DecompressionStream('deflate-raw'), MAX_SCRIPT_BYTES);
	} catch {
		return { ok: false, reason: 'the link is damaged (cannot be unpacked)' };
	}
	if (!raw) return { ok: false, reason: `the script is larger than ${MAX_SCRIPT_BYTES / 1024} KB` };
	try {
		return { ok: true, source: new TextDecoder('utf-8', { fatal: true }).decode(raw) };
	} catch {
		return { ok: false, reason: 'the link does not contain text' };
	}
}

/** `#script=<token>` for `href` (any existing fragment is replaced). */
export function shareUrl(href: string, token: string): string {
	const url = new URL(href);
	url.search = '';
	url.hash = `${SHARE_PARAM}=${token}`;
	return url.href;
}

/** The token in a URL fragment such as `#script=v1.abc`, or null. */
export function tokenFromHash(hash: string): string | null {
	const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
	return params.get(SHARE_PARAM);
}

/** Check text that came from a file or the clipboard before it reaches the editor. */
export function checkImportedText(text: string): Decoded {
	if (textEncoder.encode(text).byteLength > MAX_SCRIPT_BYTES) {
		return { ok: false, reason: `the script is larger than ${MAX_SCRIPT_BYTES / 1024} KB` };
	}
	if (text.includes('\u0000')) return { ok: false, reason: 'the file is not a text script' };
	return { ok: true, source: text.replace(/\r\n?/g, '\n') };
}

/** A safe download name for a script of the design `name`. */
export function scriptFileName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return `${slug || 'script'}.orbital.js`;
}
