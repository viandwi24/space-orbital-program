/**
 * The HUD throttle, the catalogue categories and the stability read-out know a mod's modules through
 * their descriptors (plan 023, ADR 0033), not through the stock module ids. A test mod brings an
 * engine, a wing and a gadget of its own; the stock results are pinned by the existing suites.
 */
import { loadPlugins, partId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePart, definePlugin, z } from '@orbital/sdk';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from './design';
import { categoryOf } from './editor/categories';
import {
	attachNew,
	createEditor,
	radialTarget,
	singlePart,
	type EditorState
} from './editor/state';
import { stabilityOf } from './editor/stability';
import { vesselThrottle } from './hud-model';

const Thruster = defineModule({
	id: 'acme.thruster',
	config: z.object({ thrust: z.number().positive().default(1000) }),
	state: () => ({ throttle: 0 }),
	describe: (config, state) => ({
		engine: {
			massFlow: 1,
			thrust: [{ pressure: 0, thrust: config.thrust }],
			propellants: [{ resource: 'stock.liquid-fuel', ratio: 1 }],
			ignited: state.throttle > 0,
			flameout: false,
			throttle: state.throttle
		}
	}),
	snapshot: (state) => ({ ...state })
});
const Wing = defineModule({
	id: 'acme.wing',
	config: z.object({ area: z.number().positive() }),
	state: () => ({}),
	describe: (config) => ({
		lift: { area: config.area, liftSlope: 2, crossflow: 1.2, centre: [0, -1, 0] },
		category: 'aero'
	})
});
const Gadget = defineModule({
	id: 'acme.gadget',
	state: () => ({}),
	describe: () => ({ category: 'landing' })
});
const Broken = defineModule({
	id: 'acme.broken',
	state: () => ({}),
	describe: () => {
		throw new Error('nope');
	}
});

const shape = { kind: 'cylinder', radius: 0.5, height: 1 } as const;
const attach = {
	top: { pos: [0, 0.5, 0] as [number, number, number], dir: [0, 1, 0] as [number, number, number] },
	bottom: {
		pos: [0, -0.5, 0] as [number, number, number],
		dir: [0, -1, 0] as [number, number, number]
	}
};
const part = (id: string, modules: Parameters<typeof definePart>[0]['modules']) =>
	definePart({ id, title: id, mass: 100, shape, attach, ...(modules ? { modules } : {}) });

const Acme = definePlugin({
	meta: { id: 'acme.mod', title: 'Acme', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		for (const m of [Thruster, Wing, Gadget, Broken]) ctx.modules.register(m);
		ctx.parts.register(part('acme.motor', [[Thruster, {}]]));
		ctx.parts.register(
			definePart({
				id: 'acme.blade',
				title: 'Blade',
				mass: 30,
				crossfeed: false,
				shape: { kind: 'box', size: [1.1, 1.8, 0.06] },
				attach: { radial: { pos: [-0.55, 0, 0], dir: [-1, 0, 0] } },
				modules: [[Wing, { area: 3 }]]
			})
		);
		ctx.parts.register(part('acme.thing', [[Gadget, undefined]]));
		ctx.parts.register(part('acme.faulty', [[Broken, undefined]]));
	}
});

const { registries } = loadPlugins([Stock, Acme]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

describe('vessel throttle through descriptors', () => {
	const snap = (definition: string, modules: Record<string, unknown>) => ({
		definition: partId(definition),
		modules
	});
	it("shows a mod engine's throttle, the highest of several, stock engines included", () => {
		expect(
			vesselThrottle([snap('acme.motor', { 'acme.thruster': { throttle: 0.6 } })], 0, content)
		).toBe(0.6);
		expect(
			vesselThrottle(
				[
					snap('acme.motor', { 'acme.thruster': { throttle: 0.3 } }),
					snap('stock.engine-lv', {
						'stock.engine': { throttle: 0.9, ignited: true, flameout: false, gimbal: [0, 0] }
					})
				],
				0,
				content
			)
		).toBe(0.9);
	});
	it('falls back without an engine, with unknown parts, and when a descriptor throws', () => {
		expect(vesselThrottle([snap('stock.tank-small', {})], 0.4, content)).toBe(0.4);
		expect(vesselThrottle([snap('nobody.part', { x: 1 })], 0.4, content)).toBe(0.4);
		expect(vesselThrottle([snap('acme.faulty', { 'acme.broken': {} })], 0.4, content)).toBe(0.4);
	});
});

describe('catalogue categories through descriptors', () => {
	it('puts a mod part where its module says; the stock parts keep theirs', () => {
		const of = (id: string) => categoryOf(registries.parts.get(id)!, registries.modules);
		expect(of('acme.motor')).toBe('propulsion');
		expect(of('acme.blade')).toBe('aero');
		expect(of('acme.thing')).toBe('landing');
		expect(of('acme.faulty')).toBe('other');
		expect(of('stock.command-pod')).toBe('command');
		expect(of('stock.tank-small')).toBe('tanks');
	});
});

describe('stability through descriptors', () => {
	const editorContent = { parts: content.parts, modules: content.modules };
	/** The reference two-stage with one `finPart` on the lower tank (index 5). */
	function withFin(finPart: string): EditorState {
		const s = createEditor(referenceTwoStage(), editorContent);
		const t = radialTarget(s.design, singlePart(finPart, s.nextIndex), content.parts, 5, 0, -0.4)!;
		return attachNew(s, editorContent, finPart, t, 1);
	}
	it('counts a mod wing like a stock fin', () => {
		expect(stabilityOf(referenceTwoStage(), content).fins).toBe(0);
		expect(stabilityOf(withFin('stock.fin').design, content).fins).toBe(1);
		expect(stabilityOf(withFin('acme.blade').design, content).fins).toBe(1);
	});
});
