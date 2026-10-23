/**
 * The stock system's Δv map (plan 381, ADR 0318): Hohmann numbers from the body definitions, printed
 * as the markdown tables of docs/research/stock-system.md. Run: `bun run tools/stock-dv-map.ts`.
 *
 * Model: circular coplanar Hohmann transfers between the semi-major axes, departures and captures
 * by the Oberth form √(v∞² + 2μ/r) − v_circ at a low orbit (10 km above the air, else 10 % of the
 * radius, at least 5 km), the plane change as a mid-course burn of v_mid · 2 sin(Δi/2). Ascent and
 * landing on a body with air are estimates, said so in the table.
 */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition } from '../packages/core/src/index.ts';
import { STOCK_BODIES } from '../mods/stock/src/bodies.ts';

const DAY = 21_651;
const bodies = STOCK_BODIES as readonly BodyDefinition[];
const byId = new Map(bodies.map((b) => [b.id, b]));
const mu = (b: BodyDefinition): number => b.mass * GRAVITATIONAL_CONSTANT;
const low = (b: BodyDefinition): number =>
	b.radius + (b.atmosphere ? b.atmosphere.height + 10_000 : Math.max(5_000, b.radius * 0.1));
const vCirc = (b: BodyDefinition): number => Math.sqrt(mu(b) / low(b));
const soi = (b: BodyDefinition): number =>
	b.orbit && b.parent ? b.orbit.a * Math.pow(b.mass / byId.get(b.parent)!.mass, 0.4) : Infinity;
const normal = (o: NonNullable<BodyDefinition['orbit']>) => ({
	x: Math.sin(o.raan) * Math.sin(o.i),
	y: Math.cos(o.i),
	z: Math.cos(o.raan) * Math.sin(o.i)
});
const relInc = (a: BodyDefinition, b: BodyDefinition): number => {
	const p = normal(a.orbit!);
	const q = normal(b.orbit!);
	return Math.acos(Math.min(1, p.x * q.x + p.y * q.y + p.z * q.z));
};
/** Oberth: from a circular low orbit to v∞ (or back). */
const oberth = (b: BodyDefinition, vInf: number): number =>
	Math.sqrt(vInf ** 2 + (2 * mu(b)) / low(b)) - vCirc(b);

/** Ascent to (and landing from) low orbit, m/s: airless by rule, with air the design estimates. */
const ASCENT_WITH_AIR: Record<string, number> = {
	'stock.home': 3_400,
	'stock.vesper': 8_000,
	'stock.ochre': 1_450,
	'stock.bastion': 2_600
};
const ascent = (b: BodyDefinition): string =>
	b.atmosphere
		? b.id === 'stock.tempest'
			? '— (no surface)'
			: `~${ASCENT_WITH_AIR[b.id] ?? '?'} (est.)`
		: `${Math.round(vCirc(b) * 1.12 + Math.sqrt(2 * (mu(b) / b.radius ** 2) * 2_000))}`;
const landing = (b: BodyDefinition): string =>
	b.atmosphere
		? b.id === 'stock.tempest'
			? '— (no surface)'
			: 'aerobrake + chutes, ~100–300'
		: `${Math.round(vCirc(b) * 1.12)}`;

const transfer = (from: BodyDefinition, to: BodyDefinition) => {
	const parent = byId.get(from.parent!)!;
	const m = mu(parent);
	const r1 = from.orbit!.a;
	const r2 = to.orbit!.a;
	const at = (r1 + r2) / 2;
	const v1 = Math.sqrt(m / r1);
	const v2 = Math.sqrt(m / r2);
	const vt1 = Math.sqrt(m * (2 / r1 - 1 / at));
	const vt2 = Math.sqrt(m * (2 / r2 - 1 / at));
	const tTransfer = Math.PI * Math.sqrt(at ** 3 / m);
	const T1 = 2 * Math.PI * Math.sqrt(r1 ** 3 / m);
	const T2 = 2 * Math.PI * Math.sqrt(r2 ** 3 / m);
	const synodic = 1 / Math.abs(1 / T1 - 1 / T2);
	const phase = Math.PI - (2 * Math.PI * tTransfer) / T2;
	const rMid = Math.sqrt(r1 * r2);
	const vMid = Math.sqrt(m * (2 / rMid - 1 / at));
	const di = relInc(from, to);
	return {
		eject: oberth(from, Math.abs(vt1 - v1)),
		capture: oberth(to, Math.abs(v2 - vt2)),
		plane: vMid * 2 * Math.sin(di / 2),
		di,
		days: tTransfer / DAY,
		synodic: synodic / DAY,
		phase: (((phase * 180) / Math.PI + 540) % 360) - 180
	};
};

