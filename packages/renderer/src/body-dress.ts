/**
 * What a body with an `appearance` wears (plan 381, ADR 0318): its colour map, a far sphere drawn
 * with it, a cloud deck and rings. Built-in Lambert materials only, one pipeline shared by every
 * body; the colour map starts small and is filled in at full size over a few frames once the body
 * covers enough of the screen.
 */
import {
	DataTexture,
	DoubleSide,
	LinearFilter,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	Quaternion,
	Vector3,
	Object3D,
	RepeatWrapping,
	RingGeometry,
	SRGBColorSpace,
	ClampToEdgeWrapping,
	LinearMipmapLinearFilter,
	NoColorSpace,
	type BufferGeometry,
	type Texture
} from 'three';
import {
	bodyCloudImage,
	bodyMapSize,
	loadBodyImage,
	releaseBodyImage,
	type BodyImage,
	type BodyMapKind
} from '@orbital/core';
import { hillsRows, type HillsLook } from './hills-look.ts';
import {
	cloudMap,
	LOOK_MAP,
	LOOK_MAP_SMALL,
	lookSeed,
	ringStrip,
	RING_TEXELS,
	surfaceRows,
	type BodyAppearance
} from './body-look.ts';

/** A body is near (its moon pass on, the full map baked) above this many pixels of radius, and far again below the second. */
export const DRESS_NEAR_PX = 40;
export const DRESS_FAR_PX = 24;
/** Milliseconds of map baking a frame may spend (one body at a time). */
export const DRESS_BAKE_MS = 3;

function mapTexture(data: Uint8Array, width: number, height: number): DataTexture {
	const t = new DataTexture(data, width, height);
	t.colorSpace = SRGBColorSpace;
	t.minFilter = LinearFilter;
	t.magFilter = LinearFilter;
	t.wrapS = RepeatWrapping;
	t.wrapT = ClampToEdgeWrapping;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	return t;
}

/** A mod's albedo (sRGB) or normal (data) image as a mipmapped texture: it can be 4096 texels across. */
function imageTexture(image: BodyImage, kind: BodyMapKind): DataTexture {
	const t = new DataTexture(image.data as Uint8Array<ArrayBuffer>, image.width, image.height);
	t.colorSpace = kind === 'albedo' ? SRGBColorSpace : NoColorSpace;
	t.minFilter = LinearMipmapLinearFilter;
	t.magFilter = LinearFilter;
	t.wrapS = RepeatWrapping;
	t.wrapT = ClampToEdgeWrapping;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;
}

/** A ring with its texture's u running from the inner edge (0) to the outer (1). */
function ringGeometry(inner: number, outer: number): BufferGeometry {
	const g = new RingGeometry(inner, outer, 160, 1);
	const pos = g.attributes.position!;
	const uv = g.attributes.uv!;
	for (let i = 0; i < pos.count; i++) {
		const r = Math.hypot(pos.getX(i), pos.getY(i));
		uv.setXY(i, (r - inner) / (outer - inner), 0.5);
	}
	// the body's equator plane: XZ, normal +Y
	g.rotateX(-Math.PI / 2);
	return g;
}

const RING_POLE = new Vector3();

export class BodyDress {
	readonly root = new Object3D();
	/** The colour map the body is drawn with now. */
	map: DataTexture;
	/** The far sphere (or a giant's only sphere), drawn with `map`. */
	readonly far: Mesh;
	private readonly farMaterial: MeshLambertMaterial;
	private readonly clouds: { mesh: Mesh; material: MeshLambertMaterial; altitude: number } | null;
	private readonly rings: { mesh: Mesh; material: MeshBasicMaterial } | null;
	private readonly seed: number;
	/** A map baked from the body's own surface (plan 403), while it is resident; wins over `map`. */
	baked: Texture | null = null;
	/** The mod's own albedo and normal images while the body is near (plan 406); the albedo wins over `baked`. */
	private authored: { albedo: DataTexture | null; normal: DataTexture | null; asked: boolean } = {
		albedo: null,
		normal: null,
		asked: false
	};
	/** Whether the mod gave this body an albedo or a normal image. */
	readonly hasImages: boolean;
	private bake: { data: Uint8Array; row: number } | null = null;
	private full = false;
	private readonly listeners: ((map: Texture) => void)[] = [];

