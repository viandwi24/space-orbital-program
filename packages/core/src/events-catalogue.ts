/**
 * The events reference (plan 343, ADR 0292 point 5): every event the sim and the stock mod emit,
 * grouped, with one line each. The payload types are `EventMap`'s; this list is what the guide and
 * tools show. A test fails when an event of `EventMap` has no entry here.
 */

export type SimEventGroup =
	'vessel' | 'flight' | 'program' | 'world' | 'career' | 'crew' | 'science' | 'comms' | 'mod';

export interface SimEventInfo {
	/** The `EventMap` key. */
	name: string;
	group: SimEventGroup;
	description: string;
	/** The plugin that emits it, when it is not the sim (`stock`). */
	by?: string;
}

const e = (group: SimEventGroup, name: string, description: string, by?: string): SimEventInfo =>
	by ? { name, group, description, by } : { name, group, description };

export const SIM_EVENTS: readonly SimEventInfo[] = [
	e('world', 'world:entity-added', 'An ECS entity was created (a vessel or a part).'),
	e('world', 'world:entity-removed', 'An ECS entity was removed.'),
	e('world', 'world:tick', 'A game day began; after the world-tick systems ran.'),
	e('world', 'world:rule-changed', 'A world rule changed by `set-rule`.'),
	e('world', 'warp:limited', 'An n-body world or a slow machine held the warp lower.'),
	e(
		'world',
		'warp:stopped',
		'The sim ended a warp by itself (SOI change, warp-to arrived, a vessel woke).'
	),
	e('world', 'warp:clamped', 'A warp was granted lower than asked.'),
	e('world', 'alarm:fired', 'A user alarm reached its time.'),
	e('world', 'building:ready', 'Construction or an upgrade finished.'),
	e('world', 'site:founded', 'A launch site was founded.'),
	e('world', 'site:joined', 'A vessel joined a site as an outpost.'),
	e('world', 'site:left', 'A vessel left a site.'),
	e('world', 'site:refuelled', 'A member vessel took propellant from its site storage.'),
	e('world', 'route:delivered', 'A supply route ran on its window.'),
	e(
		'vessel',
		'vessel:created',
		'A vessel was loaded (launch, spawn) or split off another (`from`).'
	),
	e('vessel', 'vessel:split', 'A vessel split: the design indices each side kept.'),
	e(
		'vessel',
		'vessel:destroyed',
		'A vessel is gone: crashed, burnt up, terminated, recovered (`reason`).'
	),
	e('vessel', 'vessel:docked', 'Two vessels docked; `absorbed` is now part of `vessel`.'),
	e('vessel', 'vessel:undocked', 'An undock split a vessel; `restored` has its old name.'),
	e('vessel', 'vessel:mode-changed', 'A vessel went to physics (`flight`) or onto rails.'),
	e('vessel', 'vessel:soi-changed', 'A vessel crossed a sphere-of-influence boundary.'),
	e(
		'vessel',
		'vessel:situation-changed',
		'Landed, splashed, flying, sub-orbital, orbiting or escaping changed.'
	),
	e('vessel', 'vessel:maneuver-complete', 'A maneuver node was burned off.'),
	e('vessel', 'vessel:target-lost', "A vessel's target no longer exists."),
	e('vessel', 'vessel:power-depleted', 'Every control source ran out of power.'),
	e('vessel', 'vessel:frozen', 'A vessel in an atmosphere is held still during rails warp.'),
	e('vessel', 'vessel:thawed', 'A frozen vessel moves again.'),
	e('flight', 'stage:activated', 'A stage fired (any source: player, script, autopilot, mod).'),
	e(
		'flight',
		'stage:blocked',
		'A part of a firing stage could not act: a separator inside a closed bay (plan 390).'
	),
	e('flight', 'part:damaged', 'A part broke off or was destroyed by an impact or by heat.'),
	e('flight', 'part:failed', 'A module failed at a reliability trial.'),
	e('flight', 'stock:engine-flameout', 'An engine ran out of propellant.', 'stock'),
	e('flight', 'stock:parachute-deployed', 'A parachute opened (semi or full).', 'stock'),
	e('flight', 'stock:parachute-torn', 'A parachute tore off.', 'stock'),
	e('flight', 'range:violation', 'A drop or an ascent azimuth broke the range.'),
	e('flight', 'tether:attached', 'A tether reached a socket on another vessel and holds it.'),
	e('flight', 'tether:released', 'A tether was let go.'),
	e('flight', 'tether:snapped', 'A tether broke under a pull above its strength.'),
	e('program', 'autopilot:ended', "A vessel's autopilot ended: done, aborted or disengaged."),
	e('program', 'program:override', 'The player took control channels from a program.'),
	e('program', 'program:resumed', 'The player let go: the program flies again.'),
	e('program', 'program:stopped', "`program-stop` ended the vessel's programs."),
	e('program', 'script:attached', 'A player script was attached or resumed.'),
	e('program', 'script:detached', 'A player script ended.'),
	e('career', 'objective:completed', 'A started contract or mission finished its objectives.'),
	e('career', 'objective:failed', 'A started contract or mission failed.'),
	e('career', 'milestone:reached', 'A world first (orbit, landing, flyby, ...).'),
	e('career', 'economy:entry', 'A ledger entry was written (funds, science, reputation).'),
	e('career', 'discovery:reviewed', 'A discovery claim was judged.'),
	e('crew', 'crew:hired', 'A crew member was hired.'),
	e('crew', 'crew:dismissed', 'A crew member was dismissed.'),
	e('crew', 'crew:xp', 'XP was booked at a recovery.'),
	e('crew', 'crew:lost', 'A crew member was lost with a vessel (or went missing).'),
	e('crew', 'crew:returned', 'A missing crew member is back.'),
	e('crew', 'crew:shortage', 'A consumable ran out for a crew member.'),
	e('crew', 'crew:resupplied', 'A shortage ended.'),
	e('crew', 'crew:g-loc', 'A crew member blacked out under g.'),
	e('science', 'science:result', 'An experiment made a result.'),
	e('science', 'science:credited', 'Science was credited (transmitted or recovered).'),
	e('science', 'data:stored', 'A data item was stored aboard.'),
	e('science', 'data:dropped', 'A data item was lost: no storage had room.'),
	e('comms', 'comms:link-up', 'A vessel got a link.'),
	e('comms', 'comms:link-down', 'A vessel lost its link.'),
	e('comms', 'comms:control-changed', "A vessel's control level changed (full, partial, none)."),
	e('comms', 'comms:data-delivered', 'A data item reached a station or a crewed vessel.'),
	e('mod', 'mod:notice', 'A mod asked for a toast (`ctx.notify`).'),
	e('mod', 'mod:focus', 'A mod asked the page to fly a vessel (`ctx.commands.focus`).'),
	e('mod', 'mod:key', 'The player pressed a mod keybinding without a command.')
];
