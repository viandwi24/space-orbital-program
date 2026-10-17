/**
 * Assets a mod package may carry (plan 051, ADR 0076): binary glTF models embedded as base64 in
 * the package's JSON, each with its own size and SHA-256, validated here without a renderer or
 * any DOM so the trust prompt, the loader and the build tool agree on what is acceptable.
 * Environment-neutral: only `atob`/`btoa` and `crypto.subtle`, which browsers, Workers, Bun and
 * Node all have.
 */
import * as z from 'zod';

/** Media type of the only asset kind in format 2: a self-contained binary glTF (`.glb`). */
export const MOD_ASSET_TYPE = 'model/gltf-binary';
/** Largest single asset, decoded bytes. */
export const MAX_MOD_ASSET_BYTES = 2 * 1024 * 1024;
/** Largest sum of all assets in one package, decoded bytes. */
export const MAX_MOD_ASSETS_TOTAL_BYTES = 6 * 1024 * 1024;
export const MAX_MOD_ASSET_COUNT = 32;
/** Triangles one model may draw (one part is drawn many times in a big vessel). */
export const MAX_ASSET_TRIANGLES = 50_000;
/** Mesh nodes (draw calls) one model may have. */
export const MAX_ASSET_MESH_NODES = 32;
/** Textures a model may embed. */
export const MAX_ASSET_IMAGES = 8;

/** Where an asset lives in a package and how a part names it: lower-case segments, `.glb`. */
export const assetPathSchema = z
	.string()
	.max(128)
	.regex(
		/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.glb$/,
		'expected a relative path of lower-case letters, digits, "." "_" "-" and "/", ending in ".glb"'
	);

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'expected 64 lower-case hex digits');

export const modAssetSchema = z.strictObject({
	type: z.literal(MOD_ASSET_TYPE),
	/** Decoded size in bytes. */
	size: z.number().int().positive().max(MAX_MOD_ASSET_BYTES),
	/** Hex SHA-256 of the decoded bytes. */
	sha256: hex64,
	/** Standard base64 of the bytes. */
	data: z.string().min(1)
});
export type ModAsset = z.output<typeof modAssetSchema>;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function bytesToBase64(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(out);
}

/** Decodes standard base64; `undefined` for text that is not valid base64. */
export function base64ToBytes(text: string): Uint8Array | undefined {
	if (!BASE64.test(text)) return undefined;
	const raw = atob(text);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/**
 * The fingerprint a package carries and the trust prompt shows. Without assets it is the SHA-256
 * of the code (as in format 1); with assets it also covers each asset's path and hash, so editing
 * any byte of any asset changes it (ADR 0076 point 2).
 */
export async function modPackageFingerprint(
	code: string,
	assets: Readonly<Record<string, { sha256: string }>> | undefined
): Promise<string> {
	const paths = Object.keys(assets ?? {}).sort();
	const encoder = new TextEncoder();
	if (!assets || paths.length === 0) return sha256Hex(encoder.encode(code));
	const text = `${code}\n--assets--\n${paths.map((p) => `${p} ${assets[p]!.sha256}\n`).join('')}`;
	return sha256Hex(encoder.encode(text));
}

// glTF extensions a model may use: everything the game's loader decodes without an extra
// decoder (no Draco, Meshopt, Basis/KTX2, WebP or AVIF: those need decoder files; ADR 0076).
const ALLOWED_EXTENSIONS = new Set([
	'KHR_materials_clearcoat',
	'KHR_materials_emissive_strength',
	'KHR_materials_ior',
	'KHR_materials_specular',
	'KHR_materials_transmission',
	'KHR_materials_unlit',
	'KHR_materials_volume',
	'KHR_mesh_quantization',
	'KHR_texture_transform'
]);

export interface GlbInfo {
	/** Triangles drawn once, all mesh nodes counted. */
	triangles: number;
	/** Nodes that draw a mesh. */
	meshNodes: number;
	images: number;
	extensions: string[];
}

export type GlbInspection = { ok: true; info: GlbInfo } | { ok: false; errors: string[] };

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);

/**
 * Checks a `.glb` without decoding any geometry: container, version, that it is self-contained
 * (no external or data URIs: the loader must never fetch anything), embedded images are PNG or
 * JPEG, only extensions the game decodes, and the triangle and draw-call budget. The renderer's
 * loader still validates accessors; this is what a modder is told before install.
 */
