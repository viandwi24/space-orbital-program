/**
 * Target selection and readout for the HUD (plan 035, ADR 0064). Pure and DOM-free: the flight loop
 * sends the commands, `TargetPanel.svelte` only draws what this returns.
 */
import {
	bodyId,
	entityId,
	type BodyDefinition,
	type Command,
	type EntityId,
	type PortAlignment,
	type Snapshot,
	type TargetRef,
	type VesselSnapshot
} from '@orbital/core';
import { bodyLabel } from './hud-model';

/** One entry of the target list. */
export interface TargetChoice {
	/** Stable key for a `<select>`: `body:stock.cinder`, `vessel:12`. */
	key: string;
	ref: TargetRef;
	label: string;
	/** `Moon`, `Debris`, ... for the list's second column. */
	kind: 'body' | 'vessel';
}

export const targetKey = (ref: TargetRef): string =>
	ref.kind === 'vessel' && ref.part !== undefined
		? `vessel:${String(ref.id)}:port:${String(ref.part)}`
		: `${ref.kind}:${String(ref.id)}`;

const PORT_SIZE_LABEL: Record<string, string> = { '0.625': 'small', '1.25': '', '2.5': 'large' };

/**
 * What the vessel may aim at: every body, then every other vessel by name. The sim refuses
 * nothing here except itself, so the list is every body and vessel but the vessel.
 */
export function targetChoices(
	snapshot: Snapshot,
	vessel: number,
	bodies: readonly BodyDefinition[]
): TargetChoice[] {
	const out: TargetChoice[] = bodies.map((b) => {
		const ref: TargetRef = { kind: 'body', id: bodyId(String(b.id)) };
		return { key: targetKey(ref), ref, label: bodyLabel(String(b.id)), kind: 'body' };
	});
	for (const v of snapshot.vessels) {
		if (Number(v.id) === vessel) continue;
		const ref: TargetRef = { kind: 'vessel', id: v.id };
		out.push({
			key: targetKey(ref),
			ref,
			label: v.name ?? `Vessel ${Number(v.id)}`,
			kind: 'vessel'
		});
		// its free docking ports, each a target of its own (plan 222)
		const free = (v.ports ?? []).filter((p) => p.free);
		free.forEach((p, i) => {
			const portRef: TargetRef = { kind: 'vessel', id: v.id, part: p.part };
			const size = PORT_SIZE_LABEL[String(p.size)] ?? `${p.size} m`;
			const which = free.length > 1 ? ` ${i + 1}` : '';
			out.push({
				key: targetKey(portRef),
				ref: portRef,
				label: `${v.name ?? `Vessel ${Number(v.id)}`} · ${size ? `${size} ` : ''}docking port${which}`,
				kind: 'vessel'
			});
		});
	}
	return out;
}

/** The choice after the current target; the one after the last is "no target" (null), then the first. */
export function nextTarget(
	choices: readonly TargetChoice[],
	current: TargetRef | undefined
): TargetRef | null {
	if (choices.length === 0) return null;
	if (!current) return choices[0]!.ref;
	const at = choices.findIndex((c) => c.key === targetKey(current));
	return at < 0 || at === choices.length - 1 ? null : choices[at + 1]!.ref;
}

export const targetCommand = (vessel: EntityId | number, target: TargetRef | null): Command => ({
	type: 'target-set',
	vessel: entityId(Number(vessel)),
	target
});

/** What the target card shows. */
export interface TargetHud {
	key: string;
	kind: 'body' | 'vessel';
	name: string;
	/** Distance between the centres of mass, m. */
	distance: number;
	/** Speed of the target relative to the vessel, m/s. */
	relativeSpeed: number;
	/** Rate the distance shrinks at, m/s: positive when closing, negative when opening. */
	closing: number;
	/** Closest approach of the current orbit, or null when there is none (see `TargetApproach`). */
	approach: { in: number; distance: number; relativeSpeed: number } | null;
	/** SAS is pointing at (`target`) or away from (`anti-target`) it. */
	pointing: 'target' | 'anti-target' | null;
	/** A targeted docking port's alignment (plan 222); null otherwise or out of range. */
	port: PortHud | null;
}

/** Inside these the ports capture (ADR 0218): 15°, and the faces in line (the offset is a hint). */
export const PORT_ALIGNED_ANGLE = 15;
export const PORT_ALIGNED_OFFSET = 0.5;

export interface PortHud {
	angle: number;
	offset: number;
	distance: number;
	closing: number;
	aligned: boolean;
	/** "Aligned 2.1° · offset 0.4 m · 4.8 m · closing 0.3 m/s": the indicator is text first. */
	text: string;
}

export function portHud(a: PortAlignment): PortHud {
	const aligned = a.angle <= PORT_ALIGNED_ANGLE && a.offset <= PORT_ALIGNED_OFFSET;
	const rate =
		Math.abs(a.closing) < 0.005
			? 'steady'
			: `${a.closing > 0 ? 'closing' : 'opening'} ${Math.abs(a.closing).toFixed(2)} m/s`;
	const text = [
		`${aligned ? 'Aligned' : 'Off'} ${a.angle.toFixed(1)}°`,
		`offset ${a.offset.toFixed(2)} m`,
		`${a.distance.toFixed(1)} m`,
		rate
	].join(' · ');
	return { angle: a.angle, offset: a.offset, distance: a.distance, closing: a.closing, aligned, text };
}

/** The card for `v`'s target at sim time `t`, or null without one. */
export function targetHud(v: VesselSnapshot, t: number): TargetHud | null {
	const target = v.target;
	if (!target) return null;
	const { position: p, velocity: w, distance } = target;
	// d|p|/dt = p . w / |p|; closing is minus that.
	const closing = distance > 0 ? -(p.x * w.x + p.y * w.y + p.z * w.z) / distance : 0;
	const mode = v.sas?.mode;
	return {
		key: targetKey(target),
		kind: target.kind,
		name: target.kind === 'body' ? bodyLabel(target.name) : target.name,
		distance,
		relativeSpeed: target.relativeSpeed,
		closing,
		approach: target.approach
			? {
					in: Math.max(0, target.approach.time - t),
					distance: target.approach.distance,
					relativeSpeed: target.approach.relativeSpeed
				}
			: null,
		pointing: mode === 'target' || mode === 'anti-target' ? mode : null,
		port: target.port ? portHud(target.port) : null
	};
}
