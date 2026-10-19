/** Test fixtures for plan 041: asparagus boosters with fuel lines and struts (format 3, ADR 0071). */
import { partId, type VesselDesign } from '@orbital/core';
import { saturn } from './vessels.ts';

/**
 * Pod, wheel, tank (index 2), engine (3) with `n` radial boosters (decoupler `10 + 3k`, booster
 * `11 + 3k`, nose cone `12 + 3k`) on the tank, and for each booster a fuel line (`20 + k`) that
 * hangs on the booster and ends on the tank (the booster's tank feeds the core). `lines` false
 * leaves the lines out; `struts` adds a strut (`30 + k`) from each booster to the tank. Stage 0
 * lights the core and the boosters, stage 1 fires the radial decouplers.
 */
export function asparagus(
	n: number,
	options: { lines?: boolean; struts?: boolean } = {}
): VesselDesign {
	const { lines = true, struts = false } = options;
	const chain = [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv'
	];
	const parts: VesselDesign['parts'] = chain.map((part, index) => ({
		index,
		part: partId(part),
		parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
	}));
	const engines = [3];
	const decouplers: number[] = [];
	for (let k = 0; k < n; k++) {
		const angle = (2 * Math.PI * k) / n;
		parts.push(
			{
				index: 10 + 3 * k,
				part: partId('stock.radial-decoupler'),
				parent: { index: 2, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			},
			{
				index: 11 + 3 * k,
				part: partId('stock.booster-liquid'),
				parent: { index: 10 + 3 * k, parentNode: 'outer', node: 'radial' },
				symmetry: 2
			},
			{
				index: 12 + 3 * k,
				part: partId('stock.nose-cone'),
				parent: { index: 11 + 3 * k, parentNode: 'top', node: 'bottom' },
				symmetry: 3
			}
		);
		if (lines) {
			parts.push({
				index: 20 + k,
				part: partId('stock.fuel-line'),
				parent: {
					index: 11 + 3 * k,
					parentNode: 'surface',
					node: 'end',
					radial: { angle: Math.PI, y: 0.5 }
				},
				link: { index: 2, angle, y: 0.5 },
				symmetry: 4
			});
		}
		if (struts) {
			parts.push({
				index: 30 + k,
				part: partId('stock.strut'),
				parent: {
					index: 11 + 3 * k,
					parentNode: 'surface',
					node: 'end',
					radial: { angle: Math.PI, y: -0.5 }
				},
				link: { index: 2, angle, y: -0.5 },
				symmetry: 5
			});
		}
		engines.push(11 + 3 * k);
		decouplers.push(10 + 3 * k);
	}
	return { formatVersion: 3, name: `Asparagus ${n}`, parts, stages: [engines, decouplers] };
}

/**
 * `saturn(wheels)` with an asparagus feed: a fuel line from each booster (`11 + 3k`) to the lower
 * tank, so the lower engine drains the boosters first, and optionally a strut each. Stage 0 lights
 * the lower core engine and the boosters, stage 1 fires the radial decouplers, stage 2 the stack
 * decoupler and the upper engine.
 */
export function saturnAsparagus(
	wheels = 1,
	options: { lines?: boolean; struts?: boolean } = {}
): VesselDesign {
	const { lines = true, struts = true } = options;
	const base = saturn(wheels);
	const lowerTank = wheels + 4;
	// fuel lines feed the core from liquid boosters (the BST-1 is solid since plan 210)
	const parts = base.parts.map((p) =>
		p.part === 'stock.booster' ? { ...p, part: partId('stock.booster-liquid') } : p
	);
	for (let k = 0; k < 4; k++) {
		const angle = (k * Math.PI) / 2;
		if (lines) {
			parts.push({
				index: 50 + k,
				part: partId('stock.fuel-line'),
				parent: {
					index: 11 + 3 * k,
					parentNode: 'surface',
					node: 'end',
					radial: { angle: Math.PI, y: 0.5 }
				},
				link: { index: lowerTank, angle, y: 0.5 },
				symmetry: 5
			});
		}
		if (struts) {
			parts.push({
				index: 60 + k,
				part: partId('stock.strut'),
				parent: {
					index: 11 + 3 * k,
					parentNode: 'surface',
					node: 'end',
					radial: { angle: Math.PI, y: -0.5 }
				},
				link: { index: lowerTank, angle, y: -0.5 },
				symmetry: 6
			});
		}
	}
	return { ...base, formatVersion: 3, name: 'Saturn asparagus', parts };
}
