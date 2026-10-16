/** Command capsule: heat shield disc, painted drum, convex cone with windows, docking collar. */
import { Matrix4, Path, Quaternion, Shape, Vector3 } from 'three';
import type { ProfilePoint } from '../revolve.ts';
import type { GenContext } from '../registry.ts';

/** Rounded rectangle outline centred on the origin in the XY plane. */
export function roundedRect(w: number, h: number, r: number, into: Path = new Shape()): Path {
	const x = w / 2;
	const y = h / 2;
	into.moveTo(-x + r, -y);
	into.lineTo(x - r, -y);
	into.quadraticCurveTo(x, -y, x, -y + r);
	into.lineTo(x, y - r);
	into.quadraticCurveTo(x, y, x - r, y);
	into.lineTo(-x + r, y);
	into.quadraticCurveTo(-x, y, -x, y - r);
	into.lineTo(-x, -y + r);
	into.quadraticCurveTo(-x, -y, -x + r, -y);
	return into;
}

/** Radius of the bulged cone at parameter `t` (0 at the drum, 1 at the nose). */
const coneRadius = (R: number, noseR: number, t: number): number =>
	R + (noseR - R) * t - 0.045 * Math.sin(Math.PI * t) * (1 - t);

export function capsule(ctx: GenContext): void {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const shieldH = Math.min(0.07, H * 0.08);
	const rd = R * 0.975; // the drum; collars and jets use the full radius
	const drumTop = ctx.param('drumTop', -0.1, -h2 + 0.2, h2 - 0.3);
	const noseR = ctx.param('noseRadius', 0.26, 0.1, R * 0.7);
	const collarH = ctx.param('collarHeight', 0.1, 0.04, 0.3);
	const coneTop = h2 - collarH;

	// Heat shield disc under the drum: slightly convex ablator, dark retaining ring above it.
	b.revolve('ablator', [
		{ r: 0, y: -h2 },
		{ r: R * 0.55, y: -h2 + 0.004 },
		{ r: R * 0.9, y: -h2 + 0.022 },
		{ r: R * 0.98, y: -h2 + shieldH }
	]);
	b.revolve('dark-metal', [
		{ r: R * 0.98, y: -h2 + shieldH },
		{ r: R, y: -h2 + shieldH },
		{ r: R, y: -h2 + shieldH + 0.035 }
	]);

	// Drum (white) and an accent line below the shoulder.
	b.revolve('paint-primary', [
		{ r: rd, y: -h2 + shieldH + 0.035 },
		{ r: rd, y: drumTop }
	]);
	b.revolve('paint-accent', [
		{ r: rd + 0.004, y: drumTop - 0.09 },
		{ r: rd + 0.004, y: drumTop - 0.05 }
	]);

	// Convex cone from the drum to the nose.
	const cone: ProfilePoint[] = [];
	const steps = 6;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		cone.push({
			r: coneRadius(rd, noseR, t),
			y: drumTop + (coneTop - drumTop) * t,
			smooth: i > 0 && i < steps
		});
	}
	b.revolve('paint-primary', cone);

	// Docking collar and hatch.
	b.revolve('dark-metal', [
		{ r: noseR, y: coneTop },
		{ r: noseR * 0.92, y: coneTop },
		{ r: noseR * 0.92, y: h2 - 0.015 },
		{ r: noseR * 0.8, y: h2 },
		{ r: 0, y: h2 }
	]);

	// Windows on the cone, facing out along its slope.
	const mid = 0.45;
	const rMid = coneRadius(rd, noseR, mid);
	const yMid = drumTop + (coneTop - drumTop) * mid;
	const slope = Math.atan2(rd - noseR, coneTop - drumTop);
	const count = detail.extras >= 1 ? 3 : 2;
	const outline = roundedRect(0.2, 0.16, 0.045) as Shape;
	const hole = new Path();
	roundedRect(0.15, 0.115, 0.03, hole);
	outline.holes.push(hole);
	const pane = roundedRect(0.15, 0.115, 0.03) as Shape;
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2 + (count === 2 ? Math.PI / 2 : 0);
		const q = new Quaternion()
			.setFromAxisAngle(new Vector3(0, 1, 0), a)
			.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -slope));
		const out = new Vector3(0, 0, 1).applyQuaternion(q);
		const at = (lift: number): Matrix4 =>
			new Matrix4().compose(
				new Vector3(Math.sin(a) * rMid, yMid, Math.cos(a) * rMid).addScaledVector(out, lift),
				q,
				new Vector3(1, 1, 1)
			);
		b.extrude('dark-metal', outline, 0.03, at(-0.012));
		b.extrude('glass', pane, 0.012, at(-0.004));
	}

	// Reaction jets on the shoulder.
	if (detail.extras >= 1) {
		for (let i = 0; i < 4; i++) {
			const a = ((i + 0.5) / 4) * Math.PI * 2;
			b.box(
				'dark-metal',
				[0.07, 0.05, 0.03],
				[Math.sin(a) * (R - 0.025), drumTop + 0.02, Math.cos(a) * (R - 0.025)],
				a
			);
		}
	}
}
