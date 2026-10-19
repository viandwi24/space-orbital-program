/**
 * Part model providers and the factory that asks them (ADR 0028). A provider claims a request
 * (return a model) or declines (`null`); the factory takes the first model in order, so an asset
 * provider placed before the procedural one overrides it.
 */
import type { PartVisual } from '@orbital/core';
import {
	BoxGeometry,
	Box3,
	BufferGeometry,
	CylinderGeometry,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	type Material
} from 'three';
import { glowEmissive } from '../effects/glow.ts';
import { PlumeEffect, createPlumeGeometry, createSpriteGeometry } from '../effects/plume-mesh.ts';
import { RcsPuffs, createPuffGeometry, createPuffMaterial } from '../effects/rcs-puff.ts';
import {
	articulationRotation,
	articulationScale,
	articulationValue,
	type ArticulationSpec
} from './articulation.ts';
import { GeometryBuilder, type BuiltGeometry, type SlotName } from './builder.ts';
import { registerStockGenerators } from './generators/index.ts';
import { revolve } from './revolve.ts';
import { shroudProfile } from './shroud.ts';
import { MaterialLibrary, NO_GLOW_SLOTS } from './materials.ts';
import {
	getPartGenerator,
	type DynamicPart,
	type GenContext,
	type GeneratedPart
} from './registry.ts';
import type {
	PartDetail,
	PartShape,
	PartModel,
	PartModelProvider,
	PartModelRequest,
	PartNode,
	PartRuntimeState,
	ProviderContext
} from './types.ts';

/** Nodes at the top and bottom face of a cylinder shape, used when the definition gives none. */
export function defaultNodes(shape: PartShape | undefined): Record<string, PartNode> {
	const h = shape?.kind === 'cylinder' ? shape.height : shape?.kind === 'box' ? shape.size.y : 1;
	return {
		top: { pos: [0, h / 2, 0], dir: [0, 1, 0] },
		bottom: { pos: [0, -h / 2, 0], dir: [0, -1, 0] }
	};
}

const clampNumber = (v: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, v));

function paramReader(visual: PartVisual): GenContext['param'] {
	return (name, fallback, min, max) => {
		const v = visual.params?.[name];
		return typeof v === 'number' && Number.isFinite(v) ? clampNumber(v, min, max) : fallback;
	};
}

/** Geometry every model of one provider shares; shrouds are keyed by part, segments and size. */
interface SharedGeometry {
	plumeGeometry: BufferGeometry;
	spriteGeometry: BufferGeometry;
	shrouds: Map<string, BufferGeometry>;
	puffGeometry: BufferGeometry;
	puffMaterial: Material;
}

interface Template {
	built: BuiltGeometry;
	/** The geometry that moves, when the generator made some (ADR 0045). */
	moving?: BuiltGeometry;
	generated: GeneratedPart;
	bounds: Box3;
	triangles: number;
}

/** A model assembled from a merged static mesh, optional animated pieces and effects. */
class ProceduralModel implements PartModel {
	readonly root = new Object3D();
	readonly bounds: Box3;
	readonly triangles: number;
	readonly staticMesh: Mesh;
	private readonly mesh: Mesh;
	private movingMesh: Mesh | null = null;
	private readonly dynamic: DynamicPart | null;
	private readonly pivot: Object3D | null = null;
	private readonly articulation: ArticulationSpec | undefined;
	private readonly plume: PlumeEffect | null;
	private readonly deploy: PartVisual['deploy'];
	private progress = 0;
	private target = 0;
	private fresh = true;
	private time = 0;
	private pressure = 0;
	private engine = { throttle: 0, ignited: false, flameout: false };
	private owned: Material[] = [];
	private hot = false;
	private shroudMesh: Mesh | null = null;
	private readonly puffs: RcsPuffs | null;
	private shroudSize: number | null = null;

