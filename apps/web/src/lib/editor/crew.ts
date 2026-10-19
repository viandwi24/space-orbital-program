/**
 * Crew seats in the Hangar (plan 218, ADR 0225): who sits where, kept in the design so the Launch
 * screen starts from it. One undo step per change; a seat count over a part's capacity is refused.
 */
import { commitDesign, type Content, type EditorState } from './state';

export type Seating = ReadonlyArray<{ member: string; part: number }>;

export function setCrew(state: EditorState, content: Content, seated: Seating): EditorState {
	const members = new Set<string>();
	const used = new Map<number, number>();
	for (const s of seated) {
		if (members.has(s.member)) throw new Error(`${s.member} is seated twice`);
		members.add(s.member);
		const entry = state.design.parts.find((p) => p.index === s.part);
		const capacity = (entry && content.parts.get(entry.part)?.crewCapacity) ?? 0;
		const n = (used.get(s.part) ?? 0) + 1;
		if (n > capacity) throw new Error(`part ${s.part} has ${capacity} seats`);
		used.set(s.part, n);
	}
	const { crew: _old, ...rest } = state.design;
	return commitDesign(
		state,
		content,
		seated.length > 0 ? { ...rest, crew: seated.map((s) => ({ ...s })) } : rest
	);
}
