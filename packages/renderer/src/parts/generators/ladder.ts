/** Ladder (plan 225, ADR 0209 point 4): two rails standing off the hull and rungs every 0.3 m. */
import type { GenContext } from '../registry.ts';

export function ladder(ctx: GenContext): void {
	const [sx, sy, sz] = ctx.size;
	const { builder: b, detail } = ctx;
	const rail = Math.min(0.03, sx * 0.4);
	const half = sz / 2 - rail;
	// the mounting plate on the hull side, then the two rails a little out from it
	b.box('dark-metal', [sx * 0.3, sy * 0.96, sz * 0.5], [-sx * 0.35, 0, 0]);
	for (const z of [-half, half]) b.box('metal', [rail, sy, rail], [sx * 0.2, 0, z]);
	const rungs = Math.max(2, Math.round(sy / 0.3));
	for (let i = 0; i < rungs; i++) {
		const y = -sy / 2 + ((i + 0.5) * sy) / rungs;
		b.box(i % 4 === 0 && detail.extras >= 1 ? 'paint-accent' : 'metal', [rail, rail * 0.8, sz - 2 * rail], [sx * 0.2, y, 0]);
	}
}
