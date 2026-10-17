/**
 * Asset-backed part models (ADR 0028, ADR 0047, ADR 0076): a `PartModelProvider` that loads
 * glTF/GLB with three's `GLTFLoader`. A part's model comes from, in order, bytes the host handed
 * over for the definition (`assets`: what a mod package ships), a URL in `models`, or a
 * `visual.kind: 'model'` with `params.url`. Assets load in `preload` (the host awaits it before
 * the first model is made); a part whose asset is missing or fails to load is declined, so the
 * generator named by `visual.kind` (or `params.fallbackKind`) or else the shape builds it.
 *
 * An asset part behaves like a procedural one where it can: the engine plume (`visual.plume`),
 * the gimbal/hinge articulation (a node named `moving` is the part that turns, about its own
 * origin), temperature glow, shadows, and a bounds check against the part's shape and attach
 * nodes (warnings, nothing is rescaled). `visual.deploy` animations are not available to
 * assets. Compressed assets (Draco, KTX2) need decoders attached to `loader`; mod packages cannot
 * carry them (core `inspectGlb`).
 */
import {
	Box3,
	BufferGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	Euler,
	Vector3,
	type Material,
	type Texture
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glowEmissive } from '../effects/glow.ts';
import { PlumeEffect, createPlumeGeometry, createSpriteGeometry } from '../effects/plume-mesh.ts';
import { articulationRotation, articulationValue } from './articulation.ts';
import { assetFit } from './asset-fit.ts';
import { defaultNodes } from './factory.ts';
import type {
	PartModel,
	PartModelProvider,
	PartModelRequest,
	PartNode,
	PartRuntimeState
} from './types.ts';

/** Reads the asset at `url`: a `.glb` as bytes or a `.gltf` as JSON text. */
export type AssetReader = (url: string) => Promise<ArrayBuffer | string>;

const defaultReader: AssetReader = async (url) => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return url.toLowerCase().endsWith('.gltf') ? response.text() : response.arrayBuffer();
};

export interface GltfProviderOptions {
	/** Definition id to asset URL, for parts without `visual.kind: 'model'`. */
	models?: ReadonlyMap<string, string>;
	/** Definition id to the bytes of its `.glb` (a mod package's asset, already checked). */
	assets?: ReadonlyMap<string, Uint8Array>;
	read?: AssetReader;
	/** Use a configured loader (decoders attached). */
	loader?: GLTFLoader;
	/** Called once per definition and message when a model does not match its part (see `assetFit`). */
	onWarning?: (definition: string, message: string) => void;
}

/** Shared plume geometry for every asset model of a provider. */
interface SharedEffects {
	plume: BufferGeometry;
	sprite: BufferGeometry;
}

interface OwnedMaterial {
	material: MeshStandardMaterial;
	emissive: [number, number, number];
	intensity: number;
}

/** A model that clones a cached glTF scene: geometry and materials are shared with the cache. */
class GltfModel implements PartModel {
	readonly root = new Group();
	readonly bounds: Box3;
	readonly triangles: number;
	private readonly plume: PlumeEffect | null;
	private readonly pivot: Object3D | null;
	private readonly pivotRest = new Quaternion();
	private readonly meshes: Mesh[] = [];
	private owned: OwnedMaterial[] = [];
	private hot = false;
	private time = 0;
	private pressure = 0;
	private engine = { throttle: 0, ignited: false, flameout: false };

