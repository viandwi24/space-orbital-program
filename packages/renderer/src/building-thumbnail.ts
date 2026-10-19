/**
 * Build-menu thumbnails (plan 235, ADR 0227 point 5): a building's site generator drawn once into
 * a 256 × 160 offscreen picture from a fixed three-quarter view, cached per session by generator
 * and footprint. One small WebGL renderer serves the queue, one building at a time, and is
 * released once the queue is empty.
 */
import {
	AmbientLight,
	Box3,
	BufferGeometry,
	CircleGeometry,
	DirectionalLight,
	Group,
	HemisphereLight,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
	type Material
} from 'three';
import { emptyParts, merge, type SiteParts } from './site-geo.ts';
import { BUCKETS, generate, SITE_CELL } from './site-list.ts';

export const THUMB_WIDTH = 256;
export const THUMB_HEIGHT = 160;
/** The view: from the south-east, 32° above the horizon, a narrow lens. */
export const THUMB_FOV = 30;
const ELEVATION = (32 * Math.PI) / 180;
const AZIMUTH = (35 * Math.PI) / 180;
/** Room around the building in the picture, as a share of the fitted distance. */
const MARGIN = 1.12;

/** A footprint in cells as the site draws it: metres, 1 m in from each edge. */
export const footprintMetres = (size: { w: number; d: number }): { w: number; d: number } => ({
	w: size.w * SITE_CELL - 2,
	d: size.d * SITE_CELL - 2
});

/** The generator's parts for one building at the origin (x east, y up, z south). */
export function thumbnailParts(generator: string, size: { w: number; d: number }): SiteParts {
	const m = footprintMetres(size);
	const parts = emptyParts();
	generate(generator, m.w, m.d, parts);
	return parts;
}

/**
 * The camera for a box: on the fixed three-quarter direction, far enough that the box's bounding
 * sphere fits the narrower field of view.
 */
export function thumbnailFraming(
	box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
	aspect = THUMB_WIDTH / THUMB_HEIGHT,
	fov = THUMB_FOV
): { position: Vector3; target: Vector3 } {
	const min = new Vector3(box.min.x, box.min.y, box.min.z);
	const max = new Vector3(box.max.x, box.max.y, box.max.z);
	const target = min.clone().add(max).multiplyScalar(0.5);
	const radius = Math.max(1, max.clone().sub(min).length() / 2);
	const vertical = (fov * Math.PI) / 180;
	const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
	const half = Math.min(vertical, horizontal) / 2;
	const distance = (radius / Math.sin(half)) * MARGIN;
	const dir = new Vector3(
		Math.cos(ELEVATION) * Math.sin(AZIMUTH),
		Math.sin(ELEVATION),
		Math.cos(ELEVATION) * Math.cos(AZIMUTH)
	);
	return { position: target.clone().addScaledVector(dir, distance), target };
}

/** The building as meshes, one per material bucket, with plain materials (no site weathering). */
export function thumbnailGroup(parts: SiteParts): Group {
	const group = new Group();
	const material = (k: (typeof BUCKETS)[number]): Material => {
		if (k === 'lamp' || k === 'beacon' || k === 'glassLit')
			return new MeshBasicMaterial({ vertexColors: true });
		if (k === 'glass')
			return new MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.2 });
		if (k === 'structure' || k === 'thin')
			return new MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.5 });
		return new MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.6 });
	};
	for (const k of BUCKETS) {
		const list = parts[k] as BufferGeometry[];
		if (list.length === 0) continue;
		group.add(new Mesh(merge(list), material(k)));
	}
	return group;
}

/** A promise cache by key: each key is drawn once, later calls get the same promise. */
export function createThumbnailCache<T>(draw: (key: string) => Promise<T>): {
	get(key: string): Promise<T>;
	readonly size: number;
} {
	const cache = new Map<string, Promise<T>>();
	return {
		get(key) {
			let p = cache.get(key);
			if (!p) {
				p = draw(key);
				// a failed draw is not kept: the card keeps its icon and a later open tries again
				p.catch(() => cache.delete(key));
				cache.set(key, p);
			}
			return p;
		},
		get size() {
			return cache.size;
		}
	};
}

export const thumbnailKey = (generator: string, size: { w: number; d: number }): string =>
	`${generator}:${size.w}x${size.d}`;

/**
 * The session's thumbnails: `get` resolves to a PNG data URL. Draws run one after another on one
 * offscreen renderer, created on the first request and disposed when the queue is empty.
 */
export function createBuildingThumbnails(
	makeRenderer: () => WebGLRenderer = () =>
		new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
) {
	let renderer: WebGLRenderer | null = null;
	let queue: Promise<unknown> = Promise.resolve();
	let pending = 0;
	const sizes = new Map<string, { generator: string; size: { w: number; d: number } }>();

	function drawNow(generator: string, size: { w: number; d: number }): string {
		if (!renderer) {
			renderer = makeRenderer();
			renderer.setPixelRatio(1);
			renderer.setSize(THUMB_WIDTH, THUMB_HEIGHT, false);
		}
		const scene = new Scene();
		scene.add(new HemisphereLight(0xdfe8f2, 0x3a3a34, 1.2));
		scene.add(new AmbientLight(0xffffff, 0.25));
		const sun = new DirectionalLight(0xffffff, 2.2);
		sun.position.set(0.6, 1, 0.45);
		scene.add(sun);
		const building = thumbnailGroup(thumbnailParts(generator, size));
		scene.add(building);
		const box = new Box3().setFromObject(building);
		const m = footprintMetres(size);
		const ground = new Mesh(
			new CircleGeometry(Math.hypot(m.w, m.d) * 0.62, 48),
			new MeshStandardMaterial({ color: 0x2b2e30, roughness: 1, metalness: 0 })
		);
		ground.rotation.x = -Math.PI / 2;
		ground.position.y = -0.02;
		scene.add(ground);
		const camera = new PerspectiveCamera(THUMB_FOV, THUMB_WIDTH / THUMB_HEIGHT, 0.5, 5000);
		const view = thumbnailFraming(box);
		camera.position.copy(view.position);
		camera.lookAt(view.target);
		renderer.setClearColor(0x000000, 0);
		renderer.render(scene, camera);
		const url = renderer.domElement.toDataURL('image/png');
		scene.traverse((o) => {
			if (o instanceof Mesh) {
				(o.geometry as BufferGeometry).dispose();
				(o.material as Material).dispose();
			}
		});
		return url;
	}

	const cache = createThumbnailCache<string>((key) => {
		const job = sizes.get(key)!;
		pending += 1;
		const run = queue.then(
			() =>
				new Promise<string>((resolve, reject) => {
					// one draw per frame, so opening a category never stalls the page for long
					requestAnimationFrame(() => {
						try {
							resolve(drawNow(job.generator, job.size));
						} catch (e) {
							reject(e);
						}
					});
				})
		);
		queue = run.catch(() => undefined);
		void run
			.finally(() => {
				pending -= 1;
				if (pending === 0) {
					renderer?.dispose();
					renderer?.forceContextLoss();
					renderer = null;
				}
			})
			.catch(() => undefined);
		return run;
	});

	return {
		get(generator: string, size: { w: number; d: number }): Promise<string> {
			const key = thumbnailKey(generator, size);
			sizes.set(key, { generator, size });
			return cache.get(key);
		},
		get cached(): number {
			return cache.size;
		}
	};
}
export type BuildingThumbnails = ReturnType<typeof createBuildingThumbnails>;
