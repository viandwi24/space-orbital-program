/**
 * The DE440 ephemeris asset (plan 125, ADR 0122 point 7): JPL's Chebyshev records, as NAIF ships them
 * in an SPK (type 2), cut to a span and packed in one little-endian file. A segment is one body
 * relative to its centre (NAIF ids: 1–9 planet barycentres, 10 Sun, 301 Moon, all about the solar
 * system barycentre 0 except the Moon about the Earth–Moon barycentre 3). Times are TDB seconds past
 * J2000; positions km in the SPK, metres here.
 */
import { chebyshevState } from './chebyshev.ts';
import type { StateVector } from './convert.ts';

/** `ORBEPH01`: the format of this file. */
export const EPHEMERIS_MAGIC = 'ORBEPH01';
/** DE440's Earth–Moon mass ratio: the Earth about the Earth–Moon barycentre is −Moon / EMRAT. */
export const DE440_EMRAT = 81.3005682214972154;
/** DE440's astronomical unit, m (testpo values are in AU and AU/day). */
export const DE440_AU = 149_597_870_700;

export interface EphemerisSegment {
	/** NAIF id of the body and of its centre. */
	target: number;
	center: number;
	/** Start of the first record and each record's length, TDB s past J2000. */
	init: number;
	intlen: number;
	/** Doubles per record: mid, radius, then x, y, z coefficients. */
	rsize: number;
	records: number;
	/** Offset of the first record in the data, in doubles. */
	offset: number;
}

export interface Ephemeris {
	/** First and last covered instant, TDB s past J2000. */
	start: number;
	end: number;
	segments: EphemerisSegment[];
	data: Float64Array;
}

/** Read an asset (already un-gzipped). Throws on a file of another format. */
export function readEphemeris(bytes: Uint8Array): Ephemeris {
	const magic = new TextDecoder().decode(bytes.subarray(0, 8));
	if (magic !== EPHEMERIS_MAGIC) throw new RangeError('not an ephemeris asset');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const headerLength = view.getUint32(8, true);
	const header = JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + headerLength))) as {
		start: number;
		end: number;
		segments: EphemerisSegment[];
	};
	// the doubles start on the next multiple of 8 after the header
	const at = Math.ceil((16 + headerLength) / 8) * 8;
	const data = new Float64Array(
		bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + bytes.byteLength)
	);
	return { start: header.start, end: header.end, segments: header.segments, data };
}

/** Write an asset from segments and their doubles (the packing tool and the tests). */
export function writeEphemeris(e: Ephemeris): Uint8Array {
	const header = new TextEncoder().encode(
		JSON.stringify({ start: e.start, end: e.end, segments: e.segments })
	);
	const at = Math.ceil((16 + header.length) / 8) * 8;
	const out = new Uint8Array(at + e.data.byteLength);
	out.set(new TextEncoder().encode(EPHEMERIS_MAGIC), 0);
	new DataView(out.buffer).setUint32(8, header.length, true);
	out.set(header, 16);
	out.set(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), at);
	return out;
}

/** State of `target` about its segment's centre at `t`, m and m/s; undefined without a segment. */
export function segmentState(e: Ephemeris, target: number, t: number): StateVector | undefined {
	const seg = e.segments.find((s) => s.target === target);
	if (!seg) return undefined;
	const k = Math.min(seg.records - 1, Math.max(0, Math.floor((t - seg.init) / seg.intlen)));
	const base = seg.offset + k * seg.rsize;
	const mid = e.data[base]!;
	const radius = e.data[base + 1]!;
	const n = (seg.rsize - 2) / 3;
	const coeffs = (axis: number) => e.data.subarray(base + 2 + axis * n, base + 2 + (axis + 1) * n);
	const s = chebyshevState(
		{
			start: mid - radius,
			end: mid + radius,
			x: coeffs(0) as never,
			y: coeffs(1) as never,
			z: coeffs(2) as never
		},
		t
	);
	return {
		r: { x: s.r.x * 1000, y: s.r.y * 1000, z: s.r.z * 1000 },
		v: { x: s.v.x * 1000, y: s.v.y * 1000, z: s.v.z * 1000 }
	};
}

/** J2000 obliquity of the ecliptic (IAU 1976, 84 381.448″): DE440's equator to the ecliptic. */
const OBLIQUITY = (84_381.448 / 3600) * (Math.PI / 180);
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

/**
 * A vector of DE440's frame (ICRF, the J2000 equator) in the game frame: to the ecliptic, then
 * ecliptic (x, y, z) to game (x, z, −y), as the series paths do (ADR 0183 point 4).
 */
export function icrfToGame(v: { x: number; y: number; z: number }): {
	x: number;
	y: number;
	z: number;
} {
	const ey = COS_E * v.y + SIN_E * v.z;
	const ez = -SIN_E * v.y + COS_E * v.z;
	return { x: v.x, y: ez, z: -ey };
}

/**
 * A body's path about its parent from the asset (game frame, seconds from J2000), or undefined when
 * the asset lacks one of them. Outside the asset's span the caller keeps its own model.
 */
export function ephemerisPath(
	e: Ephemeris,
	naif: number,
	parentNaif: number
): ((tau: number) => StateVector) | undefined {
	const has = (id: number) =>
		id === 0 || id === 301 || id === 399 || e.segments.some((s) => s.target === id);
	if (!has(naif) || !has(parentNaif)) return undefined;
	return (tau) => {
		const a = barycentricState(e, naif, tau);
		const b = barycentricState(e, parentNaif, tau);
		return {
			r: icrfToGame({ x: a.r.x - b.r.x, y: a.r.y - b.r.y, z: a.r.z - b.r.z }),
			v: icrfToGame({ x: a.v.x - b.v.x, y: a.v.y - b.v.y, z: a.v.z - b.v.z })
		};
	};
}

/**
 * State of a body about the solar system barycentre (NAIF 0) at `t`, m and m/s: 1–10 directly, the
 * Moon (301) and the Earth (399) from the Earth–Moon barycentre (3) and the Moon's record.
 */
export function barycentricState(e: Ephemeris, naif: number, t: number): StateVector {
	const add = (a: StateVector, b: StateVector, k = 1): StateVector => ({
		r: { x: a.r.x + k * b.r.x, y: a.r.y + k * b.r.y, z: a.r.z + k * b.r.z },
		v: { x: a.v.x + k * b.v.x, y: a.v.y + k * b.v.y, z: a.v.z + k * b.v.z }
	});
	if (naif === 0) return { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };
	if (naif === 301 || naif === 399) {
		const emb = segmentState(e, 3, t)!;
		const moon = segmentState(e, 301, t)!; // about the Earth–Moon barycentre
		return naif === 301 ? add(emb, moon) : add(emb, moon, -1 / DE440_EMRAT);
	}
	const s = segmentState(e, naif, t);
	if (!s) throw new RangeError(`the ephemeris has no body ${naif}`);
	return s;
}