	constructor(
		readonly id: string,
		readonly radius: number,
		readonly look: BodyAppearance,
		sphere: BufferGeometry,
		/** A hills body's biome map and sea (plan 406): the continents its ground has, in place of the palette's pattern. */
		private readonly hills?: HillsLook
	) {
		this.root.name = `dress:${id}`;
		this.seed = lookSeed(id);
		this.hasImages =
			bodyMapSize(id, 'albedo') !== undefined || bodyMapSize(id, 'normal') !== undefined;
		const small = LOOK_MAP_SMALL;
		const data = new Uint8Array(small.width * small.height * 4);
		this.rows(small, data, 0, small.height);
		this.map = mapTexture(data, small.width, small.height);
		this.farMaterial = new MeshLambertMaterial({ map: this.map });
		this.far = new Mesh(sphere, this.farMaterial);
		this.far.name = `far:${id}`;
		this.far.scale.setScalar(radius);
		this.root.add(this.far);
		if (look.clouds) {
			// a mod's image (plan 405, ADR 0362) is the deck's cover and colour; else the generated cover
			const image = look.clouds.map !== undefined ? bodyCloudImage(id) : undefined;
			const size = image ?? { width: 256, height: 128 };
			const material = new MeshLambertMaterial({
				map: mapTexture(
					image ? image.data : cloudMap(look.clouds, this.seed, size),
					size.width,
					size.height
				),
				transparent: true,
				depthWrite: false
			});
			const mesh = new Mesh(sphere, material);
			mesh.name = `clouds:${id}`;
			mesh.scale.setScalar(radius + look.clouds.altitude);
			mesh.renderOrder = 2;
			this.root.add(mesh);
			this.clouds = { mesh, material, altitude: look.clouds.altitude };
		} else this.clouds = null;
		if (look.rings) {
			const strip = mapTexture(ringStrip(look.rings, this.seed), RING_TEXELS, 1);
			strip.wrapS = ClampToEdgeWrapping;
			// rings scatter light to both faces: lit by the sun's angle on their plane (`light`), not by a normal
			const material = new MeshBasicMaterial({
				map: strip,
				transparent: true,
				depthWrite: false,
				side: DoubleSide
			});
			const mesh = new Mesh(ringGeometry(look.rings.inner, look.rings.outer), material);
			mesh.name = `rings:${id}`;
			mesh.renderOrder = 3;
			this.root.add(mesh);
			this.rings = { mesh, material };
		} else this.rings = null;
	}

	/** Rows of the generated map: the biome map's colours on a hills body, else the palette's pattern. */
	private rows(
		size: { width: number; height: number },
		out: Uint8Array,
		j0: number,
		j1: number
	): void {
		if (this.hills) hillsRows(this.hills, size, out, j0, j1);
		else surfaceRows(this.look, this.seed, size, out, j0, j1);
	}

	/** The map the far sphere and the ground are drawn with now: the mod's image, a bake, or the generated map. */
	private shown(): Texture {
		return this.authored.albedo ?? this.baked ?? this.map;
	}

	private show(): void {
		const map = this.shown();
		this.farMaterial.map = map;
		for (const l of this.listeners) l(map);
	}

	/** The baked map in (plan 403), or out (null): the far sphere and the moon pass follow. */
	setBaked(map: Texture | null): void {
		this.baked = map;
		this.show();
	}

