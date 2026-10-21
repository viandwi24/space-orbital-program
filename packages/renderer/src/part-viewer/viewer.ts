/**
 * The part model viewer (plan 301, `/dev/parts`): one part, or a row of parts, on a grid floor,
 * built by the same `PartModelFactory` as the game, drawn by the backend the page asks for
 * (`WebGLRenderer`, or three's `WebGPURenderer` on WebGPU or its WebGL2 fallback). Overlays show the
 * attach nodes and the physics shape; the viewer's drive (deploy, articulation, firing) is written
 * into synthetic module snapshots. A development tool: no picking, no editing.
 */
import type { PartVisual } from '@orbital/core';
import {
	ACESFilmicToneMapping,
	Box3,
	BoxGeometry,
	BufferGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	EdgesGeometry,
	Float32BufferAttribute,
	GridHelper,
	Group,
	HemisphereLight,
	Line,
	LineBasicMaterial,
	LineLoop,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	PMREMGenerator,
	PerspectiveCamera,
	Quaternion,
	SRGBColorSpace,
	Scene,
	SphereGeometry,
	Vector3,
	WebGLRenderer,
	type Material,
	type Texture
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { RendererBackend } from '../backend.ts';
import { PartModelFactory } from '../parts/factory.ts';
import type { PartModel, PartModelProvider, PartNode, PartShape } from '../parts/types.ts';
import { PRESETS, detailOf, type GraphicsPreset } from '../presets.ts';
import {
	driveModules,
	frameDistance,
	nodeMarkerRadius,
	rowGap,
	rowLayout,
	type ViewerDrive
} from './layout.ts';

export interface PartViewerConfig {
	canvas: HTMLCanvasElement;
	backend: RendererBackend;
	shapes: ReadonlyMap<string, PartShape>;
	visuals?: ReadonlyMap<string, PartVisual>;
	attach?: ReadonlyMap<string, Readonly<Record<string, PartNode>>>;
	/** Asset-backed providers of mod parts (the page's `modelProviders()`). */
	providers?: readonly PartModelProvider[];
	detail?: GraphicsPreset;
}

export interface PartViewerOptions extends ViewerDrive {
	nodes: boolean;
	shape: boolean;
	wire: boolean;
	background: 'dark' | 'light';
}

/** What the model of one shown part is made of. */
export interface PartViewerStats {
	id: string;
	/** Triangles with every animated piece out (`PartModel.triangles`). */
	triangles: number;
	/** Material slots in use (`userData.slot`; effect materials by name or type). */
	slots: string[];
	meshes: number;
	/** `visual.kind`, or `shape` when the part has no visual (the plain shape provider). */
	kind: string;
	params: Readonly<Record<string, number | string | boolean>>;
	shape: PartShape | null;
	/** Size of the static geometry's bounds, m. */
	bounds: [number, number, number];
	nodes: Readonly<Record<string, PartNode>>;
	/** What the drive moves on this part. */
	drives: {
		deploy: boolean;
		articulation: string | null;
		plume: boolean;
		puffs: boolean;
		lamp: boolean;
	};
}

/** A text to draw over the canvas at a screen position (CSS px from the canvas's top left). */
export interface ViewerLabel {
	kind: 'part' | 'node';
	text: string;
	x: number;
	y: number;
}

interface Shown {
	id: string;
	holder: Group;
	model: PartModel;
	overlays: { nodes: Group; shape: Group };
	box: Box3;
}

interface Backend {
	readonly name: string;
	render(scene: Scene, camera: PerspectiveCamera): void;
	setSize(width: number, height: number, ratio: number): void;
	counts(): { calls: number; triangles: number };
	dispose(): void;
}

const NODE_COLOUR = 0x22d3ee;
const RADIAL_COLOUR = 0xfacc15;
const SHAPE_COLOUR = 0xf472b6;
const BACKGROUNDS = {
	dark: { sky: 0x1b1f26, major: 0x5b6575, minor: 0x30363f },
	light: { sky: 0xdfe3e8, major: 0x8a93a0, minor: 0xbfc6cf }
} as const;

/** Builds a viewer on the canvas; resolves when the backend is ready to draw. */
export async function createPartViewer(config: PartViewerConfig): Promise<PartViewer> {
	const scene = new Scene();
	const backend =
		config.backend === 'webgl'
			? webglBackend(config.canvas, scene)
			: await webgpuBackend(config.canvas, scene, config.backend === 'webgpu-fallback');
	return new PartViewer(config, scene, backend);
}

function webglBackend(canvas: HTMLCanvasElement, scene: Scene): Backend {
	const gl = new WebGLRenderer({ canvas, antialias: true });
	gl.toneMapping = ACESFilmicToneMapping;
	gl.outputColorSpace = SRGBColorSpace;
	const pmrem = new PMREMGenerator(gl);
	const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	pmrem.dispose();
	scene.environment = env;
	return {
		name: 'webgl',
		render: (s, c) => gl.render(s, c),
		setSize: (w, h, r) => {
			gl.setPixelRatio(r);
			gl.setSize(w, h, false);
		},
		counts: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
		dispose: () => {
			env.dispose();
			gl.dispose();
		}
	};
}

async function webgpuBackend(
	canvas: HTMLCanvasElement,
	scene: Scene,
	forceWebGL: boolean
): Promise<Backend> {
	const [{ WebGPURenderer, PMREMGenerator: NodePMREM }, { hideUnported }, { Twins }] =
		await Promise.all([
			import('three/webgpu'),
			import('../webgpu-compat.ts'),
			import('../tsl/twins.ts')
		]);
	const gpu = new WebGPURenderer({ canvas, antialias: true, forceWebGL });
	await gpu.init();
	gpu.toneMapping = ACESFilmicToneMapping;
	gpu.outputColorSpace = SRGBColorSpace;
	const pmrem = new NodePMREM(gpu);
	const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
	const env: Texture = target.texture;
	pmrem.dispose();
	scene.environment = env;
	// the effects' GLSL materials (plume) are drawn by their TSL twins, as in the flight view
	const twins = new Twins();
	const isWebGPU = (gpu.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
	return {
		name: isWebGPU ? 'webgpu' : 'webgpu-fallback (WebGL2)',
		render: (s, c) => {
			const unported = hideUnported(s, (m, o) => twins.twinOf(m, o));
			gpu.render(s, c);
			unported.restore();
		},
		setSize: (w, h, r) => {
			gpu.setPixelRatio(r);
			gpu.setSize(w, h, false);
		},
		counts: () => ({ calls: gpu.info.render.drawCalls, triangles: gpu.info.render.triangles }),
		dispose: () => {
			target.dispose();
			gpu.dispose();
		}
	};
}

export class PartViewer {
	readonly camera = new PerspectiveCamera(40, 1, 0.01, 4000);
	private factory: PartModelFactory;
	private detail: GraphicsPreset;
	private shown: Shown[] = [];
	private ids: string[] = [];
	private readonly world = new Group();
	private grid: GridHelper | null = null;
	private readonly sun = new DirectionalLight(0xffffff, 2.6);
	private readonly fill = new HemisphereLight(0xdde6f2, 0x404040, 0.6);
	private options: PartViewerOptions = {
		nodes: false,
		shape: false,
		wire: false,
		deploy: 0,
		art: 0,
		fire: false,
		background: 'dark'
	};
	private readonly orbit = { target: new Vector3(), yaw: 0.65, pitch: 0.28, distance: 6 };
	private width = 1;
	private height = 1;
	private frameHandle = 0;
	private last = 0;
	private lastCounts = { calls: 0, triangles: 0 };
	private readonly overlayMaterials: Material[] = [];
	private readonly overlayGeometries: BufferGeometry[] = [];
	private readonly cleanup: (() => void)[] = [];

	constructor(
		private readonly config: PartViewerConfig,
		readonly scene: Scene,
		private readonly backend: Backend
	) {
		this.detail = config.detail ?? 'high';
		this.factory = this.makeFactory();
		scene.environmentIntensity = 0.55;
		scene.add(this.world);
		// light from the side, a little above and in front, so relief reads on round parts
		this.sun.position.set(8, 5, 4);
		scene.add(this.sun, this.sun.target, this.fill);
		this.setBackground('dark');
		this.bindPointer(config.canvas);
	}

	/** The backend that draws: `webgl`, `webgpu`, or the WebGL2 fallback of three's WebGPU renderer. */
	get backendName(): string {
		return this.backend.name;
	}

	/** Draw calls and triangles of the last frame, as the backend counted them. */
	get counts(): { calls: number; triangles: number } {
		return this.lastCounts;
	}

	private makeFactory(): PartModelFactory {
		return new PartModelFactory({
			shapes: this.config.shapes,
			...(this.config.visuals ? { visuals: this.config.visuals } : {}),
			...(this.config.attach ? { attach: this.config.attach } : {}),
			...(this.config.providers ? { providers: this.config.providers } : {}),
			detail: detailOf(PRESETS[this.detail])
		});
	}

	/** Shows these parts in a row (one id: the part alone). Unknown ids draw as the default box. */
	setParts(ids: readonly string[]): void {
		this.ids = [...ids];
		this.rebuild();
		this.frame();
	}

	/** The detail preset of the part models; rebuilds them (the texture size belongs to the factory). */
	setDetail(preset: GraphicsPreset): void {
		if (preset === this.detail) return;
		this.detail = preset;
		this.clear();
		this.factory.dispose();
		this.factory = this.makeFactory();
		this.rebuild();
	}

	setOptions(next: Partial<PartViewerOptions>): void {
		const was = this.options;
		this.options = { ...was, ...next };
		if (this.options.background !== was.background) this.setBackground(this.options.background);
		if (this.options.wire !== was.wire) this.applyWire();
		for (const s of this.shown) {
			s.overlays.nodes.visible = this.options.nodes;
			s.overlays.shape.visible = this.options.shape;
		}
		if (
			this.options.deploy !== was.deploy ||
			this.options.art !== was.art ||
			this.options.fire !== was.fire
		)
			this.applyDrive();
	}

	/** Puts every shown part in view, keeping the camera's direction. */
	frame(): void {
		const box = new Box3();
		this.world.updateMatrixWorld(true);
		for (const s of this.shown) {
			box.union(s.box.clone().translate(s.holder.position));
			// what moved out (a parachute's canopy, legs), but not the effects (plume, jets, lamp cone)
			s.model.root.traverseVisible((o) => {
				const mesh = o as Mesh;
				if (mesh.isMesh && !isEffect(mesh)) box.expandByObject(mesh);
			});
		}
		if (box.isEmpty()) box.set(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
		const centre = box.getCenter(new Vector3());
		const radius = box.getSize(new Vector3()).length() / 2;
		this.orbit.target.copy(centre);
		this.orbit.distance = frameDistance(radius, this.camera.fov, this.width / this.height);
		this.placeCamera();
	}

	/** Back to the default three-quarter view, framed. */
	resetView(): void {
		this.orbit.yaw = 0.65;
		this.orbit.pitch = 0.28;
		this.frame();
	}

	/** A view along one axis: `front` (+Z), `side` (+X) or `top` (+Y), framed. */
	view(direction: 'front' | 'side' | 'top'): void {
		this.orbit.yaw = direction === 'side' ? Math.PI / 2 : 0;
		this.orbit.pitch = direction === 'top' ? Math.PI / 2 - 0.001 : 0;
		this.frame();
	}

	setSize(width: number, height: number, ratio: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
		this.backend.setSize(this.width, this.height, ratio);
	}

	/** Statistics of each shown part's model, in row order. */
	stats(): PartViewerStats[] {
		return this.shown.map((s) => statsOf(s, this.config));
	}

	/** Part names under each part and node names at each node (when nodes are shown), on screen. */
	labels(): ViewerLabel[] {
		const out: ViewerLabel[] = [];
		const v = new Vector3();
		const toScreen = (p: Vector3): { x: number; y: number } | null => {
			v.copy(p).project(this.camera);
			if (v.z > 1) return null;
			return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
		};
		if (this.shown.length > 1) {
			for (const s of this.shown) {
				const at = toScreen(new Vector3(s.holder.position.x, 0, s.box.max.z + s.holder.position.z));
				if (at) out.push({ kind: 'part', text: s.id, ...at });
			}
		}
		if (this.options.nodes) {
			for (const s of this.shown) {
				for (const [name, node] of Object.entries(s.model.nodes)) {
					const p = new Vector3(...node.pos).add(s.holder.position);
					const at = toScreen(p);
					if (at) out.push({ kind: 'node', text: name, ...at });
				}
			}
		}
		return out;
	}

	/** Starts drawing every animation frame; `onFrame` runs after each draw (labels, stats). */
	start(onFrame?: () => void): void {
		const loop = (now: number): void => {
			this.frameHandle = requestAnimationFrame(loop);
			const dt = this.last === 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
			this.last = now;
			for (const s of this.shown) s.model.tick(dt);
			this.backend.render(this.scene, this.camera);
			this.lastCounts = this.backend.counts();
			onFrame?.();
		};
		this.frameHandle = requestAnimationFrame(loop);
	}

	/** Draws one frame now (for screenshots and tests). */
	draw(): void {
		this.backend.render(this.scene, this.camera);
		this.lastCounts = this.backend.counts();
	}

	dispose(): void {
		cancelAnimationFrame(this.frameHandle);
		for (const c of this.cleanup) c();
		this.clear();
		this.factory.dispose();
		this.grid?.geometry.dispose();
		(this.grid?.material as Material | undefined)?.dispose();
		this.backend.dispose();
	}

	// --- building ------------------------------------------------------------------------------------------

	private clear(): void {
		for (const s of this.shown) {
			s.model.dispose();
			s.holder.removeFromParent();
		}
		this.shown = [];
		for (const m of this.overlayMaterials) m.dispose();
		for (const g of this.overlayGeometries) g.dispose();
		this.overlayMaterials.length = 0;
		this.overlayGeometries.length = 0;
	}

	private rebuild(): void {
		this.clear();
		for (const id of this.ids) {
			const model = this.factory.create(id);
			const holder = new Group();
			holder.name = `viewer:${id}`;
			holder.add(model.root);
			const shape = this.config.shapes.get(id) ?? null;
			const box = model.bounds.clone();
			if (shape) box.union(shapeBox(shape));
			if (box.isEmpty()) box.set(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
			const size = box.getSize(new Vector3());
			const overlays = {
				nodes: this.nodeOverlay(model.nodes, Math.max(size.x, size.y, size.z)),
				shape: this.shapeOverlay(shape)
			};
			overlays.nodes.visible = this.options.nodes;
			overlays.shape.visible = this.options.shape;
			holder.add(overlays.nodes, overlays.shape);
			this.world.add(holder);
			this.shown.push({ id, holder, model, overlays, box });
		}
		// stand each part on the floor, side by side along X
		const widths = this.shown.map((s) => s.box.max.x - s.box.min.x);
		const xs = rowLayout(widths, rowGap(widths));
		this.shown.forEach((s, i) => {
			const centreX = (s.box.min.x + s.box.max.x) / 2;
			s.holder.position.set(xs[i]! - centreX, -s.box.min.y, 0);
		});
		this.makeGrid(widths.reduce((a, b) => a + b, 0) + rowGap(widths) * widths.length);
		this.applyWire();
		this.applyDrive();
	}

	private applyDrive(): void {
		for (const s of this.shown) {
			const visual = this.config.visuals?.get(s.id);
			s.model.setState({ modules: driveModules(visual, this.options) });
			// jump the deploy animation to the slider instead of easing there
			s.model.tick(60);
		}
	}

	private applyWire(): void {
		for (const s of this.shown) {
			s.model.root.traverse((o) => {
				const m = (o as Mesh).material as Material | Material[] | undefined;
				if (!m || !(o as Mesh).isMesh) return;
				for (const mat of Array.isArray(m) ? m : [m]) {
					const w = mat as Material & { wireframe?: boolean };
					if (w.wireframe !== undefined && w.wireframe !== this.options.wire) {
						w.wireframe = this.options.wire;
						mat.needsUpdate = true;
					}
				}
			});
		}
	}

	private setBackground(which: 'dark' | 'light'): void {
		const c = BACKGROUNDS[which];
		this.scene.background = new Color(c.sky);
		this.makeGrid(this.rowWidth);
	}

	/** Width of the row the grid was last sized for, m. */
	private rowWidth = 0;

	private makeGrid(rowWidth: number): void {
		this.rowWidth = rowWidth;
		const size = Math.max(10, 2 * Math.ceil(rowWidth * 0.7));
		if (this.grid) {
			this.grid.removeFromParent();
			this.grid.geometry.dispose();
			(this.grid.material as Material).dispose();
		}
		const c = BACKGROUNDS[this.options.background];
		// half-metre cells
		this.grid = new GridHelper(size, size * 2, c.major, c.minor);
		this.scene.add(this.grid);
	}

	private own<T extends Material | BufferGeometry>(x: T): T {
		if ((x as Material).isMaterial) this.overlayMaterials.push(x as Material);
		else this.overlayGeometries.push(x as BufferGeometry);
		return x;
	}

	/** A sphere at each node, a line along its direction, and a ring of its diameter when it has one. */
	private nodeOverlay(nodes: Readonly<Record<string, PartNode>>, partSize: number): Group {
		const group = new Group();
		group.name = 'viewer:nodes';
		const r = nodeMarkerRadius(partSize);
		const sphere = this.own(new SphereGeometry(r, 12, 8));
		const up = new Vector3(0, 1, 0);
		for (const node of Object.values(nodes)) {
			const colour = node.size === undefined ? RADIAL_COLOUR : NODE_COLOUR;
			const solid = this.own(
				new MeshBasicMaterial({ color: colour, depthTest: false, transparent: true })
			);
			const line = this.own(
				new LineBasicMaterial({ color: colour, depthTest: false, transparent: true })
			);
			const pos = new Vector3(...node.pos);
			const dir = new Vector3(...node.dir).normalize();
			const ball = new Mesh(sphere, solid);
			ball.position.copy(pos);
			ball.renderOrder = 10;
			const length = Math.max(0.15, partSize * 0.2);
			const arrow = new Line(
				this.own(
					new BufferGeometry().setFromPoints([pos, pos.clone().addScaledVector(dir, length)])
				),
				line
			);
			arrow.renderOrder = 10;
			group.add(ball, arrow);
			if (node.size !== undefined && node.size > 0) {
				const ring = new LineLoop(this.own(circle(node.size / 2, 48)), line);
				ring.position.copy(pos);
				ring.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir));
				ring.renderOrder = 10;
				group.add(ring);
			}
		}
		return group;
	}

	/** The physics shape as a faint solid and its edges. */
	private shapeOverlay(shape: PartShape | null): Group {
		const group = new Group();
		group.name = 'viewer:shape';
		if (!shape) return group;
		const geometry = this.own(
			shape.kind === 'box'
				? new BoxGeometry(shape.size.x, shape.size.y, shape.size.z)
				: new CylinderGeometry(shape.radius, shape.radius, shape.height, 48, 1, true)
		);
		const fill = new Mesh(
			geometry,
			this.own(
				new MeshBasicMaterial({
					color: SHAPE_COLOUR,
					transparent: true,
					opacity: 0.12,
					depthWrite: false
				})
			)
		);
		fill.renderOrder = 5;
		const lineMaterial = this.own(
			new LineBasicMaterial({ color: SHAPE_COLOUR, transparent: true, opacity: 0.9 })
		);
		const edges =
			shape.kind === 'box'
				? new LineSegments(this.own(new EdgesGeometry(geometry)), lineMaterial)
				: cylinderEdges(shape.radius, shape.height, (g) => this.own(g), lineMaterial);
		group.add(fill, edges);
		return group;
	}

	// --- camera --------------------------------------------------------------------------------------------

	private placeCamera(): void {
		const { target, yaw, pitch, distance } = this.orbit;
		this.camera.position.set(
			target.x + distance * Math.cos(pitch) * Math.sin(yaw),
			target.y + distance * Math.sin(pitch),
			target.z + distance * Math.cos(pitch) * Math.cos(yaw)
		);
		this.camera.near = Math.max(0.005, distance / 500);
		this.camera.far = Math.max(100, distance * 50);
		this.camera.updateProjectionMatrix();
		this.camera.lookAt(target);
	}

	/** Left drag orbits, right drag (or Shift + drag) pans, the wheel zooms. */
	private bindPointer(canvas: HTMLCanvasElement): void {
		let drag: { x: number; y: number; pan: boolean } | null = null;
		const down = (e: PointerEvent): void => {
			drag = { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey };
			canvas.setPointerCapture(e.pointerId);
		};
		const move = (e: PointerEvent): void => {
			if (!drag) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			drag.x = e.clientX;
			drag.y = e.clientY;
			if (drag.pan) {
				const k =
					(this.orbit.distance * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;
				const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
				const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
				this.orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
			} else {
				this.orbit.yaw -= dx * 0.008;
				this.orbit.pitch = Math.max(-1.5, Math.min(1.5, this.orbit.pitch + dy * 0.008));
			}
			this.placeCamera();
		};
		const up = (e: PointerEvent): void => {
			drag = null;
			if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
		};
		const wheel = (e: WheelEvent): void => {
			e.preventDefault();
			this.orbit.distance = Math.max(0.05, this.orbit.distance * Math.exp(e.deltaY * 0.0012));
			this.placeCamera();
		};
		const menu = (e: Event): void => e.preventDefault();
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		canvas.addEventListener('wheel', wheel, { passive: false });
		canvas.addEventListener('contextmenu', menu);
		this.cleanup.push(() => {
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			canvas.removeEventListener('wheel', wheel);
			canvas.removeEventListener('contextmenu', menu);
		});
	}
}

/** Effect meshes (plume, RCS jets, lamp lens): transparent or additive, never part of the framing. */
function isEffect(mesh: Mesh): boolean {
	const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	return list.some((m) => m.transparent || m.userData.slot === undefined);
}

function shapeBox(shape: PartShape): Box3 {
	const half =
		shape.kind === 'box'
			? new Vector3(shape.size.x / 2, shape.size.y / 2, shape.size.z / 2)
			: new Vector3(shape.radius, shape.height / 2, shape.radius);
	return new Box3(half.clone().negate(), half);
}

/** A circle of `radius` in the XZ plane (normal +Y), as a line loop's points. */
function circle(radius: number, segments: number): BufferGeometry {
	const points: number[] = [];
	for (let i = 0; i < segments; i++) {
		const a = (i / segments) * Math.PI * 2;
		points.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
	}
	return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
}

/** Top and bottom rings and eight vertical lines of a cylinder. */
function cylinderEdges(
	radius: number,
	height: number,
	own: (g: BufferGeometry) => BufferGeometry,
	material: LineBasicMaterial
): Object3D {
	const group = new Group();
	for (const y of [-height / 2, height / 2]) {
		const ring = new LineLoop(own(circle(radius, 48)), material);
		ring.position.y = y;
		group.add(ring);
	}
	const points: number[] = [];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		const x = Math.cos(a) * radius;
		const z = Math.sin(a) * radius;
		points.push(x, -height / 2, z, x, height / 2, z);
	}
	group.add(
		new LineSegments(
			own(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3))),
			material
		)
	);
	return group;
}

function statsOf(s: Shown, config: PartViewerConfig): PartViewerStats {
	const slots = new Set<string>();
	let meshes = 0;
	s.model.root.traverse((o) => {
		const mesh = o as Mesh;
		if (!mesh.isMesh) return;
		meshes++;
		const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of list) {
			const slot = (m.userData as { slot?: string }).slot;
			slots.add(slot ?? `effect:${m.name || m.type}`);
		}
	});
	const visual = config.visuals?.get(s.id);
	const size = s.model.bounds.getSize(new Vector3());
	return {
		id: s.id,
		triangles: s.model.triangles,
		slots: [...slots].sort(),
		meshes,
		kind: visual?.kind ?? 'shape',
		params: visual?.params ?? {},
		shape: config.shapes.get(s.id) ?? null,
		bounds: [size.x, size.y, size.z],
		nodes: s.model.nodes,
		drives: {
			deploy: visual?.deploy !== undefined,
			articulation: visual?.articulation?.mode ?? null,
			plume: visual?.plume !== undefined,
			puffs: visual?.puffs !== undefined,
			lamp: visual?.lamp !== undefined
		}
	};
}
