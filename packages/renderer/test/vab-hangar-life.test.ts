import { describe, expect, it } from 'bun:test';
import {
	Color,
	InstancedMesh,
	Mesh,
	Object3D,
	PerspectiveCamera,
	Vector3,
	SkinnedMesh
} from 'three';
import { DEFAULT_TIME_OF_DAY, dayLight, floorPatch } from '../src/vab/hangar-light.ts';
import {
	CREW,
	LANE,
	LANE_LENGTH,
	REST_TIME,
	WALK_SPEED,
	cranePose,
	crewPose,
	lanePose,
	tugPoses
} from '../src/vab/hangar-movers.ts';
import { HANGAR, createHangar } from '../src/vab/hangar.ts';
import { HighlightMaterials } from '../src/vab/highlight.ts';
import { SAFETY_CELLS, SIGN_ATLAS, numberCell, paintSignAtlas } from '../src/vab/hangar-signs.ts';
import {
	MARKER_PIXELS,
	StabilityMarkerKit,
	createGlyphGeometry,
	markerWorldRadius
} from '../src/vab/stability-markers.ts';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
	Math.hypot(a.x - b.x, a.z - b.z);

describe('daylight', () => {
	it('moves the sun from -x over -z to +x and warms the light at the horizon', () => {
		const dawn = dayLight(0);
		const noon = dayLight(0.5);
		const dusk = dayLight(1);
		expect(dawn.toSun[0]).toBeLessThan(-0.9);
		expect(noon.toSun[2]).toBeLessThan(-0.5);
		expect(dusk.toSun[0]).toBeGreaterThan(0.9);
		expect(noon.elevation).toBeGreaterThan(dawn.elevation);
		expect(dawn.warmth).toBeGreaterThan(noon.warmth);
		expect(dawn.sun[2]).toBeLessThan(noon.sun[2]);
		for (const d of [dawn, noon, dusk]) expect(Math.hypot(...d.toSun)).toBeCloseTo(1, 9);
	});

	it('clamps and defaults', () => {
		expect(dayLight(-3).time).toBe(0);
		expect(dayLight(9).time).toBe(1);
		expect(dayLight().time).toBe(DEFAULT_TIME_OF_DAY);
		expect(dayLight(Number.NaN).time).toBe(DEFAULT_TIME_OF_DAY);
	});

	it('projects a window down to the floor along the sun, or nothing when the sun is below', () => {
		const sun = dayLight(0.5).toSun;
		const patch = floorPatch(
			[
				[0, 30, -29],
				[4, 30, -29],
				[4, 34, -29],
				[0, 34, -29]
			],
			sun
		)!;
		expect(patch.length).toBe(4);
		for (const p of patch) expect(p[1]).toBe(0);
		// The sun is in -z, so light lands further into the room (+z) than the window.
		expect(patch[0]![2]).toBeGreaterThan(-29);
		expect(floorPatch([[0, 1, 0]], [1, -0.2, 0])).toBeNull();
	});
});

describe('movers', () => {
	it('the tug lane is a closed, continuous loop', () => {
		const step = 0.05;
		let prev = lanePose(0);
		for (let s = step; s < LANE_LENGTH + 1; s += step) {
			const p = lanePose(s);
			expect(dist(p, prev)).toBeLessThan(step * 1.05);
			prev = p;
		}
		expect(dist(lanePose(0), lanePose(LANE_LENGTH))).toBeLessThan(1e-9);
		// Stays inside the lane rectangle and clear of the crates and walls.
		for (let s = 0; s < LANE_LENGTH; s += 0.5) {
			const p = lanePose(s);
			expect(p.z).toBeGreaterThanOrEqual(LANE.zWest - 1e-9);
			expect(p.z).toBeLessThanOrEqual(LANE.zEast + 1e-9);
			expect(Math.abs(p.x)).toBeLessThan(HANGAR.half - 8);
		}
	});

	it('the tug heading follows its motion and the trailer trails along the lane', () => {
		for (const t of [0, 7, 19, 23, 31, 44, 60]) {
			const a = lanePose(t * LANE.speed);
			const b = lanePose(t * LANE.speed + 0.01);
			const heading = Math.atan2(b.z - a.z, b.x - a.x);
			const d = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading));
			expect(Math.abs(d)).toBeLessThan(0.02);
			const { tug, trailer } = tugPoses(t);
			expect(dist(tug, trailer)).toBeGreaterThan(2.5);
			expect(dist(tug, trailer)).toBeLessThan(3.7);
		}
	});

	it('the crane stays clear of the towers and the platform at every time', () => {
		for (let t = 0; t < 400; t += 0.7) {
			const p = cranePose(t);
			// The towers' decks start at |x| = 13 (plan 220); the crate is 1.8 m wide.
			expect(Math.abs(p.trolleyX) + 0.9).toBeLessThan(13);
			expect(p.bridgeZ + 0.9).toBeLessThan(-HANGAR.platformRadius);
			// Crate bottom (4.75 m under the hook) above the tug (2 m) and the hook below the crane.
			expect(p.hookY - 4.8).toBeGreaterThan(2.2);
			expect(p.hookY).toBeLessThan(30);
			expect(Math.abs(p.trolleyX)).toBeLessThan(HANGAR.half - 3);
		}
	});

	it('crew walk at walking pace along their paths and pause at the ends of a line', () => {
		const spec = CREW.find((c) => c.path.kind === 'circle')!;
		const a = crewPose(spec, 10);
		const b = crewPose(spec, 11);
		expect(dist(a, b)).toBeCloseTo(WALK_SPEED, 1);
		// The circle keeps a radius around the platform, outside its edge.
		expect(Math.hypot(a.x, a.z)).toBeGreaterThan(HANGAR.platformRadius + 1);
		const line = CREW.find((c) => c.path.kind === 'line')!;
		const stopped = Array.from({ length: 80 }, (_, i) => crewPose(line, i * 0.5)).filter(
			(p) => !p.moving
		);
		expect(stopped.length).toBeGreaterThan(0);
		for (const s of CREW.filter((c) => c.path.kind === 'stand')) {
			expect(crewPose(s, 5)).toEqual(crewPose(s, 500));
		}
	});
});

