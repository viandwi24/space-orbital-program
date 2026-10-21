/**
 * Vessel lights (plan 242, ADR 0239): a lamp that is on or off, one of a few colours, dimmable, and
 * optionally blinking. It belongs to the Lights group (U in flight) and draws electric charge while
 * on, in flight and on rails; with none to draw it goes out. The renderer reads the snapshot
 * (`PartVisual.lamp`) and lights the scene within a small lamp budget.
 */
import { defineModule, z } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

/** The colours a lamp offers, by name. */
export const LIGHT_COLOURS = {
	warm: '#ffe2b0',
	white: '#ffffff',
	red: '#ff4a3a',
	amber: '#ffb000',
	green: '#47e06e',
	blue: '#5aa8ff'
} as const;
export type LightColour = keyof typeof LIGHT_COLOURS;
const COLOUR_NAMES = Object.keys(LIGHT_COLOURS) as [LightColour, ...LightColour[]];

/**
 * The colour's name from a state (a name) or from the snapshot view a live vessel's panel reads (a
 * hex, for the renderer). Owner, 2026-10-21: the panel of a flying vessel with a lamp threw "a mode
 * needs options and a value that is one of them".
 */
export const colourName = (colour: string): LightColour =>
	(COLOUR_NAMES as readonly string[]).includes(colour)
		? (colour as LightColour)
		: (COLOUR_NAMES.find((n) => LIGHT_COLOURS[n] === colour) ?? 'warm');

export const lightConfigSchema = z.object({
	/** Electric charge per second at full brightness. */
	drain: z.number().nonnegative().default(0.04),
	/** On at launch (the Hangar sets it in the part's build controls). */
	on: z.boolean().default(false),
	colour: z.enum(COLOUR_NAMES).default('warm'),
	/** 0..1 of the lamp's full output; the drain scales with it. */
	brightness: z.number().min(0).max(1).default(1),
	/** Blinks once a second while on. */
	blink: z.boolean().default(false)
});
export type LightConfig = z.output<typeof lightConfigSchema>;

export interface LightState {
	on: boolean;
	colour: LightColour;
	brightness: number;
	blink: boolean;
}

/** Charge per second the lamp draws now. */
export const lightDraw = (config: LightConfig, state: LightState): number =>
	state.on ? config.drain * state.brightness : 0;

type LightContext = {
	config: LightConfig;
	state: LightState;
	vessel: { resources: { withdraw(resource: string, amount: number): number } };
};

/** Draws the charge for `dt` seconds; a lamp that gets less than half of it goes out. */
function burn(ctx: LightContext, dt: number): void {
	const need = lightDraw(ctx.config, ctx.state) * dt;
	if (dt <= 0 || need <= 0) return;
	const got = ctx.vessel.resources.withdraw(ElectricCharge.id, need);
	if (got < need * 0.5) ctx.state.on = false;
}

export const ModuleLight = defineModule({
	id: 'stock.light',
	config: lightConfigSchema,
	state: (config): LightState => ({
		on: config.on,
		colour: config.colour,
		brightness: config.brightness,
		blink: config.blink
	}),
	describe: (config, state) => ({
		category: 'stock.other',
		readouts: [
			{
				id: 'draw',
				label: 'Draw',
				value: state.on ? `${lightDraw(config, state).toFixed(3)} EC/s` : 'Off'
			}
		],
		actions: [
			{
				id: 'setOn',
				label: 'Light',
				kind: 'toggle',
				value: state.on,
				enabled: true,
				group: 'stock.lights',
				icon: 'light',
				build: 'on'
			},
			{
				id: 'setColour',
				label: 'Colour',
				kind: 'mode',
				value: colourName(state.colour),
				options: COLOUR_NAMES.map((value) => ({
					value,
					label: value[0]!.toUpperCase() + value.slice(1)
				})),
				enabled: true,
				icon: 'light',
				build: 'colour'
			},
			{
				id: 'setBrightness',
				label: 'Brightness',
				kind: 'value',
				value: state.brightness,
				min: 0,
				max: 1,
				step: 0.05,
				enabled: true,
				icon: 'light',
				more: true,
				build: 'brightness'
			},
			{
				id: 'setBlink',
				label: 'Blink',
				kind: 'toggle',
				value: state.blink,
				enabled: true,
				icon: 'light',
				more: true,
				build: 'blink'
			}
		]
	}),
	// the budget counts a lamp that starts on
	power: (config) => ({ rate: config.on ? -config.drain * config.brightness : 0 }),
	update: burn,
	background: burn,
	actions: {
		/** `(on)`: the lights group's toggle (plan 110). */
		setOn: (ctx, ...args) => {
			const [on] = z.tuple([z.boolean()]).parse(args);
			ctx.state.on = on;
		},
		/** `(name)`: one of `LIGHT_COLOURS`. */
		setColour: (ctx, ...args) => {
			const [colour] = z.tuple([z.enum(COLOUR_NAMES)]).parse(args);
			ctx.state.colour = colour;
		},
		/** `(0..1)` */
		setBrightness: (ctx, ...args) => {
			const [b] = z.tuple([z.number().min(0).max(1)]).parse(args);
			ctx.state.brightness = b;
		},
		/** `(blink)` */
		setBlink: (ctx, ...args) => {
			const [blink] = z.tuple([z.boolean()]).parse(args);
			ctx.state.blink = blink;
		}
	},
	snapshot: (state) => ({
		on: state.on,
		colour: LIGHT_COLOURS[state.colour],
		brightness: state.brightness,
		blink: state.blink
	})
});
