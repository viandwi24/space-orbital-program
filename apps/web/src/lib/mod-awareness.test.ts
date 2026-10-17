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
import { categoryOf, sortParts } from './editor/categories';
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
		// Placement of the part itself (ADR 0082): no modules, an override of what the modules say.
		ctx.parts.register({
			...part('acme.plate', undefined),
			catalog: { category: 'structural', order: -5 }
		});
		ctx.parts.register({
			...part('acme.cowl', undefined),
			catalog: { category: 'aero', order: 3 }
		});
		ctx.parts.register({
			...part('acme.quiet-motor', [[Thruster, {}]]),
			catalog: { category: 'other', order: -1 }
		});
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
		expect(of('acme.motor')).toBe('stock.propulsion');
		expect(of('acme.blade')).toBe('stock.aero');
		expect(of('acme.thing')).toBe('stock.landing');
		expect(of('acme.faulty')).toBe('stock.other');
		expect(of('stock.command-pod')).toBe('stock.command');
		expect(of('stock.tank-small')).toBe('stock.tanks');
	});
	it("a part's own catalogue entry beats what its modules imply, and orders the list", () => {
		const of = (id: string) => categoryOf(registries.parts.get(id)!, registries.modules);
		expect(of('acme.plate')).toBe('stock.structural');
		expect(of('acme.cowl')).toBe('stock.aero');
		expect(of('acme.motor')).toBe('stock.propulsion');
		expect(of('acme.quiet-motor')).toBe('stock.other');
		const ids = sortParts(registries.parts.list()).map((p) => p.id);
		expect(ids.indexOf('acme.plate')).toBeLessThan(ids.indexOf('acme.quiet-motor'));
		expect(ids.indexOf('acme.quiet-motor')).toBeLessThan(ids.indexOf('stock.command-pod'));
		expect(ids.indexOf('stock.command-pod')).toBeLessThan(ids.indexOf('acme.cowl'));
		// stock keeps the grouping its modules imply: no explicit placement anywhere
		expect(registries.parts.list().filter((p) => p.id.startsWith('stock.') && p.catalog)).toEqual(
			[]
		);
		// parts without an order keep registration order
		const stockIds = registries.parts
			.list()
			.filter((p) => p.id.startsWith('stock.'))
			.map((p) => p.id);
		expect(ids.filter((i) => i.startsWith('stock.'))).toEqual(stockIds);
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
	it("a mod wing moves the centre of pressure by the numbers of its descriptor's lift", () => {
		const bare = stabilityOf(referenceTwoStage(), content);
		const winged = stabilityOf(withFin('acme.blade').design, content);
		expect(winged.cop).not.toBeCloseTo(bare.cop!, 3);
		// the plate sits below the middle of the stack, so the pressure moves down
		expect(winged.cop!).toBeLessThan(bare.cop!);
	});
});
