/**
 * User alarms (plan 224, ADR 0223). An alarm is a sim time worked out once, when it is set: a plain
 * time, a transfer window the page found with the trip planner, or a vessel's next apsis, sphere
 * change or node less a lead. It lives in the sim, so it fires under warp and for vessels nobody
 * watches; any warp stops at it, and it leaves the list once fired.
 */
import type { AlarmKind, AlarmSnapshot, CommandResult, EntityId, SaveAlarms } from '@orbital/core';
import { cloneData } from '@orbital/core';
import { vesselOf, type SimCore } from './core.ts';
import { eventTime, NODE_MARGIN, WARP_TO_MARGIN } from './warp.ts';

/** Most alarms a world keeps. */
export const MAX_ALARMS = 64;
/** An alarm counts as due this close to its time, s (the clock lands on it in float steps). */
const DUE = 1e-6;

export const freshAlarms = (saved?: SaveAlarms): SaveAlarms =>
	saved ? cloneData(saved) : { next: 1, list: [] };

const LABEL: Record<AlarmKind, string> = {
	time: 'Alarm',
	apoapsis: 'Apoapsis',
	periapsis: 'Periapsis',
	soi: 'Sphere change',
	node: 'Maneuver node',
	transfer: 'Transfer window'
};

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

export function addAlarm(
	core: SimCore,
	command: {
		id?: string;
		name?: string;
		kind?: AlarmKind;
		time?: number;
		vessel?: EntityId;
		lead?: number;
		body?: string;
	}
): CommandResult {
	const kind = command.kind ?? 'time';
	let time: number;
	if (kind === 'time' || kind === 'transfer') {
		if (command.time === undefined) return refuse(`a ${kind} alarm needs a time`);
		time = command.time - (command.lead ?? 0);
	} else {
		if (command.vessel === undefined) return refuse(`a ${kind} alarm needs a vessel`);
		const at = eventTime(core, kind, command.vessel);
		if (typeof at === 'string') return refuse(at);
		time = at - (command.lead ?? (kind === 'node' ? NODE_MARGIN : WARP_TO_MARGIN));
	}
	if (time <= core.t) return refuse('an alarm needs a time that has not passed');
	const list = core.alarms.list;
	const at = command.id === undefined ? -1 : list.findIndex((a) => a.id === command.id);
	if (command.id !== undefined && at < 0) return refuse(`no alarm ${command.id}`);
	if (at < 0 && list.length >= MAX_ALARMS)
		return refuse(`a world keeps at most ${MAX_ALARMS} alarms`);
	const id = at >= 0 ? list[at]!.id : `alarm.${core.alarms.next++}`;
	const alarm: AlarmSnapshot = {
		id,
		name: command.name?.trim() || LABEL[kind],
		time,
		kind,
		...(command.vessel !== undefined ? { vessel: command.vessel } : {}),
		...(command.body !== undefined ? { body: command.body } : {}),
		...(kind === 'apoapsis' || kind === 'periapsis' ? { lead: command.lead ?? WARP_TO_MARGIN } : {})
	};
	if (at >= 0) list.splice(at, 1);
	list.push(alarm);
	list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
	return { ok: true, alarm: id };
}

export function removeAlarm(core: SimCore, id: string): CommandResult {
	const at = core.alarms.list.findIndex((a) => a.id === id);
	if (at < 0) return refuse(`no alarm ${id}`);
	core.alarms.list.splice(at, 1);
	return { ok: true };
}

/** The earliest alarm still to come, if any (the list is in time order). */
export const nextAlarm = (core: SimCore): AlarmSnapshot | undefined => core.alarms.list[0];

/** Fire every alarm whose time has come: any warp stops, each posts `alarm:fired` and leaves. */
export function fireAlarms(core: SimCore): void {
	const list = core.alarms.list;
	while (list.length > 0 && list[0]!.time <= core.t + DUE) {
		const alarm = list.shift()!;
		if (core.warp > 1 || core.warpTarget !== null) {
			core.warp = 1;
			core.warpTarget = null;
			core.accumulator = 0;
			core.events.emit('warp:stopped', { reason: `alarm "${alarm.name}"` });
		}
		core.events.emit('alarm:fired', {
			id: alarm.id,
			name: alarm.name,
			kind: alarm.kind,
			...(alarm.vessel !== undefined ? { vessel: alarm.vessel } : {})
		});
	}
}

/**
 * Apsis alarms follow their vessel's orbit (plan 247): while it flies (a burn changes the orbit),
 * the alarm is moved to the new next apsis less its lead. One already inside its lead keeps its time.
 */
export function followAlarms(core: SimCore): void {
	let moved = false;
	for (const alarm of core.alarms.list) {
		if ((alarm.kind !== 'apoapsis' && alarm.kind !== 'periapsis') || alarm.vessel === undefined)
			continue;
		if (!core.world.hasEntity(alarm.vessel)) continue;
		if (vesselOf(core, alarm.vessel).mode !== 'flight') continue;
		const at = eventTime(core, alarm.kind, alarm.vessel);
		if (typeof at === 'string') continue;
		const time = at - (alarm.lead ?? WARP_TO_MARGIN);
		if (time <= core.t || Math.abs(time - alarm.time) < 1e-3) continue;
		alarm.time = time;
		moved = true;
	}
	if (moved) core.alarms.list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export const alarmsSnapshot = (core: SimCore): AlarmSnapshot[] | undefined =>
	core.alarms.list.length > 0 ? core.alarms.list.map((a) => ({ ...a })) : undefined;

/** Saved once any alarm was ever set. */
export const saveAlarms = (core: SimCore): SaveAlarms | undefined =>
	core.alarms.next > 1 ? cloneData(core.alarms) : undefined;
