/**
 * Parachute (plan 209): a packed canister (a stack chute's drum and cap, or a radial chute's box)
 * and the canopy, a dynamic piece that follows the module's `canopy` flag. Up to `SEMI_CANOPY`
 * (0.3) the canopy is a narrow streamer on long lines, the semi-deployed state; from there it
 * opens to a dome of `canopy` metres radius. Hidden at 0 (stowed, armed, cut or torn).
 */
import {
	CylinderGeometry,
	Group,
	Mesh,
	SphereGeometry,
	type BufferGeometry,
	type Material
} from 'three';
import type { SlotName } from '../builder.ts';
import type { GenContext, GeneratedPart } from '../registry.ts';

/** The module's semi-deployed opening on the deploy flag (`stock` `SEMI_CANOPY`). */
export const SEMI_OPENING = 0.3;
const LINES = 8;

/** Canopy radius and line length as fractions of the full canopy, for a deploy progress 0..1. */
export function canopyShape(progress: number): { radius: number; lines: number; visible: boolean } {
	const p = Math.min(1, Math.max(0, progress));
	if (p <= 0.002) return { radius: 0, lines: 0, visible: false };
	if (p <= SEMI_OPENING) {
		const s = p / SEMI_OPENING;
		return { radius: 0.02 + 0.1 * s, lines: 0.5 + 0.6 * s, visible: true };
	}
	const f = (p - SEMI_OPENING) / (1 - SEMI_OPENING);
	const e = f * f * (3 - 2 * f);
	return { radius: 0.12 + 0.88 * e, lines: 1.1 + 0.1 * e, visible: true };
}

export function parachute(ctx: GenContext): GeneratedPart {
	const { radius: R, height: H, builder: b, size } = ctx;
	const h2 = H / 2;
	const radial = ctx.visual.params?.radial === true;
	const canopyRadius = ctx.param('canopy', 11, 1, 40);
	if (radial) {
		// a pack on the hull: the radial node is on -X
		b.box('paint-secondary', [size[0] * 0.8, H * 0.92, size[2] * 0.9], [0, 0, 0]);
		b.box('paint-accent', [size[0] * 0.85, H * 0.18, size[2] * 0.94], [0, h2 - H * 0.12, 0]);
		b.box('dark-metal', [0.04, H * 0.8, size[2] * 0.6], [-size[0] / 2 + 0.02, 0, 0]);
	} else {
		b.revolve('dark-metal', [
			{ r: 0, y: -h2 },
			{ r: R, y: -h2 },
			{ r: R, y: -h2 + 0.05 }
		]);
		b.revolve('paint-secondary', [
			{ r: R * 0.97, y: -h2 + 0.05 },
			{ r: R * 0.97, y: h2 - H * 0.35 }
		]);
		// the cap the canopy pushes off
		b.revolve('paint-accent', [
			{ r: R * 0.99, y: h2 - H * 0.35 },
			{ r: R * 0.92, y: h2 - H * 0.12, smooth: true },
			{ r: R * 0.6, y: h2 - 0.01, smooth: true },
			{ r: 0, y: h2 }
		]);
	}
	return { dynamic: canopyDynamic(ctx, canopyRadius, h2) };
}

/**
 * The canopy as a dynamic piece (a stack or radial chute's, and the suit's, plan 249): `anchorY` is
 * where the lines meet the part, in the part frame, and `canopyRadius` the full dome's radius, m.
 */
export function canopyDynamic(
	ctx: GenContext,
	canopyRadius: number,
	anchorY: number
): NonNullable<GeneratedPart['dynamic']> {
	const { detail } = ctx;
	return (material: (slot: SlotName) => Material) => {
		const root = new Group();
		root.name = 'canopy';
		// the canopy follows the preset's detail like the revolved parts
		const segments = Math.max(8, Math.round(detail.segments * 0.75));
		const rings = Math.max(4, Math.round(segments / 3));
		// a unit hemisphere, open side down; the inside drawn too (seen from the capsule)
		const outer = new SphereGeometry(1, segments, rings, 0, Math.PI * 2, 0, Math.PI / 2);
		const inner = outer.clone();
		const index = inner.getIndex();
		if (index) {
			const a = index.array;
			for (let i = 0; i < a.length; i += 3) {
				const t = a[i + 1]!;
				a[i + 1] = a[i + 2]!;
				a[i + 2] = t;
			}
			index.needsUpdate = true;
		}
		const line: BufferGeometry = new CylinderGeometry(0.012, 0.012, 1, 3, 1).translate(0, 0.5, 0);
		const dome = new Group();
		dome.name = 'dome';
		for (const [g, slot] of [
			[outer, 'paint-primary'],
			[inner, 'paint-accent']
		] as const) {
			const m = new Mesh(g, material(slot));
			m.castShadow = true;
			m.receiveShadow = true;
			dome.add(m);
		}
		root.add(dome);
		const lines: Mesh[] = [];
		for (let i = 0; i < LINES; i++) {
			const m = new Mesh(line, material('dark-metal'));
			m.name = `line-${i}`;
			lines.push(m);
			root.add(m);
		}
		const animate = (progress: number): void => {
			const s = canopyShape(progress);
			root.visible = s.visible;
			if (!s.visible) return;
			const r = canopyRadius * s.radius;
			const length = canopyRadius * s.lines;
			// the skirt sits `length` above the anchor; the dome is flattened like a real canopy
			const skirt = anchorY + length;
			dome.position.set(0, skirt, 0);
			dome.scale.set(r, r * (s.radius < 0.2 ? 2.5 : 0.6), r);
			lines.forEach((m, i) => {
				const a = (i / LINES) * Math.PI * 2;
				const tip = { x: Math.cos(a) * r, y: skirt, z: Math.sin(a) * r };
				const dx = tip.x;
				const dy = tip.y - anchorY;
				const dz = tip.z;
				const len = Math.hypot(dx, dy, dz);
				m.position.set(0, anchorY, 0);
				m.scale.set(1, len, 1);
				// tilt the unit +Y line toward the rim point
				m.rotation.set(0, -a, 0);
				m.rotateZ(-Math.atan2(Math.hypot(dx, dz), dy));
			});
		};
		animate(0);
		return {
			object: root,
			animate,
			triangles: segments * rings * 2 * 2 + LINES * 6,
			dispose() {
				for (const g of [outer, inner, line]) g.dispose();
			}
		};
	};
}
