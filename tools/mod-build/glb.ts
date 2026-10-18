/**
 * A small binary glTF (.glb) writer for mod build scripts and tests (plan 051, ADR 0076): meshes
 * with positions, normals and optional UVs, PBR factor materials with an optional embedded PNG
 * base-colour texture, a node tree. Lets a mod generate its models in code, so the repository
 * ships no binary art and no licence question. Also a lathe (surface of revolution) and a PNG
 * encoder, the two things a procedural part needs.
 */
import { deflateSync } from 'node:zlib';

export interface GlbMesh {
	name?: string;
	positions: Float32Array;
	normals: Float32Array;
	uvs?: Float32Array;
	indices: Uint16Array | Uint32Array;
	/** Index into `GlbSpec.materials`. */
	material: number;
}

export interface GlbMaterial {
	name?: string;
	/** Linear RGBA base colour factor. */
	color: readonly [number, number, number, number];
	metallic?: number;
	roughness?: number;
	/** Linear RGB emissive factor. */
	emissive?: readonly [number, number, number];
	/** Index into `GlbSpec.images`: the base-colour texture. */
	texture?: number;
}

export interface GlbNode {
	name: string;
	mesh?: number;
	translation?: readonly [number, number, number];
	children?: number[];
}

/** One animation clip: channels that key a node's rotation, translation or scale (plan 065, ADR 0160). */
export interface GlbAnimation {
	name: string;
	channels: Array<{
		node: number;
		path: 'rotation' | 'translation' | 'scale';
		/** Seconds, increasing. */
		times: Float32Array;
		/** VEC4 quaternions for rotation, VEC3 otherwise, one per time. */
		values: Float32Array;
	}>;
}

export interface GlbSpec {
	meshes: GlbMesh[];
	materials: GlbMaterial[];
	nodes: GlbNode[];
	/** Indices of the nodes in the scene. */
	roots: number[];
	/** Embedded PNG files. */
	images?: Uint8Array[];
	/** The images' type when they are not PNG (`image/ktx2` with `KHR_texture_basisu`). */
	imageMime?: string;
	animations?: GlbAnimation[];
	/** Extra `extensionsUsed` entries. */
	extensionsUsed?: string[];
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** Serialises `spec` as a self-contained GLB 2.0 (one binary buffer, images embedded). */
export function buildGlb(spec: GlbSpec): Uint8Array {
	const chunks: Uint8Array[] = [];
	let length = 0;
	const bufferViews: Record<string, unknown>[] = [];
	const accessors: Record<string, unknown>[] = [];
	const push = (bytes: Uint8Array, target?: number): number => {
		const at = length;
		const padded = new Uint8Array(pad4(bytes.byteLength));
		padded.set(bytes);
		chunks.push(padded);
		length += padded.byteLength;
		bufferViews.push({
			buffer: 0,
			byteOffset: at,
			byteLength: bytes.byteLength,
			...(target ? { target } : {})
		});
		return bufferViews.length - 1;
	};
	const bytesOf = (a: ArrayBufferView): Uint8Array =>
		new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

	const meshes = spec.meshes.map((m) => {
		const attributes: Record<string, number> = {};
		const count = m.positions.length / 3;
		const min = [Infinity, Infinity, Infinity];
		const max = [-Infinity, -Infinity, -Infinity];
		for (let i = 0; i < m.positions.length; i++) {
			const axis = i % 3;
			min[axis] = Math.min(min[axis]!, m.positions[i]!);
			max[axis] = Math.max(max[axis]!, m.positions[i]!);
		}
		accessors.push({
			bufferView: push(bytesOf(m.positions), 34962),
			componentType: 5126,
			count,
			type: 'VEC3',
			min,
			max
		});
		attributes.POSITION = accessors.length - 1;
		accessors.push({
			bufferView: push(bytesOf(m.normals), 34962),
			componentType: 5126,
			count,
			type: 'VEC3'
		});
		attributes.NORMAL = accessors.length - 1;
		if (m.uvs) {
			accessors.push({
				bufferView: push(bytesOf(m.uvs), 34962),
				componentType: 5126,
				count,
				type: 'VEC2'
			});
			attributes.TEXCOORD_0 = accessors.length - 1;
		}
		accessors.push({
			bufferView: push(bytesOf(m.indices), 34963),
			componentType: m.indices instanceof Uint32Array ? 5125 : 5123,
			count: m.indices.length,
			type: 'SCALAR'
		});
		return {
			...(m.name ? { name: m.name } : {}),
			primitives: [{ attributes, indices: accessors.length - 1, material: m.material }]
		};
	});

	const images = (spec.images ?? []).map((png) => ({
		bufferView: push(png),
		mimeType: spec.imageMime ?? 'image/png'
	}));

	const animations = (spec.animations ?? []).map((a) => {
		const samplers: Record<string, unknown>[] = [];
		const channels = a.channels.map((c) => {
			const times = Array.from(c.times);
			accessors.push({
				bufferView: push(bytesOf(c.times)),
				componentType: 5126,
				count: c.times.length,
				type: 'SCALAR',
				min: [Math.min(...times)],
				max: [Math.max(...times)]
			});
			const input = accessors.length - 1;
			accessors.push({
				bufferView: push(bytesOf(c.values)),
				componentType: 5126,
				count: c.times.length,
				type: c.path === 'rotation' ? 'VEC4' : 'VEC3'
			});
			samplers.push({ input, output: accessors.length - 1, interpolation: 'LINEAR' });
			return { sampler: samplers.length - 1, target: { node: c.node, path: c.path } };
		});
		return { name: a.name, channels, samplers };
	});

	const json = {
		asset: { version: '2.0', generator: 'orbital mod-build glb.ts' },
		scene: 0,
		scenes: [{ nodes: spec.roots }],
		nodes: spec.nodes.map((n) => ({
			name: n.name,
			...(n.mesh !== undefined ? { mesh: n.mesh } : {}),
			...(n.translation ? { translation: [...n.translation] } : {}),
			...(n.children ? { children: n.children } : {})
		})),
		meshes,
		materials: spec.materials.map((m) => ({
			...(m.name ? { name: m.name } : {}),
			pbrMetallicRoughness: {
				baseColorFactor: [...m.color],
				metallicFactor: m.metallic ?? 0,
				roughnessFactor: m.roughness ?? 0.6,
				...(m.texture !== undefined ? { baseColorTexture: { index: m.texture } } : {})
			},
			...(m.emissive ? { emissiveFactor: [...m.emissive] } : {})
		})),
		...(images.length > 0
			? {
					images,
					textures: images.map((_, i) =>
						spec.imageMime === 'image/ktx2'
							? { extensions: { KHR_texture_basisu: { source: i } } }
							: { source: i }
					)
				}
			: {}),
		...(animations.length > 0 ? { animations } : {}),
		...(spec.extensionsUsed ? { extensionsUsed: spec.extensionsUsed } : {}),
		accessors,
		bufferViews,
		buffers: [{ byteLength: length }]
	};

	const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
	const jsonChunk = new Uint8Array(pad4(jsonBytes.byteLength)).fill(0x20); // JSON pads with spaces
	jsonChunk.set(jsonBytes);
	const total = 12 + 8 + jsonChunk.byteLength + 8 + length;
	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x46546c67, true);
	view.setUint32(4, 2, true);
	view.setUint32(8, total, true);
	view.setUint32(12, jsonChunk.byteLength, true);
	view.setUint32(16, 0x4e4f534a, true);
	out.set(jsonChunk, 20);
	const binAt = 20 + jsonChunk.byteLength;
	view.setUint32(binAt, length, true);
	view.setUint32(binAt + 4, 0x004e4942, true);
	let at = binAt + 8;
	for (const c of chunks) {
		out.set(c, at);
		at += c.byteLength;
	}
	return out;
}

