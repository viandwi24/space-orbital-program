/**
 * Every stock part has a place in the tech tree (plan 231, ADR 0231 point 1): exactly one node,
 * so a part a later plan adds cannot be forgotten; the starting node allows a KSP-style first
 * flight; the tree is about 20 to 24 nodes in tiers, each node reachable from Basics.
 */
import { describe, expect, test } from 'bun:test';
import { loadPlugins } from '@orbital/sdk';
import Stock from '../src/index.ts';

const { registries } = loadPlugins([Stock]);
const nodes = registries.techNodes.list();
/** Never built: the suit is the crew outside, the flag is planted, the panel is thrown-off debris. */
const NOT_BUILT = ['stock.eva-suit', 'stock.fairing-panel', 'stock.flag'];

describe('stock tech coverage', () => {
	test('every stock part is in exactly one node', () => {
		const count = new Map<string, string[]>();
		for (const n of nodes)
			for (const p of n.unlocks ?? []) count.set(p, [...(count.get(p) ?? []), n.id]);
		const missing: string[] = [];
		const twice: string[] = [];
		for (const p of registries.parts.list()) {
			if (NOT_BUILT.includes(p.id)) {
				expect(count.has(p.id)).toBe(false);
				continue;
			}
			const n = count.get(p.id) ?? [];
			if (n.length === 0) missing.push(p.id);
			if (n.length > 1) twice.push(`${p.id}: ${n.join(', ')}`);
		}
		expect(missing).toEqual([]);
		expect(twice).toEqual([]);
		// no node names a part that does not exist
		const parts = new Set(registries.parts.list().map((p) => p.id));
		expect([...count.keys()].filter((p) => !parts.has(p))).toEqual([]);
	});

	test('the starting node holds a pod, a parachute, a solid booster, a fin and a decoupler', () => {
		const basics = registries.techNodes.get('stock.basics')!;
		// free: no cost, no requirement, no milestone
		expect([basics.cost, basics.requires ?? [], basics.milestone]).toEqual([0, [], undefined]);
		for (const p of [
			'stock.command-pod',
			'stock.parachute',
			'stock.srb-small',
			'stock.fin',
			'stock.decoupler',
			// the reference rockets fly from the start
			'stock.tank-small',
			'stock.engine-lv'
		])
			expect(basics.unlocks).toContain(p);
	});

	test('about 20 to 24 nodes in tiers, each reachable from Basics through its requirements', () => {
		expect(nodes.length).toBeGreaterThanOrEqual(20);
		expect(nodes.length).toBeLessThanOrEqual(24);
		const byId = new Map(nodes.map((n) => [n.id, n]));
		const reach = (id: string, seen = new Set<string>()): boolean => {
			if (id === 'stock.basics') return true;
			if (seen.has(id)) return false;
			seen.add(id);
			const n = byId.get(id)!;
			return (n.requires ?? []).length > 0 && n.requires!.every((r) => reach(r, seen));
		};
		for (const n of nodes) {
			expect(reach(n.id)).toBe(true);
			// a node never needs one of a higher or equal tier
			for (const r of n.requires ?? []) expect(byId.get(r)!.tier).toBeLessThan(n.tier);
		}
	});
});
