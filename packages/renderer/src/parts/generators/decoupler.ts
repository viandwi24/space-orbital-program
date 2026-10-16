/** Stack decoupler: separation ring with a hazard-yellow band and pyro bolts. */
import type { GenContext } from '../registry.ts';

export function decoupler(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const groove = R * 0.95;
	const lip = Math.min(0.03, H * 0.2);
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R * 0.94, y: -h2 },
		{ r: R, y: -h2 + 0.02 },
		{ r: R, y: -lip },
		{ r: groove, y: -lip },
		{ r: groove, y: lip },
		{ r: R, y: lip },
		{ r: R, y: h2 - 0.02 },
		{ r: R * 0.94, y: h2 },
		{ r: 0, y: h2 }
	]);
	b.revolve('paint-accent', [
		{ r: groove + 0.003, y: -lip + 0.004 },
		{ r: groove + 0.003, y: lip - 0.004 }
	]);
	if (detail.extras >= 1) {
		const bolts = detail.extras >= 2 ? 16 : 8;
		for (let i = 0; i < bolts; i++) {
			const a = ((i + 0.5) / bolts) * Math.PI * 2;
			b.cylinder('metal', 0.016, 0.05, [Math.sin(a) * groove, 0, Math.cos(a) * groove], {
				segments: 10
			});
		}
	}
}
