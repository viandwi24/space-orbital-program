/**
 * The debug panel's pure parts (plan 203, ADR 0200): the Log tab's filter, copy and file name, and
 * the Set orbit tab's apsides and presets. No Svelte, no DOM.
 */
import type { BodyDefinition, BodyId, DebugOrbit } from '@orbital/core';
import { LOG_LEVELS, type LogEntry, type LogLevel } from '../log-buffer';
import type { SimEventMessage } from '../sim-client';

export const DEBUG_TABS = [
	'cheats',
	'orbit',
	'location',
	'resources',
	'log',
	'overlay',
	'info'
] as const;
export type DebugTab = (typeof DEBUG_TABS)[number];

export const TAB_LABELS: Record<DebugTab, string> = {
	cheats: 'Cheats',
	orbit: 'Set orbit',
	location: 'Set location',
	resources: 'Resources',
	log: 'Log',
	overlay: 'Overlay',
	info: 'Info'
};

// ---- Log ---------------------------------------------------------------------------------------

export interface LogFilter {
	/** The levels shown; every level when empty. */
	levels: readonly LogLevel[];
	/** Case-insensitive text in the source or the message. */
	text?: string;
}

export function filterLog(entries: readonly LogEntry[], filter: LogFilter): LogEntry[] {
	const text = filter.text?.trim().toLowerCase() ?? '';
	return entries.filter(
		(e) =>
			(filter.levels.length === 0 || filter.levels.includes(e.level)) &&
			(text === '' || `${e.source} ${e.message}`.toLowerCase().includes(text))
	);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `14:03:07.215 WARN  command  warp refused: ...`, in UTC so a pasted log reads the same anywhere. */
export function formatLogLine(e: LogEntry): string {
	const d = new Date(e.time);
	const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
	return `${clock} ${e.level.toUpperCase().padEnd(5)} ${e.source.padEnd(8)} ${e.message}`;
}

/** What Copy puts on the clipboard: the visible lines, oldest first. */
export const logText = (visible: readonly LogEntry[]): string =>
	visible.map(formatLogLine).join('\n');

/** `orbital-log-<world>-2026-10-19.txt` (UTC date). */
export function logFileName(world: string, date: Date): string {
	const slug =
		world
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'world';
	const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
	return `orbital-log-${slug}-${day}.txt`;
}

export const ALL_LEVELS: readonly LogLevel[] = LOG_LEVELS;

// ---- Set orbit ---------------------------------------------------------------------------------

/** Semi-major axis and eccentricity from apoapsis and periapsis altitudes above a body of `radius`, m. */
export function fromApsides(radius: number, apoapsis: number, periapsis: number) {
	const ra = radius + Math.max(apoapsis, periapsis);
	const rp = radius + Math.min(apoapsis, periapsis);
	return { a: (ra + rp) / 2, e: (ra - rp) / (ra + rp) };
}

/** A safe low circular altitude: 10 km above the atmosphere, or 5 % of the radius (at least 10 km). */
export function lowAltitude(body: BodyDefinition): number {
	if (body.atmosphere) return body.atmosphere.height + 10_000;
	return Math.max(10_000, Math.round(body.radius * 0.05));
}

const circular = (body: BodyDefinition, altitude: number): DebugOrbit => ({
	body: body.id as BodyId,
	a: body.radius + altitude,
	e: 0,
	i: 0,
	raan: 0,
	argp: 0,
	m0: 0
});

export interface OrbitPreset {
	id: string;
	label: string;
	orbit: DebugOrbit;
}

/**
 * "Low orbit" around `home`, "Moon orbit" around each of its moons, and "Transfer to <moon>": the
 * ellipse from low orbit out to the moon's distance, at periapsis now.
 */
export function orbitPresets(bodies: readonly BodyDefinition[], home: string): OrbitPreset[] {
	const base = bodies.find((b) => b.id === home);
	if (!base) return [];
	const moons = bodies
		.filter((b) => b.parent === home && b.orbit !== undefined)
		.sort((a, b) => a.id.localeCompare(b.id));
	const out: OrbitPreset[] = [
		{ id: 'low', label: 'Low orbit', orbit: circular(base, lowAltitude(base)) }
	];
	for (const moon of moons) {
		out.push({
			id: `moon:${moon.id}`,
			label: `${title(moon)} orbit`,
			orbit: circular(moon, lowAltitude(moon))
		});
	}
	for (const moon of moons) {
		const rp = base.radius + lowAltitude(base);
		const ra = moon.orbit!.a;
		out.push({
			id: `transfer:${moon.id}`,
			label: `Transfer to ${title(moon)}`,
			orbit: { ...circular(base, 0), a: (ra + rp) / 2, e: (ra - rp) / (ra + rp) }
		});
	}
	return out;
}

/** `stock.cinder` -> `Cinder`. */
export const title = (body: { id: string }): string => {
	const name = body.id.slice(body.id.indexOf('.') + 1).replace(/-/g, ' ');
	return name.charAt(0).toUpperCase() + name.slice(1);
};

export const DEG = Math.PI / 180;

// ---- sim events in the log -------------------------------------------------------------------

/** A sim event as a log line: damage and losses are warnings, with their cause (ADR 0200 point 6). */
export function simEventLine(event: SimEventMessage): { level: LogLevel; message: string } {
	switch (event.type) {
		case 'part-damaged':
			return {
				level: 'warn',
				message: `${event.definition} on vessel ${event.vessel} ${event.outcome === 'destroyed' ? 'exploded' : 'broke off'}: ${event.cause ?? 'impact'} at ${event.speed.toFixed(1)} m/s${event.temperature === undefined ? '' : `, ${Math.round(event.temperature)} K`}`
			};
		case 'vessel-destroyed':
			return { level: 'warn', message: `vessel ${event.vessel} lost: ${event.reason}` };
		case 'flameout':
			return { level: 'warn', message: `flameout on part ${event.part}` };
		case 'part-failed':
			return { level: 'warn', message: `part ${event.part} failed: ${event.label}` };
		case 'mode-changed':
			return {
				level: 'info',
				message: `vessel ${event.vessel} ${event.mode === 'flight' ? 'in flight' : 'on rails'} (${event.reason})`
			};
		case 'soi-changed':
			return {
				level: 'info',
				message: `vessel ${event.vessel} left ${event.from} for ${event.to}`
			};
		case 'maneuver-complete':
			return { level: 'info', message: `node ${event.node} of vessel ${event.vessel} burned` };
		case 'milestone':
			return { level: 'info', message: `first: ${event.id}` };
		case 'warp-stopped':
			return { level: 'info', message: `warp stopped: ${event.reason}` };
		case 'building-ready':
			return { level: 'info', message: `construction done: ${event.kind} level ${event.level}` };
		case 'power-depleted':
			return { level: 'warn', message: `vessel ${event.vessel} out of power` };
		case 'docked':
			return {
				level: 'info',
				message: `vessel ${event.absorbed} docked with vessel ${event.vessel}`
			};
		case 'undocked':
			return {
				level: 'info',
				message: `vessel ${event.vessel} undocked ${event.name} (vessel ${event.restored})`
			};
		case 'parachute-deployed':
			return { level: 'info', message: `parachute on part ${event.part}: ${event.stage}` };
		case 'parachute-torn':
			return {
				level: 'warn',
				message: `parachute on part ${event.part} torn at ${event.speed.toFixed(1)} m/s`
			};
	}
}
