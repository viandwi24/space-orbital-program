/**
 * The 3D view of the vehicle assembly building (plan 022, ADR 0029). A plain class: the page hands
 * it a declarative `VabScene` and pointer positions, it owns the WebGL renderer, the hangar, the
 * part models, the orbit camera, picking, node markers and the rendering of catalogue icons.
 */
import {
	ACESFilmicToneMapping,
	Box3,
	Color,
	DirectionalLight,
	FogExp2,
	Group,
	HalfFloatType,
	HemisphereLight,
	Object3D,
	OrthographicCamera,
	PCFShadowMap,
	PMREMGenerator,
	PerspectiveCamera,
	PointLight,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	WebGLRenderer,
	CanvasTexture,
	SRGBColorSpace,
	SpotLight,
	MeshStandardMaterial,
	Mesh,
	BoxGeometry,
	Quaternion
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { hangarDetail } from '../presets.ts';
import { ConnectorBars } from '../parts/connector.ts';
import { PartModelFactory, type PartModelFactoryConfig } from '../parts/factory.ts';
import {
	repeatedDetail,
	type PartModel,
	type PartModelProvider,
	type PartNode,
	type PartShape
} from '../parts/types.ts';
import type { PartVisual } from '@orbital/core';
import { HANGAR, createHangar, type Hangar } from './hangar.ts';
import { HighlightMaterials, NodeMarkerKit, pulseMarkers } from './highlight.ts';
import { PartLayer } from './part-layer.ts';
import {
	BAY_SIGN,
	SIGN_ATLAS,
	paintBaySign,
	paintSignAtlas,
	type SignContext
} from './hangar-signs.ts';
import { StabilityMarkerKit } from './stability-markers.ts';
import { frameIcon } from './icons.ts';
import {
	approach,
	approachCamera,
	maxDistanceInRoom,
	frameDistance,
	initialCamera,
	orbit,
	pan,
	cameraPosition,
	focus,
	raise,
	zoom,
	type VabCameraState
} from './orbit-camera.ts';
import { pickNode, toNdc, worldNormalOf, type PickRay } from './picking.ts';
import {
	EMPTY_SCENE,
	applyPartTurn,
	floorShift,
	repeatedDefinitions,
	sameMarkers,
	type VabMarker,
	type VabNode,
	type VabScene
} from './scene-model.ts';

export interface VabViewConfig {
	canvas: HTMLCanvasElement;
	shapes: ReadonlyMap<string, PartShape>;
	visuals?: ReadonlyMap<string, PartVisual>;
	attach?: ReadonlyMap<string, Readonly<Record<string, PartNode>>>;
	/** Consulted before the procedural generators: asset-backed models of mod parts (ADR 0076). */
	providers?: readonly PartModelProvider[];
	/** Definitions shown lying on trestles at the side of the hangar (decor). */
	props?: readonly string[];
	/** `high` is the default; `low` drops the post chain, shadows' size and dust. */
	quality?: 'low' | 'high';
	/** `prefers-reduced-motion`: no pulsing rings or highlights, the camera and the stack jump instead of easing. */
	reducedMotion?: boolean;
	/** Daylight of the hangar, 0 = dawn to 1 = dusk (`high` only); default a fixed afternoon. */
	timeOfDay?: number;
}

export type VabHit =
	| { kind: 'node'; key: string }
	/** `point` is where the ray meets the part, in the design frame of its group (root origin, vessel axes), metres. */
	| {
			kind: 'part';
			key: string;
			point: [number, number, number];
			/** The face's outward normal in the group's frame (plan 217); absent for a hit without a face. */
			normal?: [number, number, number];
	  }
	| { kind: 'ghost' };

export interface VabStats {
	/** Milliseconds the last frames spent in `render` on the CPU side (moving average). */
	renderMs: number;
	/** Frames per second from the animation loop (moving average). */
	fps: number;
	/** Draw calls and triangles of the last frame as WebGL counted them: hangar, vessel and shadow pass together. */
	drawCalls: number;
	triangles: number;
	/** The vessels alone, colour and shadow pass (deterministic, as of the last scene change). */
	vesselDrawCalls: number;
	vesselTriangles: number;
	/** Parts drawn as an instance of a shared mesh. */
	instancedParts: number;
}

/** Top of the assembly platform, metres: the vessel stands on it. */
const PLATFORM_TOP = 0.3;
const FOV = 38;
/** Direction from a vessel to the thumbnail camera: from the front-right, slightly above. */
const THUMBNAIL_DIR = new Vector3(0.55, 0.22, 0.8).normalize();

export class VabView {
	readonly stats: VabStats = {
		renderMs: 0,
		fps: 0,
		drawCalls: 0,
		triangles: 0,
		vesselDrawCalls: 0,
		vesselTriangles: 0,
		instancedParts: 0
	};
	/** Resolves when the hangar lettering is drawn (needs the page fonts). */
	readonly ready: Promise<void>;

	private readonly gl: WebGLRenderer;
	private readonly scene = new Scene();
	private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 400);
	private readonly hangar: Hangar;
	private readonly factory: PartModelFactory;
	private readonly highlights = new HighlightMaterials();
	private readonly markerKit = new NodeMarkerKit();
	private readonly raycaster = new Raycaster();
	private readonly key: DirectionalLight;
	private readonly rimLight: DirectionalLight;
	private readonly fill: HemisphereLight;
	private readonly glowLight: PointLight;
	private readonly layer: PartLayer;
	private readonly glyphKit = new StabilityMarkerKit();
	private readonly glyphs = new Map<string, Mesh>();
	private markerList: readonly VabMarker[] = [];
	private highContrast = false;
	private reduced: boolean;
	private readonly props = new Group();
	private readonly trestleGeometry = new BoxGeometry(0.2, 0.55, 1);
	private readonly trestleMaterial = new MeshStandardMaterial({
		color: 0xe3a61f,
		roughness: 0.5,
		metalness: 0.3
	});
	private readonly signTextures: CanvasTexture[] = [];
	private composer: EffectComposer | null = null;
	private bloom: UnrealBloomPass | null = null;
	private env: WebGLRenderTarget | null = null;
	private iconScene: Scene | null = null;

	private nodes: VabNode[] = [];
	private readonly markers = new Map<string, Object3D>();
	private sceneModel: VabScene = EMPTY_SCENE;
	private hover: string | null = null;
	private selected = new Set<string>();
	private flagged = new Set<string>();

	private cam: VabCameraState = initialCamera();
	private goal: VabCameraState = initialCamera();
	private follow = true;
	private width = 1;
	private height = 1;
	private insets = { left: 0, right: 0, top: 0, bottom: 0 };
	private time = 0;
	private raf = 0;
	private last = 0;
	private readonly quality: 'low' | 'high';
	private disposed = false;

	constructor(private readonly config: VabViewConfig) {
		this.quality = config.quality ?? 'high';
		this.reduced = config.reducedMotion === true;
		this.gl = new WebGLRenderer({
			canvas: config.canvas,
			antialias: true,
			alpha: true,
			powerPreference: 'high-performance'
		});
		this.gl.info.autoReset = false;
		this.gl.toneMapping = ACESFilmicToneMapping;
		this.gl.toneMappingExposure = 1.0;
		this.gl.shadowMap.enabled = this.quality === 'high';
		this.gl.shadowMap.type = PCFShadowMap;
		this.gl.setClearColor(0x0b1118, 1);

		const factoryConfig: PartModelFactoryConfig = {
			shapes: config.shapes,
			visuals: config.visuals,
			attach: config.attach,
			providers: config.providers,
			detail: hangarDetail(this.quality)
		};
		this.factory = new PartModelFactory(factoryConfig);
		this.layer = new PartLayer(this.factory, this.highlights, config.visuals);

		this.scene.background = new Color(0x0b1118);
		this.scene.fog = new FogExp2(0x172029, 0.006);
		this.hangar = createHangar({
			dust: this.quality === 'high' ? 300 : 0,
			textureSize: 512,
			quality: this.quality,
			timeOfDay: config.timeOfDay,
			reducedMotion: config.reducedMotion
		});
		this.scene.add(this.hangar.root);

		// Lights: a warm key from above and in front with shadows, a cool rim from behind, a sky/ground fill
		// and a small accent light over the platform so the lower stack picks up the ring's colour.
		this.key = new DirectionalLight(0xfff1de, 2.0);
		// A subtle time-of-day tint: the work-light key leans warm towards dawn and dusk.
		if (this.quality === 'high')
			this.key.color.lerp(new Color(0xffb584), 0.3 * this.hangar.daylight.warmth);
		this.key.position.set(11, 38, 18);
		this.key.target.position.set(0, 6, 0);
		this.key.castShadow = this.quality === 'high';
		this.key.shadow.mapSize.set(2048, 2048);
		this.key.shadow.bias = -0.0004;
		this.key.shadow.normalBias = 0.03;
		this.scene.add(this.key, this.key.target);
		const rim = new DirectionalLight(0x9ec8ff, 0.6);
		this.rimLight = rim;
		rim.position.set(-16, 20, -22);
		rim.target.position.set(0, 6, 0);
		this.scene.add(rim, rim.target);
		this.fill = new HemisphereLight(0xb7cdea, 0x2a2118, 0.15);
		this.scene.add(this.fill);
		const glow = new PointLight(0x5ccfff, 6, 14, 1.6);
		this.glowLight = glow;
		glow.position.set(0, 0.9, 0);
		this.scene.add(glow);

		// The hero light: a spot straight above the platform, soft edged, so the vessel stands in a pool of light.
		const spot = new SpotLight(0xfff4e6, 900, 70, 0.34, 0.7, 1.6);
		spot.position.set(0.5, 40, 1.5);
		spot.target.position.set(0, 3, 0);
		this.scene.add(spot, spot.target);
		this.scene.add(this.layer.root);
		for (const light of this.hangar.workLights) this.scene.add(light);
		this.scene.add(this.props);
		this.buildProps(config.props ?? []);
		this.bakeEnvironment();

		if (this.quality === 'high') this.buildComposer();
		this.ready = this.drawSign();
	}

	// --- environment and decoration -------------------------------------------------------------------------

	/** Renders the hangar itself into the environment map, so paint and metal reflect its lamps and walls. */
	private bakeEnvironment(): void {
		const envScene = new Scene();
		envScene.background = new Color(0x0b1118);
		envScene.add(this.hangar.root);
		envScene.add(new HemisphereLight(0xc4d8f2, 0x3a3f46, 2.2));
		const lights: PointLight[] = [];
		for (const [x, y, z] of this.hangar.lamps) {
			if ((Math.round(x / 12) + Math.round(z / 13)) % 2 !== 0) continue;
			const l = new PointLight(0xfff0d8, 3600, 0, 2);
			l.position.set(x, y - 2, z);
			lights.push(l);
			envScene.add(l);
		}
		const pmrem = new PMREMGenerator(this.gl);
		this.env = pmrem.fromScene(envScene, 0.025, 0.1, 200, {
			size: 256,
			position: new Vector3(0, 7, 3)
		});
		pmrem.dispose();
		this.scene.add(this.hangar.root);
		for (const l of lights) l.removeFromParent();
		this.scene.environment = this.env.texture;
		this.scene.environmentIntensity = 0.25;
	}

	private buildProps(definitions: readonly string[]): void {
		// Spare parts lying on trestles at the side: scale and a reason for the room to exist.
		let z = 11;
		for (const [i, definition] of definitions.entries()) {
			const model = this.factory.create(definition);
			model.setState({ modules: {}, ambientPressure: 101_325 });
			const holder = new Group();
			model.root.rotation.z = Math.PI / 2;
			const box = new Box3().setFromObject(model.root);
			holder.add(model.root);
			holder.position.set(i % 2 === 0 ? -14.5 : 15.5, -box.min.y + 0.55, z);
			holder.rotation.y = i % 2 === 0 ? 0.12 : -0.2;
			// Two trestles under it.
			const size = box.getSize(new Vector3());
			const mid = box.getCenter(new Vector3());
			for (const f of [-0.3, 0.3]) {
				const trestle = new Mesh(this.trestleGeometry, this.trestleMaterial);
				trestle.scale.set(1, 1, Math.max(0.8, size.z * 0.9));
				trestle.position.set(mid.x + f * size.x, box.min.y - 0.275, mid.z);
				trestle.castShadow = true;
				trestle.receiveShadow = true;
				holder.add(trestle);
			}
			this.props.add(holder);
			z -= 3.4;
		}
	}

	/**
	 * Paints the hangar's lettering and column plates once the UI fonts are loaded (needs a DOM):
	 * the bay sign over the door and on the back wall, and the number / safety atlas on the columns.
	 * The signs are emissive so they read from the default camera without a light of their own.
	 */
	private async drawSign(): Promise<void> {
		if (typeof document === 'undefined') return;
		try {
			await document.fonts?.load('700 100px "Barlow Semi Condensed"');
			await document.fonts?.load('500 100px "Barlow Semi Condensed"');
		} catch {
			// fall back to the system condensed face
		}
		if (this.disposed) return;
		const texture = (
			width: number,
			height: number,
			paint: (ctx: SignContext) => void
		): CanvasTexture | null => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			paint(ctx);
			const map = new CanvasTexture(canvas);
			map.colorSpace = SRGBColorSpace;
			map.anisotropy = 8;
			this.signTextures.push(map);
			return map;
		};
		const bay = texture(BAY_SIGN.width, BAY_SIGN.height, paintBaySign);
		if (bay) {
			for (const name of ['sign', 'sign-wall']) {
				const mesh = this.hangar.root.getObjectByName(name) as Mesh | undefined;
				if (!mesh) continue;
				const old = mesh.material as MeshStandardMaterial;
				mesh.material = new MeshStandardMaterial({
					color: 0xffffff,
					map: bay,
					emissive: new Color(0xffffff),
					emissiveMap: bay,
					emissiveIntensity: 1.6,
					roughness: 0.6
				});
				old.dispose();
			}
		}
		const atlas = texture(SIGN_ATLAS.width, SIGN_ATLAS.height, paintSignAtlas);
		const plates = this.hangar.root.getObjectByName('plates') as Mesh | undefined;
		if (atlas && plates) {
			const old = plates.material as MeshStandardMaterial;
			plates.material = new MeshStandardMaterial({
				color: 0xffffff,
				map: atlas,
				emissive: new Color(0xffffff),
				emissiveMap: atlas,
				emissiveIntensity: 0.55,
				roughness: 0.55
			});
			old.dispose();
		}
	}

	private buildComposer(): void {
		const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
		this.composer = new EffectComposer(this.gl, target);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.2, 0.5, 1.3);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
	}

	// --- scene -----------------------------------------------------------------------------------------------

	setScene(next: VabScene): void {
		this.layer.sync(next);
		this.sceneModel = next;
		this.hangar.setVesselRadius(this.vesselRadius());
		this.applyHighlights();
		this.rebuildMarkers(next.nodes);
		this.rebuildGlyphs(next.markers ?? []);
		this.updateFloorShifts();
		this.updateCameraGoal();
	}

	/** The widest reach of the design (the `main` group) from the platform axis, m; null when empty. */
	private vesselRadius(): number | null {
		const main = this.layer.groups.get('main');
		if (!main) return null;
		const box = new Box3().setFromObject(main.object);
		if (box.isEmpty()) return null;
		const at = main.object.getWorldPosition(new Vector3());
		return Math.max(
			Math.abs(box.min.x - at.x),
			Math.abs(box.max.x - at.x),
			Math.abs(box.min.z - at.z),
			Math.abs(box.max.z - at.z)
		);
	}

	private rebuildMarkers(nodes: readonly VabNode[]): void {
		for (const m of this.markers.values()) m.removeFromParent();
		this.markers.clear();
		this.nodes = [...nodes];
		for (const n of nodes) {
			const group = this.layer.groups.get(n.group);
			if (!group) continue;
			const marker = this.markerKit.create(n);
			marker.userData.nodeKey = n.key;
			group.markers.add(marker);
			this.markers.set(n.key, marker);
		}
	}

	/** Stability glyphs (centre of mass and pressure) are re-created only when the list changes. */
	private rebuildGlyphs(list: readonly VabMarker[]): void {
		if (sameMarkers(this.markerList, list) && [...this.glyphs.values()].every((m) => m.parent)) {
			return;
		}
		for (const m of this.glyphs.values()) m.removeFromParent();
		this.glyphs.clear();
		this.markerList = [...list];
		for (const marker of list) {
			const group = this.layer.groups.get(marker.group);
			if (!group) continue;
			const mesh = this.glyphKit.create(marker);
			mesh.position.set(...marker.position);
			group.glyphs.add(mesh);
			this.glyphs.set(marker.key, mesh);
		}
	}

	/** Stands every group on the floor (the design on the platform). The base eases to its new height. */
	private updateFloorShifts(): void {
		for (const [id, group] of this.layer.groups) {
			const lows: number[] = [];
			for (const p of this.sceneModel.parts) {
				if (p.group !== id) continue;
				const e = this.layer.parts.get(p.key);
				if (e) lows.push(p.position[1] + e.model.bounds.min.y);
			}
			group.goalY = floorShift(lows) + (id === 'main' ? PLATFORM_TOP : 0);
			if (group.fresh) {
				group.y = group.goalY;
				group.fresh = false;
			}
		}
	}

	// --- highlights -----------------------------------------------------------------------------------------------

	setHover(key: string | null): void {
		if (this.hover === key) return;
		this.hover = key;
		this.applyHighlights();
	}

	setSelected(keys: Iterable<string>): void {
		this.selected = new Set(keys);
		this.applyHighlights();
	}

	setFlagged(keys: Iterable<string>): void {
		this.flagged = new Set(keys);
		this.applyHighlights();
	}

	/** Follows `prefers-reduced-motion` while the page is open: pulses stop, the camera jumps and the hangar's movers freeze. */
	setReducedMotion(on: boolean): void {
		this.reduced = on;
		this.hangar.setReducedMotion(on);
	}

	/**
	 * Thicker, brighter and steady outlines for rings, selection, flags, ghosts and the stability
	 * glyphs (accessibility). Takes effect at once.
	 */
	setHighContrast(on: boolean): void {
		if (this.highContrast === on) return;
		this.highContrast = on;
		this.highlights.setHighContrast(on);
		this.markerKit.setHighContrast(on);
		this.glyphKit.setHighContrast(on);
		this.rebuildMarkers(this.sceneModel.nodes);
		this.rebuildGlyphs([]);
		this.rebuildGlyphs(this.sceneModel.markers ?? []);
	}

	private applyHighlights(): void {
		this.layer.applyHighlights(this.hover, this.selected, this.flagged);
		// The shadow pass exists only in the high variant.
		const cost = this.layer.drawCost;
		const shadows = this.quality === 'high';
		this.stats.vesselDrawCalls = cost.drawCalls + (shadows ? cost.shadowDrawCalls : 0);
		this.stats.vesselTriangles = cost.triangles + (shadows ? cost.shadowTriangles : 0);
		this.stats.instancedParts = this.layer.instancedCount;
	}

	// --- camera -----------------------------------------------------------------------------------------------------

	setInsets(insets: { left: number; right: number; top: number; bottom: number }): void {
		this.insets = insets;
		this.applyViewOffset();
		this.updateCameraGoal();
	}

	private applyViewOffset(): void {
		const { left, right, top, bottom } = this.insets;
		const cx = (left + (this.width - right)) / 2;
		const cy = (top + (this.height - bottom)) / 2;
		this.camera.setViewOffset(
			this.width,
			this.height,
			this.width / 2 - cx,
			this.height / 2 - cy,
			this.width,
			this.height
		);
		this.camera.updateProjectionMatrix();
	}

	orbitBy(dx: number, dy: number): void {
		this.goal = orbit(this.goal, dx, dy);
		this.cam = { ...this.cam, yaw: this.goal.yaw, pitch: this.goal.pitch };
	}

	panBy(dx: number, dy: number): void {
		this.follow = false;
		this.goal = pan(this.goal, dx, dy, this.height, FOV);
		this.cam = { ...this.cam, target: this.goal.target };
	}

	zoomBy(factor: number): void {
		this.goal = zoom(this.goal, factor);
	}

	/** The turntable's wheel (plan 217): `dy` metres up or down the vessel. */
	raiseBy(dy: number): void {
		this.follow = false;
		this.goal = raise(this.goal, dy);
		this.cam = { ...this.cam, target: this.goal.target };
	}

	/** Centres the camera on a part (a middle click, plan 217); false for an unknown key. */
	focusOn(key: string): boolean {
		const e = this.layer.parts.get(key);
		if (!e) return false;
		this.follow = false;
		const c = new Box3().setFromObject(e.model.root).getCenter(new Vector3());
		this.goal = focus(this.goal, [c.x, c.y, c.z]);
		return true;
	}

	/** Back to following the vessel with a framing that fits it. */
	frame(): void {
		this.follow = true;
		this.goal = { ...initialCamera(this.goal.distance), yaw: this.goal.yaw };
		this.updateCameraGoal(true);
	}

	/** Which extent of the main assembly the camera must fit. */
	private mainExtent(): { height: number; width: number; centreY: number } {
		const g = this.layer.groups.get('main');
		if (!g || !this.sceneModel.parts.some((p) => p.group === 'main')) {
			let width = 4;
			for (const [id, group] of this.layer.groups) {
				if (id !== 'main') width = Math.max(width, 2 * (Math.abs(group.x) + 1.8));
			}
			return { height: 11, width: Math.max(width, 7), centreY: 4.2 };
		}
		let lo = Infinity;
		let hi = -Infinity;
		let w = 0;
		for (const p of this.sceneModel.parts) {
			if (p.group !== 'main') continue;
			const e = this.layer.parts.get(p.key);
			if (!e) continue;
			lo = Math.min(lo, p.position[1] + e.model.bounds.min.y);
			hi = Math.max(hi, p.position[1] + e.model.bounds.max.y);
			w = Math.max(w, e.model.bounds.max.x - e.model.bounds.min.x);
		}
		// Loose assemblies stand beside the platform; keep them in view.
		for (const [id, group] of this.layer.groups) {
			if (id !== 'main') w = Math.max(w, 2 * (Math.abs(group.x) + 1.8));
		}
		return { height: hi - lo, width: Math.max(w, 2), centreY: PLATFORM_TOP + (hi - lo) / 2 };
	}

	private updateCameraGoal(snap = false): void {
		const ext = this.mainExtent();
		if (this.follow) {
			this.goal = { ...this.goal, target: [0, ext.centreY, 0] };
		}
		const { left, right, top, bottom } = this.insets;
		const freeW = Math.max(100, this.width - left - right);
		const freeH = Math.max(100, this.height - top - bottom);
		// The view is `height` tall in total; the free rectangle shows only a fraction of the vertical field.
		const tanEff = Math.tan((FOV * Math.PI) / 360) * (freeH / this.height);
		const fovEff = (2 * Math.atan(tanEff) * 180) / Math.PI;
		const need = frameDistance(
			ext.width + 4,
			Math.max(ext.height, 5) + 1.5,
			fovEff,
			freeW / freeH,
			1.12
		);
		if (this.follow) {
			this.goal = {
				...this.goal,
				distance: snap ? need : Math.max(need, Math.min(this.goal.distance, need * 2.2))
			};
			// Zoom in when the vessel is small only if the user has not moved the camera far in.
			if (this.goal.distance > need * 1.6) this.goal = { ...this.goal, distance: need * 1.3 };
		}
		this.goal = {
			...this.goal,
			distance: Math.min(this.goal.distance, maxDistanceInRoom(this.goal))
		};
		if (snap) this.cam = { ...this.goal };
	}

	// --- picking -----------------------------------------------------------------------------------------------------

	private rayAt(clientX: number, clientY: number): PickRay {
		const rect = this.config.canvas.getBoundingClientRect();
		const [x, y] = toNdc(clientX, clientY, rect);
		this.camera.updateMatrixWorld(true);
		this.raycaster.setFromCamera(new Vector2(x, y), this.camera);
		const o = this.raycaster.ray.origin;
		const d = this.raycaster.ray.direction;
		return { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] };
	}

	/** Node markers win over parts when the ray is near one (they sit on the part's end faces). */
	pick(clientX: number, clientY: number, options: { ignoreGhost?: boolean } = {}): VabHit | null {
		const ray = this.rayAt(clientX, clientY);
		this.layer.root.updateMatrixWorld(true);
		const candidates = [...this.markers.entries()].map(([key, m]) => {
			const p = m.getWorldPosition(new Vector3());
			const node = this.nodes.find((n) => n.key === key);
			return { key, position: [p.x, p.y, p.z] as const, radius: (node?.radius ?? 0.5) * 0.9 };
		});
		const node = pickNode(ray, candidates);
		if (node) return { kind: 'node', key: node.node.key };
		const roots: Object3D[] = [...this.layer.barRoots];
		for (const e of this.layer.parts.values()) roots.push(e.model.root);
		const hits = this.raycaster.intersectObjects(roots, true);
		for (const h of hits) {
			let o: Object3D | null = h.object;
			while (o && o.userData.key === undefined) o = o.parent;
			if (!o) continue;
			const entry = this.layer.parts.get(o.userData.key as string);
			// A preview bar of a connector being placed belongs to no part: look through it.
			if (!entry) continue;
			if (entry.slot.role === 'ghost') {
				if (options.ignoreGhost) continue;
				return { kind: 'ghost' };
			}
			const group = entry && this.layer.groups.get(entry.group);
			const local = group ? group.object.worldToLocal(h.point.clone()) : h.point;
			const world = worldNormalOf(h);
			let normal: [number, number, number] | undefined;
			if (world) {
				const n = new Vector3(...world);
				// into the group's frame: its rotation only
				if (group) n.applyQuaternion(group.object.getWorldQuaternion(new Quaternion()).invert());
				normal = [n.x, n.y, n.z];
			}
			return {
				kind: 'part',
				key: o.userData.key as string,
				point: [local.x, local.y, local.z],
				...(normal ? { normal } : {})
			};
		}
		return null;
	}

	/** Screen position (CSS pixels in the canvas) of a node marker (`t<i>` for target `i`), or null. */
	screenPositionOfMarker(key: string): { x: number; y: number } | null {
		const m = this.markers.get(key);
		if (!m) return null;
		const p = m.getWorldPosition(new Vector3()).project(this.camera);
		if (p.z > 1) return null;
		return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
	}

	/** Screen position (CSS pixels in the canvas) of a part's centre, or null if it is unknown or behind the camera. */
	screenPositionOf(key: string): { x: number; y: number } | null {
		const e = this.layer.parts.get(key);
		if (!e) return null;
		const p = new Box3().setFromObject(e.model.root).getCenter(new Vector3()).project(this.camera);
		if (p.z > 1) return null;
		return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
	}

	// --- icons ---------------------------------------------------------------------------------------------------------

	/**
	 * Renders a catalogue icon: the part in a three-quarter view lit like the hangar, transparent
	 * background, as a PNG data URL. Draws into the main canvas for a moment (it keeps the page's
	 * tone mapping and anti-aliasing), so call it before the first frame or between frames.
	 */
	renderIcon(definition: string, size = 112): string {
		if (typeof document === 'undefined') return '';
		const scene = (this.iconScene ??= this.createIconScene());
		const model = this.factory.create(definition);
		model.setState({ modules: {}, temperature: 0, ambientPressure: 101_325 });
		const holder = new Object3D();
		holder.add(model.root);
		scene.add(holder);
		holder.updateMatrixWorld(true);
		const box = new Box3().setFromObject(holder);
		const cam = new OrthographicCamera(-1, 1, 1, -1);
		frameIcon(box, cam);

		const url = this.captureWith(scene, cam, size, size);
		scene.remove(holder);
		model.dispose();
		return url;
	}

	/**
	 * Renders `scene` through `cam` into the lower-left `width` x `height` CSS pixels of the canvas
	 * (clear colour transparent, no shadows) and copies them out as a PNG data URL. The canvas, its
	 * size and the page's own camera are restored afterwards; it is meant to run between frames.
	 */
	private captureWith(
		scene: Scene,
		cam: OrthographicCamera,
		width: number,
		height: number
	): string {
		const pr = this.pixelRatio();
		const gl = this.gl;
		const prevRatio = gl.getPixelRatio();
		const prevSize = gl.getSize(new Vector2());
		gl.setPixelRatio(pr);
		gl.setSize(Math.max(prevSize.x, width), Math.max(prevSize.y, height), false);
		const prevShadow = gl.shadowMap.enabled;
		gl.shadowMap.enabled = false;
		gl.setViewport(0, 0, width, height);
		gl.setScissor(0, 0, width, height);
		gl.setScissorTest(true);
		gl.setClearColor(0x000000, 0);
		gl.clear();
		gl.render(scene, cam);
		const out = document.createElement('canvas');
		out.width = Math.round(width * pr);
		out.height = Math.round(height * pr);
		const src = gl.domElement;
		out
			.getContext('2d')
			?.drawImage(
				src,
				0,
				src.height - out.height,
				out.width,
				out.height,
				0,
				0,
				out.width,
				out.height
			);
		gl.setScissorTest(false);
		gl.shadowMap.enabled = prevShadow;
		gl.setClearColor(0x0b1118, 1);
		gl.setPixelRatio(prevRatio);
		gl.setSize(prevSize.x, prevSize.y, false);
		this.resize(this.width, this.height, true);
		return out.toDataURL('image/png');
	}

	/**
	 * A PNG data URL of the design (group `main`, solid parts only: no ghosts, node rings, glyphs or
	 * highlights) from a fixed three-quarter view with a transparent backdrop, for the vessel
	 * library. Builds its own models from the last scene, so it is valid right after `setScene` and
	 * leaves the live camera and scene alone. `''` for an empty design or without a DOM.
	 */
	captureThumbnail(width: number, height: number): string {
		if (typeof document === 'undefined') return '';
		const parts = this.sceneModel.parts.filter((p) => p.group === 'main' && p.role === 'solid');
		if (parts.length === 0) return '';
		const scene = (this.iconScene ??= this.createIconScene());
		const holder = new Object3D();
		const repeated = repeatedDefinitions(parts);
		const models: PartModel[] = [];
		for (const p of parts) {
			const model = this.factory.create(
				p.definition,
				repeated.has(`solid|${p.definition}`)
					? { detail: repeatedDetail(this.factory.currentDetail) }
					: {}
			);
			model.setState({ modules: {}, temperature: 0, ambientPressure: 101_325 });
			model.root.position.set(...p.position);
			applyPartTurn(model.root, p);
			holder.add(model.root);
			models.push(model);
		}
		const bars = new ConnectorBars(this.factory, this.config.visuals ?? new Map());
		bars.sync(
			(this.sceneModel.links ?? [])
				.filter((l) => l.group === 'main')
				.map((l) => ({ key: l.key, definition: l.definition, from: l.from, to: l.to }))
		);
		holder.add(bars.root);
		scene.add(holder);
		holder.updateMatrixWorld(true);
		const box = new Box3().setFromObject(holder);
		const cam = new OrthographicCamera(-1, 1, 1, -1);
		frameIcon(box, cam, 1.05, width / height, THUMBNAIL_DIR);
		const url = this.captureWith(scene, cam, width, height);
		scene.remove(holder);
		for (const m of models) m.dispose();
		bars.dispose();
		return url;
	}

	private createIconScene(): Scene {
		const scene = new Scene();
		scene.environment = this.env?.texture ?? null;
		scene.environmentIntensity = 1.1;
		const key = new DirectionalLight(0xfff1de, 4.2);
		key.position.set(4, 7, 5);
		const rim = new DirectionalLight(0x9ec8ff, 2.0);
		rim.position.set(-6, 3, -5);
		scene.add(key, rim, new HemisphereLight(0xb7cdea, 0x3a2f24, 0.7));
		return scene;
	}

	// --- loop -------------------------------------------------------------------------------------------------------------

	/** Backing-store scale: retina sharpness where it is cheap, capped so a 4K canvas never costs a frame. */
	private pixelRatio(): number {
		return Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.5 : 1);
	}

	/** Sets the canvas drawing size in CSS pixels. */
	resize(width: number, height: number, force = false): void {
		if (!force && width === this.width && height === this.height) return;
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		const pr = this.pixelRatio();
		this.gl.setPixelRatio(pr);
		this.gl.setSize(this.width, this.height, false);
		this.camera.aspect = this.width / this.height;
		this.composer?.setPixelRatio(pr);
		this.composer?.setSize(this.width, this.height);
		this.bloom?.setSize(this.width * pr * 0.5, this.height * pr * 0.5);
		this.applyViewOffset();
		this.updateCameraGoal();
	}

	start(): void {
		if (this.raf) return;
		this.last = performance.now();
		const loop = (now: number): void => {
			this.raf = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - this.last) / 1000);
			this.last = now;
			if (dt > 0) this.stats.fps = this.stats.fps * 0.9 + (1 / dt) * 0.1;
			this.renderFrame(dt);
		};
		this.raf = requestAnimationFrame(loop);
	}

	stop(): void {
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	/** Advances animation by `dt` and draws one frame. Also used for captures while the page is hidden. */
	renderFrame(dt: number): void {
		if (this.disposed) return;
		const t0 = performance.now();
		this.gl.info.reset();
		this.time += dt;
		const ease = this.reduced ? 1_000 : 1;
		this.cam = approachCamera(this.cam, this.goal, dt, 8 * ease);
		for (const g of this.layer.groups.values()) {
			g.y = approach(g.y, g.goalY, dt, 9 * ease);
			g.object.position.set(g.x, g.y, g.z);
		}
		// Never outside the hangar, whatever the framing asked for (the walls are one-sided).
		const placed = {
			...this.cam,
			distance: Math.min(this.cam.distance, maxDistanceInRoom(this.cam))
		};
		const p = cameraPosition(placed);
		this.camera.position.set(...p);
		this.camera.lookAt(...this.cam.target);
		this.highlights.setTime(this.reduced ? 0 : this.time);
		if (!this.reduced) pulseMarkers(this.markers.values(), this.time);
		this.hangar.update(dt, this.time);
		this.glyphKit.orient(this.glyphs.values(), this.camera, FOV, this.height);
		this.fitShadow();
		for (const e of this.layer.parts.values()) e.model.tick(dt);
		if (this.composer) this.composer.render(dt);
		else this.gl.render(this.scene, this.camera);
		const ms = performance.now() - t0;
		this.stats.renderMs = this.stats.renderMs * 0.9 + ms * 0.1;
		const info = this.gl.info.render;
		this.stats.drawCalls = info.calls;
		this.stats.triangles = info.triangles;
	}

	/** Keeps the key light's shadow frustum around the vessel. */
	private fitShadow(): void {
		const ext = this.mainExtent();
		const r = Math.max(10, ext.height * 0.75 + 4);
		const cam = this.key.shadow.camera;
		cam.left = -r;
		cam.right = r;
		cam.top = r;
		cam.bottom = -r;
		cam.near = 5;
		cam.far = 90;
		cam.updateProjectionMatrix();
		this.key.target.position.set(0, ext.centreY, 0);
	}

	/** Multiply tone-mapping exposure (settings, screenshots). */
	setExposure(value: number): void {
		this.gl.toneMappingExposure = value;
	}

	/** Handles for tuning and captures from the console, like `Renderer.debug`. */
	get debug(): {
		scene: Scene;
		camera: PerspectiveCamera;
		key: DirectionalLight;
		rim: DirectionalLight;
		fill: HemisphereLight;
		glow: PointLight;
		bloom: UnrealBloomPass | null;
		gl: WebGLRenderer;
		hangar: Hangar;
		setCamera(
			yaw: number,
			pitch: number,
			distance: number,
			target?: [number, number, number]
		): void;
	} {
		return {
			scene: this.scene,
			camera: this.camera,
			key: this.key,
			rim: this.rimLight,
			fill: this.fill,
			glow: this.glowLight,
			bloom: this.bloom,
			gl: this.gl,
			hangar: this.hangar,
			setCamera: (yaw, pitch, distance, target) => {
				this.follow = false;
				this.goal = { yaw, pitch, distance, target: target ?? this.goal.target };
				this.cam = { ...this.goal };
			}
		};
	}

	get roomHalf(): number {
		return HANGAR.half;
	}

	dispose(): void {
		this.disposed = true;
		this.stop();
		this.layer.dispose();
		this.glyphKit.dispose();
		this.markerKit.dispose();
		this.highlights.dispose();
		this.hangar.dispose();
		for (const t of this.signTextures) t.dispose();
		this.trestleGeometry.dispose();
		this.trestleMaterial.dispose();
		this.factory.dispose();
		this.env?.dispose();
		this.composer?.dispose();
		this.gl.dispose();
	}
}
