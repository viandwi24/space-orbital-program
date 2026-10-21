/**
 * The crew line-up (plan 341, `/dev/crew`): every outfit in a row, every expression in a row in
 * front, a 1.25 m pod-sized drum and a 1.7 m pole for scale, on a floor, with orbit controls. A
 * development tool drawn by a plain `WebGLRenderer`.
 */
import {
	ACESFilmicToneMapping,
	CylinderGeometry,
	DirectionalLight,
	GridHelper,
	HemisphereLight,
	Mesh,
	MeshStandardMaterial,
	PMREMGenerator,
	PerspectiveCamera,
	SRGBColorSpace,
	Scene,
	Color,
	WebGLRenderer,
	PCFSoftShadowMap,
	CircleGeometry
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
	CREW_HEIGHT,
	EXPRESSIONS,
	OUTFIT_IDS,
	OUTFITS,
	SKIN_NAMES,
	appearanceOf,
	type Skin
} from './outfits.ts';
import { createCrewMaterial, createPerson, type Person } from './person.ts';
import { personPose, type Action } from './poses.ts';

export type LineupView = 'all' | 'outfits' | 'faces' | 'close';

export interface CrewLineup {
	setAction(action: Action): void;
	/** Frames the whole line-up, the outfit row, the expression row or four faces close up. */
	setView(view: LineupView): void;
	setSkin(skin: Skin | 'by-id'): void;
	/** Where each figure's label goes, in canvas pixels. */
	labels(): { text: string; x: number; y: number }[];
	readonly triangles: number;
	readonly calls: number;
	dispose(): void;
}

export function createCrewLineup(canvas: HTMLCanvasElement): CrewLineup {
	const gl = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
	gl.outputColorSpace = SRGBColorSpace;
	gl.toneMapping = ACESFilmicToneMapping;
	gl.shadowMap.enabled = true;
	gl.shadowMap.type = PCFSoftShadowMap;
	const scene = new Scene();
	scene.background = new Color(0x1b2233);
	const pmrem = new PMREMGenerator(gl);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.5;
	scene.add(new HemisphereLight(0xcfe0ff, 0x30281e, 0.6));
	const sun = new DirectionalLight(0xfff2e0, 2.2);
	sun.position.set(4, 8, 6);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 4, bottom: -3 });
	scene.add(sun);
	const floor = new Mesh(
		new CircleGeometry(14, 48).rotateX(-Math.PI / 2),
		new MeshStandardMaterial({ color: 0x3a4152, roughness: 0.9 })
	);
	floor.receiveShadow = true;
	scene.add(floor, new GridHelper(28, 28, 0x56607a, 0x464e62));

	const camera = new PerspectiveCamera(32, 1, 0.1, 200);
	camera.position.set(0, 1.9, 12.5);
	const controls = new OrbitControls(camera, canvas);
	controls.target.set(0, 0.9, 0);
	controls.update();

	const material = createCrewMaterial();
	const people: {
		person: Person;
		label: string;
		x: number;
		z: number;
		seed: number;
		row: 'outfits' | 'faces';
	}[] = [];
	let view: LineupView = 'all';
	let skin: Skin | 'by-id' = 'by-id';
	const build = (): void => {
		for (const p of people) {
			scene.remove(p.person.mesh);
			p.person.dispose();
		}
		people.length = 0;
		const gap = 1.05;
		OUTFIT_IDS.forEach((outfit, i) => {
			const look = appearanceOf(`lineup-${i}`);
			const appearance = skin === 'by-id' ? look : { ...look, skin };
			const person = createPerson({ outfit, appearance }, material);
			const x = (i - (OUTFIT_IDS.length - 1) / 2) * gap;
			people.push({ person, label: OUTFITS[outfit].title, x, z: -1.2, seed: i, row: 'outfits' });
		});
		EXPRESSIONS.forEach((expression, i) => {
			const look = appearanceOf(`face-${i}`);
			const appearance = skin === 'by-id' ? look : { ...look, skin };
			const person = createPerson({ outfit: 'flight', appearance, expression }, material);
			const x = (i - (EXPRESSIONS.length - 1) / 2) * gap;
			people.push({ person, label: expression, x, z: 1.2, seed: 20 + i, row: 'faces' });
		});
		for (const p of people) {
			p.person.mesh.position.set(p.x, 0, p.z);
			scene.add(p.person.mesh);
		}
		showRows();
	};
	const showRows = (): void => {
		for (const p of people) {
			p.person.mesh.visible =
				view === 'all' || view === p.row || (view === 'close' && p.row === 'faces');
		}
	};
	build();

	// scale references: a 1.25 m × 1 m drum (the stock command pod's box) and a 1.7 m pole
	const refMat = new MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.5 });
	const drum = new Mesh(new CylinderGeometry(0.625, 0.625, 1, 32), refMat);
	drum.position.set(-7.6, 0.5, -1.2);
	drum.castShadow = true;
	const pole = new Mesh(
		new CylinderGeometry(0.02, 0.02, CREW_HEIGHT, 8),
		new MeshStandardMaterial({ color: 0xe0572b })
	);
	pole.position.set(-6.7, CREW_HEIGHT / 2, -1.2);
	scene.add(drum, pole);

	let action: Action = 'idle';
	let frame = 0;
	let width = 0;
	let height = 0;
	const t0 = performance.now();
	const loop = (): void => {
		frame = requestAnimationFrame(loop);
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (w !== width || h !== height) {
			width = w;
			height = h;
			gl.setPixelRatio(Math.min(devicePixelRatio, 2));
			gl.setSize(w, h, false);
			camera.aspect = w / Math.max(h, 1);
			camera.updateProjectionMatrix();
		}
		const t = (performance.now() - t0) / 1000;
		for (const p of people) p.person.pose(personPose(action, t, t * 1.15, p.seed));
		controls.update();
		gl.render(scene, camera);
	};
	loop();

	return {
		setAction(a) {
			action = a;
		},
		setView(v) {
			const views: Record<LineupView, [number, number, number, number, number, number]> = {
				all: [0, 1.9, 12.5, 0, 0.9, 0],
				outfits: [0, 1.5, 6.4, 0, 0.85, -1.2],
				faces: [0, 1.4, 6.5, 0, 0.9, 1.2],
				close: [-1.6, 1.35, 3.6, -1.6, 1.0, 1.2]
			};
			view = v;
			showRows();
			const [x, y, z, tx, ty, tz] = views[v];
			camera.position.set(x, y, z);
			controls.target.set(tx, ty, tz);
			controls.update();
		},
		setSkin(s) {
			skin = s;
			build();
		},
		labels() {
			return people.filter((p) => p.person.mesh.visible).map((p) => {
				const v = p.person.mesh.position.clone();
				v.y = -0.12;
				v.project(camera);
				return { text: p.label, x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
			});
		},
		get triangles() {
			return gl.info.render.triangles;
		},
		get calls() {
			return gl.info.render.calls;
		},
		dispose() {
			cancelAnimationFrame(frame);
			controls.dispose();
			for (const p of people) p.person.dispose();
			material.dispose();
			pmrem.dispose();
			gl.dispose();
		}
	};
}

export { SKIN_NAMES };
