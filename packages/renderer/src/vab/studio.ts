/**
 * The Hangar's two looks (plan 375, the owner's request of 2026-10-23):
 * - **normal**: the realistic hangar;
 * - **zen**: a 3D modelling studio. A neutral gradient backdrop, a ground grid and studio
 *   three-point light; no building, props or walkers. The tools are the same in both.
 *
 * A switch must not stall, so the scene keeps one light set and one set of objects for both looks:
 * - the lights only change intensity and colour, never visibility or count (a light's count and kind
 *   are part of every lit shader program);
 * - the fog only changes density;
 * - the hidden objects were compiled before the first frame (`VabView` warms both looks), so neither
 *   look meets a new program later.
 */
import {
	BackSide,
	BufferAttribute,
	Color,
	type DirectionalLight,
	type FogExp2,
	GridHelper,
	Group,
	type HemisphereLight,
	type Light,
	type LineBasicMaterial,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	CircleGeometry,
	SphereGeometry
} from 'three';

export type HangarLook = 'normal' | 'zen';
export const HANGAR_LOOKS: readonly HangarLook[] = ['normal', 'zen'];

/** Colours of the studio: a soft grey backdrop like a modelling tool's viewport. */
const STUDIO = {
	top: 0x2a2e35,
	horizon: 0x5d636c,
	bottom: 0x353940,
	floor: 0x464b53,
	gridMajor: 0x9aa1ab,
	gridMinor: 0x6a7079,
	clear: 0x3b4048
} as const;

export interface Studio {
	root: Group;
	dispose(): void;
}

/**
 * The studio's backdrop, floor and grid. `floorY` is where the vessel stands (the platform top in
 * the normal look), so it sits on the grid.
 */
export function createStudio(floorY: number): Studio {
	const root = new Group();
	root.name = 'studio';
	// a backdrop sphere with a vertical gradient, unlit, untouched by fog and tone mapping
	const sky = new SphereGeometry(320, 32, 16);
	const pos = sky.getAttribute('position');
	const colours = new Float32Array(pos.count * 3);
	const top = new Color(STUDIO.top);
	const horizon = new Color(STUDIO.horizon);
	const bottom = new Color(STUDIO.bottom);
	const c = new Color();
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i) / 320;
		if (y >= 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6));
		else c.copy(horizon).lerp(bottom, Math.pow(-y, 0.5));
		colours.set([c.r, c.g, c.b], i * 3);
	}
	sky.setAttribute('color', new BufferAttribute(colours, 3));
	const skyMat = new MeshBasicMaterial({
		vertexColors: true,
		side: BackSide,
		fog: false,
		depthWrite: false,
		toneMapped: false
	});
	skyMat.name = 'studio-backdrop';
	const backdrop = new Mesh(sky, skyMat);
	backdrop.renderOrder = -10;
	backdrop.frustumCulled = false;
	// a matte floor that takes the key light's shadow
	const floorGeo = new CircleGeometry(90, 64).rotateX(-Math.PI / 2);
	const floorMat = new MeshStandardMaterial({ color: STUDIO.floor, roughness: 0.92, metalness: 0 });
	floorMat.name = 'studio-floor';
	const floor = new Mesh(floorGeo, floorMat);
	floor.position.y = floorY - 0.002;
	floor.receiveShadow = true;
	// a 1 m grid to 30 m, a 10 m grid to 80 m
	const minor = new GridHelper(60, 60, STUDIO.gridMinor, STUDIO.gridMinor);
	const major = new GridHelper(160, 16, STUDIO.gridMajor, STUDIO.gridMajor);
	for (const [grid, opacity] of [
		[minor, 0.35],
		[major, 0.6]
	] as const) {
		const m = grid.material as LineBasicMaterial;
		m.transparent = true;
		m.opacity = opacity;
		m.depthWrite = false;
		grid.position.y = floorY + (grid === minor ? 0.001 : 0.002);
	}
	root.add(backdrop, floor, minor, major);
	return {
		root,
		dispose() {
			for (const o of [backdrop, floor, minor, major]) {
				o.geometry.dispose();
				(o.material as { dispose(): void }).dispose();
			}
		}
	};
}

/** One light's colour and intensity in each look. */
export interface LightLook {
	light: Light;
	normal: { intensity: number; colour: number };
	zen: { intensity: number; colour: number };
}

export interface LookTargets {
	/** Shown in the normal look only: the hangar building, props and walkers. */
	hangar: readonly Object3D[];
	studio: Object3D;
	lights: readonly LightLook[];
	fog: FogExp2;
	fogDensity: { normal: number; zen: number };
	background: Color;
	backgroundColour: { normal: number; zen: number };
}

/** The studio's key, fill and rim (a classic three-point set) for the view's existing lights. */
export const ZEN_LIGHTS = {
	key: { intensity: 2.4, colour: 0xffffff },
	fill: { intensity: 0.9, colour: 0xe8eef7 },
	rim: { intensity: 1.6, colour: 0xf2f5ff },
	sky: { intensity: 0.55, colour: 0xdfe6f0 },
	off: { intensity: 0, colour: 0xffffff }
} as const;

export const ZEN_BACKGROUND = STUDIO.clear;

/** Applies `look`: visibility of the hangar and the studio, light intensities and colours, fog, background. */
export function applyLook(t: LookTargets, look: HangarLook): void {
	const zen = look === 'zen';
	for (const o of t.hangar) o.visible = !zen;
	t.studio.visible = zen;
	for (const l of t.lights) {
		const s = l[look];
		l.light.intensity = s.intensity;
		l.light.color.setHex(s.colour);
	}
	t.fog.density = t.fogDensity[look];
	t.background.setHex(t.backgroundColour[look]);
}

/** The colour and intensity a light has now, as its normal look. */
export function lightLook(
	light: DirectionalLight | HemisphereLight | Light,
	zen: { intensity: number; colour: number }
): LightLook {
	return {
		light,
		normal: { intensity: light.intensity, colour: light.color.getHex() },
		zen
	};
}

/** Where the player's choice is kept: the world Hangar and the developer sandbox each have one. */
export const LOOK_KEYS = { world: 'orbital.vab.look', sandbox: 'orbital.dev.hangar.look' } as const;

export function readLook(key: string, fallback: HangarLook): HangarLook {
	try {
		const v = globalThis.localStorage?.getItem(key);
		return v === 'zen' || v === 'normal' ? v : fallback;
	} catch {
		return fallback;
	}
}

export function saveLook(key: string, look: HangarLook): void {
	try {
		globalThis.localStorage?.setItem(key, look);
	} catch {
		// blocked storage: the look lasts for this page
	}
}