	constructor(
		scene: Object3D,
		readonly nodes: Readonly<Record<string, PartNode>>,
		readonly definition: string,
		private readonly visual: PartModelRequest['visual'],
		shared: SharedEffects
	) {
		this.root.name = `part:${definition}`;
		const clone = scene.clone(true);
		this.root.add(clone);
		clone.traverse((o) => {
			if (!(o instanceof Mesh)) return;
			o.castShadow = true;
			o.receiveShadow = true;
			this.meshes.push(o);
		});
		this.root.updateMatrixWorld(true);
		this.bounds = new Box3().setFromObject(this.root);
		this.triangles = countTriangles(clone);

		this.pivot = visual?.articulation ? (clone.getObjectByName('moving') ?? null) : null;
		if (this.pivot) this.pivotRest.copy(this.pivot.quaternion);
		this.plume = visual?.plume ? new PlumeEffect(visual.plume, shared.plume, shared.sprite) : null;
		if (this.plume) {
			// A gimballed engine's plume leaves along the thrust vector, so it hangs on the pivot.
			if (this.pivot && visual?.articulation?.mode === 'gimbal') {
				const at = new Vector3().setFromMatrixPosition(this.pivot.matrixWorld);
				this.plume.root.position.sub(at);
				this.pivot.add(this.plume.root);
			} else this.root.add(this.plume.root);
		}
	}

	setState(state: PartRuntimeState): void {
		this.pressure = state.ambientPressure ?? 0;
		if (this.plume) {
			const e = state.modules[this.plume.spec.module] as Record<string, unknown> | undefined;
			this.engine = {
				throttle: typeof e?.throttle === 'number' ? e.throttle : 0,
				ignited: e?.ignited === true,
				flameout: e?.flameout === true
			};
		}
		const articulation = this.visual?.articulation;
		if (this.pivot && articulation) {
			const r = articulationRotation(
				articulation.mode,
				articulationValue(articulation, state.modules)
			);
			this.pivot.quaternion
				.copy(this.pivotRest)
				.multiply(new Quaternion().setFromEuler(new Euler(r.x, r.y, r.z)));
		}
		this.applyGlow(state.temperature);
		this.plume?.update(this.engine, this.pressure, this.time);
	}

	tick(dt: number): void {
		this.time += dt;
		this.plume?.update(this.engine, this.pressure, this.time);
	}

	/** Glow needs per-part emissive: the part's materials are cloned the first time the skin is hot. */
	private applyGlow(temperature: number | undefined): void {
		const [r, g, b] = glowEmissive(temperature ?? 0);
		const glowing = r > 0;
		if (!glowing && !this.hot) return;
		if (glowing && this.owned.length === 0) this.cloneMaterials();
		for (const o of this.owned) {
			if (glowing) {
				o.material.emissive.setRGB(r, g, b);
				o.material.emissiveIntensity = 1;
			} else {
				o.material.emissive.setRGB(...o.emissive);
				o.material.emissiveIntensity = o.intensity;
			}
		}
		this.hot = glowing;
	}

	private cloneMaterials(): void {
		for (const mesh of this.meshes) {
			const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			const next = list.map((m) => {
				if (!(m instanceof MeshStandardMaterial)) return m;
				const clone = m.clone();
				this.owned.push({
					material: clone,
					emissive: [clone.emissive.r, clone.emissive.g, clone.emissive.b],
					intensity: clone.emissiveIntensity
				});
				return clone;
			});
			mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
		}
	}

	dispose(): void {
		for (const o of this.owned) o.material.dispose();
		this.owned = [];
		this.plume?.dispose();
	}
}

function countTriangles(root: Object3D): number {
	let n = 0;
	root.traverse((o) => {
		if (!(o instanceof Mesh)) return;
		const g = o.geometry;
		n += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
	});
	return n;
}

const TEXTURE_SLOTS = [
	'map',
	'normalMap',
	'roughnessMap',
	'metalnessMap',
	'emissiveMap',
	'aoMap'
] as const;

export class GltfPartProvider implements PartModelProvider {
	readonly id = 'gltf';
	private readonly scenes = new Map<string, Object3D>();
	/** Definitions whose asset failed, with the reason (kept for diagnostics). */
	readonly failures = new Map<string, string>();
	/** Fit warnings per definition (`assetFit`), filled when the first model of a part is made. */
	readonly warnings = new Map<string, string[]>();
	private readonly loader: GLTFLoader;
	private readonly read: AssetReader;
	private effects: SharedEffects | null = null;

