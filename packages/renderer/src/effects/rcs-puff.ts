/**
 * RCS puffs (plan 211, ADR 0217; redrawn by plan 311 on the owner's "it should look like a
 * high-pressure jet"): at each firing nozzle a bright short core, and a stream of soft puffs that
 * leave it, grow and fade, as gas spreading into vacuum. Camera-facing sprites, not a cone: a cone
 * seen from the side reads as a hard beam of light. The core's geometry and material are shared by
 * every thruster; the puffs share ten materials.
 */
import {
	AdditiveBlending,
	BufferAttribute,
	Color,
	CylinderGeometry,
	DataTexture,
	LinearFilter,
	RGBAFormat,
	Sprite,
	SpriteMaterial,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Quaternion,
	Vector3,
	type BufferGeometry,
	type Material
} from 'three';

export interface PuffSpec {
	nozzles: ReadonlyArray<{
		pos: readonly [number, number, number];
		dir: readonly [number, number, number];
	}>;
	length?: number;
}

/**
 * An open cone 1 m long along +Y, its narrow end (radius `r0`) at the origin and `r1` at the far
 * end. Its UV `v` runs 0 at the nozzle to 1 at the far end, for the fade texture below.
 */
function fadingCone(r0: number, r1: number): BufferGeometry {
	const g = new CylinderGeometry(1, 1, 1, 14, 6, true);
	const pos = g.attributes.position as BufferAttribute;
	const uv = g.attributes.uv as BufferAttribute;
	for (let i = 0; i < pos.count; i++) {
		const t = pos.getY(i) + 0.5;
		const r = r0 + (r1 - r0) * t;
		pos.setXYZ(i, pos.getX(i) * r, t, pos.getZ(i) * r);
		uv.setY(i, t);
	}
	g.computeVertexNormals();
	return g;
}

/**
 * White at the nozzle fading to black at the far end, as `(1 - v)^fade`: with additive blending,
 * black adds nothing. A texture rather than vertex colours: both renderers sample it the same.
 */
function fadeTexture(fade: number): DataTexture {
	const n = 64;
	const data = new Uint8Array(n * 4);
	for (let i = 0; i < n; i++) {
		const c = Math.round(255 * Math.pow(1 - i / (n - 1), fade));
		data.set([c, c, c, 255], i * 4);
	}
	const tex = new DataTexture(data, 1, n, RGBAFormat);
	tex.magFilter = LinearFilter;
	tex.minFilter = LinearFilter;
	tex.needsUpdate = true;
	return tex;
}

/** The core: narrow, short and bright, the gas still dense at the nozzle. */
export function createPuffGeometry(): BufferGeometry {
	return fadingCone(0.014, 0.03);
}

export function createPuffMaterial(): Material {
	return new MeshBasicMaterial({
		// additive: dimmed by its colour, which both renderers honour (WebGPU ignored the opacity)
		color: new Color(0xffffff).multiplyScalar(0.7),
		map: fadeTexture(3),
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending
	});
}

/** A soft round puff: white in the middle fading to black at the rim (additive). */
let puffTexture: DataTexture | null = null;
function puffMap(): DataTexture {
	if (puffTexture) return puffTexture;
	const n = 32;
	const data = new Uint8Array(n * n * 4);
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const r = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2) / (n / 2);
			const c = Math.round(255 * Math.max(0, 1 - r) ** 2);
			data.set([c, c, c, 255], (y * n + x) * 4);
		}
	puffTexture = new DataTexture(data, n, n, RGBAFormat);
	puffTexture.magFilter = LinearFilter;
	puffTexture.minFilter = LinearFilter;
	puffTexture.needsUpdate = true;
	return puffTexture;
}

/** Puffs along a jet: fewer, bigger and fainter away from the nozzle. */
const PUFFS = 10;
let puffMaterials: SpriteMaterial[] | null = null;
function puffMaterialsOf(): SpriteMaterial[] {
	puffMaterials ??= Array.from(
		{ length: PUFFS },
		(_, k) =>
			new SpriteMaterial({
				map: puffMap(),
				color: new Color(0xdde8ff).multiplyScalar(0.22 * (1 - k / PUFFS) ** 1.3),
				transparent: true,
				depthWrite: false,
				blending: AdditiveBlending
			})
	);
	return puffMaterials;
}

const UP = new Vector3(0, 1, 0);

interface Jet {
	root: Object3D;
	core: Mesh;
	puffs: Sprite[];
	firing: number;
}

export class RcsPuffs {
	readonly root = new Object3D();
	private readonly jets: Jet[] = [];
	private readonly length: number;
	private time = 0;

	constructor(spec: PuffSpec, geometry: BufferGeometry, material: Material) {
		this.root.name = 'rcs-puffs';
		this.length = spec.length ?? 0.5;
		const materials = puffMaterialsOf();
		spec.nozzles.forEach((n) => {
			const root = new Object3D();
			root.position.set(n.pos[0], n.pos[1], n.pos[2]);
			// the jet leaves against the push
			const out = new Vector3(-n.dir[0], -n.dir[1], -n.dir[2]).normalize();
			root.quaternion.copy(new Quaternion().setFromUnitVectors(UP, out));
			root.visible = false;
			const coreMesh = new Mesh(geometry, material);
			coreMesh.name = 'plume-rcs';
			coreMesh.renderOrder = 12;
			const puffs = materials.map((m) => {
				const sprite = new Sprite(m);
				sprite.name = 'plume-rcs-puff';
				sprite.renderOrder = 11;
				return sprite;
			});
			root.add(coreMesh, ...puffs);
			this.root.add(root);
			this.jets.push({ root, core: coreMesh, puffs, firing: 0 });
		});
	}

	/** Show each jet by its firing fraction (0..1); a missing value hides it. */
	update(firing: readonly unknown[] | undefined): void {
		this.jets.forEach((jet, i) => {
			const f = typeof firing?.[i] === 'number' ? (firing[i] as number) : 0;
			jet.firing = f > 0.02 ? Math.min(1, f) : 0;
			jet.root.visible = jet.firing > 0;
		});
		this.shape();
	}

	/** The flicker: the puffs drift out and shiver every frame. */
	tick(dt: number): void {
		this.time += dt;
		if (this.jets.some((j) => j.firing > 0)) this.shape();
	}

	private shape(): void {
		this.jets.forEach((jet, i) => {
			if (jet.firing <= 0) return;
			const f = jet.firing;
			// two incommensurate waves per jet: no two jets shiver in step
			const shiver =
				1 + 0.12 * Math.sin(this.time * 61 + i * 2.3) + 0.08 * Math.sin(this.time * 97 + i * 5.1);
			const l = this.length * (0.5 + 0.5 * f) * shiver;
			// the dense core is a hand's width long whatever the jet's length
			jet.core.scale.set(1, Math.min(0.07, this.length * 0.15) * (0.6 + 0.4 * f) * shiver, 1);
			// the puffs stream outward: each slides along its slot and starts again at the nozzle
			const drift = (this.time * 6 + i * 0.37) % 1;
			jet.puffs.forEach((p, k) => {
				const t = (k + drift) / PUFFS;
				p.position.set(0, l * t, 0);
				const size = this.length * (0.1 + 0.45 * t) * (0.7 + 0.3 * f);
				p.scale.set(size, size, 1);
			});
		});
	}
}