const r0 = (n: number): string => Math.round(n).toLocaleString('en-US');
const name = (b: BodyDefinition): string => {
	const s = b.id.split('.')[1]!;
	return s[0]!.toUpperCase() + s.slice(1);
};

const out: string[] = [];
out.push('### Bodies\n');
out.push(
	'| Body | Parent | Radius km | g m/s² | Day s | a Mm | e | SOI km | Low orbit km | v low m/s | Air |'
);
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const b of bodies) {
	if (b.star) continue;
	const g = mu(b) / b.radius ** 2;
	out.push(
		`| ${name(b)} | ${name(byId.get(b.parent!)!)} | ${r0(b.radius / 1000)} | ${g.toFixed(2)} | ${r0(b.rotationPeriod)} | ${(b.orbit!.a / 1e6).toFixed(1)} | ${b.orbit!.e} | ${r0(soi(b) / 1000)} | ${r0((low(b) - b.radius) / 1000)} | ${r0(vCirc(b))} | ${b.atmosphere ? `${(b.atmosphere.surfacePressure / 1000).toFixed(1)} kPa, ${r0(b.atmosphere.height / 1000)} km` : '—'} |`
	);
}

const home = byId.get('stock.home')!;
out.push('\n### From Home (low orbit, 80 km)\n');
out.push(
	'| To | Eject | Plane change | Capture to low orbit | Land | Ascent | Δi ° | Trip days | Window every days | Phase angle ° |'
);
out.push('|---|---|---|---|---|---|---|---|---|---|');
for (const b of bodies) {
	if (b.parent !== 'stock.sun' || b === home) continue;
	const t = transfer(home, b);
	out.push(
		`| ${name(b)} | ${r0(t.eject)} | ${r0(t.plane)} | ${r0(t.capture)} | ${landing(b)} | ${ascent(b)} | ${((t.di * 180) / Math.PI).toFixed(1)} | ${r0(t.days)} | ${r0(t.synodic)} | ${t.phase.toFixed(0)} |`
	);
}

out.push('\n### Moons, from their planet\'s low orbit\n');
out.push('| Moon | Planet | Transfer | Plane change | Capture to low orbit | Land | Ascent | Trip hours |');
out.push('|---|---|---|---|---|---|---|---|');
for (const b of bodies) {
	const parent = b.parent ? byId.get(b.parent) : undefined;
	if (!parent?.parent) continue;
	const m = mu(parent);
	const r1 = low(parent);
	const r2 = b.orbit!.a;
	const at = (r1 + r2) / 2;
	const dv1 = Math.sqrt(m * (2 / r1 - 1 / at)) - Math.sqrt(m / r1);
	const vInf = Math.abs(Math.sqrt(m / r2) - Math.sqrt(m * (2 / r2 - 1 / at)));
	const di = b.orbit!.i - (parent.rotation ? 0 : 0);
	void di;
	const plane = b.id === 'stock.husk' ? Math.sqrt(m / r2) * 2 * Math.sin(((180 - 158) * Math.PI) / 360) : 0;
	const hours = (Math.PI * Math.sqrt(at ** 3 / m)) / 3600;
	out.push(
		`| ${name(b)} | ${name(parent)} | ${r0(dv1)} | ${b.id === 'stock.husk' ? `${r0(plane)} (retrograde: arrive head-on instead)` : '—'} | ${r0(oberth(b, vInf))} | ${landing(b)} | ${ascent(b)} | ${hours.toFixed(1)} |`
	);
}

console.log(out.join('\n'));