	constructor(private readonly options: GltfProviderOptions = {}) {
		this.loader = options.loader ?? new GLTFLoader();
		this.read = options.read ?? defaultReader;
	}

	private urlOf(definition: string, visual: PartModelRequest['visual']): string | undefined {
		if (visual?.kind === 'model') {
			const url = visual.params?.url;
			if (typeof url === 'string' && url.length > 0) return url;
		}
		return this.options.models?.get(definition);
	}

	async preload(definitions: readonly string[]): Promise<void> {
		await Promise.all(
			definitions.map(async (definition) => {
				const bytes = this.options.assets?.get(definition);
				if (bytes) {
					await this.parse(definition, copyBuffer(bytes));
					return;
				}
				const url = this.options.models?.get(definition);
				if (url) await this.load(definition, url);
			})
		);
	}

	/** Loads the asset for a request the host knows by `visual.params.url` (call before the first `create`). */
	async preloadRequest(request: Pick<PartModelRequest, 'definition' | 'visual'>): Promise<void> {
		const url = this.urlOf(request.definition, request.visual);
		if (url) await this.load(request.definition, url);
	}

	private async load(definition: string, url: string): Promise<void> {
		if (this.scenes.has(definition) || this.failures.has(definition)) return;
		try {
			await this.parse(definition, await this.read(url));
		} catch (e) {
			this.failures.set(definition, e instanceof Error ? e.message : String(e));
		}
	}

	private async parse(definition: string, data: ArrayBuffer | string): Promise<void> {
		if (this.scenes.has(definition) || this.failures.has(definition)) return;
		try {
			const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) => {
				this.loader.parse(data, '', resolve, (e) =>
					reject(e instanceof Error ? e : new Error(String(e)))
				);
			});
			this.scenes.set(definition, gltf.scene);
		} catch (e) {
			this.failures.set(definition, e instanceof Error ? e.message : String(e));
		}
	}

	create(request: PartModelRequest): PartModel | null {
		const scene = this.scenes.get(request.definition);
		if (!scene) return null;
		this.effects ??= { plume: createPlumeGeometry(24), sprite: createSpriteGeometry() };
		const nodes = request.attach ?? defaultNodes(request.shape);
		const model = new GltfModel(scene, nodes, request.definition, request.visual, this.effects);
		if (!this.warnings.has(request.definition)) {
			const found = assetFit(
				{
					min: [model.bounds.min.x, model.bounds.min.y, model.bounds.min.z],
					max: [model.bounds.max.x, model.bounds.max.y, model.bounds.max.z]
				},
				request.shape,
				request.attach
			);
			if (request.visual?.deploy) {
				found.push('"deploy" animations are not available to model parts and are ignored');
			}
			if (request.visual?.articulation && !scene.getObjectByName('moving')) {
				found.push(
					'"articulation" needs a node named "moving" in the model; the part will not turn'
				);
			}
			this.warnings.set(request.definition, found);
			for (const message of found) this.options.onWarning?.(request.definition, message);
		}
		return model;
	}

	dispose(): void {
		for (const scene of this.scenes.values()) {
			scene.traverse((o) => {
				if (!(o instanceof Mesh)) return;
				o.geometry.dispose();
				const list: Material[] = Array.isArray(o.material) ? o.material : [o.material];
				for (const m of list) {
					for (const slot of TEXTURE_SLOTS) {
						const t = (m as unknown as Record<string, Texture | null | undefined>)[slot];
						t?.dispose();
					}
					m.dispose();
				}
			});
		}
		this.scenes.clear();
		this.effects?.plume.dispose();
		this.effects?.sprite.dispose();
		this.effects = null;
	}
}

/** A standalone `ArrayBuffer` of the bytes: the loader may keep it, and a view onto a big buffer must not be. */
function copyBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	return copy;
}
