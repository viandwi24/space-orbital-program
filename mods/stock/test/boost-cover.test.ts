/** The boost cover (system audit D6): its shell holds the port and the neck under it, not the capsule. */
import { describe, expect, test } from 'bun:test';
import type { PartDefinition } from '@orbital/sdk';
import { ModuleCoverShell } from '../src/index.ts';
import { loaded } from './helpers.ts';

const part = (id: string): PartDefinition => loaded.registries.parts.get(id)!;
const half = (id: string): number => (part(id).shape as { height: number }).height / 2;
const radius = (id: string): number => (part(id).shape as { radius: number }).radius;

describe('the boost cover', () => {
	const cover = part('stock.boost-cover');
	const [, config] = cover.modules!.find(([m]) => String(m) === ModuleCoverShell.id)!;
	const profile = ModuleCoverShell.shell!(config as never, {} as never)!;
	const at = (y: number): number => {
		for (let i = 1; i < profile.length; i++) {
			const a = profile[i - 1]!;
			const b = profile[i]!;
			if (y >= a.y && y <= b.y) return a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y);
		}
		return -1;
	};
	const inside = (from: number, to: number, r: number) => at(from) >= r && at(to) >= r;

	test('the port and the neck under it are inside the shell; the capsule is not', () => {
		// down from the cover's bottom node: the small port, then the 1.25 m to 0.625 m neck
		const seat = cover.attach!['bottom']!.pos[1]!;
		const portTop = seat;
		const portBottom = portTop - 2 * half('stock.docking-port-small');
		const neckBottom = portBottom - 2 * half('stock.adapter-small');
		expect(inside(portBottom, portTop, radius('stock.docking-port-small'))).toBe(true);
		expect(inside(neckBottom, portBottom, radius('stock.adapter-small'))).toBe(true);
		expect(inside(neckBottom - 2 * half('stock.pod-3'), neckBottom, radius('stock.pod-3'))).toBe(
			false
		);
	});

	test('it is hollow: thrown off, it does not collide with the port it covered', () => {
		expect(ModuleCoverShell.hollow!(config as never)).toBe(true);
		expect(ModuleCoverShell.colliders!(config as never, {} as never)).toEqual([]);
	});

	test('the tower fits on it and it fits on the small port: no size mismatch', () => {
		expect(cover.attach!['top']!.size).toBe(part('stock.escape-tower').attach!['bottom']!.size);
		expect(cover.attach!['bottom']!.size).toBe(
			part('stock.docking-port-small').attach!['top']!.size
		);
	});
});