	constructor(
		readonly definition: string,
		private readonly visual: PartVisual,
		private readonly template: Template,
		readonly nodes: Readonly<Record<string, PartNode>>,
		private readonly materials: MaterialLibrary,
		private readonly shared: SharedGeometry,
		private readonly segments: number
	) {
		this.root.name = `part:${definition}`;
		const mats = template.built.slots.map((s) => materials.get(s, visual.palette));
		this.mesh = new Mesh(template.built.geometry, mats);
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
		this.staticMesh = this.mesh;
		this.root.add(this.mesh);
		this.bounds = template.bounds.clone();
		this.triangles = template.triangles;
		this.deploy = visual.deploy;
		this.dynamic =
			template.generated.dynamic?.((slot) => materials.get(slot, visual.palette)) ?? null;
		if (this.dynamic) {
			this.root.add(this.dynamic.object);
			this.triangles += this.dynamic.triangles;
		}
		this.articulation = visual.articulation;
		const pivotAt = template.generated.pivot ?? [0, 0, 0];
		if (template.moving) {
			this.pivot = new Object3D();
			this.pivot.name = 'pivot';
			this.pivot.position.set(pivotAt[0], pivotAt[1], pivotAt[2]);
			const moving = new Mesh(
				template.moving.geometry,
				template.moving.slots.map((s) => materials.get(s, visual.palette))
			);
			moving.position.set(-pivotAt[0], -pivotAt[1], -pivotAt[2]);
			moving.castShadow = true;
			moving.receiveShadow = true;
			moving.name = 'moving';
			this.movingMesh = moving;
			this.pivot.add(moving);
			this.root.add(this.pivot);
			this.triangles += template.moving.triangles;
		}
		this.plume = visual.plume
			? new PlumeEffect(visual.plume, shared.plumeGeometry, shared.spriteGeometry)
			: null;
		this.puffs = visual.puffs
			? new RcsPuffs(visual.puffs, shared.puffGeometry, shared.puffMaterial)
			: null;
		if (this.puffs) this.root.add(this.puffs.root);
		if (this.plume) {
			// The plume belongs to the bell: it leaves along the thrust vector (ADR 0045).
			if (this.pivot && visual.articulation?.mode === 'gimbal') {
				this.plume.root.position.sub(this.pivot.position);
				this.pivot.add(this.plume.root);
			} else this.root.add(this.plume.root);
		}
	}

	get shroud(): number | null {
		return this.shroudSize;
	}

	setShroud(size: number | null): void {
		const spec = this.template.generated.shroud;
		if (!spec) return;
		const profile = shroudProfile(spec, size);
		const wanted = profile ? size : null;
		if (wanted === this.shroudSize) return;
		this.shroudMesh?.removeFromParent();
		this.shroudMesh = null;
		this.shroudSize = wanted;
		if (!profile || wanted === null) return;
		const key = `${this.definition}|${this.segments}|${wanted}`;
		let geometry = this.shared.shrouds.get(key);
		if (!geometry) {
			geometry = revolve(profile, { segments: this.segments, tile: 1 });
			this.shared.shrouds.set(key, geometry);
		}
		const mesh = new Mesh(geometry, this.materials.get('paint-primary', this.visual.palette));
		mesh.name = 'shroud';
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.shroudMesh = mesh;
		this.root.add(mesh);
	}

	setState(state: PartRuntimeState): void {
		if (this.deploy) {
			const flag = (state.modules[this.deploy.module] as Record<string, unknown> | undefined)?.[
				this.deploy.flag
			];
			// a boolean (legs out), or how far open, 0..1 (a parachute's canopy, plan 209)
			this.target =
				flag === true ? 1 : typeof flag === 'number' ? Math.min(1, Math.max(0, flag)) : 0;
			if (this.fresh) this.progress = this.target;
		}
		this.fresh = false;
		this.pressure = state.ambientPressure ?? 0;
		if (this.plume) {
			const e = state.modules[this.plume.spec.module] as Record<string, unknown> | undefined;
			this.engine = {
				throttle: typeof e?.throttle === 'number' ? e.throttle : 0,
				ignited: e?.ignited === true,
				flameout: e?.flameout === true
			};
		}
		if (this.pivot && this.articulation) {
			const value = articulationValue(this.articulation, state.modules);
			const r = articulationRotation(this.articulation.mode, value);
			this.pivot.rotation.set(r.x, r.y, r.z);
			this.pivot.scale.y = articulationScale(this.articulation.mode, value);
		}
		if (this.puffs && this.visual.puffs) {
			const m = state.modules[this.visual.puffs.module] as Record<string, unknown> | undefined;
			const f = m?.[this.visual.puffs.field];
			this.puffs.update(Array.isArray(f) ? f : undefined);
		}
		this.applyGlow(state.temperature);
		this.dynamic?.animate(this.progress);
		this.plume?.update(this.engine, this.pressure, this.time);
	}

