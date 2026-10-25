import { describe, expect, test } from 'bun:test';
import { BoxGeometry, Mesh, Object3D, PlaneGeometry, ShaderMaterial } from 'three';
import { BillboardField } from '../src/effects/field.ts';
import { GroundGlow } from '../src/effects/ground-glow.ts';
import { PlasmaEffect } from '../src/effects/plasma-mesh.ts';
import { PlumeEffect } from '../src/effects/plume-mesh.ts';
import { FIRE_FRAG, SMOKE_FRAG } from '../src/effects/shaders.ts';
import { TrailRibbon } from '../src/effects/trail-ribbon.ts';
import { SiteSteam } from '../src/site-steam.ts';
import { Twins } from '../src/tsl/twins.ts';
import { HighlightMaterials, type HighlightKind } from '../src/vab/highlight.ts';

/**
 * Every GLSL material that has a TSL twin (plan 388): the twin is made against the scene's own
 * material without an error, and the material gives every uniform its shaders declare. A material
 * that shares a twinned shader without one of its uniforms (the plasma wake had no `uPeriod`)
 * broke the twin's node build on every Space Center load.
 */
const sources = (): { name: string; root: Object3D }[] => {
	const plume = new PlumeEffect(
		{ nozzle: [0, 0, 0], exitRadius: 0.4 } as never,
		new BoxGeometry(),
		new PlaneGeometry()
	);
	const plasma = new PlasmaEffect();
	const smoke = new BillboardField(8, SMOKE_FRAG, false, true);
	const fire = new BillboardField(8, FIRE_FRAG, true);
	const trail = new TrailRibbon();
	const glow = new GroundGlow(2);
	const steam = new SiteSteam([{ x: 0, y: 0, z: 0 }]);
	const highlight = new HighlightMaterials();
	const kinds: HighlightKind[] = ['hover', 'select', 'flag', 'xray'];
	const hl = new Object3D();
	for (const k of kinds) hl.add(new Mesh(new BoxGeometry(), highlight.get(k)));
	const root = (o: unknown): Object3D =>
		(o as { root?: Object3D; mesh?: Object3D; object?: Object3D }).root ??
		(o as { mesh?: Object3D }).mesh ??
		(o as { object?: Object3D }).object ??
		(o as Object3D);
	return [
		{ name: 'plume', root: plume.root },
		{ name: 'plasma', root: root(plasma) },
		{ name: 'smoke', root: smoke.mesh },
		{ name: 'fire', root: fire.mesh },
		{ name: 'trail', root: root(trail) },
		{ name: 'ground glow', root: glow.root },
		{ name: 'site steam', root: root(steam) },
		{ name: 'highlight', root: hl }
	];
};

const shaded = (root: Object3D): { o: Object3D; m: ShaderMaterial }[] => {
	const out: { o: Object3D; m: ShaderMaterial }[] = [];
	root.traverse((o) => {
		const m = (o as Mesh).material as ShaderMaterial | undefined;
		if (m && !Array.isArray(m) && m.isShaderMaterial) out.push({ o, m });
	});
	return out;
};

/** The uniforms a shader declares, without three's own (`uniform mat4 modelViewMatrix` etc. are injected, not declared). */
const declared = (src: string): string[] =>
	[...src.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/gm)].map((m) => m[1]!);

describe('TSL twins (plan 388)', () => {
	for (const { name, root } of sources()) {
		test(`${name}: every material has a twin, made and synced without an error`, () => {
			const list = shaded(root);
			expect(list.length).toBeGreaterThan(0);
			const twins = new Twins();
			for (const { o, m } of list) {
				const twin = twins.twinOf(m, o);
				expect(twin, `${name}: ${m.name || m.type} on ${o.name}`).not.toBeNull();
				expect(() => twin!.sync()).not.toThrow();
			}
		});
		test(`${name}: every uniform a shader declares is given by the material`, () => {
			for (const { m } of shaded(root)) {
				const names = new Set([...declared(m.vertexShader), ...declared(m.fragmentShader)]);
				const missing = [...names].filter((n) => !(n in m.uniforms));
				expect(missing, `${name}: ${m.name || m.type}`).toEqual([]);
			}
		});
	}

	test('a material without a uniform its twin reads is named in the error', () => {
		const glow = new GroundGlow(1);
		const mesh = shaded(glow.root)[0]!;
		delete mesh.m.uniforms.uGain;
		expect(() => new Twins().twinOf(mesh.m, mesh.o)).toThrow(/no uniform uGain/);
	});
});

describe('a twin and its material', () => {
	test('disposing the material disposes its twin, and a later draw makes a new one', () => {
		const twins = new Twins();
		const smoke = new BillboardField(8, SMOKE_FRAG, false, true);
		const m = smoke.mesh.material as ShaderMaterial;
		const twin = twins.twinOf(m, smoke.mesh)!;
		expect(twin).not.toBeNull();
		let disposed = 0;
		twin.material.addEventListener('dispose', () => disposed++);
		expect(twins.twinOf(m, smoke.mesh)).toBe(twin);
		m.dispose();
		expect(disposed).toBe(1);
		expect(twins.twinOf(m, smoke.mesh)).not.toBe(twin);
	});
});
