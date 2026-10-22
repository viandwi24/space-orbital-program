/** Plan 346 (ADR 0295 point 5): the side outline of a design without a saved thumbnail. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { boosterRocket } from '../editor/examples';
import { designProfile, profileSvg } from './design-profile';

const { registries } = loadPlugins([Stock]);
const content = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

describe('designProfile', () => {
	it('outlines every shaped part of a stack, taller than wide, with the capsule and engines marked', () => {
		const design = referenceTwoStage();
		const p = designProfile(design, registries.parts)!;
		expect(p).not.toBeNull();
		expect(p.shapes.length).toBe(design.parts.length);
		expect(p.maxY - p.minY).toBeGreaterThan(p.maxX - p.minX);
		expect(p.shapes.some((s) => s.role === 'command')).toBe(true);
		expect(p.shapes.some((s) => s.role === 'engine')).toBe(true);
	});

	it('radial boosters widen it', () => {
		const stack = designProfile(referenceTwoStage(), registries.parts)!;
		const boosted = designProfile(boosterRocket(content), registries.parts)!;
		expect(boosted.maxX - boosted.minX).toBeGreaterThan(stack.maxX - stack.minX);
	});

	it('an empty design has no outline', () => {
		expect(designProfile({ ...referenceTwoStage(), parts: [] }, registries.parts)).toBeNull();
	});
});

describe('profileSvg', () => {
	it('fits the outline inside the box', () => {
		const svg = profileSvg(designProfile(referenceTwoStage(), registries.parts)!, 100, 200, 8);
		expect(svg.startsWith('<svg')).toBe(true);
		const nums = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
			m[1]!.split(' ').map((pt) => pt.split(',').map(Number))
		);
		for (const [x, y] of nums) {
			expect(x).toBeGreaterThanOrEqual(7.9);
			expect(x).toBeLessThanOrEqual(92.1);
			expect(y).toBeGreaterThanOrEqual(7.9);
			expect(y).toBeLessThanOrEqual(192.1);
		}
	});
});
