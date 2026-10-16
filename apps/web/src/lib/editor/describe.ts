/**
 * A spoken description of the design for screen readers (plan 029): the stack from the top, then
 * the parts on the sides, then staging. Pure text, so it is tested without a DOM.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import { subtreeOf } from '../design';
import { layoutOf } from './state';

const titleOf = (parts: PartLookup, id: string): string => parts.get(id)?.title ?? id;
const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);

/** Titles with repeats counted: "4 Boosters and Engine". */
function counted(titles: readonly string[]): string[] {
	const n = new Map<string, number>();
	for (const t of titles) n.set(t, (n.get(t) ?? 0) + 1);
	return [...n].map(([t, c]) => (c === 1 ? t : `${c} ${t}${t.endsWith('s') ? '' : 's'}`));
}

const list = (items: readonly string[]): string =>
	items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export function describeStack(design: VesselDesign, parts: PartLookup): string {
	if (design.parts.length === 0) return 'The vessel is empty.';
	const byIndex = new Map(design.parts.map((p) => [p.index, p]));
	const radialRoots = new Set(design.parts.filter((p) => p.parent?.radial).map((p) => p.index));
	const at = layoutOf(design, parts);
	const y = (i: number): number => at?.get(i)?.position.y ?? 0;

	// The stack: everything reachable from the root without crossing a radial link, top first.
	const stack: number[] = [];
	const walk = (i: number): void => {
		stack.push(i);
		for (const p of design.parts)
			if (p.parent?.index === i && !radialRoots.has(p.index)) walk(p.index);
	};
	const root = design.parts.find((p) => p.parent === null);
	if (root) walk(root.index);
	stack.sort((a, b) => y(b) - y(a));

	const sentences = [
		`${design.name}: ${design.parts.length} ${plural(design.parts.length, 'part')}.`,
		`Stack from the top: ${list(stack.map((i) => titleOf(parts, byIndex.get(i)!.part)))}.`
	];

	// Side parts, one sentence per group (or single part).
	const seen = new Set<number>();
	for (const p of design.parts) {
		if (!radialRoots.has(p.index) || seen.has(p.index)) continue;
		const members =
			p.symmetry === undefined
				? [p]
				: design.parts.filter((q) => q.symmetry === p.symmetry && radialRoots.has(q.index));
		for (const m of members) seen.add(m.index);
		const onto = byIndex.get(p.parent!.index)!;
		const carried = [...subtreeOf(design, p.index)]
			.filter((i) => i !== p.index)
			.sort((a, b) => y(b) - y(a))
			.map((i) => titleOf(parts, byIndex.get(i)!.part));
		const count = members.length;
		const name = titleOf(parts, p.part);
		sentences.push(
			`${count === 1 ? 'One' : count} ${count === 1 ? name : `${name}${name.endsWith('s') ? '' : 's'}`} on the side of the ${titleOf(parts, onto.part)}${count > 1 ? `, evenly around it` : ''}${carried.length > 0 ? `, each carrying ${list(carried)}` : ''}.`
		);
	}
	if (design.stages.length > 0) {
		sentences.push(
			`${design.stages.length} ${plural(design.stages.length, 'stage')}: ${design.stages
				.map(
					(s, k) =>
						`stage ${k + 1} fires ${list(counted(s.map((i) => titleOf(parts, byIndex.get(i)?.part ?? ''))))}`
				)
				.join('; ')}.`
		);
	} else {
		sentences.push('No stages yet.');
	}
	return sentences.join(' ');
}
