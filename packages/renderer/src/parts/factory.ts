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
import { GeometryBuilder, type BuiltGeometry, type SlotName } from './builder.ts';
import { registerStockGenerators } from './generators/index.ts';
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

interface Template {
	built: BuiltGeometry;
	generated: GeneratedPart;
	bounds: Box3;
	triangles: number;
}

/** A model assembled from a merged static mesh, optional animated pieces and effects. */
class ProceduralModel implements PartModel {
	readonly root = new Object3D();
	readonly bounds: Box3;
	readonly triangles: number;
	private readonly mesh: Mesh;
	private readonly dynamic: DynamicPart | null;
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

	constructor(
		readonly definition: string,
		visual: PartVisual,
		template: Template,
		readonly nodes: Readonly<Record<string, PartNode>>,
		materials: MaterialLibrary,
		shared: { plumeGeometry: BufferGeometry; spriteGeometry: BufferGeometry }
	) {
		this.root.name = `part:${definition}`;
		const mats = template.built.slots.map((s) => materials.get(s, visual.palette));
		this.mesh = new Mesh(template.built.geometry, mats);
		this.mesh.castShadow = true;
		this.mesh.receiveShadow = true;
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
		this.plume = visual.plume
			? new PlumeEffect(visual.plume, shared.plumeGeometry, shared.spriteGeometry)
			: null;
		if (this.plume) this.root.add(this.plume.root);
	}

	setState(state: PartRuntimeState): void {
		if (this.deploy) {
			const flag = (state.modules[this.deploy.module] as Record<string, unknown> | undefined)?.[
				this.deploy.flag
			];
			this.target = flag === true ? 1 : 0;
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
	private readonly shared = {
		plumeGeometry: createPlumeGeometry(24),
		spriteGeometry: createSpriteGeometry()
	};

	constructor() {
		registerStockGenerators();
	}

	create(request: PartModelRequest, context: ProviderContext): PartModel | null {
		const { visual, shape } = request;
		if (!visual || shape?.kind !== 'cylinder') return null;
		const generator = getPartGenerator(visual.kind);
		if (!generator) return null;
		const key = `${request.definition}|${request.detail.segments}|${request.detail.extras}`;
		let template = this.templates.get(key);
		if (!template) {
			const builder = new GeometryBuilder({
				segments: request.detail.segments,
				tile: 1
			});
			const generated =
				generator({
					radius: shape.radius,
					height: shape.height,
					visual,
					detail: request.detail,
					builder,
					param: paramReader(visual)
				}) ?? {};
			const built = builder.build();
			built.geometry.computeBoundingBox();
			template = {
				built,
				generated,
				bounds: built.geometry.boundingBox!.clone(),
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
			this.shared
		);
	}

	dispose(): void {
		for (const t of this.templates.values()) t.built.geometry.dispose();
		this.templates.clear();
		this.shared.plumeGeometry.dispose();
		this.shared.spriteGeometry.dispose();
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

	create(definition: string): PartModel {
		const request: PartModelRequest = {
			definition,
			shape: this.config.shapes.get(definition),
			visual: this.config.visuals?.get(definition),
			attach: this.config.attach?.get(definition),
			detail: this.detail
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