export function inspectGlb(bytes: Uint8Array): GlbInspection {
	const errors: string[] = [];
	if (bytes.byteLength < 20) return { ok: false, errors: ['not a binary glTF (.glb): too short'] };
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== GLB_MAGIC) {
		return { ok: false, errors: ['not a binary glTF (.glb): missing the "glTF" header'] };
	}
	if (view.getUint32(4, true) !== 2) {
		return { ok: false, errors: ['only glTF 2.0 binary files are supported'] };
	}
	if (view.getUint32(8, true) !== bytes.byteLength) {
		return { ok: false, errors: ['the .glb length field does not match the file size'] };
	}
	const jsonLength = view.getUint32(12, true);
	if (view.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLength > bytes.byteLength) {
		return { ok: false, errors: ['the .glb does not start with a valid JSON chunk'] };
	}
	let doc: unknown;
	try {
		doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
	} catch {
		return { ok: false, errors: ['the .glb JSON chunk is not valid JSON'] };
	}
	if (!isObject(doc) || !isObject(doc.asset) || doc.asset.version !== '2.0') {
		return { ok: false, errors: ['only glTF 2.0 is supported (asset.version "2.0")'] };
	}

	const used = [
		...(Array.isArray(doc.extensionsUsed) ? doc.extensionsUsed : []),
		...(Array.isArray(doc.extensionsRequired) ? doc.extensionsRequired : [])
	].filter((e): e is string => typeof e === 'string');
	const extensions = [...new Set(used)];
	for (const e of extensions) {
		if (!ALLOWED_EXTENSIONS.has(e)) {
			errors.push(
				`uses the glTF extension ${e}, which the game cannot decode (no Draco, Meshopt, KTX2, WebP or AVIF; export plain triangles with PNG or JPEG textures)`
			);
		}
	}

	for (const [i, b] of list(doc.buffers).entries()) {
		if (b.uri !== undefined) {
			errors.push(`buffers[${i}] points at an external or data URI; a .glb must embed its data`);
		}
	}
	const images = list(doc.images);
	for (const [i, img] of images.entries()) {
		if (img.uri !== undefined || typeof img.bufferView !== 'number') {
			errors.push(`images[${i}] must be embedded in the .glb (bufferView), not a URI`);
		} else if (img.mimeType !== 'image/png' && img.mimeType !== 'image/jpeg') {
			errors.push(
				`images[${i}] is ${String(img.mimeType)}; only image/png and image/jpeg are supported`
			);
		}
	}
	if (images.length > MAX_ASSET_IMAGES) {
		errors.push(`has ${images.length} textures; at most ${MAX_ASSET_IMAGES} are allowed`);
	}

	// Triangles of every node that draws a mesh (an instanced mesh counts once per node).
	const accessors = list(doc.accessors);
	const meshes = list(doc.meshes);
	const count = (index: unknown): number => {
		const a = typeof index === 'number' ? accessors[index] : undefined;
		return typeof a?.count === 'number' ? a.count : 0;
	};
	const meshTriangles = meshes.map((mesh, mi) => {
		let t = 0;
		for (const p of list(mesh.primitives)) {
			const mode = typeof p.mode === 'number' ? p.mode : 4;
			const n =
				p.indices !== undefined ? count(p.indices) : count(list([p.attributes])[0]?.POSITION);
			if (mode === 4) t += Math.floor(n / 3);
			else if (mode === 5 || mode === 6) t += Math.max(0, n - 2);
			else errors.push(`meshes[${mi}] has points or lines; only triangles can be drawn`);
		}
		return t;
	});
	let triangles = 0;
	let meshNodes = 0;
	for (const node of list(doc.nodes)) {
		if (typeof node.mesh !== 'number') continue;
		meshNodes += 1;
		triangles += meshTriangles[node.mesh] ?? 0;
	}
	if (triangles > MAX_ASSET_TRIANGLES) {
		errors.push(`draws ${triangles} triangles; the limit is ${MAX_ASSET_TRIANGLES}`);
	}
	if (meshNodes > MAX_ASSET_MESH_NODES) {
		errors.push(`has ${meshNodes} mesh nodes; the limit is ${MAX_ASSET_MESH_NODES} (merge meshes)`);
	}
	if (meshNodes === 0) errors.push('contains no mesh');
	return errors.length > 0
		? { ok: false, errors }
		: { ok: true, info: { triangles, meshNodes, images: images.length, extensions } };
}

/** A package's assets after the checks, with decoded bytes. Key: asset path. */
export type DecodedAssets = Map<string, { bytes: Uint8Array; info: GlbInfo; sha256: string }>;

/**
 * Validates the `assets` of a parsed package: count, sizes, base64, hash of every asset, and the
 * glb checks. Errors name the asset path.
 */
export async function decodeAssets(
	assets: Readonly<Record<string, ModAsset>>
): Promise<{ ok: true; assets: DecodedAssets } | { ok: false; errors: string[] }> {
	const errors: string[] = [];
	const out: DecodedAssets = new Map();
	const paths = Object.keys(assets);
	if (paths.length > MAX_MOD_ASSET_COUNT) {
		errors.push(`assets: ${paths.length} files; at most ${MAX_MOD_ASSET_COUNT} are allowed`);
	}
	let total = 0;
	for (const path of paths) {
		const asset = assets[path]!;
		const where = `assets["${path}"]`;
		const pathCheck = assetPathSchema.safeParse(path);
		if (!pathCheck.success) {
			errors.push(`${where}: ${pathCheck.error.issues[0]?.message ?? 'bad path'}`);
			continue;
		}
		const bytes = base64ToBytes(asset.data);
		if (!bytes) {
			errors.push(`${where}: data is not valid base64`);
			continue;
		}
		if (bytes.byteLength > MAX_MOD_ASSET_BYTES) {
			errors.push(
				`${where}: ${bytes.byteLength} bytes is over the ${MAX_MOD_ASSET_BYTES} byte limit`
			);
			continue;
		}
		if (bytes.byteLength !== asset.size) {
			errors.push(`${where}: size says ${asset.size} bytes but the data is ${bytes.byteLength}`);
			continue;
		}
		total += bytes.byteLength;
		if ((await sha256Hex(bytes)) !== asset.sha256) {
			errors.push(`${where}: the data does not match its fingerprint (edited or damaged)`);
			continue;
		}
		const glb = inspectGlb(bytes);
		if (!glb.ok) {
			for (const e of glb.errors) errors.push(`${where}: ${e}`);
			continue;
		}
		out.set(path, { bytes, info: glb.info, sha256: asset.sha256 });
	}
	if (total > MAX_MOD_ASSETS_TOTAL_BYTES) {
		errors.push(
			`assets: ${total} bytes in all is over the ${MAX_MOD_ASSETS_TOTAL_BYTES} byte limit`
		);
	}
	return errors.length > 0 ? { ok: false, errors } : { ok: true, assets: out };
}
