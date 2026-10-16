/**
 * Example vessels built through the editor operations, so they are valid by construction and show
 * what the tools can do. The booster rocket is the 23-part vessel of plan 026 (journal 026) and
 * the budget vessel of plan 029's renderer test.
 */
import type { VesselDesign } from '@orbital/core';
import { referenceTwoStage } from '../design';
import {
	attachNew,
	attachTargets,
	createEditor,
	radialTarget,
	singlePart,
	type Content,
	type EditorState
} from './state';

/** Two-stage core, four radial decouplers each carrying a booster with a nose cone, and four fins. */
export function boosterRocket(content: Content): VesselDesign {
	let s: EditorState = createEditor(referenceTwoStage(), content);
	const lowerTank = 5;
	const side = (part: string, parent: number, y: number, n: number): EditorState => {
		const t = radialTarget(s.design, singlePart(part, s.nextIndex), content.parts, parent, 0, y);
		if (!t) throw new Error(`no radial site for ${part}`);
		return attachNew(s, content, part, t, n);
	};
	const on = (part: string, parent: number, node: string): EditorState => {
		const t = attachTargets(s.design, singlePart(part, s.nextIndex), content.parts).find(
			(x) => x.parent?.index === parent && x.parent.parentNode === node
		);
		if (!t) throw new Error(`no ${node} node on part ${parent} for ${part}`);
		return attachNew(s, content, part, t);
	};
	s = side('stock.radial-decoupler', lowerTank, 0, 4);
	const decoupler = s.design.parts.find((p) => p.part === 'stock.radial-decoupler')!.index;
	s = on('stock.booster', decoupler, 'outer');
	const booster = s.design.parts.find((p) => p.part === 'stock.booster')!.index;
	s = on('stock.nose-cone', booster, 'top');
	// Fins between the boosters, low on the core: 45 degrees off the decouplers.
	const fin = radialTarget(
		s.design,
		singlePart('stock.fin', s.nextIndex),
		content.parts,
		lowerTank,
		Math.PI / 4,
		-0.45
	);
	if (!fin) throw new Error('no radial site for the fins');
	s = attachNew(s, content, 'stock.fin', fin, 4);
	return { ...s.design, name: 'Booster rocket' };
}
