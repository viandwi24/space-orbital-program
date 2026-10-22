/**
 * Mod overlays on the page (plan 347, ADR 0296): for each overlay the player has on, the shapes a
 * sim system published (`snapshot.overlays`) plus those of its page-side `draw(input)`, run at its
 * rate. Shapes tagged with a vessel show only while the player flies it. A throwing `draw` draws
 * nothing and is reported once.
 */
import {
	clampOverlay,
	type EntityId,
	type OverlayDefinition,
	type OverlayShape,
	type PanelInput,
	type Snapshot
} from '@orbital/core';
import type { OverlayInput } from '@orbital/renderer';

export type OverlayToggles = Readonly<Record<string, boolean>>;

/** Is the overlay on: the player's choice, else its default. */
export const overlayOn = (def: OverlayDefinition, toggles: OverlayToggles): boolean =>
	toggles[def.id] ?? def.defaultOn;

export interface OverlayHost {
	/** The layers to draw now (`now` in ms). */
	layers(
		now: number,
		snapshot: Snapshot,
		input: () => PanelInput | null,
		active: EntityId | null,
		toggles: OverlayToggles
	): OverlayInput[];
}

export function createOverlayHost(
	defs: readonly OverlayDefinition[],
	report: (id: string, message: string) => void = () => undefined
): OverlayHost {
	const drawn = new Map<string, { at: number; shapes: OverlayShape[] }>();
	const reported = new Set<string>();
	const tell = (id: string, message: string): void => {
		if (reported.has(id)) return;
		reported.add(id);
		report(id, message);
	};
	return {
		layers(now, snapshot, input, active, toggles) {
			const out: OverlayInput[] = [];
			for (const def of defs) {
				if (!overlayOn(def, toggles)) {
					drawn.delete(def.id);
					continue;
				}
				const shapes: OverlayShape[] = [...(snapshot.overlays?.[def.id]?.shapes ?? [])];
				if (def.draw) {
					const period = 1000 / Math.min(30, Math.max(1, def.rate ?? 10));
					let last = drawn.get(def.id);
					if (!last || now - last.at >= period) {
						const i = input();
						let fresh: OverlayShape[] = last?.shapes ?? [];
						if (i) {
							try {
								const { shapes: kept, dropped } = clampOverlay([...def.draw(i)]);
								fresh = kept;
								if (dropped.length > 0) tell(def.id, dropped.join('; '));
							} catch (e) {
								fresh = [];
								tell(def.id, e instanceof Error ? e.message : String(e));
							}
						}
						last = { at: now, shapes: fresh };
						drawn.set(def.id, last);
					}
					shapes.push(...last.shapes);
				}
				const mine = shapes.filter((s) => s.vessel === undefined || s.vessel === active);
				if (mine.length > 0) out.push({ id: def.id, shapes: mine });
			}
			return out;
		}
	};
}
