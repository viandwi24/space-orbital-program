/**
 * Snapshot deltas (plan 365, ADR 0358): the worker posts a snapshot every tick and the main thread
 * pays to deserialize all of it, though most of it does not change from one tick to the next: the
 * bodies, the sites, the rules, a vessel's actions and crew, and, per part, its definition, modules
 * and stores until a burn or a switch changes them. The encoder (worker) leaves out what is the
 * same as in the last message, the decoder (main thread) puts the earlier values back, so
 * consumers see the whole `Snapshot` as before, and an unchanged field is the same object as in the
 * last snapshot. Messages arrive in order from one worker, so the decoder's last snapshot is the
 * encoder's last message; the first message is always whole.
 */
import type { PartSnapshot, Snapshot, VesselSnapshot } from '@orbital/core';

/** A vessel's keys that change every tick: never compared, always sent. */
const FAST_VESSEL_KEYS: ReadonlySet<string> = new Set([
	'id',
	'parts',
	'position',
	'velocity',
	'orientation',
	'aero',
	'mach',
	'terrainHeight',
	'situation',
	'orbit'
]);

/** A part's keys that change every tick: always sent. */
const FAST_PART_KEYS: ReadonlySet<string> = new Set([
	'id',
	'position',
	'orientation',
	'temperature'
]);

/** A part as posted: its tick-by-tick keys, and either all the rest or `same` for "as before". */
export type WirePart = Partial<PartSnapshot> &
	Pick<PartSnapshot, 'id' | 'position' | 'orientation'> & { same?: true };

export type WireVessel = Omit<Partial<VesselSnapshot>, 'parts'> & {
	id: VesselSnapshot['id'];
	parts: WirePart[];
	/** Keys left out because they are as in the vessel's last snapshot. */
	same?: string[];
};

export type SnapshotWire = Omit<Partial<Snapshot>, 'vessels'> & {
	t: number;
	vessels: WireVessel[];
	/** Top-level keys left out because they are as in the last snapshot. */
	same?: string[];
};

const record = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

/** The state the worker keeps between messages: the JSON of what it last sent. */
export class SnapshotEncoder {
	private readonly top = new Map<string, string>();
	private readonly vessels = new Map<number, Map<string, string>>();
	private readonly parts = new Map<number, string>();
	private first = true;

	/** The wire form of `snapshot`: the same data with the unchanged slow fields left out. */
	encode(snapshot: Snapshot): SnapshotWire {
		const first = this.first;
		this.first = false;
		const out: Record<string, unknown> = {};
		const same: string[] = [];
		for (const key of Object.keys(snapshot)) {
			const value = record(snapshot)[key];
			if (key === 't' || key === 'vessels' || value === undefined) {
				if (value !== undefined) out[key] = value;
				continue;
			}
			const json = JSON.stringify(value);
			if (!first && this.top.get(key) === json) same.push(key);
			else {
				this.top.set(key, json);
				out[key] = value;
			}
		}
		// a key that is gone is forgotten, so that it comes back whole
		for (const key of [...this.top.keys()])
			if (record(snapshot)[key] === undefined) this.top.delete(key);
		out.vessels = snapshot.vessels.map((v) => this.encodeVessel(v, first));
		const live = new Set(snapshot.vessels.map((v) => Number(v.id)));
		for (const id of [...this.vessels.keys()]) if (!live.has(id)) this.vessels.delete(id);
		if (same.length > 0) out.same = same;
		const parts = new Set<number>();
		for (const v of snapshot.vessels) for (const p of v.parts) parts.add(Number(p.id));
		for (const id of [...this.parts.keys()]) if (!parts.has(id)) this.parts.delete(id);
		return out as SnapshotWire;
	}

	private encodeVessel(v: VesselSnapshot, first: boolean): WireVessel {
		const id = Number(v.id);
		let cache = this.vessels.get(id);
		const fresh = !cache || first;
		if (!cache) this.vessels.set(id, (cache = new Map()));
		const out: Record<string, unknown> = {};
		const same: string[] = [];
		for (const key of Object.keys(v)) {
			const value = record(v)[key];
			if (key === 'parts') continue;
			if (FAST_VESSEL_KEYS.has(key) || value === undefined) {
				if (value !== undefined) out[key] = value;
				continue;
			}
			const json = JSON.stringify(value);
			if (!fresh && cache.get(key) === json) same.push(key);
			else {
				cache.set(key, json);
				out[key] = value;
			}
		}
		for (const key of [...cache.keys()]) if (record(v)[key] === undefined) cache.delete(key);
		if (same.length > 0) out.same = same;
		out.parts = v.parts.map((p) => {
			const pid = Number(p.id);
			const rest: Record<string, unknown> = {};
			for (const key of Object.keys(p)) if (!FAST_PART_KEYS.has(key)) rest[key] = record(p)[key];
			const json = JSON.stringify(rest);
			if (!fresh && this.parts.get(pid) === json) {
				const wire: WirePart = {
					id: p.id,
					position: p.position,
					orientation: p.orientation,
					same: true
				};
				if (p.temperature !== undefined) wire.temperature = p.temperature;
				return wire;
			}
			this.parts.set(pid, json);
			return p;
		});
		return out as unknown as WireVessel;
	}
}

/** The main thread's side: puts the left-out fields back from the last snapshot. */
export class SnapshotDecoder {
	private last: Snapshot | null = null;
	private readonly lastParts = new Map<number, PartSnapshot>();

	decode(wire: SnapshotWire): Snapshot {
		const prev = this.last;
		const out: Record<string, unknown> = { ...wire };
		delete out.same;
		if (prev) for (const key of wire.same ?? []) out[key] = record(prev)[key];
		const prevVessels = new Map<number, VesselSnapshot>();
		for (const v of prev?.vessels ?? []) prevVessels.set(Number(v.id), v);
		const nextParts = new Map<number, PartSnapshot>();
		out.vessels = wire.vessels.map((w) => {
			const before = prevVessels.get(Number(w.id));
			const v: Record<string, unknown> = { ...w };
			delete v.same;
			if (before) for (const key of w.same ?? []) v[key] = record(before)[key];
			v.parts = w.parts.map((p) => {
				if (p.same !== true) {
					nextParts.set(Number(p.id), p as PartSnapshot);
					return p;
				}
				const old = this.lastParts.get(Number(p.id));
				if (!old) throw new Error('snapshot delta: a part without a baseline');
				const part = { ...old, position: p.position, orientation: p.orientation } as PartSnapshot;
				if (p.temperature !== undefined) part.temperature = p.temperature;
				else delete part.temperature;
				nextParts.set(Number(p.id), part);
				return part;
			});
			return v as unknown as VesselSnapshot;
		});
		const snapshot = out as unknown as Snapshot;
		this.last = snapshot;
		this.lastParts.clear();
		for (const [id, p] of nextParts) this.lastParts.set(id, p);
		return snapshot;
	}
}