	tick(dt: number): void {
		this.time += dt;
		if (this.deploy && this.progress !== this.target) {
			const seconds = this.deploy.seconds ?? 1.2;
			const step = dt / seconds;
			this.progress =
				this.target > this.progress
					? Math.min(this.target, this.progress + step)
					: Math.max(this.target, this.progress - step);
			this.dynamic?.animate(this.progress);
		}
		this.plume?.update(this.engine, this.pressure, this.time);
	}

	/** Temperature glow needs per-part emissive, so materials are cloned the first time the skin is hot. */
	private applyGlow(temperature: number | undefined): void {
		const [r, g, b] = glowEmissive(temperature ?? 0);
		const glowing = r > 0;
		if (!glowing && !this.hot) return;
		if (glowing && this.owned.length === 0) this.cloneMaterials();
		for (const m of this.owned) {
			const std = m as MeshStandardMaterial;
			std.emissive.setRGB(r, g, b);
			std.emissiveIntensity = 1;
		}
		this.hot = glowing;
	}

	private cloneMaterials(): void {
		const targets: Mesh[] = [this.mesh];
		if (this.movingMesh) targets.push(this.movingMesh);
		if (this.shroudMesh) targets.push(this.shroudMesh);
		this.dynamic?.object.traverse((o) => {
			if (o instanceof Mesh) targets.push(o);
		});
		for (const mesh of targets) {
			const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			const next = list.map((m) => {
				if (NO_GLOW_SLOTS.has(m.userData.slot as SlotName)) return m;
				const clone = m.clone();
				this.owned.push(clone);
				return clone;
			});
			mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
		}
	}

	dispose(): void {
		for (const m of this.owned) m.dispose();
		this.owned = [];
		this.plume?.dispose();
		this.dynamic?.dispose();
	}
}

/** The generators in `parts/generators`, selected by `visual.kind`. */
export class ProceduralProvider implements PartModelProvider {
	readonly id = 'procedural';
	private readonly templates = new Map<string, Template>();
	private readonly shared: SharedGeometry = {
		plumeGeometry: createPlumeGeometry(24),
		spriteGeometry: createSpriteGeometry(),
		shrouds: new Map(),
		puffGeometry: createPuffGeometry(),
		puffMaterial: createPuffMaterial()
	};

	constructor() {
		registerStockGenerators();
	}

	create(request: PartModelRequest, context: ProviderContext): PartModel | null {
		const { visual, shape } = request;
		if (!visual || !shape) return null;
		// An asset part whose model did not load falls back to the generator it names (ADR 0047).
		const fallback = visual.params?.fallbackKind;
		const kind = visual.kind === 'model' && typeof fallback === 'string' ? fallback : visual.kind;
		const generator = getPartGenerator(kind);
		if (!generator) return null;
		const key = `${request.definition}|${request.detail.segments}|${request.detail.extras}`;
		let template = this.templates.get(key);
		if (!template) {
			const builder = new GeometryBuilder({
				segments: request.detail.segments,
				tile: 1
			});
			const moving = new GeometryBuilder({ segments: request.detail.segments, tile: 1 });
			const generated =
				generator({
					radius:
						shape.kind === 'cylinder' ? shape.radius : Math.max(shape.size.x, shape.size.z) / 2,
					height: shape.kind === 'cylinder' ? shape.height : shape.size.y,
					size:
						shape.kind === 'cylinder'
							? [shape.radius * 2, shape.height, shape.radius * 2]
							: [shape.size.x, shape.size.y, shape.size.z],
					visual,
					detail: request.detail,
					builder,
					moving,
					param: paramReader(visual)
				}) ?? {};
			const built = builder.build();
			built.geometry.computeBoundingBox();
			const movingBuilt = moving.isEmpty ? undefined : moving.build();
			const bounds = built.geometry.boundingBox!.clone();
			if (movingBuilt) {
				movingBuilt.geometry.computeBoundingBox();
				bounds.union(movingBuilt.geometry.boundingBox!);
			}
			template = {
				built,
				...(movingBuilt ? { moving: movingBuilt } : {}),
				generated,
				bounds,
				triangles: built.triangles
			};
			this.templates.set(key, template);
		}
		return new ProceduralModel(
			request.definition,
			visual,
			template,
			request.attach ?? defaultNodes(shape),
			context.materials,
			this.shared,
			request.detail.segments
		);
	}

