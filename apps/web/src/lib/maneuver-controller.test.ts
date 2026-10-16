/** Plan 045: the planner - clicks, handle drags, keys and warp-to-node against a fake sim. */
import {
	GRAVITATIONAL_CONSTANT,
	entityId,
	type BodyDefinition,
	type Command,
	type CommandResult,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import { propagateUniversal } from '@orbital/kepler';
import { describe, expect, it } from 'vitest';
import { createManeuverController, WARP_LEAD_S } from './maneuver-controller';
import { dvPerPixel } from './maneuver';

const HOME_MU = 3.5316e12;
const home = {
	id: 'stock.home',
	mass: HOME_MU / GRAVITATIONAL_CONSTANT,
	radius: 600_000,
	rotationPeriod: 21_600
} as unknown as BodyDefinition;
const R = 700_000;
const V = Math.sqrt(HOME_MU / R);

/** A flat view from +Y: world x to the right, world z down, 2 km per pixel. */
const project = (w: Vec3) => ({ x: 400 + w.x / 2000, y: 300 + w.z / 2000, hidden: false });

interface Rig {
	commands: Command[];
	notices: string[];
	paths: unknown[];
	ctl: ReturnType<typeof createManeuverController>;
	snap: Snapshot;
	setNodes(
		nodes: Array<{ id: number; time: number; prograde?: number; normal?: number; radial?: number }>
	): void;
	reply: CommandResult;
}

function rig(opts: { mapOn?: boolean; burn?: number | null } = {}): Rig {
	const commands: Command[] = [];
	const notices: string[] = [];
	const paths: unknown[] = [];
	const snap = {
		t: 0,
		bodies: [],
		vessels: [
			{
				id: entityId(1),
				mode: 'on-rails',
				soi: 'stock.home',
				position: { x: R, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -V },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				parts: [],
				orbit: { a: R, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 },
				nodes: []
			}
		]
	} as unknown as Snapshot;
	const r = { reply: { ok: true, node: 1 } as CommandResult } as Rig;
	const ctl = createManeuverController({
		bodies: [home],
		dispatch: async (c) => {
			commands.push(c);
			return r.reply;
		},
		project,
		setPath: (p) => paths.push(p),
		mapOn: () => opts.mapOn ?? true,
		vessel: () => 1,
		snapshot: () => snap,
		burnTime: () => (opts.burn === undefined ? 20 : opts.burn),
		notice: (title) => notices.push(title)
	});
	r.commands = commands;
	r.notices = notices;
	r.paths = paths;
	r.ctl = ctl;
	r.snap = snap;
	r.setNodes = (nodes) => {
		(snap.vessels[0] as unknown as { nodes: unknown }).nodes = nodes.map((n) => ({
			prograde: 0,
			normal: 0,
			radial: 0,
			dv: Math.hypot(n.prograde ?? 0, n.normal ?? 0, n.radial ?? 0),
			...n
		}));
	};
	return r;
}

const settle = (): Promise<void> => new Promise((res) => setTimeout(res, 0));

describe('placing a node', () => {
	it('a click on the orbit asks the sim for a node at the time of that point', async () => {
		const r = rig();
		r.ctl.update(1_000); // predict once so the path is known
		const at = propagateUniversal({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -V }, HOME_MU, 900).r;
		const p = project(at);
		r.ctl.click(p.x + 3, p.y - 2);
		await Promise.resolve();
		expect(r.commands).toHaveLength(1);
		const c = r.commands[0]!;
		expect(c.type).toBe('node-set');
		if (c.type === 'node-set') {
			expect(Math.abs(c.time - 900)).toBeLessThan(25);
			expect(c).toMatchObject({ prograde: 0, normal: 0, radial: 0 });
			expect(c.id).toBeUndefined();
		}
		await new Promise((res) => setTimeout(res, 0));
		expect(r.ctl.selected).toBe(1);
	});

	it('a click away from the orbit places nothing and deselects', () => {
		const r = rig();
		r.ctl.select(4);
		r.ctl.click(5, 5);
		expect(r.commands).toHaveLength(0);
		expect(r.ctl.selected).toBeNull();
	});

	it('clicks do nothing outside the map view and a refusal is shown', async () => {
		const off = rig({ mapOn: false });
		off.ctl.click(400, 300);
		expect(off.commands).toHaveLength(0);
		const r = rig();
		r.reply = { ok: false, reason: 'a vessel keeps at most 8 maneuver nodes' };
		r.ctl.update(1_000);
		const p = project(R > 0 ? { x: R, y: 0, z: 0 } : { x: 0, y: 0, z: 0 });
		r.ctl.click(p.x, p.y);
		await new Promise((res) => setTimeout(res, 0));
		expect(r.notices).toEqual(['No maneuver node placed']);
	});
});

describe('the drawn path and the handles', () => {
	it('draws the path with the node applied and puts six handles around the selected node', () => {
		const r = rig();
		r.setNodes([{ id: 1, time: 1_000, prograde: 200 }]);
		r.ctl.select(1);
		r.ctl.update(1_000);
		const drawn = r.paths.at(-1) as Array<{ planned?: boolean }>;
		expect(drawn.length).toBeGreaterThanOrEqual(2);
		expect(drawn[0]!.planned).toBeUndefined();
		expect(drawn.at(-1)!.planned).toBe(true);
		const frame = r.ctl.frame()!;
		expect(frame.nodes).toHaveLength(1);
		const n = frame.nodes[0]!;
		expect(n.selected).toBe(true);
		expect(n.handles).toHaveLength(6);
		const pro = n.handles.find((h) => h.kind === 'prograde')!.point!;
		const retro = n.handles.find((h) => h.kind === 'retrograde')!.point!;
		// handles sit 56 px from the node, retrograde opposite prograde
		expect(Math.hypot(pro.x - n.point!.x, pro.y - n.point!.y)).toBeCloseTo(56, 6);
		expect(pro.x + retro.x).toBeCloseTo(2 * n.point!.x, 6);
		expect(pro.y + retro.y).toBeCloseTo(2 * n.point!.y, 6);
		// the node sits where the orbit is at its time; prograde points along the motion
		const at = propagateUniversal({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: -V }, HOME_MU, 1_000);
		const world = project(at.r);
		expect(n.point!.x).toBeCloseTo(world.x, 6);
		const ahead = project({ x: at.r.x + at.v.x, y: 0, z: at.r.z + at.v.z });
		const want = Math.atan2(ahead.y - world.y, ahead.x - world.x);
		expect(Math.atan2(pro.y - n.point!.y, pro.x - n.point!.x)).toBeCloseTo(want, 6);
	});

	it('an unselected node has no handles; no map, no frame', () => {
		const r = rig();
		r.setNodes([{ id: 1, time: 1_000 }]);
		r.ctl.update(1_000);
		expect(r.ctl.frame()!.nodes[0]!.handles).toEqual([]);
		const off = rig({ mapOn: false });
		off.ctl.update(1_000);
		expect(off.ctl.frame()).toBeNull();
	});
});

describe('editing', () => {
	it('dragging the prograde handle outward sends the dv the mapping gives; dragging back undoes it', async () => {
		const r = rig();
		r.setNodes([{ id: 1, time: 1_000, prograde: 10 }]);
		r.ctl.select(1);
		r.ctl.update(1_000);
		const f = r.ctl.frame()!.nodes[0]!;
		const pro = f.handles.find((h) => h.kind === 'prograde')!.point!;
		const out = { x: (pro.x - f.point!.x) / 56, y: (pro.y - f.point!.y) / 56 };
		r.ctl.beginDrag(1, 'prograde', 0, 0);
		expect(r.ctl.dragging).toBe(true);
		r.ctl.drag(out.x * 100, out.y * 100, {});
		r.ctl.update(2_000);
		await Promise.resolve();
		const sent = r.commands.at(-1)!;
		expect(sent.type).toBe('node-set');
		if (sent.type === 'node-set') {
			expect(sent.id).toBe(1);
			expect(sent.time).toBe(1_000);
			expect(sent.prograde).toBeCloseTo(10 + 100 * dvPerPixel(V), 6);
			expect(sent.normal).toBe(0);
		}
		await settle();
		r.ctl.drag(-out.x * 40, -out.y * 40, { shift: true });
		r.ctl.endDrag();
		r.ctl.update(3_000);
		await settle();
		const last = r.commands.at(-1)!;
		if (last.type === 'node-set') expect(last.prograde).toBeCloseTo(10 - 400 * dvPerPixel(V), 6);
		expect(r.ctl.dragging).toBe(false);
	});

	it('keys adjust the selected node by 1 m/s, Shift by 10, Alt by 0.1, and Delete removes it', async () => {
		const r = rig();
		r.setNodes([{ id: 1, time: 1_000, normal: 5 }]);
		r.ctl.select(1);
		expect(r.ctl.key('KeyL', {})).toBe(true);
		r.ctl.update(5_000);
		await settle();
		let c = r.commands.at(-1)!;
		expect(c.type === 'node-set' && c.normal).toBeCloseTo(6, 9);
		expect(r.ctl.key('KeyK', { shift: true })).toBe(true);
		r.ctl.update(6_000);
		await settle();
		c = r.commands.at(-1)!;
		expect(c.type === 'node-set' && c.prograde).toBeCloseTo(-10, 9);
		expect(c.type === 'node-set' && c.normal).toBeCloseTo(6, 9);
		expect(r.ctl.key('KeyO', { alt: true })).toBe(true);
		r.ctl.update(7_000);
		await settle();
		c = r.commands.at(-1)!;
		expect(c.type === 'node-set' && c.radial).toBeCloseTo(0.1, 9);
		expect(r.ctl.key('KeyZ', {})).toBe(false);
		expect(r.ctl.key('Delete', {})).toBe(true);
		expect(r.commands.at(-1)).toMatchObject({ type: 'node-remove', id: 1 });
		expect(r.ctl.selected).toBeNull();
		expect(r.ctl.key('KeyI', {})).toBe(false);
	});

	it('keys do nothing outside the map view', () => {
		const r = rig({ mapOn: false });
		r.setNodes([{ id: 1, time: 1_000 }]);
		r.ctl.select(1);
		expect(r.ctl.key('KeyI', {})).toBe(false);
	});
});

describe('warp to the node', () => {
	it('warps to 30 s before the centred burn starts', () => {
		const r = rig({ burn: 40 });
		r.setNodes([{ id: 1, time: 5_000, prograde: 300 }]);
		r.ctl.warpToNode();
		expect(r.commands.at(-1)).toMatchObject({
			type: 'warp-to',
			time: 5_000 - 20 - WARP_LEAD_S,
			factor: 100_000
		});
	});

	it('says so when the burn is already about to start or there is no node', () => {
		const r = rig({ burn: 40 });
		r.ctl.warpToNode();
		r.setNodes([{ id: 1, time: 40, prograde: 300 }]);
		r.ctl.warpToNode();
		expect(r.commands).toHaveLength(0);
		expect(r.notices).toEqual(['No maneuver node', 'Already at the burn']);
	});
});
