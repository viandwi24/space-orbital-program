/**
 * Fairing editing in the Hangar (plan 219, ADR 0224): a base's shell is a list of sections in the
 * part's design settings for `stock.fairing`. Each edit is one undo step; a section that breaks the
 * limits is refused with the reason the Hangar shows.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import {
	fairingConfigSchema,
	fairingMass,
	fairingProblem,
	type FairingSection
} from '@orbital/mod-stock';
import { setPartSettings, type Content, type EditorState } from './state';

export const FAIRING_MODULE = 'stock.fairing';

export interface FairingView {
	size: number;
	sections: FairingSection[];
	closed: boolean;
	/** Shell mass, kg. */
	mass: number;
	/** Why it cannot be made, or null. */
	problem: string | null;
}

/** The fairing of part `index`, or null when it has none. */
export function fairingOf(
	design: Pick<VesselDesign, 'parts'>,
	parts: PartLookup,
	index: number
): FairingView | null {
	const entry = design.parts.find((p) => p.index === index);
	const def = entry && parts.get(entry.part);
	const base = def?.modules?.find(([id]) => id === FAIRING_MODULE)?.[1];
	if (!entry || !base) return null;
	const parsed = fairingConfigSchema.safeParse({
		...(base as Record<string, unknown>),
		...(entry.settings?.[FAIRING_MODULE] ?? {})
	});
	if (!parsed.success) return null;
	const c = parsed.data;
	return {
		size: c.size,
		sections: c.sections,
		closed: c.closed,
		mass: fairingMass(c),
		problem: fairingProblem(c.size, c.sections)
	};
}

function write(
	state: EditorState,
	content: Content,
	index: number,
	sections: FairingSection[],
	closed: boolean
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f) throw new Error('that part has no fairing');
	const problem = fairingProblem(f.size, sections);
	if (problem) throw new Error(problem);
	return setPartSettings(
		state,
		content,
		index,
		FAIRING_MODULE,
		sections.length === 0 && !closed ? null : { sections, closed }
	);
}

/** Adds a section on top (a click in the edit mode); the shell opens again until Close. */
export function addFairingSection(
	state: EditorState,
	content: Content,
	index: number,
	section: FairingSection
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f) throw new Error('that part has no fairing');
	return write(state, content, index, [...f.sections, { ...section }], false);
}

/** Changes section `i` (the number fields). */
export function setFairingSection(
	state: EditorState,
	content: Content,
	index: number,
	i: number,
	change: Partial<FairingSection>
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f || !f.sections[i]) throw new Error('no such section');
	const sections = f.sections.map((s, k) => (k === i ? { ...s, ...change } : s));
	return write(state, content, index, sections, f.closed);
}

/** Removes the top section. */
export function removeFairingSection(
	state: EditorState,
	content: Content,
	index: number
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f || f.sections.length === 0) throw new Error('no section to remove');
	return write(state, content, index, f.sections.slice(0, -1), false);
}

/** Caps the shell with a nose (Close), or opens it again. */
export function setFairingClosed(
	state: EditorState,
	content: Content,
	index: number,
	closed: boolean
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f) throw new Error('that part has no fairing');
	if (closed && f.sections.length === 0) throw new Error('Add a section first');
	return write(state, content, index, f.sections, closed);
}
