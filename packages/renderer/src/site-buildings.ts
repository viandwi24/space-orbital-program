/**
 * Launch-site structures (plan 025): the tower with platforms and umbilicals, floodlit masts,
 * tanks, a gabled hangar with a panelled door, a glazed control centre, offices, garages, shipping
 * containers, parked vehicles, fences and light poles. Builders fill `SiteParts` buckets in site
 * metres (+x east, +y up, +z south, origin at the pad centre); `LaunchSite` merges one mesh per
 * material. Layout numbers live in `site.ts`.
 */
import {
	BufferAttribute,
	BufferGeometry,
	CatmullRomCurve3,
	CircleGeometry,
	ConeGeometry,
	CylinderGeometry,
	ExtrudeGeometry,
	RingGeometry,
	Shape,
	SphereGeometry,
	TubeGeometry,
	Vector3
} from 'three';
import {
	beam,
	box,
	coloured,
	cylinder,
	lin,
	placed,
	texturedBox,
	type ArmParts,
	type Rgb,
	type SiteParts
} from './site-geo.ts';
import { windowIsLit } from './site-animation.ts';
import {
	BUILDINGS,
	CONTAINERS,
	FENCES,
	MASTS,
	ROADS,
	TANKS,
	TOWER,
	VEHICLES,
	type BoxSpec,
	type VehicleSpec
} from './site.ts';

const LAMP_WARM: Rgb = [6, 4.7, 2.7];
const LAMP_RED: Rgb = [8, 0.9, 0.6];
const GLASS: Rgb = lin(0x1d2c3a);
const gbox = (w: number, h: number, d: number, x: number, y: number, z: number) =>
	box(w, h, d, x, y, z, GLASS);

export function buildTower(p: SiteParts): void {
	const steel = lin(0x9aa3ab);
	const red = lin(0xc4361f);
	const grating = lin(0x3b4146);
	const { x, z, size, height } = TOWER;
	const h = size / 2;
	const bay = 3;
	const bays = Math.floor(height / bay);
	const corners: [number, number][] = [
		[-h, -h],
		[h, -h],
		[h, h],
		[-h, h]
	];
	for (const [cx, cz] of corners)
		p.structure.push(box(0.4, height, 0.4, x + cx, height / 2, z + cz, steel));
	for (let i = 0; i <= bays; i++) {
		const y = i * bay;
		const rc = i % 4 === 0 ? red : steel;
		p.structure.push(
			box(size, 0.22, 0.22, x, y, z - h, rc),
			box(size, 0.22, 0.22, x, y, z + h, rc),
			box(0.22, 0.22, size, x - h, y, z, rc),
			box(0.22, 0.22, size, x + h, y, z, rc)
		);
		if (i < bays) {
			const y1 = y + bay;
			const flip = i % 2 === 0;
			p.structure.push(
				beam(x - h, y, z - h, x + h, y1, z - h, 0.14, steel),
				beam(x + h, flip ? y : y1, z + h, x - h, flip ? y1 : y, z + h, 0.14, steel),
				beam(x - h, flip ? y1 : y, z - h, x - h, flip ? y : y1, z + h, 0.14, steel),
				beam(x + h, y, z + h, x + h, y1, z - h, 0.14, steel)
			);
		}
		// grating platform every second bay, with a handrail on the open side
		if (i > 0 && i % 2 === 0 && i < bays) {
			p.structure.push(box(size - 0.2, 0.08, size - 0.2, x, y + 0.05, z, grating));
			p.thin.push(box(size, 0.05, 0.05, x, y + 1.0, z - h - 0.02, red));
		}
	}
	// ladder up one face
	for (const dz of [-0.25, 0.25])
		p.thin.push(box(0.05, height, 0.05, x - h - 0.12, height / 2, z + dz, steel));
	for (let y = 0.6; y < height; y += 0.6)
		p.thin.push(box(0.04, 0.04, 0.5, x - h - 0.12, y, z, steel));
	// swing arms reaching toward the vessel, with umbilical hoses; each turns about a vertical hinge half a metre
	// off the tower face and folds against it (site-animation.ts, ADR 0073)
	for (const [ay, len] of [
		[19, 4.0],
		[12.5, 4.0],
		[6.5, 3.8]
	] as const) {
		const x0 = x - h;
		const x1 = x0 - len;
		const arm: ArmParts = { hinge: { x: x0 - 0.5, y: ay, z }, structure: [], thin: [] };
		p.structure.push(box(0.6, 0.5, 1.0, x0 - 0.25, ay, z, steel)); // the fixed bracket on the tower
		arm.structure.push(
			box(len - 0.5, 0.35, 1.0, (x0 - 0.5 + x1) / 2, ay, z, red),
			box(len - 0.5, 0.15, 0.15, (x0 - 0.5 + x1) / 2, ay + 0.9, z - 0.45, steel),
			box(len - 0.5, 0.15, 0.15, (x0 - 0.5 + x1) / 2, ay + 0.9, z + 0.45, steel),
			beam(x0 - 0.5, ay, z, x1, ay + 0.9, z, 0.1, steel),
			box(0.9, 1.0, 1.3, x1 - 0.2, ay + 0.5, z, steel)
		);
		for (const [dz, sag] of [
			[-0.3, 1.5],
			[0.25, 2.3]
		] as const) {
			const curve = new CatmullRomCurve3([
				new Vector3(x1 + 0.1, ay + 0.1, z + dz),
				new Vector3(x1 + len * 0.3, ay - sag, z + dz * 1.4),
				new Vector3(x0 - 0.2, ay - sag * 0.55, z + dz * 1.2),
				new Vector3(x0 + 0.1, ay + 0.15, z + dz)
			]);
			arm.thin.push(
				coloured(new TubeGeometry(curve, 14, 0.06, 6), dz < 0 ? lin(0x1d1f21) : lin(0xdcdcd4))
			);
		}
		p.arms.push(arm);
	}
	p.structure.push(
		box(size + 0.6, 0.5, size + 0.6, x, height + 0.25, z, red),
		box(9, 0.45, 0.6, x - 2.5, height + 1.0, z, red),
		beam(x + 3.6, height + 0.4, z, x + 5.6, height + 4.2, z, 0.1, steel)
	);
	p.thin.push(cylinder(0.05, 0.12, 6, x, height + 3.5, z, steel, 6));
	// footing, equipment cabinet, and water-deluge riser
	p.structure.push(box(size + 3.5, 0.5, size + 3.5, x, 0.25, z, lin(0x6b6e70)));
	p.painted.push(
		box(1.8, 1.2, 1.8, x + 4.4, 0.6, z + 1.2, lin(0xd8d8d0)),
		box(1.4, 1.2, 1.4, x + 4.5, 0.6, z - 1.5, lin(0xcfd2c8))
	);
	p.structure.push(cylinder(0.25, 0.25, 9, x + 3.0, 4.5, z + 2.5, lin(0x5d7a8f), 10));
	p.structure.push(
		box(0.7, 0.9, 0.5, x + 3.6, 0.95, z + 1.9, lin(0x3d4146)),
		box(0.2, 0.5, 0.2, x + 3.0, 0.8, z + 2.5, lin(0xc4361f))
	);
}

