/**
 * Landing legs: a ring housing with four hinge brackets, and four folding legs (knee, brace, foot)
 * that unfold from the housing to the stance of the module's colliders (`spread`, `drop`,
 * `footSize`; stock `landingLegColliders`). Retracted, the legs are hidden inside the housing.
 */
import {
	BoxGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	SphereGeometry,
	type BufferGeometry,
	type Material
} from 'three';
import type { SlotName } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';

type P2 = readonly [number, number];

/** Unit cylinder along +X from the origin. */
const strutGeometry = (radius: number, sides: number): BufferGeometry =>
	new CylinderGeometry(radius, radius, 1, sides, 1).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);

/** Lay a unit-strut mesh from `a` to `b` in the leg plane (x radial, y up). */
function span(mesh: Mesh, a: P2, b: P2): void {
	mesh.position.set(a[0], a[1], 0);
	mesh.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
	mesh.scale.set(Math.hypot(b[0] - a[0], b[1] - a[1]), 1, 1);
}

export function landingLegs(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, detail } = ctx;
	const h2 = H / 2;
	const spread = ctx.param('spread', 2, 0.8, 6);
	const drop = ctx.param('drop', 0.4, 0.1, 3);
	const footSize = ctx.param('footSize', 0.3, 0.1, 1);
	const rb = R * 0.93;
	const flange = 0.05;

	// Housing.
	for (const s of [-1, 1] as const) {
		const edge = s * h2;
		const inner = s * (h2 - flange);
		b.revolve(
			'metal',
			s < 0
				? [
						{ r: 0, y: edge },
						{ r: R * 0.92, y: edge },
						{ r: R, y: edge + 0.02 },
						{ r: R, y: inner },
						{ r: rb, y: inner }
					]
				: [
						{ r: rb, y: inner },
						{ r: R, y: inner },
						{ r: R, y: edge - 0.02 },
						{ r: R * 0.92, y: edge },
						{ r: 0, y: edge }
					]
		);
	}
	b.revolve('paint-secondary', [
		{ r: rb, y: -h2 + flange },
		{ r: rb, y: h2 - flange }
	]);
	const hingeX = R * 0.82;
	const hingeY = h2 - 0.09;
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2;
		const sx = Math.sin(a);
		const cz = Math.cos(a);
		// A hatch where the leg stows and a hinge block.
		b.box('paint-primary', [0.26, 0.11, 0.012], [sx * (rb + 0.003), 0, cz * (rb + 0.003)], a);
		b.box('dark-metal', [0.07, 0.08, 0.07], [sx * hingeX, hingeY - 0.02, cz * hingeX], a);
	}

	const sides = Math.max(4, Math.round(detail.segments / 4));
	const knee: P2 = [hingeX + 0.5 * (spread - hingeX), hingeY + 0.5 * (-drop - hingeY) + 0.34];
	const foot: P2 = [spread, -drop];
	const trianglesPerStrut = sides * 4;
	const trianglesPerLeg = trianglesPerStrut * 3 + 2 * 2 * 6 + sides * 4;

	return {
		dynamic(material: (slot: SlotName) => Material) {
			const root = new Group();
			root.name = 'legs';
			const strut = strutGeometry(0.03, sides);
			const thin = strutGeometry(0.018, sides);
			const ball = new SphereGeometry(0.045, sides, Math.max(4, sides / 2));
			const footBox = new BoxGeometry(footSize, footSize, footSize);
			const pad = new BoxGeometry(footSize * 1.15, 0.035, footSize * 1.15);
			const legs: Array<{
				group: Group;
				upper: Mesh;
				lower: Mesh;
				brace: Mesh;
				knee: Mesh;
				foot: Mesh;
				pad: Mesh;
			}> = [];
			for (let i = 0; i < 4; i++) {
				const group = new Group();
				group.name = `leg-${i}`;
				group.rotation.y = (i / 4) * Math.PI * 2 - Math.PI / 2; // local +X points along azimuth (sin, cos)
				const mk = (g: BufferGeometry, slot: SlotName, name: string): Mesh => {
					const m = new Mesh(g, material(slot));
					m.name = name;
					m.castShadow = true;
					m.receiveShadow = true;
					group.add(m);
					return m;
				};
				legs.push({
					group,
					upper: mk(strut, 'metal', 'upper'),
					lower: mk(strut, 'paint-secondary', 'lower'),
					brace: mk(thin, 'dark-metal', 'brace'),
					knee: mk(ball, 'dark-metal', 'knee'),
					foot: mk(footBox, 'dark-metal', `foot-${i}`),
					pad: mk(pad, 'rubber', 'pad')
				});
				root.add(group);
			}
			const animate = (progress: number): void => {
				const p = Math.min(1, Math.max(0, progress));
				const e = p * p * (3 - 2 * p);
				root.visible = p > 0.002;
				const at = (v: P2): P2 => [hingeX + e * (v[0] - hingeX), hingeY + e * (v[1] - hingeY)];
				const h: P2 = [hingeX, hingeY];
				const k = at(knee);
				const f = at(foot);
				const brace: P2 = [hingeX - 0.1 + e * 0, hingeY - 0.03];
				const braceEnd: P2 = [f[0] * 0.5 + k[0] * 0.5, f[1] * 0.5 + k[1] * 0.5];
				for (const leg of legs) {
					span(leg.upper, h, k);
					span(leg.lower, k, f);
					span(leg.brace, brace, braceEnd);
					leg.knee.position.set(k[0], k[1], 0);
					leg.foot.position.set(f[0], f[1], 0);
					leg.foot.scale.setScalar(Math.max(e, 0.001));
					leg.pad.position.set(f[0], f[1] - footSize / 2 + 0.0175, 0);
					leg.pad.scale.setScalar(Math.max(e, 0.001));
				}
			};
			animate(0);
			return {
				object: root,
				animate,
				triangles: trianglesPerLeg * 4,
				dispose() {
					for (const g of [strut, thin, ball, footBox, pad]) g.dispose();
				}
			};
		}
	};
}
