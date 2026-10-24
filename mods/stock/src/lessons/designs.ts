/** The designs the lessons fly: stock's blueprints by id (the baked lesson vessels are in `designs.generated.ts`). */
import type { VesselDesign } from '@orbital/sdk';
import { STOCK_BLUEPRINTS } from '../blueprints.generated.ts';

/** A copy of the stock blueprint `id`'s design; throws when stock has none by that id. */
export function blueprintDesign(id: string): VesselDesign {
	const found = STOCK_BLUEPRINTS.find((b) => b.id === id);
	if (!found) throw new Error(`stock has no blueprint "${id}"`);
	return structuredClone(found.design);
}
