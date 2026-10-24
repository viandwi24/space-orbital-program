/**
 * A small PNG decoder for what a mod's data images are (plan 406, ADR 0346): 8-bit grey, RGB or RGBA,
 * not interlaced, no palette. Environment-neutral: the zlib stream is read with `DecompressionStream`,
 * which browsers, Workers, Bun and Node all have. It returns RGBA8 rows, or says why it cannot.
 */

export interface DecodedImage {
	width: number;
	height: number;
	/** RGBA8, row-major, top row first. */
	data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 6: 4 };

async function inflate(chunks: Uint8Array[]): Promise<Uint8Array> {
	const stream = new Blob(chunks as unknown as ArrayBuffer[])
		.stream()
		.pipeThrough(new DecompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PNG's size from its header, without decoding it; a string is why it is not one this game reads. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | string {
	if (bytes.byteLength < 33 || !SIGNATURE.every((b, i) => bytes[i] === b))
		return 'not a PNG file (bad signature)';
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return 'the PNG has no header';
	const width = view.getUint32(16);
	const height = view.getUint32(20);
	if (CHANNELS[bytes[25]!] === undefined || bytes[24] !== 8)
		return 'only 8-bit grey, RGB and RGBA PNGs are read (no palette, no 16-bit)';
	if (bytes[28] !== 0) return 'an interlaced PNG is not read';
	return { width, height };
}

/** Decodes a PNG; a string is the reason it is not one this game reads. */
export async function decodePng(bytes: Uint8Array): Promise<DecodedImage | string> {
	if (bytes.byteLength < 33 || !SIGNATURE.every((b, i) => bytes[i] === b))
		return 'not a PNG file (bad signature)';
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0;
	let height = 0;
	let depth = 0;
	let colour = -1;
	let interlace = 0;
	const idat: Uint8Array[] = [];
	for (let at = 8; at + 8 <= bytes.byteLength;) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		const body = bytes.subarray(at + 8, at + 8 + length);
		if (body.byteLength !== length) return 'a PNG chunk runs past the end of the file';
		if (type === 'IHDR') {
			width = view.getUint32(at + 8);
			height = view.getUint32(at + 12);
			depth = bytes[at + 16]!;
			colour = bytes[at + 17]!;
			interlace = bytes[at + 20]!;
		} else if (type === 'IDAT') idat.push(body);
		else if (type === 'IEND') break;
		at += 12 + length;
	}
	const channels = CHANNELS[colour];
	if (channels === undefined || depth !== 8)
		return 'only 8-bit grey, RGB and RGBA PNGs are read (no palette, no 16-bit)';
	if (interlace !== 0) return 'an interlaced PNG is not read';
	if (width < 1 || height < 1 || width > 8192 || height > 8192) return `a ${width} x ${height} PNG`;
	let raw: Uint8Array;
	try {
		raw = await inflate(idat);
	} catch {
		return 'the PNG data is damaged (it does not decompress)';
	}
	const stride = width * channels;
	if (raw.byteLength !== (stride + 1) * height) return 'the PNG data has the wrong length';
	const rows = new Uint8Array(stride * height);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)]!;
		const src = y * (stride + 1) + 1;
		const out = y * stride;
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? rows[out + x - channels]! : 0;
			const b = y > 0 ? rows[out - stride + x]! : 0;
			const c = x >= channels && y > 0 ? rows[out - stride + x - channels]! : 0;
			let v = raw[src + x]!;
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			} else if (filter !== 0) return `the PNG uses an unknown row filter (${filter})`;
			rows[out + x] = v & 255;
		}
	}
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const s = i * channels;
		if (channels === 1) data.set([rows[s]!, rows[s]!, rows[s]!, 255], i * 4);
		else if (channels === 3) data.set([rows[s]!, rows[s + 1]!, rows[s + 2]!, 255], i * 4);
		else data.set(rows.subarray(s, s + 4), i * 4);
	}
	return { width, height, data };
}
