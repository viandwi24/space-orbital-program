/**
 * The stub of a strut or fuel line: a bolt head with a collar, where the part hangs on its parent.
 * The bar to the far end is drawn by the scene from the part's link (`parts/connector.ts`), because
 * its length is not a property of the part (ADR 0071).
 */
import type { GenContext } from '../registry.ts';

function stub(ctx: GenContext, slot: 'metal' | 'paint-accent'): void {
	const r = ctx.radius;
	const h = ctx.height;
	ctx.builder.revolve(slot, [
		{ r: 0, y: -h / 2 },
		{ r: r * 0.7, y: -h / 2 },
		{ r: r * 0.7, y: -h * 0.15 },
		{ r, y: -h * 0.15 },
		{ r, y: h * 0.25 },
		{ r: r * 0.6, y: h / 2, smooth: true },
		{ r: 0, y: h / 2 }
	]);
}

export const strut = (ctx: GenContext): void => stub(ctx, 'metal');
export const fuelLine = (ctx: GenContext): void => stub(ctx, 'paint-accent');
