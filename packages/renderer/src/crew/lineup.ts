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
import type { CrewAnimationDefinition } from '@orbital/core';
import { animationFor, poseFor } from './content.ts';
import { CREW_HEIGHT, appearanceOf, crewContent, withSkin } from './outfits.ts';
import { createCrewMaterial, createPerson, type Person } from './person.ts';
import type { Action } from './poses.ts';

export type LineupView = 'all' | 'outfits' | 'faces' | 'close';

export interface CrewLineup {
	/** Plays the animation the game uses for a role. */
	setAction(action: Action): void;
	/** Plays one registered animation by id (any of a role's, not only the one in use). */
	setAnimation(id: string): void;
	/** Shows only what one plugin registered (null: everything). */
	setFilter(mod: string | null): void;
	/** Builds the figures again from the crew content (after `setCrewContent`). */
	rebuild(): void;
	/** Frames the whole line-up, the outfit row, the expression row or four faces close up. */
	setView(view: LineupView): void;
	/** A skin look id, or each figure's own look. */
	setSkin(skin: string | 'by-id'): void;
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
	let skin: string | 'by-id' = 'by-id';
	let filter: string | null = null;
	const build = (): void => {
		for (const p of people) {
			scene.remove(p.person.mesh);
			p.person.dispose();
		}
		people.length = 0;
		const gap = 1.05;
		const content = crewContent();
		const mine = (id: string): boolean => filter === null || content.by.get(id) === filter;
		const outfits = content.outfits.filter((o) => mine(o.id));
		const faces = content.expressions.filter((e) => mine(e.id));
		const podOutfit = content.outfits.find((o) => o.uses?.includes('pod'))?.id ?? 'crew.fallback';
		const lookOf = (id: string) => {
			const look = appearanceOf(id);
			return skin === 'by-id' ? look : withSkin(look, skin);
		};
		outfits.forEach((outfit, i) => {
			const person = createPerson(
				{ outfit: outfit.id, appearance: lookOf(`lineup-${i}`) },
				material
			);
			const x = (i - (outfits.length - 1) / 2) * gap;
			people.push({ person, label: outfit.title, x, z: -1.2, seed: i, row: 'outfits' });
		});
		faces.forEach((expression, i) => {
			const person = createPerson(
				{ outfit: podOutfit, appearance: lookOf(`face-${i}`), expression: expression.id },
				material
			);
			const x = (i - (faces.length - 1) / 2) * gap;
			people.push({ person, label: expression.title, x, z: 1.2, seed: 20 + i, row: 'faces' });
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
	let animation: CrewAnimationDefinition | undefined = animationFor('idle');
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
		for (const p of people)
			p.person.pose(poseFor(animation?.role ?? action, t, t * 1.15, p.seed, animation));
		controls.update();
		gl.render(scene, camera);
	};
	loop();

	return {
		setAction(a) {
			action = a;
			animation = animationFor(a);
		},
		setAnimation(id) {
			const found = crewContent().animations.find((x) => x.id === id);
			if (found) {
				animation = found;
				action = found.role;
			}
		},
		setFilter(mod) {
			filter = mod;
			build();
		},
		rebuild() {
			animation = animationFor(action);
			build();
		},
		setView(v) {
			const views: Record<LineupView, [number, number, number, number, number, number]> = {
				all: [0, 1.9, 12.5, 0, 0.9, 0],
				outfits: [-0.7, 1.25, 8.4, -0.7, 0.95, -1.2],
				faces: [0, 1.3, 8.8, 0, 0.95, 1.2],
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
			return people
				.filter((p) => p.person.mesh.visible)
				.map((p) => {
					const v = p.person.mesh.position.clone();
					v.y = -0.32;
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

