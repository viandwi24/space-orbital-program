/**
 * A new world's start (player-journey audit Q1, ADR 0322): the buildings its rules need from minute
 * 0, a Career crew, and a save that keeps them without seeding twice.
 */
import { describe, expect, test } from 'bun:test';
import { legacyWorldInfo, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

const world = (preset: string): WorldInfo => ({
	...legacyWorldInfo(4),
	id: `start-${preset}`,
	preset
});
const make = (preset: string) =>
	createSim({ plugins: [Stock], backendFactory: rapier(8), world: world(preset) });
const kinds = (sim: Awaited<ReturnType<typeof make>>) =>
	sim
		.snapshot()
		.sites![0]!.buildings.filter((b) => b.state === 'active')
		.map((b) => b.kind);

describe('a new world starts with what its rules need', () => {
	test('Sandbox: the Astronaut Complex and R&D (the lesson world visits both); no Test Stand, no crew to start', async () => {
		const sim = await make('stock.sandbox');
		expect(kinds(sim)).toEqual(expect.arrayContaining(['stock.astronaut-complex', 'stock.research']));
		expect(kinds(sim)).not.toContain('stock.test-stand');
		expect(sim.snapshot().crew ?? []).toEqual([]);
		sim.dispose();
	});

	test('Science: R&D for its tree; the pilot comes at launch as before', async () => {
		const sim = await make('stock.science');
		expect(kinds(sim)).toEqual(
			expect.arrayContaining(['stock.astronaut-complex', 'stock.research'])
		);
		sim.dispose();
	});

	test('Career: the Complex and R&D, and a pilot, an engineer and a scientist, all free', async () => {
		const sim = await make('stock.career');
		expect(kinds(sim)).toEqual(
			expect.arrayContaining(['stock.astronaut-complex', 'stock.research'])
		);
		expect(sim.snapshot().crew!.map((c) => c.profession)).toEqual([
			'pilot',
			'engineer',
			'scientist'
		]);
		expect(sim.snapshot().economy!.funds).toBe(100_000);
		expect(sim.save().economy!.entries).toEqual([]);
		sim.dispose();
	});

	test('Career (engineering): the Test Stand too', async () => {
		const sim = await make('stock.career-engineering');
		expect(kinds(sim)).toContain('stock.test-stand');
		sim.dispose();
	});

	test('a save keeps the start and never seeds it again', async () => {
		const sim = await make('stock.career');
		const save = sim.save();
		const resumed = await createSim({ plugins: [Stock], backendFactory: rapier(8), resume: save });
		expect(kinds(resumed)).toEqual(kinds(sim));
		expect(resumed.snapshot().crew).toHaveLength(3);
		sim.dispose();
		resumed.dispose();
	});
});
