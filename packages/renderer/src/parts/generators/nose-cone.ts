/** Nose cone: a tangent-ogive shell with a collar at the base. */
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

export function noseCone(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const collar = 0.06;
	b.revolve('dark-metal', [
		{ r: 0, y: -h2 },
		{ r: R * 0.94, y: -h2 },
		{ r: R, y: -h2 + 0.02 },
		{ r: R, y: -h2 + collar }
	]);
	const steps = detail.extras >= 1 ? 12 : 8;
	const bodyH = H - collar;
	const profile: ProfilePoint[] = [];
	// Tangent ogive: radius falls as a circular arc that meets the cylinder tangentially.
	const rho = (R * R + bodyH * bodyH) / (2 * R);
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const x = bodyH * t;
		const r = Math.sqrt(Math.max(0, rho * rho - (bodyH - x) ** 2)) - (rho - R);
		profile.push({ r: Math.max(0.004, r), y: -h2 + collar + x, smooth: i > 0 && i < steps });
	}
	profile[0] = { r: R * 0.985, y: -h2 + collar };
	b.revolve('paint-accent', profile);
	if (detail.extras >= 1) {
		b.revolve('paint-secondary', [
			{ r: R * 0.99, y: -h2 + collar + 0.03 },
			{ r: R * 0.99, y: -h2 + collar + 0.07 }
		]);
	}
}