describe('hangar variants', () => {
	const count = (root: Object3D): { meshes: number; instanced: number } => {
		let meshes = 0;
		let instanced = 0;
		root.traverse((o) => {
			if (o instanceof InstancedMesh) instanced++;
			if (o instanceof Mesh) meshes++;
		});
		return { meshes, instanced };
	};

	it('high has daylight shafts and work lights, low has neither', () => {
		const high = createHangar({ dust: 0, textureSize: 32, quality: 'high' });
		const low = createHangar({ dust: 0, textureSize: 32, quality: 'low' });
		expect(high.shafts.children.length).toBe(2);
		expect(high.workLights.length).toBeGreaterThan(0);
		expect(low.shafts.children.length).toBe(0);
		expect(low.workLights.length).toBe(0);
		high.dispose();
		low.dispose();
	});

	it('draws the hall in a bounded number of meshes with the crew as one skinned mesh each', () => {
		const h = createHangar({ dust: 0, textureSize: 32 });
		h.root.remove(h.shafts);
		const c = count(h.root);
		expect(c.meshes).toBeLessThan(85);
		expect(c.instanced).toBeLessThanOrEqual(1);
		let skinned = 0;
		h.root.traverse((o) => {
			if (o instanceof SkinnedMesh) skinned++;
		});
		expect(skinned).toBe(CREW.length);
		h.dispose();
	});

	it('moves crane, tug and crew over time, and not at all with reduced motion', () => {
		const snapshot = (h: ReturnType<typeof createHangar>): number[] => {
			const hook = h.root.getObjectByName('crane-hook')!.getWorldPosition(new Vector3());
			const tug = h.root.getObjectByName('tug')!.position;
			return [hook.x, hook.y, hook.z, tug.x, tug.z];
		};
		const moving = createHangar({ dust: 0, textureSize: 32 });
		const still = createHangar({ dust: 0, textureSize: 32, reducedMotion: true });
		const before = snapshot(moving);
		const rest = snapshot(still);
		moving.update(0.016, 30);
		still.update(0.016, 30);
		expect(snapshot(moving)).not.toEqual(before);
		expect(snapshot(still)).toEqual(rest);
		still.update(0.016, 90);
		expect(snapshot(still)).toEqual(rest);
		// The still pose is the rest time's pose.
		const hook = still.root.getObjectByName('crane-hook')!;
		expect(hook.position.y).toBeCloseTo(cranePose(REST_TIME).hookY, 9);
		moving.dispose();
		still.dispose();
	});

	it('the time of day tints the window sky and the sun', () => {
		const dawn = createHangar({ dust: 0, textureSize: 32, timeOfDay: 0 });
		const noon = createHangar({ dust: 0, textureSize: 32, timeOfDay: 0.5 });
		expect(dawn.daylight.warmth).toBeGreaterThan(noon.daylight.warmth);
		expect(dawn.daylight.toSun).not.toEqual(noon.daylight.toSun);
		dawn.dispose();
		noon.dispose();
	});
});

