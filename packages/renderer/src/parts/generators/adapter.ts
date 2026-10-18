/**
 * Size adapter (plan 207): a conical wall between two collars of different radius, so a stack can
 * change size class. `params.top` and `params.bottom` are the collar radii in m; the larger one is
 * the part's own radius.
 */
import type { GenContext } from '../registry.ts';

export function adapter(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const rt = ctx.param('top', R / 2, 0.05, R);
	const rl = ctx.param('bottom', R, 0.05, R);
	const collar = Math.min(0.08, H * 0.15);
	// Lower collar (bottom attach face), the wall, then the upper collar (top attach face).
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: rl * 0.97, y: -h2 },
		{ r: rl, y: -h2 + 0.02 },
		{ r: rl, y: -h2 + collar }
	]);
	b.revolve('paint-primary', [
		{ r: rl * 0.985, y: -h2 + collar },
		{ r: rt * 0.985, y: h2 - collar, smooth: false }
	]);
	b.revolve('dark-metal', [
		{ r: rt, y: h2 - collar },
		{ r: rt, y: h2 - 0.02 },
		{ r: rt * 0.97, y: h2 },
		{ r: 0, y: h2 }
	]);
	// A thin accent ring halfway up the wall.
	if (detail.extras >= 1) {
		const y0 = -h2 + collar;
		const y1 = h2 - collar;
		const at = (t: number) => ({ r: rl + (rt - rl) * t + 0.004, y: y0 + (y1 - y0) * t });
		b.revolve('paint-accent', [at(0.46), at(0.54)]);
	}
}