	dispose(): void {
		for (const t of this.templates.values()) {
			t.built.geometry.dispose();
			t.moving?.geometry.dispose();
		}
		this.templates.clear();
		this.shared.plumeGeometry.dispose();
		this.shared.spriteGeometry.dispose();
		for (const g of this.shared.shrouds.values()) g.dispose();
		this.shared.shrouds.clear();
		this.shared.puffGeometry.dispose();
		this.shared.puffMaterial.dispose();
	}
}

/** The plain box/cylinder of the part's `shape` (a 1 m box without one): the pre-plan-020 look. */
export class ShapeProvider implements PartModelProvider {
	readonly id = 'shape';
	private readonly geometries = new Map<string, BufferGeometry>();
	private readonly material = new MeshStandardMaterial({
		color: 0xcfd8dc,
		metalness: 0.35,
		roughness: 0.5
	});

	create(request: PartModelRequest): PartModel {
		const shape = request.shape;
		let g = this.geometries.get(request.definition);
		if (!g) {
			g =
				shape?.kind === 'cylinder'
					? new CylinderGeometry(shape.radius, shape.radius, shape.height, 24)
					: shape?.kind === 'box'
						? new BoxGeometry(shape.size.x, shape.size.y, shape.size.z)
						: new BoxGeometry(1, 1, 1);
			this.geometries.set(request.definition, g);
		}
		const mesh = new Mesh(g, this.material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		g.computeBoundingBox();
		return {
			root: mesh,
			bounds: g.boundingBox!.clone(),
			nodes: request.attach ?? defaultNodes(shape),
			triangles: g.index ? g.index.count / 3 : g.getAttribute('position').count / 3,
			setState() {},
			tick() {},
			dispose() {}
		};
	}

	dispose(): void {
		for (const g of this.geometries.values()) g.dispose();
		this.geometries.clear();
		this.material.dispose();
	}
}

export interface PartModelFactoryConfig {
	/** Physics shapes by definition id (`PartDefinition.shape`). */
	shapes: ReadonlyMap<string, PartShape>;
	/** Visual descriptors by definition id (`PartDefinition.visual`). */
	visuals?: ReadonlyMap<string, PartVisual>;
	/** Attach nodes by definition id; the top/bottom faces of the shape are used when missing. */
	attach?: ReadonlyMap<string, Readonly<Record<string, PartNode>>>;
	/** Consulted before the built-in providers (asset-backed providers go here). */
	providers?: readonly PartModelProvider[];
	detail: PartDetail;
}

/**
 * Builds part models for definition ids without any snapshot: the scene uses it per part, and
 * plan 022 (VAB view, catalogue icons) calls `create` for a single part or a whole design.
 */
export class PartModelFactory {
	readonly materials: MaterialLibrary;
	private readonly procedural = new ProceduralProvider();
	private readonly shape = new ShapeProvider();
	private readonly providers: PartModelProvider[];
	private detail: PartDetail;

	constructor(private readonly config: PartModelFactoryConfig) {
		this.detail = config.detail;
		this.materials = new MaterialLibrary(config.detail.textureSize);
		this.providers = [...(config.providers ?? []), this.procedural, this.shape];
	}

	get currentDetail(): PartDetail {
		return this.detail;
	}

	/** `options.detail` overrides the preset's detail for this model (see `repeatedDetail`). */
	create(definition: string, options: { detail?: PartDetail } = {}): PartModel {
		const request: PartModelRequest = {
			definition,
			shape: this.config.shapes.get(definition),
			visual: this.config.visuals?.get(definition),
			attach: this.config.attach?.get(definition),
			detail: options.detail ?? this.detail
		};
		for (const provider of this.providers) {
			const model = provider.create(request, { materials: this.materials });
			if (model) return model;
		}
		throw new Error(`No part model provider handled "${definition}"`);
	}

	/** Awaits every provider's `preload` (asset loading) for the given definitions. */
	async preload(definitions: readonly string[]): Promise<void> {
		await Promise.all(this.providers.map((p) => p.preload?.(definitions)));
	}

	dispose(): void {
		this.procedural.dispose();
		this.shape.dispose();
		this.materials.dispose();
	}
}
