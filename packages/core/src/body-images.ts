/**
 * The images of mod bodies (plans 405 and 406, ADRs 0362 and 0363). A body's `appearance` names
 * three kinds in its mod's package: `clouds.map` (the deck's cover), `albedo` and `normal` (the
 * body's colour and relief seen from far). The host calls `installBodyImages` once per world after
 * the mod runtime; the renderer asks `bodyCloudImage` and `loadBodyImage`. The cloud image is
 * small and decoded at once. An albedo or a normal image can be 4096 texels across (32 MiB
 * decoded), so only its header is read at install and the PNG's bytes are kept (4 MiB at most);
 * it is decoded when the body comes near and `releaseBodyImage` lets the pixels go when it is far.
 * A missing or unreadable image leaves the body with what it had and is reported.
 */
import { decodePng, pngSize } from './png.ts';
import { loadPlugins, type Plugin } from './plugin.ts';

/** An image as RGBA8 rows from the top. */
export interface BodyImage {
	width: number;
	height: number;
	data: Uint8Array;
}

/** A cloud map is twice as wide as high, within these widths. */
export const CLOUD_MAP_MIN = 64;
export const CLOUD_MAP_MAX = 2048;
/** An albedo or normal image, twice as wide as high, within these widths. */
export const BODY_MAP_MIN = 128;
export const BODY_MAP_MAX = 4096;

/** Checks a decoded image as a cloud map; a string is the reason it is not one. */
export function checkCloudMap(image: { width: number; height: number }): string | undefined {
	if (image.width !== image.height * 2)
		return `a ${image.width} x ${image.height} cloud map is not twice as wide as it is high`;
	if (image.width < CLOUD_MAP_MIN || image.width > CLOUD_MAP_MAX)
		return `a ${image.width} texel wide cloud map is outside ${CLOUD_MAP_MIN} to ${CLOUD_MAP_MAX}`;
	return undefined;
}

/** Checks an image as a body's albedo or normal map; a string is the reason it is not one. */
export function checkBodyMap(image: { width: number; height: number }): string | undefined {
	if (image.width !== image.height * 2)
		return `a ${image.width} x ${image.height} map is not twice as wide as it is high`;
	if (image.width < BODY_MAP_MIN || image.width > BODY_MAP_MAX)
		return `a ${image.width} texel wide map is outside ${BODY_MAP_MIN} to ${BODY_MAP_MAX}`;
	return undefined;
}

export type BodyMapKind = 'albedo' | 'normal';

interface Held {
	bytes: Uint8Array;
	width: number;
	height: number;
	/** The decoded pixels, while some body wants them. */
	image?: BodyImage;
	/** A decode in flight. */
	loading?: Promise<BodyImage | undefined>;
}

const clouds = new Map<string, BodyImage>();
const maps = new Map<string, Held>();
const mapKey = (bodyId: string, kind: BodyMapKind): string => `${bodyId}\u0000${kind}`;

/** The cloud image installed for a body, if any. */
export const bodyCloudImage = (bodyId: string): BodyImage | undefined => clouds.get(bodyId);

/** Whether a body has an albedo or normal image (its size is known before it is decoded). */
export function bodyMapSize(
	bodyId: string,
	kind: BodyMapKind
): { width: number; height: number } | undefined {
	const held = maps.get(mapKey(bodyId, kind));
	return held ? { width: held.width, height: held.height } : undefined;
}

/** Decodes a body's albedo or normal image (once while it is held); undefined if it has none or cannot be read. */
export function loadBodyImage(bodyId: string, kind: BodyMapKind): Promise<BodyImage | undefined> {
	const held = maps.get(mapKey(bodyId, kind));
	if (!held) return Promise.resolve(undefined);
	if (held.image) return Promise.resolve(held.image);
	held.loading ??= decodePng(held.bytes).then((image) => {
		held.loading = undefined;
		if (typeof image === 'string') return undefined;
		held.image = { width: image.width, height: image.height, data: image.data };
		return held.image;
	});
	return held.loading;
}

/** Lets a decoded image go (the bytes stay): its body is far again. */
export function releaseBodyImage(bodyId: string, kind: BodyMapKind): void {
	const held = maps.get(mapKey(bodyId, kind));
	if (held) delete held.image;
}

/** Whether the pixels of a body's image are in memory now (for tests and the HUD). */
export const bodyImageResident = (bodyId: string, kind: BodyMapKind): boolean =>
	maps.get(mapKey(bodyId, kind))?.image !== undefined;

export function clearBodyImages(): void {
	clouds.clear();
	maps.clear();
}

export interface BodyImageProblem {
	mod: string;
	body: string;
	path: string;
	message: string;
}

/**
 * Reads every body's images of the mods. `assets`: each mod's decoded files by mod id then path
 * (`resolveMods`'s). Nothing throws; what cannot be read is returned.
 */
export async function installBodyImages(
	plugins: readonly Plugin[],
	assets: ReadonlyMap<string, ReadonlyMap<string, { bytes: Uint8Array }>>
): Promise<BodyImageProblem[]> {
	clearBodyImages();
	const problems: BodyImageProblem[] = [];
	let loaded;
	try {
		loaded = loadPlugins(plugins);
	} catch {
		return problems;
	}
	// the image is in the package of the mod that set the path: the body's owner, or a patcher of it
	const owner = new Map(loaded.report.registered.body.map((b) => [b.id, b.by]));
	const patcher = (entry: string, field: string): string | undefined => {
		let by: string | undefined;
		for (const patch of loaded.report.patches)
			for (const change of patch.changes)
				if (patch.target === 'body' && change.entry === entry && change.path.startsWith(field))
					by = patch.by;
		return by;
	};
	for (const body of loaded.registries.bodies.list()) {
		const look = body.appearance;
		if (!look) continue;
		const wanted: { field: string; kind: 'clouds' | BodyMapKind; path: string | undefined }[] = [
			{ field: 'appearance.clouds', kind: 'clouds', path: look.clouds?.map },
			{ field: 'appearance.albedo', kind: 'albedo', path: look.albedo },
			{ field: 'appearance.normal', kind: 'normal', path: look.normal }
		];
		for (const { field, kind, path } of wanted) {
			if (path === undefined) continue;
			const mod = patcher(body.id, field) ?? owner.get(body.id) ?? '';
			const fail = (message: string): void =>
				void problems.push({ mod, body: body.id, path, message });
			const file = assets.get(mod)?.get(path);
			if (!file) {
				fail('the image is not in the mod package');
				continue;
			}
			if (kind === 'clouds') {
				const image = await decodePng(file.bytes);
				if (typeof image === 'string') {
					fail(image);
					continue;
				}
				const bad = checkCloudMap(image);
				if (bad) {
					fail(bad);
					continue;
				}
				clouds.set(body.id, { width: image.width, height: image.height, data: image.data });
				continue;
			}
			const size = pngSize(file.bytes);
			if (typeof size === 'string') {
				fail(size);
				continue;
			}
			const bad = checkBodyMap(size);
			if (bad) {
				fail(bad);
				continue;
			}
			maps.set(mapKey(body.id, kind), {
				bytes: file.bytes,
				width: size.width,
				height: size.height
			});
		}
	}
	return problems;
}