	/** The mod's images are decoded while the body is near and let go when it is far (plan 406). */
	private stream(px: number): void {
		const a = this.authored;
		if (!a.asked && px >= DRESS_NEAR_PX) {
			a.asked = true;
			for (const kind of ['albedo', 'normal'] as const)
				void loadBodyImage(this.id, kind).then((image) => {
					if (!image || !a.asked || a[kind]) return;
					a[kind] = imageTexture(image, kind);
					if (kind === 'normal') {
						this.farMaterial.normalMap = a.normal;
						this.farMaterial.needsUpdate = true;
					} else this.show();
				});
		} else if (a.asked && px < DRESS_FAR_PX) {
			a.asked = false;
			const albedo = a.albedo;
			const normal = a.normal;
			a.albedo = null;
			a.normal = null;
			if (normal) {
				this.farMaterial.normalMap = null;
				this.farMaterial.needsUpdate = true;
				normal.dispose();
			}
			this.show();
			albedo?.dispose();
			releaseBodyImage(this.id, 'albedo');
			releaseBodyImage(this.id, 'normal');
		}
	}

	/** Whether the mod's albedo is on the body now (for tests and the capture scripts). */
	get authoredResident(): boolean {
		return this.authored.albedo !== null || this.authored.normal !== null;
	}

	/** Called with the new map when the full one replaces the small one. */
	onMap(listener: (map: Texture) => void): void {
		this.listeners.push(listener);
	}

	/** The full map is in. */
	get detailed(): boolean {
		return this.full;
	}

	/** The far sphere on or off (off while the moon pass draws the ground). */
	showFar(on: boolean): void {
		this.far.visible = on;
	}

	/**
	 * The rings' light from the sun direction (inertial, unit) and the body's orientation: bright when
	 * the sun shines across the plane, dim when it stands edge-on, never dark (light passes through).
	 */
	light(sun: { x: number; y: number; z: number }, orientation: Quaternion): void {
		if (!this.rings) return;
		const pole = RING_POLE.set(0, 1, 0).applyQuaternion(orientation);
		const k = Math.abs(pole.x * sun.x + pole.y * sun.y + pole.z * sun.z);
		this.rings.material.color.setScalar(0.18 + 0.82 * Math.sqrt(k));
	}

	/**
	 * Once a frame: `px` the body's radius on screen, `altitude` the camera's height over the ground
	 * (m). Bakes a slice of the full map once the body is near; fades the cloud deck out below it.
	 * Returns whether this frame spent its baking budget (so the caller bakes one body a frame).
	 */
	frame(px: number, altitude: number, mayBake: boolean): boolean {
		if (this.hasImages) this.stream(px);
		if (this.clouds) {
			const a = this.clouds.altitude;
			const t = Math.min(1, Math.max(0, (altitude - (a - 2_000)) / 5_000));
			this.clouds.mesh.visible = t > 0.01;
			this.clouds.material.opacity = t;
		}
		if (this.full || !mayBake || px < DRESS_NEAR_PX) return false;
		const size = LOOK_MAP;
		this.bake ??= { data: new Uint8Array(size.width * size.height * 4), row: 0 };
		const start = performance.now();
		while (this.bake.row < size.height && performance.now() - start < DRESS_BAKE_MS) {
			this.rows(size, this.bake.data, this.bake.row, this.bake.row + 4);
			this.bake.row += 4;
		}
		if (this.bake.row >= size.height) {
			const old = this.map;
			this.map = mapTexture(this.bake.data, size.width, size.height);
			if (!this.baked && !this.authored.albedo) this.show();
			old.dispose();
			this.bake = null;
			this.full = true;
		}
		return true;
	}

	dispose(): void {
		this.authored.albedo?.dispose();
		this.authored.normal?.dispose();
		this.map.dispose();
		this.farMaterial.dispose();
		if (this.clouds) {
			this.clouds.material.map?.dispose();
			this.clouds.material.dispose();
		}
		if (this.rings) {
			this.rings.material.map?.dispose();
			this.rings.material.dispose();
			this.rings.mesh.geometry.dispose();
		}
	}
}
