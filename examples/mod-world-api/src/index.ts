/**
 * The World API sample (plan 343, ADR 0292): a flight log that
 *  - reads the whole world through `ctx.world` (every vessel, its situation, the nearest one),
 *  - keeps its own state saved with the world (`defineStore`, checked by a zod schema),
 *  - reacts to sim events (`on` handlers of a system: landings, SOI changes, a key press),
 *  - sends commands the world's rules allow (`ctx.commands.setTarget`),
 *  - shows notices (`ctx.notify`) and adds a rebindable key (`defineKeybinding`),
 *  - lists the fleet by situation in a dock panel through `input.world`.
 */
import {
	definePanel,
	definePlugin,
	defineKeybinding,
	defineStore,
	defineSystem,
	VESSEL_SITUATIONS,
	z,
	type PanelInput
} from '@orbital/sdk';

/** The saved log: counts and the last few lines. */
export const FlightLog = defineStore({
	id: 'world-api.log',
	schema: z.object({
		landings: z.int().min(0),
		soiChanges: z.int().min(0),
		/** Newest last, at most `LINES`. */
		lines: z.array(z.string().max(120)).max(20)
	}),
	initial: { landings: 0, soiChanges: 0, lines: [] as string[] }
});
export type FlightLogValue = z.infer<typeof FlightLog.schema>;

const LINES = 20;
const push = (log: FlightLogValue, line: string): FlightLogValue => ({
	...log,
	lines: [...log.lines, line.slice(0, 120)].slice(-LINES)
});

/** No `command`: the page sends `mod-key`, and the system below answers it. */
export const TargetNearestKey = defineKeybinding({
	id: 'world-api.target-nearest',
	label: 'Target the nearest vessel',
	defaults: ['Alt+KeyN']
});

export const Logger = defineSystem({
	id: 'world-api.logger',
	on: {
		'vessel:situation-changed': (e, ctx) => {
			if (e.to !== 'landed' && e.to !== 'splashed') return;
			const v = ctx.world.vessel(e.vessel);
			if (!v || v.type === 'debris') return;
			const where = e.body.replace(/^.*\./, '');
			const line = `${v.name} ${e.to} on ${where}`;
			ctx.store(FlightLog).update((log) => push({ ...log, landings: log.landings + 1 }, line));
			ctx.notify(line, { tone: 'success', vessel: e.vessel });
		},
		'vessel:soi-changed': (e, ctx) => {
			const v = ctx.world.vessel(e.vessel);
			ctx
				.store(FlightLog)
				.update((log) =>
					push({ ...log, soiChanges: log.soiChanges + 1 }, `${v?.name ?? e.vessel}: ${e.from} → ${e.to}`)
				);
		},
		'mod:key': (e, ctx) => {
			if (e.key !== TargetNearestKey.id || e.vessel === undefined) return;
			const nearest = ctx.world.nearest(e.vessel, { noDebris: true, owner: 'player' });
			if (!nearest) {
				ctx.notify('No other vessel', { tone: 'warning', vessel: e.vessel });
				return;
			}
			const r = ctx.commands.setTarget(e.vessel, { kind: 'vessel', id: nearest.id });
			const km = (ctx.world.distance(e.vessel, nearest.id) ?? 0) / 1000;
			ctx.notify(r.ok ? `Target: ${nearest.name} (${km.toFixed(1)} km)` : r.reason, {
				tone: r.ok ? 'info' : 'warning',
				vessel: e.vessel
			});
		}
	}
});

const log = (input: PanelInput): FlightLogValue | undefined =>
	input.world?.store(FlightLog.id) as FlightLogValue | undefined;

export const FleetPanel = definePanel({
	id: 'world-api.fleet',
	title: 'Flight log',
	icon: 'script',
	order: 900,
	contexts: ['flight', 'map'],
	view: {
		kind: 'section',
		children: [
			{ kind: 'readout', label: 'Landings', value: (i) => log(i)?.landings ?? 0 },
			{ kind: 'readout', label: 'SOI changes', value: (i) => log(i)?.soiChanges ?? 0 },
			{
				kind: 'list',
				label: 'Fleet',
				items: (i) =>
					VESSEL_SITUATIONS.map((s) => ({
						name: s,
						value: String(i.world?.vessels({ situation: s, noDebris: true }).length ?? 0)
					})).filter((row) => row.value !== '0')
			},
			{
				kind: 'list',
				label: 'Log',
				items: (i) => [...(log(i)?.lines ?? [])].reverse().map((name) => ({ name }))
			}
		]
	}
});

export default definePlugin({
	meta: { id: 'world-api', version: '1.0.0', api: '^0.1.106' },
	depends: ['stock'],
	setup(ctx) {
		ctx.stores.register(FlightLog);
		ctx.keybindings.register(TargetNearestKey);
		ctx.systems.register(Logger);
		ctx.panels.register(FleetPanel);
	}
});