export function buildMasts(p: SiteParts): void {
	for (const m of MASTS) {
		const segments = 8;
		for (let i = 0; i < segments; i++) {
			const hh = m.height / segments;
			p.thin.push(
				cylinder(0.14, 0.2, hh, m.x, hh * (i + 0.5), m.z, i % 2 ? lin(0xe8e4dc) : lin(0xc03a22), 8)
			);
		}
		// floodlight bank facing the pad, red beacon on top
		const len = Math.hypot(m.x, m.z) || 1;
		const yaw = Math.atan2(-m.x / len, -m.z / len);
		const y = m.height - 4;
		p.thin.push(placed(box(2.6, 1.5, 0.3, 0, 0, 0, lin(0x3c4247)), m.x, y, m.z, yaw));
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 2; j++) {
				p.lamp.push(
					placed(
						box(0.7, 0.55, 0.1, (i - 1) * 0.82, (j - 0.5) * 0.65, 0.2, LAMP_WARM),
						m.x,
						y,
						m.z,
						yaw
					)
				);
			}
		}
		p.beacon.push(
			coloured(new SphereGeometry(0.35, 8, 6).translate(m.x, m.height + 0.2, m.z), LAMP_RED)
		);
	}
	p.beacon.push(
		coloured(
			new SphereGeometry(0.35, 8, 6).translate(TOWER.x + 5.6, TOWER.height + 4.4, TOWER.z),
			LAMP_RED
		)
	);
}

