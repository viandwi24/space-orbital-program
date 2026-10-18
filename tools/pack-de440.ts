/**
 * Pack JPL's DE440 for the Sol pack (plan 125, ADR 0122 point 7): read an SPK file (`de440s.bsp`
 * from NAIF, type 2 segments), keep the planet barycentres, the Sun and the Moon, cut the records to
 * a span of years and write the `ORBEPH01` asset gzipped, with its size and SHA-256 printed.
 *
 *   bun tools/pack-de440.ts <de440s.bsp> <out.bin.gz> [fromYear] [toYear]
 *
 * The Earth is not kept: about the Earth–Moon barycentre it is the Moon's vector over EMRAT.
 */
import { gzipSync } from 'node:zlib';
import { writeEphemeris, type EphemerisSegment } from '../packages/kepler/src/ephemeris.ts';

const [bsp, outPath, fromArg, toArg] = process.argv.slice(2);
if (!bsp || !outPath) {
	console.error('usage: bun tools/pack-de440.ts <de440s.bsp> <out.bin.gz> [fromYear] [toYear]');
	process.exit(2);
}
const KEEP = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 301]);
/** TDB seconds past J2000 of 1 January of `year` (Julian years: the span only needs whole records). */
const yearStart = (year: number): number => (year - 2000) * 365.25 * 86_400 - 43_200;
const from = yearStart(Number(fromArg ?? 2000));
const to = yearStart(Number(toArg ?? 2100));

const bytes = new Uint8Array(await Bun.file(bsp).arrayBuffer());
const dv = new DataView(bytes.buffer);
if (new TextDecoder().decode(bytes.subarray(0, 7)) !== 'DAF/SPK') throw new Error('not an SPK file');
const nd = dv.getInt32(8, true);
const ni = dv.getInt32(12, true);
const stride = nd + Math.floor((ni + 1) / 2);
const segments: EphemerisSegment[] = [];
const chunks: Float64Array[] = [];
let offset = 0;
for (let rec = dv.getInt32(76, true); rec > 0; ) {
	const base = (rec - 1) * 1024;
	const next = dv.getFloat64(base, true);
	const count = dv.getFloat64(base + 16, true);
	for (let k = 0; k < count; k++) {
		const o = base + 24 + k * stride * 8;
		const target = dv.getInt32(o + 16, true);
		const center = dv.getInt32(o + 20, true);
		const type = dv.getInt32(o + 28, true);
		const end = dv.getInt32(o + 36, true);
		if (!KEEP.has(target)) continue;
		if (type !== 2) throw new Error(`segment ${target}: type ${type}, expected 2`);
		const dir = (end - 4) * 8;
		const init = dv.getFloat64(dir, true);
		const intlen = dv.getFloat64(dir + 8, true);
		const rsize = dv.getFloat64(dir + 16, true);
		const first = Math.max(0, Math.floor((from - init) / intlen));
		const last = Math.ceil((to - init) / intlen);
		const start = dv.getInt32(o + 32, true); // first double of the segment, 1-based
		const n = last - first;
		const data = new Float64Array(n * rsize);
		for (let i = 0; i < n * rsize; i++) data[i] = dv.getFloat64((start - 1 + first * rsize + i) * 8, true);
		chunks.push(data);
		segments.push({ target, center, init: init + first * intlen, intlen, rsize, records: n, offset });
		offset += data.length;
	}
	rec = next;
}
const data = new Float64Array(offset);
let at = 0;
for (const c of chunks) {
	data.set(c, at);
	at += c.length;
}
segments.sort((a, b) => a.target - b.target);
const raw = writeEphemeris({ start: from, end: to, segments, data });
const gz = gzipSync(raw, { level: 9 });
await Bun.write(outPath, gz);
const sha = new Bun.CryptoHasher('sha256').update(gz).digest('hex');
console.log(
	`${outPath}: ${segments.length} segments, ${(raw.length / 1e6).toFixed(2)} MB raw, ${(gz.length / 1e6).toFixed(2)} MB gzipped, sha256 ${sha}`
);
for (const s of segments)
	console.log(`  ${s.target} about ${s.center}: ${s.records} records of ${s.intlen / 86_400} days, ${(s.rsize - 2) / 3} coefficients`);
