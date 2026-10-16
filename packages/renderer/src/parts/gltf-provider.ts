/**
 * Asset-backed part models (ADR 0028, ADR 0047): a `PartModelProvider` that loads glTF/GLB with
 * three's `GLTFLoader` for definitions whose visual is `kind: 'model'` with `params.url`, or that
 * the host lists by id. Assets load in `preload` (the host awaits it before the first snapshot);
 * a part whose asset is missing or fails to load is declined, so its `params.fallbackKind`
 * generator (or the shape) builds it instead. Compressed assets (Draco, KTX2) need their decoders
 * attached to `loader`; nothing in the stock content needs them yet.
 */
import { Box3, Group, Mesh, Object3D, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
	read?: AssetReader;
	/** Use a configured loader (decoders attached). */
	loader?: GLTFLoader;
}

/** A model that clones a cached glTF scene: geometry and materials are shared with the cache. */
class GltfModel implements PartModel {
	readonly root = new Group();
	readonly bounds: Box3;
	readonly triangles: number;

	constructor(
		scene: Object3D,
		readonly nodes: Readonly<Record<string, PartNode>>,
		definition: string
	) {
		this.root.name = `part:${definition}`;
		const clone = scene.clone(true);
		this.root.add(clone);
		this.root.updateMatrixWorld(true);
		this.bounds = new Box3().setFromObject(this.root);
		this.triangles = countTriangles(clone);
	}

	setState(_state: PartRuntimeState): void {}
	tick(_dt: number): void {}
	dispose(): void {}
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

export class GltfPartProvider implements PartModelProvider {
	readonly id = 'gltf';
	private readonly scenes = new Map<string, Object3D>();
	/** Definitions whose asset failed, with the reason (kept for diagnostics). */
	readonly failures = new Map<string, string>();
	private readonly loader: GLTFLoader;
	private readonly read: AssetReader;

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
			const data = await this.read(url);
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
		return new GltfModel(scene, request.attach ?? defaultNodes(request.shape), request.definition);
	}

	dispose(): void {
		for (const scene of this.scenes.values()) {
			scene.traverse((o) => {
				if (!(o instanceof Mesh)) return;
				o.geometry.dispose();
				const list: Material[] = Array.isArray(o.material) ? o.material : [o.material];
				for (const m of list) m.dispose();
			});
		}
		this.scenes.clear();
	}
}