export function buildTanks(p: SiteParts): void {
	const white = lin(0xe6e8e8);
	const steel = lin(0x7c8286);
	for (const t of TANKS) {
		if (t.kind === 'sphere') {
			const s = new SphereGeometry(t.radius, 32, 20);
			s.translate(t.x, t.radius + 2.2, t.z);
			p.structure.push(coloured(s, white));
			for (let i = 0; i < 6; i++) {
				const a = (i / 6) * Math.PI * 2;
				p.structure.push(
					cylinder(
						0.28,
						0.3,
						t.radius + 1.6,
						t.x + Math.cos(a) * t.radius * 0.72,
						(t.radius + 1.6) / 2 + 0.2,
						t.z + Math.sin(a) * t.radius * 0.72,
						steel,
						8
					)
				);
			}
			p.structure.push(box(t.radius * 2.2, 0.35, 0.35, t.x, 0.6, t.z, steel));
			// equator band and top valve
			p.structure.push(
				cylinder(
					t.radius + 0.03,
					t.radius + 0.03,
					0.35,
					t.x,
					t.radius + 2.2,
					t.z,
					lin(0xc03a22),
					32
				),
				cylinder(0.4, 0.4, 0.8, t.x, t.radius * 2 + 2.5, t.z, steel, 10)
			);
		} else {
			p.structure.push(
				cylinder(t.radius, t.radius, t.height, t.x, t.height / 2 + 1.4, t.z, white, 32)
			);
			const dome = new SphereGeometry(t.radius, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
			dome.translate(t.x, t.height + 1.4, t.z);
			p.structure.push(coloured(dome, white));
			for (let i = 0; i < 4; i++) {
				const a = (i / 4) * Math.PI * 2 + 0.4;
				p.structure.push(
					cylinder(
						0.25,
						0.25,
						1.6,
						t.x + Math.cos(a) * t.radius * 0.8,
						0.8,
						t.z + Math.sin(a) * t.radius * 0.8,
						steel,
						8
					)
				);
			}
			p.structure.push(
				cylinder(
					t.radius + 0.05,
					t.radius + 0.05,
					0.5,
					t.x,
					t.height * 0.6 + 1.4,
					t.z,
					lin(0xc03a22),
					32
				)
			);
			// service ladder
			for (let y = 1.8; y < t.height + 1; y += 0.6) {
				p.thin.push(box(0.5, 0.04, 0.04, t.x + t.radius + 0.12, y, t.z, steel));
			}
			p.thin.push(
				box(0.04, t.height, 0.04, t.x + t.radius + 0.12, t.height / 2 + 1.4, t.z - 0.25, steel),
				box(0.04, t.height, 0.04, t.x + t.radius + 0.12, t.height / 2 + 1.4, t.z + 0.25, steel)
			);
		}
	}
	// pipe run between the spheres and the cylinder
	for (const [pz, r] of [
		[40, 0.22],
		[41.2, 0.16]
	] as const) {
		const pipe = new CylinderGeometry(r, r, 24, 10);
		pipe.rotateZ(Math.PI / 2);
		pipe.translate(-62, 1.1, pz);
		p.structure.push(coloured(pipe, lin(0xa8adb0)));
	}
	for (const px of [-72, -62, -52])
		p.structure.push(box(0.3, 1.1, 2.0, px, 0.55, 40.6, lin(0x5c6166)));
}

export function buildProps(p: SiteParts): void {
	const steel = lin(0x6e7377);
	// radar tower + dish
	p.structure.push(cylinder(0.5, 0.9, 22, 150, 11, -135, lin(0xdcdcd8), 12));
	const dish = new SphereGeometry(4.2, 24, 10, 0, Math.PI * 2, 0, 1.0);
	dish.rotateX(Math.PI * 0.55);
	dish.translate(150, 23.5, -135);
	p.structure.push(coloured(dish, lin(0xe9e9e6)));
	p.structure.push(beam(150, 23.3, -135, 150, 26, -139, 0.1, steel));
	// windsock
	p.thin.push(cylinder(0.08, 0.1, 7, 32, 3.5, 20, lin(0xdddddd), 6));
	const sock = new ConeGeometry(0.55, 3.2, 10, 1, true);
	sock.rotateZ(Math.PI / 2);
	sock.translate(30.2, 6.6, 20);
	p.painted.push(coloured(sock, lin(0xe5601d)));
	// pad-side service shed numbers: a flagpole by the control block
	p.thin.push(cylinder(0.06, 0.09, 14, 42, 7, -38, lin(0xd9d9d6), 6));
	p.painted.push(box(2.6, 1.6, 0.04, 43.4, 12.8, -38, lin(0x2c4f8a)));
	p.painted.push(box(2.6, 0.4, 0.05, 43.4, 12.0, -38, lin(0xc4361f)));
}

export function buildLightPoles(p: SiteParts): void {
	for (const r of ROADS.slice(0, 4)) {
		const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
		const n = Math.floor(len / 28);
		const nx = (r.bz - r.az) / len;
		const nz = -(r.bx - r.ax) / len;
		for (let i = 1; i < n; i++) {
			const t = i / n;
			const px = r.ax + (r.bx - r.ax) * t + nx * (r.width / 2 + 1.5);
			const pz = r.az + (r.bz - r.az) * t + nz * (r.width / 2 + 1.5);
			p.thin.push(
				cylinder(0.08, 0.12, 8, px, 4, pz, lin(0x5a5f63), 6),
				box(1.2, 0.18, 0.3, px, 8.05, pz, lin(0x5a5f63))
			);
			p.lamp.push(coloured(new SphereGeometry(0.28, 8, 6).translate(px, 7.9, pz), LAMP_WARM));
		}
	}
}

/** Barrel of rows of lit lamps over a doorway. */
const lampRow = (p: SiteParts, x: number, y: number, z: number, n: number, gap: number): void => {
	for (let i = 0; i < n; i++)
		p.lamp.push(box(0.8, 0.3, 0.3, x + (i - (n - 1) / 2) * gap, y, z, LAMP_WARM));
};

/** A glass ribbon with white mullions across a face; `normalSign` +1 faces +z. */
function glassRibbon(
	p: SiteParts,
	cx: number,
	cy: number,
	cz: number,
	width: number,
	height: number,
	alongX: boolean,
	mullion = 3
): void {
	const white = lin(0xeceae4);
	// one pane between each pair of mullions; a fixed share of the panes glows at night (ADR 0073)
	const panes = Math.max(1, Math.round(width / mullion));
	for (let i = 0; i < panes; i++) {
		const offset = -width / 2 + (width / panes) * (i + 0.5);
		const lit = windowIsLit(Math.round(cx * 3.1 + cy * 17.3 + cz * 5.7) * 64 + i);
		const pane = alongX
			? gbox(width / panes - 0.04, height, 0.12, cx + offset, cy, cz)
			: gbox(0.12, height, width / panes - 0.04, cx, cy, cz + offset);
		(lit ? p.glassLit : p.glass).push(pane);
	}
	if (alongX) {
		for (let m = -width / 2; m <= width / 2 + 0.01; m += mullion) {
			p.painted.push(box(0.16, height + 0.1, 0.22, cx + m, cy, cz, white));
		}
		p.painted.push(box(width, 0.14, 0.24, cx, cy + height / 2, cz, white));
		p.painted.push(box(width, 0.14, 0.24, cx, cy - height / 2, cz, white));
	} else {
		for (let m = -width / 2; m <= width / 2 + 0.01; m += mullion) {
			p.painted.push(box(0.22, height + 0.1, 0.16, cx, cy, cz + m, white));
		}
		p.painted.push(box(0.24, 0.14, width, cx, cy + height / 2, cz, white));
		p.painted.push(box(0.24, 0.14, width, cx, cy - height / 2, cz, white));
	}
}

export function buildHangar(b: BoxSpec, p: SiteParts): void {
	const wallH = b.h - 6;
	const ridge = 7;
	const base = 0.9;
	const fz = b.z + b.d / 2;
	const grey = lin(0xd3d8dc);
	const concrete = lin(0x8d9094);
	const dark = lin(0x2b2f33);
	const red = lin(0xc03a22);
	const roofC = lin(0x8a949b);
	p.painted.push(box(b.w + 1.2, base + 0.1, b.d + 1.2, b.x, (base + 0.1) / 2, b.z, concrete));
	p.siding.push(placed(texturedBox(b.w, wallH, b.d, grey, 4), b.x, base + wallH / 2, b.z));
	// gabled roof: a triangle extruded along the depth, gable ends in wall colour
	const hw = b.w / 2 + 0.8;
	const shape = new Shape();
	shape.moveTo(-hw, 0);
	shape.lineTo(hw, 0);
	shape.lineTo(0, ridge);
	shape.closePath();
	const depth = b.d + 1.6;
	const roof = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
	roof.translate(b.x, base + wallH, b.z - depth / 2);
	const n = roof.getAttribute('normal');
	const uv = roof.getAttribute('uv');
	const col = new Float32Array(n.count * 3);
	for (let i = 0; i < n.count; i++) {
		const c = Math.abs(n.getZ(i)) > 0.5 ? grey : roofC;
		col[i * 3] = c[0];
		col[i * 3 + 1] = c[1];
		col[i * 3 + 2] = c[2];
		uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
	}
	roof.setAttribute('color', new BufferAttribute(col, 3));
	p.siding.push(roof);
	p.painted.push(box(b.w + 1.8, 0.35, 0.5, b.x, base + wallH + 0.15, fz + 0.5, lin(0xb9bfc4)));
	// ridge vents
	for (let i = -3; i <= 3; i++) {
		p.painted.push(box(2.6, 1.2, 1.6, b.x + i * 10, base + wallH + ridge + 0.4, b.z, roofC));
		p.structure.push(
			cylinder(
				0.45,
				0.45,
				1.8,
				b.x + i * 10 + 1.8,
				base + wallH + ridge + 0.9,
				b.z,
				lin(0x9ea4a8),
				10
			)
		);
	}
	// pilasters along the front, rear and sides
	const dw = b.w * 0.5;
	const dh = wallH * 0.88;
	for (let px = -b.w / 2 + 2; px <= b.w / 2 - 1.9; px += 9.1) {
		if (Math.abs(px) < dw / 2 + 2.2) continue;
		p.painted.push(box(1.0, wallH, 0.55, b.x + px, base + wallH / 2, fz + 0.28, lin(0xc0c6ca)));
	}
	for (let px = -b.w / 2 + 2; px <= b.w / 2 - 1.9; px += 9.1) {
		p.painted.push(
			box(1.0, wallH, 0.55, b.x + px, base + wallH / 2, b.z - b.d / 2 - 0.28, lin(0xc0c6ca))
		);
	}
	for (let pz = -b.d / 2 + 3; pz <= b.d / 2 - 2.9; pz += 10) {
		p.painted.push(
			box(0.55, wallH, 1.0, b.x + b.w / 2 + 0.28, base + wallH / 2, b.z + pz, lin(0xc0c6ca))
		);
		p.painted.push(
			box(0.55, wallH, 1.0, b.x - b.w / 2 - 0.28, base + wallH / 2, b.z + pz, lin(0xc0c6ca))
		);
	}
	// clerestory glass on the sides and back
	for (const s of [-1, 1]) {
		p.glass.push(gbox(0.12, 1.9, b.d - 6, b.x + s * (b.w / 2 + 0.05), base + wallH - 3.2, b.z));
	}
	p.glass.push(gbox(b.w - 6, 1.9, 0.12, b.x, base + wallH - 3.2, b.z - b.d / 2 - 0.05));
	// the big door
	p.structure.push(
		box(dw + 3.2, 2.6, 1.3, b.x, base + dh + 1.3, fz + 0.65, lin(0x6a7076)),
		box(1.5, dh, 1.3, b.x - dw / 2 - 0.75, base + dh / 2, fz + 0.65, lin(0x6a7076)),
		box(1.5, dh, 1.3, b.x + dw / 2 + 0.75, base + dh / 2, fz + 0.65, lin(0x6a7076)),
		box(dw * 1.7, 1.1, 1.1, b.x, base + dh + 3.4, fz + 0.7, lin(0x575d62))
	);
	p.door.push(box(dw, dh, 0.5, b.x, base + dh / 2, fz + 0.35, [1, 1, 1]));
	lampRow(p, b.x, base + dh + 2.7, fz + 1.4, 7, dw / 7);
	// sign band and emblem
	p.painted.push(box(b.w * 0.5, 1.5, 0.5, b.x, base + wallH - 1.6, fz + 0.3, red));
	const ring = new RingGeometry(1.7, 2.3, 40);
	ring.translate(b.x + b.w * 0.36, base + wallH - 8.5, fz + 0.62);
	p.painted.push(coloured(ring, lin(0xf2f0ea)));
	const disc = new CircleGeometry(0.95, 24);
	disc.translate(b.x + b.w * 0.36, base + wallH - 8.5, fz + 0.62);
	p.painted.push(coloured(disc, lin(0xe5601d)));
	// man door, steps, lamp
	const mx = b.x + b.w * 0.38;
	p.painted.push(
		box(2.0, 3.6, 0.3, mx, base + 1.8, fz + 0.4, lin(0x2f4a3c)),
		box(3.2, 0.3, 1.6, mx, base + 0.15, fz + 1.2, concrete)
	);
	p.lamp.push(box(0.6, 0.3, 0.3, mx, base + 4.2, fz + 0.6, LAMP_WARM));
	// downpipes and base conduit
	for (const s of [-1, 1]) {
		p.thin.push(
			cylinder(
				0.1,
				0.1,
				wallH,
				b.x + s * (b.w / 2 - 0.4),
				base + wallH / 2,
				fz + 0.12,
				lin(0x808589),
				6
			)
		);
	}
	p.structure.push(box(dw * 0.6, 0.5, 1.1, b.x, 0.25, fz + 4.2, lin(0xe3b21f)));
	// hazard bollards in front of the door
	for (let i = -2; i <= 2; i++) {
		p.painted.push(cylinderBody(b.x + i * dw * 0.22, fz + 6, lin(0xe3b21f)));
	}
}

function cylinderBody(x: number, z: number, colour: Rgb): BufferGeometry {
	return cylinder(0.14, 0.14, 1.1, x, 0.55, z, colour, 8);
}

export function buildControl(b: BoxSpec, p: SiteParts): void {
	const white = lin(0xe9e6df);
	const fz = b.z + b.d / 2;
	const lowH = 4.6;
	p.painted.push(box(b.w, lowH, b.d, b.x, lowH / 2, b.z, white));
	const upW = b.w * 0.74;
	const upD = b.d * 0.84;
	p.painted.push(box(upW, 4.0, upD, b.x - b.w * 0.07, lowH + 2.0, b.z - 0.5, white));
	p.painted.push(box(b.w + 0.6, 0.4, b.d + 0.6, b.x, lowH + 0.2, b.z, lin(0x8c9296)));
	p.painted.push(
		box(upW + 0.6, 0.4, upD + 0.6, b.x - b.w * 0.07, lowH + 4.2, b.z - 0.5, lin(0x8c9296))
	);
	p.painted.push(box(b.w + 0.1, 0.5, b.d + 0.1, b.x, 1.0, b.z, lin(0xc03a22)));
	// ribbon windows on the front and sides
	glassRibbon(p, b.x, 2.7, fz + 0.04, b.w - 4, 1.8, true);
	glassRibbon(p, b.x - b.w * 0.07, lowH + 2.4, b.z - 0.5 + upD / 2 + 0.04, upW - 3, 1.9, true);
	glassRibbon(p, b.x + b.w / 2 + 0.04, 2.7, b.z, b.d - 3, 1.8, false, 2.8);
	glassRibbon(p, b.x - b.w / 2 - 0.04, 2.7, b.z, b.d - 3, 1.8, false, 2.8);
	// canopy and entrance
	const ex = b.x + b.w * 0.28;
	p.painted.push(box(7, 0.3, 4.2, ex, 3.6, fz + 2.1, lin(0xc03a22)));
	p.structure.push(
		cylinder(0.12, 0.12, 3.5, ex - 3.2, 1.75, fz + 3.8, lin(0x6b7075), 8),
		cylinder(0.12, 0.12, 3.5, ex + 3.2, 1.75, fz + 3.8, lin(0x6b7075), 8)
	);
	p.glass.push(gbox(3.2, 2.7, 0.14, ex, 1.55, fz + 0.1));
	p.lamp.push(box(1.4, 0.2, 0.5, ex, 3.4, fz + 2.2, LAMP_WARM));
	// roof gear: mast, dishes, plant
	const rx = b.x - b.w * 0.2;
	p.structure.push(cylinder(0.12, 0.2, 14, rx, lowH + 4.4 + 7, b.z, lin(0xb4b9bc), 8));
	const dish = new SphereGeometry(1.7, 20, 8, 0, Math.PI * 2, 0, 1.0);
	dish.rotateX(Math.PI * 0.55);
	dish.translate(rx + 3.5, lowH + 6.2, b.z + 2);
	p.structure.push(coloured(dish, lin(0xeeeeea)));
	p.structure.push(
		beam(rx + 3.5, lowH + 5.2, b.z + 2, rx + 3.5, lowH + 6.4, b.z + 3.4, 0.08, lin(0x777c80))
	);
	p.painted.push(box(4, 1.6, 2.6, b.x + b.w * 0.2, lowH + 4.4 + 0.8, b.z, lin(0x9da3a7)));
	p.lamp.push(
		coloured(new SphereGeometry(0.3, 8, 6).translate(rx, lowH + 4.4 + 14.2, b.z), LAMP_RED)
	);
}

export function buildOffice(b: BoxSpec, p: SiteParts): void {
	const fz = b.z + b.d / 2;
	p.painted.push(box(b.w, b.h, b.d, b.x, b.h / 2, b.z, lin(0xe2dfd6)));
	p.painted.push(box(b.w + 0.6, 0.45, b.d + 0.6, b.x, b.h + 0.22, b.z, lin(0x80888c)));
	const floors = Math.max(1, Math.round(b.h / 4.5));
	for (let f = 0; f < floors; f++) {
		const y = 1.8 + (f * (b.h - 1.0)) / floors + 0.8;
		glassRibbon(p, b.x, y, fz + 0.04, b.w - 3, 1.7, true, 2.5);
		glassRibbon(p, b.x + b.w / 2 + 0.04, y, b.z, b.d - 3, 1.7, false, 2.5);
	}
	p.glass.push(gbox(2.8, 2.6, 0.14, b.x - b.w * 0.3, 1.4, fz + 0.1));
	p.painted.push(box(4.4, 0.25, 2.2, b.x - b.w * 0.3, 3.1, fz + 1.1, lin(0xc03a22)));
	p.structure.push(cylinder(0.05, 0.07, 7, b.x + b.w * 0.35, b.h + 3.5, b.z, lin(0xdddddd), 6));
	p.painted.push(box(3.4, 1.8, 3.4, b.x - 8, b.h + 1.4, b.z, lin(0x9da3a7)));
}

export function buildService(b: BoxSpec, p: SiteParts, light: Rgb): void {
	const fz = b.z + b.d / 2;
	p.siding.push(placed(texturedBox(b.w, b.h, b.d, light, 4), b.x, b.h / 2, b.z));
	p.painted.push(box(b.w + 0.6, 0.45, b.d + 0.6, b.x, b.h + 0.22, b.z, lin(0x80888c)));
	p.painted.push(box(b.w + 0.3, 0.9, b.d + 0.3, b.x, 0.45, b.z, lin(0x8d9094)));
	const doors = b.w > 24 ? 2 : 1;
	const dwid = Math.min(5.6, b.w * 0.3);
	const dhei = Math.min(5.4, b.h * 0.72);
	for (let i = 0; i < doors; i++) {
		const dx = b.x + (doors === 1 ? 0 : (i === 0 ? -1 : 1) * b.w * 0.25);
		p.door.push(box(dwid, dhei, 0.3, dx, dhei / 2 + 0.2, fz + 0.2, [1, 1, 1]));
		p.structure.push(box(dwid + 0.7, 0.4, 0.5, dx, dhei + 0.5, fz + 0.28, lin(0x5d6368)));
		p.lamp.push(box(0.6, 0.25, 0.25, dx, dhei + 1.2, fz + 0.5, LAMP_WARM));
	}
	p.painted.push(box(3, 2.2, 3, b.x + b.w * 0.3, b.h + 1.5, b.z - 2, lin(0x9da3a7)));
	p.glass.push(gbox(b.w * 0.5, 1.2, 0.12, b.x, b.h - 1.6, fz + 0.04));
}

/** A shipping container's long axis is x (yaw 0). */
function buildContainers(p: SiteParts): void {
	const colours = [lin(0xb5412c), lin(0x2f5d8a), lin(0xd1a022), lin(0x4d7a4f)];
	for (const c of CONTAINERS) {
		for (let l = 0; l < c.levels; l++) {
			const colour = colours[(c.colour + l) % colours.length]!;
			const g = texturedBox(12.2, 2.6, 2.44, colour, 2.4);
			p.siding.push(placed(g, c.x, 1.3 + l * 2.6, c.z, c.yaw));
			// corner posts and door bars
			for (const s of [-1, 1]) {
				p.structure.push(
					placed(
						box(0.16, 2.62, 2.5, s * 6.05, 0, 0, lin(0x4b4f52)),
						c.x,
						1.3 + l * 2.6,
						c.z,
						c.yaw
					)
				);
				p.thin.push(
					placed(
						cylinder(0.04, 0.04, 2.3, s * 6.12, 0, 0.5, lin(0x8b9094), 5),
						c.x,
						1.3 + l * 2.6,
						c.z,
						c.yaw
					),
					placed(
						cylinder(0.04, 0.04, 2.3, s * 6.12, 0, -0.5, lin(0x8b9094), 5),
						c.x,
						1.3 + l * 2.6,
						c.z,
						c.yaw
					)
				);
			}
		}
	}
}

function vehicle(v: VehicleSpec, p: SiteParts): void {
	const body = [lin(0xe8e6de), lin(0x2f5d8a), lin(0xc4361f), lin(0xd9a21b)][v.colour % 4]!;
	const tyre = lin(0x151618);
	const wheel = (x: number, z: number, r = 0.45): BufferGeometry => {
		const g = new CylinderGeometry(r, r, 0.35, 12);
		g.rotateX(Math.PI / 2);
		g.translate(x, r, z);
		return coloured(g, tyre);
	};
	const at = (g: BufferGeometry): BufferGeometry => placed(g, v.x, 0, v.z, v.yaw);
	if (v.kind === 'van') {
		p.painted.push(
			at(box(4.4, 1.5, 2.0, 0, 1.2, 0, body)),
			at(box(1.8, 0.9, 1.9, 1.5, 2.15, 0, body))
		);
		p.glass.push(at(gbox(0.08, 0.7, 1.7, 2.42, 2.15, 0)), at(gbox(1.7, 0.6, 1.95, 1.5, 2.2, 0)));
		for (const x of [-1.4, 1.5]) for (const z of [-0.95, 0.95]) p.painted.push(at(wheel(x, z)));
		p.lamp.push(
			at(box(0.1, 0.25, 0.4, 2.23, 1.2, 0.7, LAMP_WARM)),
			at(box(0.1, 0.25, 0.4, 2.23, 1.2, -0.7, LAMP_WARM))
		);
	} else if (v.kind === 'truck') {
		p.painted.push(
			at(box(2.3, 2.4, 2.4, 3.6, 1.75, 0, body)),
			at(box(10, 0.5, 2.3, 0, 0.9, 0, lin(0x3a3f43))),
			at(box(6.6, 2.6, 2.45, -1.1, 2.45, 0, lin(0xdadbd6)))
		);
		p.glass.push(at(gbox(0.08, 1.0, 2.1, 4.76, 2.2, 0)));
		for (const x of [-3.4, -2.2, 3.3])
			for (const z of [-1.0, 1.0]) p.painted.push(at(wheel(x, z, 0.55)));
	} else {
		p.painted.push(
			at(box(9, 0.9, 3.0, 0, 1.0, 0, body)),
			at(box(2.4, 1.8, 2.6, 3.2, 2.3, 0.2, body)),
			at(box(2.2, 1.4, 2.4, -3.3, 2.0, 0, lin(0x575d62)))
		);
		p.glass.push(at(gbox(0.08, 1.0, 2.2, 4.42, 2.5, 0.2)));
		p.structure.push(at(beam(-1.5, 1.5, 0, 6.5, 8.5, 0, 0.55, lin(0xe3b21f))));
		p.thin.push(at(beam(6.5, 8.5, 0, 6.5, 5.5, 0, 0.05, lin(0x222426))));
		p.structure.push(at(box(0.8, 0.8, 0.8, 6.5, 5.3, 0, lin(0x2c2e30))));
		for (const x of [-3, -1.2, 1.4, 3.2])
			for (const z of [-1.4, 1.4]) p.painted.push(at(wheel(x, z, 0.62)));
	}
}

function buildFences(p: SiteParts): void {
	const steel = lin(0x8e9498);
	for (const f of FENCES) {
		const sides: [number, number, number, number][] = [
			[f.x - f.hx, f.z - f.hz, f.x + f.hx, f.z - f.hz],
			[f.x + f.hx, f.z - f.hz, f.x + f.hx, f.z + f.hz],
			[f.x + f.hx, f.z + f.hz, f.x - f.hx, f.z + f.hz],
			[f.x - f.hx, f.z + f.hz, f.x - f.hx, f.z - f.hz]
		];
		for (const [ax, az, bx, bz] of sides) {
			const len = Math.hypot(bx - ax, bz - az);
			const posts = Math.floor(len / 3);
			for (let i = 0; i <= posts; i++) {
				const t = i / posts;
				p.thin.push(
					cylinder(0.05, 0.05, 2.4, ax + (bx - ax) * t, 1.2, az + (bz - az) * t, steel, 5)
				);
			}
			for (const y of [0.4, 1.2, 2.3]) p.thin.push(beam(ax, y, az, bx, y, bz, 0.04, steel));
		}
	}
}

/** The hard-coded buildings of the launch site (plan 025); site mode (ADR 0117) leaves them out. */
export function buildBuildings(p: SiteParts, withBoxes = true): void {
	for (const b of withBoxes ? BUILDINGS : []) {
		if (b.kind === 'hangar') buildHangar(b, p);
		else if (b.kind === 'control') buildControl(b, p);
		else if (b.kind === 'office') buildOffice(b, p);
		else buildService(b, p, b.kind === 'garage' ? lin(0xd2c9b8) : lin(0xcfd3d6));
	}
	buildContainers(p);
	for (const v of VEHICLES) vehicle(v, p);
	buildFences(p);
}