describe('signage atlas', () => {
	it('keeps every cell inside the atlas and paints without overflowing', () => {
		const cells = [...Object.values(SAFETY_CELLS), ...[1, 2, 3, 4, 5, 6, 7].map(numberCell)];
		for (const c of cells) {
			expect(c.x).toBeGreaterThanOrEqual(0);
			expect(c.y).toBeGreaterThanOrEqual(0);
			expect(c.x + c.w).toBeLessThanOrEqual(SIGN_ATLAS.width);
			expect(c.y + c.h).toBeLessThanOrEqual(SIGN_ATLAS.height);
		}
		const texts: string[] = [];
		const noop = (): void => {};
		paintSignAtlas({
			fillStyle: '',
			strokeStyle: '',
			lineWidth: 1,
			font: '',
			textAlign: 'left',
			textBaseline: 'alphabetic',
			fillRect: noop,
			strokeRect: noop,
			fillText: (t: string) => void texts.push(t),
			beginPath: noop,
			moveTo: noop,
			lineTo: noop,
			closePath: noop,
			fill: noop,
			stroke: noop,
			arc: noop
		});
		expect(texts).toContain('EXIT');
		expect(texts).toContain('7');
	});
});

describe('stability glyphs', () => {
	it('keeps a constant size on screen: the world radius grows with distance and shrinks with view height', () => {
		const a = markerWorldRadius(10, 38, 800, 14);
		expect(markerWorldRadius(20, 38, 800, 14)).toBeCloseTo(2 * a, 9);
		expect(markerWorldRadius(10, 38, 1600, 14)).toBeCloseTo(a / 2, 9);
		// A 14 px radius in an 800 px view at 10 m: about 0.12 m.
		expect(a).toBeGreaterThan(0.1);
		expect(a).toBeLessThan(0.14);
	});

	it('builds one merged geometry per kind, with a halo, and scales and turns each glyph to the camera', () => {
		for (const kind of ['com', 'cop', 'com-empty'] as const) {
			for (const thick of [false, true]) {
				const g = createGlyphGeometry(kind, thick);
				expect(g.getAttribute('position').count).toBeGreaterThan(30);
				expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
				g.dispose();
			}
		}
		const kit = new StabilityMarkerKit();
		const m = kit.create({ key: 'a', kind: 'com', group: 'main', position: [0, 0, 0] });
		expect(m.raycast).not.toBe(Mesh.prototype.raycast);
		expect(kit.material.depthTest).toBe(false);
		const cam = new PerspectiveCamera(38, 1, 0.1, 100);
		cam.position.set(0, 0, 10);
		cam.lookAt(0, 0, 0);
		cam.updateMatrixWorld(true);
		const holder = new Object3D();
		holder.add(m);
		holder.updateMatrixWorld(true);
		kit.orient([m], cam, 38, 800);
		const near = m.scale.x;
		cam.position.set(0, 0, 20);
		cam.updateMatrixWorld(true);
		kit.orient([m], cam, 38, 800);
		expect(m.scale.x).toBeCloseTo(near * 2, 6);
		expect(m.quaternion.angleTo(cam.quaternion)).toBeLessThan(1e-9);
		kit.setHighContrast(true);
		expect(MARKER_PIXELS.com.high).toBeGreaterThan(MARKER_PIXELS.com.normal);
		kit.dispose();
	});
});

describe('high contrast highlights', () => {
	/** WCAG relative luminance of an sRGB hex colour. */
	const luminance = (hex: number): number => {
		const c = new Color(hex);
		return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // Color works in linear space already
	};
	const contrast = (a: number, b: number): number =>
		(Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

	it('uses brighter, wider, steady outlines that clear 4.5:1 against the dark hangar', () => {
		const normal = new HighlightMaterials();
		const high = new HighlightMaterials();
		high.setHighContrast(true);
		const hangarDark = luminance(0x172029);
		for (const kind of ['hover', 'select', 'flag', 'ghost', 'xray'] as const) {
			const n = normal.lookOf(kind);
			const h = high.lookOf(kind);
			expect(h.power).toBeLessThan(n.power);
			expect(h.rim).toBeGreaterThan(n.rim);
			expect(h.pulse).toBe(0);
			expect(contrast(luminance(h.colour), hangarDark)).toBeGreaterThanOrEqual(4.5);
		}
		normal.dispose();
		high.dispose();
	});

	it('updates the materials already created and keeps the x-ray pass see-through', () => {
		const m = new HighlightMaterials();
		const sel = m.get('select');
		const xray = m.get('xray');
		expect(xray.depthTest).toBe(false);
		expect(m.get('ghost').depthTest).toBe(true);
		const before = sel.uniforms.uPower!.value as number;
		m.setHighContrast(true);
		expect(sel.uniforms.uPower!.value as number).toBeLessThan(before);
		expect(m.ghost.opacity).toBeGreaterThan(0.5);
		m.setHighContrast(false);
		expect(sel.uniforms.uPower!.value).toBe(before);
		m.dispose();
	});
});
