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
	MeshLambertMaterial,
	Object3D,
	RepeatWrapping,
	RingGeometry,
	SRGBColorSpace,
	ClampToEdgeWrapping,
	type BufferGeometry,
	type Texture
} from 'three';
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

export class BodyDress {
	readonly root = new Object3D();
	/** The colour map the body is drawn with now. */
	map: DataTexture;
	/** The far sphere (or a giant's only sphere), drawn with `map`. */
	readonly far: Mesh;
	private readonly farMaterial: MeshLambertMaterial;
	private readonly clouds: { mesh: Mesh; material: MeshLambertMaterial; altitude: number } | null;
	private readonly rings: Mesh | null;
	private readonly seed: number;
	private bake: { data: Uint8Array; row: number } | null = null;
	private full = false;
	private readonly listeners: ((map: Texture) => void)[] = [];

	constructor(
		readonly id: string,
		readonly radius: number,
		readonly look: BodyAppearance,
		sphere: BufferGeometry
	) {
		this.root.name = `dress:${id}`;
		this.seed = lookSeed(id);
		const small = LOOK_MAP_SMALL;
		const data = new Uint8Array(small.width * small.height * 4);
		surfaceRows(look, this.seed, small, data, 0, small.height);
		this.map = mapTexture(data, small.width, small.height);
		this.farMaterial = new MeshLambertMaterial({ map: this.map });
		this.far = new Mesh(sphere, this.farMaterial);
		this.far.name = `far:${id}`;
		this.far.scale.setScalar(radius);
		this.root.add(this.far);
		if (look.clouds) {
			const size = { width: 256, height: 128 };
			const material = new MeshLambertMaterial({
				map: mapTexture(cloudMap(look.clouds, this.seed, size), size.width, size.height),
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
			const mesh = new Mesh(
				ringGeometry(look.rings.inner, look.rings.outer),
				new MeshLambertMaterial({
					map: strip,
					transparent: true,
					depthWrite: false,
					side: DoubleSide
				})
			);
			mesh.name = `rings:${id}`;
			mesh.renderOrder = 3;
			this.root.add(mesh);
			this.rings = mesh;
		} else this.rings = null;
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
	 * Once a frame: `px` the body's radius on screen, `altitude` the camera's height over the ground
	 * (m). Bakes a slice of the full map once the body is near; fades the cloud deck out below it.
	 * Returns whether this frame spent its baking budget (so the caller bakes one body a frame).
	 */
	frame(px: number, altitude: number, mayBake: boolean): boolean {
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
			surfaceRows(this.look, this.seed, size, this.bake.data, this.bake.row, this.bake.row + 4);
			this.bake.row += 4;
		}
		if (this.bake.row >= size.height) {
			const old = this.map;
			this.map = mapTexture(this.bake.data, size.width, size.height);
			this.farMaterial.map = this.map;
			for (const l of this.listeners) l(this.map);
			old.dispose();
			this.bake = null;
			this.full = true;
		}
		return true;
	}

	dispose(): void {
		this.map.dispose();
		this.farMaterial.dispose();
		if (this.clouds) {
			this.clouds.material.map?.dispose();
			this.clouds.material.dispose();
		}
		if (this.rings) {
			const m = this.rings.material as MeshLambertMaterial;
			m.map?.dispose();
			m.dispose();
			this.rings.geometry.dispose();
		}
	}
}
