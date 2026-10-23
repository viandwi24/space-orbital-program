/**
 * Plan 317 (ADR 0273): the generated art gallery. Every system the game loads (stock, Sol 1:1, Sol
 * rescaled) and every stock preset gets a picture: deterministic, finite, inside its box; a mod's own
 * illustration wins over it.
 */
import { loadPlugins, type BodyDefinition } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import { systemsOf } from './catalog';
import { modeArt } from './mode-art';
import SystemArt from './SystemArt.svelte';
import { bodyKind, systemPicture, worldHue } from './system-art';

const systems = systemsOf(BUILTIN_PLUGINS);
const variantBodies = (id: string, variant: string): BodyDefinition[] =>
	loadPlugins(BUILTIN_PLUGINS, { system: { id, variant } }).registries.bodies.list();
const gallery: [string, BodyDefinition[]][] = [];
for (const s of systems)
	for (const v of s.variants)
		gallery.push([
			`${s.id} ${v.variant}`,
			s.id === 'stock' ? [...s.bodies] : variantBodies(s.id, v.variant)
		]);

describe('the system art gallery', () => {
	it('has stock and both Sol scales', () => {
		expect(gallery.map(([name]) => name)).toEqual(['stock default', 'sol 1:1', 'sol rescaled']);
	});

	it.each(gallery)(
		'%s: deterministic, finite, in its box, as a card and an icon',
		(name, bodies) => {
			const id = name.split(' ')[0]!;
			for (const layout of ['card', 'icon'] as const) {
				const a = systemPicture(id, bodies, layout);
				expect(systemPicture(id, bodies, layout)).toEqual(a);
				expect(a.bodies.length).toBeGreaterThan(0);
				for (const b of a.bodies) {
					for (const v of [b.x, b.y, b.r]) expect(Number.isFinite(v)).toBe(true);
					expect(b.x - b.r).toBeGreaterThanOrEqual(-0.01);
					expect(b.x + b.r).toBeLessThanOrEqual(a.width + 0.01);
					expect(b.y - b.r).toBeGreaterThanOrEqual(-0.01);
					expect(b.y + b.r).toBeLessThanOrEqual(a.height + 0.01);
				}
				const svg = render(SystemArt, {
					props: { systemId: id, bodies, layout, label: name }
				}).body;
				expect(svg).toContain('<svg');
				expect(svg).not.toContain('NaN');
			}
		}
	);

	it('reads the data: the home world is blue with air, the moon grey rock, Jupiter a giant', () => {
		const stock = gallery[0]![1];
		expect(bodyKind(stock.find((b) => b.id === 'stock.home')!)).toBe('terran');
		expect(bodyKind(stock.find((b) => b.id === 'stock.cinder')!)).toBe('rock');
		const sol = gallery[1]![1];
		expect(bodyKind(sol.find((b) => b.id === 'sol.jupiter')!)).toBe('giant');
		// Sol's planets in orbit order with the Moon beside the Earth
		const pic = systemPicture('sol', sol);
		expect(pic.bodies.map((b) => b.id)).toEqual([
			'sol.mercury',
			'sol.venus',
			'sol.earth',
			'sol.mars',
			'sol.jupiter',
			'sol.saturn',
			'sol.uranus',
			'sol.neptune'
		]);
		expect(pic.bodies.find((b) => b.id === 'sol.earth')!.moons).toHaveLength(1);
		expect(pic.bodies.find((b) => b.id === 'sol.saturn')!.ring).toBeGreaterThan(0);
	});

	it("draws the wider stock system from the bodies' appearance (plan 381)", () => {
		const stock = gallery[0]![1];
		const pic = systemPicture('stock', stock);
		expect(pic.bodies.map((b) => b.id)).toEqual([
			'stock.kiln',
			'stock.vesper',
			'stock.home',
			'stock.ochre',
			'stock.vagrant',
			'stock.tempest',
			'stock.glim'
		]);
		const tempest = pic.bodies.find((b) => b.id === 'stock.tempest')!;
		expect(tempest.bands).toBe(true);
		expect(tempest.ring).toBeGreaterThan(0);
		expect(tempest.moons).toHaveLength(3);
		// the palette's colour, the cloud deck over Vesper, the sky colour as the halo
		expect(pic.bodies.find((b) => b.id === 'stock.ochre')!.light).toBe('#b0603a');
		expect(pic.bodies.find((b) => b.id === 'stock.vesper')!.light).toBe('#eedcae');
		expect(pic.bodies.find((b) => b.id === 'stock.ochre')!.atmosphere).toBe(
			'rgba(214, 162, 122, 0.55)'
		);
		expect(pic.bodies.find((b) => b.id === 'stock.ochre')!.moons).toHaveLength(2);
	});

	it('a mod system with no data beyond its bodies still gets a picture', () => {
		const bodies = [
			{ id: 'mod.star', mass: 1e30, radius: 5e8, rotationPeriod: 1e6, star: true },
			{
				id: 'mod.a',
				mass: 1e24,
				radius: 4e6,
				rotationPeriod: 1e5,
				parent: 'mod.star',
				orbit: { a: 1e10, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
			}
		] as unknown as BodyDefinition[];
		expect(systemPicture('mod', bodies).bodies).toHaveLength(1);
	});

	it("a mod's own illustration is drawn as an image, not the generated diagram", () => {
		const image = 'data:image/svg+xml,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22/%3E';
		const html = render(SystemArt, {
			props: { systemId: 'stock', bodies: gallery[0]![1], image, label: 'Stock' }
		}).body;
		expect(html).toContain('<img');
		expect(html).not.toContain('data-testid="system-art"');
	});

	it('every stock mode has the design line art; another preset gets a seeded glyph', () => {
		for (const id of [
			'stock.sandbox',
			'stock.science',
			'stock.career',
			'stock.career-hardcore',
			'stock.career-engineering'
		])
			expect(modeArt(id).paths.length).toBeGreaterThan(3);
		const mod = modeArt('mod.speedrun');
		expect(modeArt('mod.speedrun')).toEqual(mod);
		expect(mod.color).toMatch(/^hsl\(/);
		expect(mod.paths.every((p) => !p.d.includes('NaN'))).toBe(true);
	});

	it('two worlds of one system get different planet colours', () => {
		const home = gallery[0]![1].find((b) => b.id === 'stock.home');
		expect(worldHue('a', home)).not.toEqual(worldHue('b', home));
		expect(worldHue('a', home)).toEqual(worldHue('a', home));
	});
});
