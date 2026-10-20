/**
 * Fairing editing in the Hangar (plan 219, ADR 0224): a base's shell is a list of sections in the
 * part's design settings for `stock.fairing`. Each edit is one undo step; a section that breaks the
 * limits is refused with the reason the Hangar shows.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import {
	fairingConfigSchema,
	fairingCost,
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
	/** An interstage: open at the top, a node there for the next stage (plan 243). */
	interstage: boolean;
	/** Shell mass, kg. */
	mass: number;
	/** The base's top face above its origin, m: the shell starts here. */
	baseTop: number;
	/** Shell cost, funds (plan 243: added to the part's cost). */
	cost: number;
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
		interstage: c.interstage,
		mass: fairingMass(c),
		cost: fairingCost(c),
		baseTop: c.baseTop,
		problem: fairingProblem(c.size, c.sections)
	};
}

function write(
	state: EditorState,
	content: Content,
	index: number,
	sections: FairingSection[],
	closed: boolean,
	interstage = fairingOf(state.design, content.parts, index)?.interstage ?? false
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
		sections.length === 0 && !closed && !interstage
			? null
			: { sections, closed: closed && !interstage, interstage }
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
	if (closed && f.interstage) throw new Error('An interstage stays open at the top');
	return write(state, content, index, f.sections, closed);
}

/**
 * Makes the shell an interstage (open at the top, a node there for the next stage) or a plain
 * fairing again (plan 243, ADR 0238). Off is refused while a part hangs on that node.
 */
export function setFairingInterstage(
	state: EditorState,
	content: Content,
	index: number,
	interstage: boolean
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f) throw new Error('that part has no fairing');
	if (interstage && f.sections.length === 0) throw new Error('Add a section first');
	if (
		!interstage &&
		state.design.parts.some(
			(p) => p.parent?.index === index && p.parent.parentNode === 'interstage'
		)
	) {
		throw new Error('Move the stage off the interstage first');
	}
	return write(state, content, index, f.sections, f.closed && !interstage, interstage);
}

/** The smallest section a click may cut, m. */
export const MIN_SECTION = 0.1;

/**
 * A section at a height (plan 243): `y` metres above the part's origin, as the cursor meets the
 * shell. Inside a section it cuts it in two at `y`, the new corner on the line between its
 * neighbours' radii, so the shape does not change until a handle moves it; above the top it adds a
 * section up to `y` at the last radius. Refused within `MIN_SECTION` of a corner or of the base.
 */
export function addFairingSectionAt(
	state: EditorState,
	content: Content,
	index: number,
	y: number
): EditorState {
	const f = fairingOf(state.design, content.parts, index);
	if (!f) throw new Error('that part has no fairing');
	let start = f.baseTop;
	let before = f.size / 2;
	for (const [i, s] of f.sections.entries()) {
		const end = start + s.height;
		if (y < end) {
			if (y - start < MIN_SECTION || end - y < MIN_SECTION) {
				throw new Error('Too close to a corner: drag its handle instead');
			}
			const radius = before + ((s.radius - before) * (y - start)) / s.height;
			const cut = [
				{ height: y - start, radius },
				{ height: end - y, radius: s.radius }
			];
			return write(
				state,
				content,
				index,
				[...f.sections.slice(0, i), ...cut, ...f.sections.slice(i + 1)],
				f.closed
			);
		}
		start = end;
		before = s.radius;
	}
	if (y - start < MIN_SECTION) throw new Error('Too close to the top: drag its handle instead');
	return write(
		state,
		content,
		index,
		[...f.sections, { height: y - start, radius: f.sections.at(-1)?.radius ?? f.size / 2 }],
		false
	);
}