/**
 * A surface of revolution about +Y from a profile of `[radius, y]` points (bottom to top), smooth
 * shaded with UVs (u around, v along the profile). Triangles face outwards.
 */
export function lathe(
	profile: readonly (readonly [number, number])[],
	segments: number,
	material: number,
	name?: string
): GlbMesh {
	const rows = profile.length;
	const cols = segments + 1;
	const positions = new Float32Array(rows * cols * 3);
	const normals = new Float32Array(rows * cols * 3);
	const uvs = new Float32Array(rows * cols * 2);
	for (let i = 0; i < rows; i++) {
		const [r, y] = profile[i]!;
		// Normal from the profile tangent: rotate (dr, dy) by 90 degrees.
		const prev = profile[Math.max(0, i - 1)]!;
		const next = profile[Math.min(rows - 1, i + 1)]!;
		const dr = next[0] - prev[0];
		const dy = next[1] - prev[1];
		const len = Math.hypot(dr, dy) || 1;
		const nr = dy / len;
		const ny = -dr / len;
		for (let j = 0; j < cols; j++) {
			const a = (j / segments) * Math.PI * 2;
			const k = i * cols + j;
			positions.set([r * Math.cos(a), y, r * Math.sin(a)], k * 3);
			normals.set([nr * Math.cos(a), ny, nr * Math.sin(a)], k * 3);
			uvs.set([j / segments, i / (rows - 1)], k * 2);
		}
	}
	const indices: number[] = [];
	for (let i = 0; i < rows - 1; i++) {
		for (let j = 0; j < segments; j++) {
			const a = i * cols + j;
			const b = a + 1;
			const c = a + cols;
			const d = c + 1;
			indices.push(a, c, b, b, c, d);
		}
	}
	return {
		...(name ? { name } : {}),
		positions,
		normals,
		uvs,
		indices: new Uint16Array(indices),
		material
	};
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** An 8-bit RGBA PNG of `rgba` (row-major, `width * height * 4` bytes). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
	const raw = new Uint8Array((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0; // filter: none
		raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
	}
	const chunk = (type: string, data: Uint8Array): Uint8Array => {
		const out = new Uint8Array(12 + data.byteLength);
		const view = new DataView(out.buffer);
		view.setUint32(0, data.byteLength);
		for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
		out.set(data, 8);
		view.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)));
		return out;
	};
	const header = new Uint8Array(13);
	const hv = new DataView(header.buffer);
	hv.setUint32(0, width);
	hv.setUint32(4, height);
	header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA, deflate, adaptive filtering, no interlace
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', new Uint8Array(deflateSync(raw))),
		chunk('IEND', new Uint8Array(0))
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.byteLength;
	}
	return out;
}
