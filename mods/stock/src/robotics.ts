/**
 * Robotic parts (plan 306, ADR 0269): one module, `stock.robotic`, for a hinge (turns about the
 * part's X), a rotation servo (about Y, to an angle), a rotor (about Y, without end) and a piston
 * (slides along Y). The sim re-poses the parts on the `node` side inside the vessel's one body.
 * Moving draws electric charge; a locked joint holds.
 */
import { defineModule, z } from '@orbital/sdk';
import { ElectricCharge } from './resources.ts';

const DEG = Math.PI / 180;

export const ROBOTIC_KINDS = ['hinge', 'servo', 'rotor', 'piston'] as const;
export type RoboticKind = (typeof ROBOTIC_KINDS)[number];

export const roboticConfigSchema = z.object({
	kind: z.enum(ROBOTIC_KINDS),
	/** The attach node of the moving side. */
	node: z.string().min(1).default('top'),
	/** The joint's pivot in the part frame, m. */
	pivot: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
	/** Travel: degrees (hinge, servo) or metres of extension (piston). A rotor has none. */
	min: z.number().default(-90),
	max: z.number().default(90),
	/** Degrees or metres per second; a rotor's top speed in rpm. */
	speed: z.number().positive().default(30),
	/** Electric charge while moving at full speed, EC/s. */
	power: z.number().nonnegative().default(0.5)
});
export type RoboticConfig = z.output<typeof roboticConfigSchema>;

export interface RoboticState {
	/** Degrees (hinge, servo, rotor) or metres (piston) from the built pose. */
	value: number;
	/** Where a hinge, servo or piston is going. */
	target: number;
	/** The pose the sim applied last (ADR 0269 point 2). */
	applied: number;
	locked: boolean;
	/** A rotor turns while on; `reverse` turns it the other way. */
	running: boolean;
	reverse: boolean;
	/** The last step had no charge to move. */
	starved: boolean;
}

const UNIT = (kind: RoboticKind): string => (kind === 'piston' ? 'm' : '°');

export const ModuleRobotic = defineModule({
	id: 'stock.robotic',
	config: roboticConfigSchema,
	state: (): RoboticState => ({
		value: 0,
		target: 0,
		applied: 0,
		locked: false,
		running: false,
		reverse: false,
		starved: false
	}),
	describe: (config, state) => ({
		category: 'stock.robotics',
		actions:
			config.kind === 'rotor'
				? [
						{
							id: 'setRunning',
							label: 'Rotor',
							kind: 'toggle',
							value: state.running,
							enabled: !state.locked,
							group: 'stock.robotics',
							icon: 'wheel'
						},
						{
							id: 'setReverse',
							label: 'Reverse',
							kind: 'toggle',
							value: state.reverse,
							enabled: true,
							icon: 'wheel'
						},
						{
							id: 'setLocked',
							label: 'Lock',
							kind: 'toggle',
							value: state.locked,
							enabled: true,
							icon: 'wheel'
						}
					]
				: [
						{
							id: 'setTarget',
							label: config.kind === 'piston' ? 'Extension' : 'Angle',
							kind: 'value',
							value: state.target,
							min: config.min,
							max: config.max,
							step: config.kind === 'piston' ? 0.05 : 5,
							unit: UNIT(config.kind),
							enabled: !state.locked,
							icon: 'wheel'
						},
						{
							id: 'toggle',
							label: config.kind === 'piston' ? 'Extend / retract' : 'Swing',
							kind: 'trigger',
							enabled: !state.locked,
							group: 'stock.robotics',
							icon: 'wheel'
						},
						{
							id: 'setLocked',
							label: 'Lock',
							kind: 'toggle',
							value: state.locked,
							enabled: true,
							icon: 'wheel'
						}
					]
	}),
	joint: (config, state) => ({
		kind: config.kind === 'piston' ? 'translate' : 'rotate',
		axis: config.kind === 'hinge' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 },
		pivot: { x: config.pivot[0], y: config.pivot[1], z: config.pivot[2] },
		node: config.node,
		value: config.kind === 'piston' ? state.value : state.value * DEG
	}),
	update: (ctx, dt) => {
		const { config, state } = ctx;
		state.starved = false;
		if (state.locked || dt <= 0) return;
		const rotor = config.kind === 'rotor';
		const gap = rotor ? 0 : state.target - state.value;
		if (rotor ? !state.running : Math.abs(gap) < 1e-9) return;
		const step = (rotor ? config.speed * 6 : config.speed) * dt;
		const want = rotor ? 1 : Math.min(1, Math.abs(gap) / step);
		const need = config.power * dt * want;
		const got = need > 0 ? ctx.vessel.resources.withdraw(ElectricCharge.id, need) : 0;
		const share = need > 0 ? got / need : 1;
		if (share < 1e-6) {
			state.starved = true;
			return;
		}
		if (rotor) {
			// wrapped to a turn: the sim turns by the difference, a whole turn is no turn
			const v = state.value + (state.reverse ? -1 : 1) * step * share;
			state.value = ((v % 360) + 360) % 360;
		} else {
			state.value += Math.sign(gap) * Math.min(Math.abs(gap), step * share);
		}
	},
	actions: {
		setTarget: (ctx, ...args) => {
			const [target] = z.tuple([z.number()]).parse(args);
			ctx.state.target = Math.min(ctx.config.max, Math.max(ctx.config.min, target));
		},
		/** Swing to the far end of the travel, or back to the near one (an action group's press). */
		toggle: (ctx) => {
			const { min, max } = ctx.config;
			const mid = (min + max) / 2;
			ctx.state.target = ctx.state.target > mid ? (min < 0 && max > 0 ? 0 : min) : max;
		},
		setRunning: (ctx, ...args) => {
			const [running] = z.tuple([z.boolean()]).parse(args);
			ctx.state.running = running;
		},
		setReverse: (ctx, ...args) => {
			const [reverse] = z.tuple([z.boolean()]).parse(args);
			ctx.state.reverse = reverse;
		},
		setLocked: (ctx, ...args) => {
			const [locked] = z.tuple([z.boolean()]).parse(args);
			ctx.state.locked = locked;
		}
	},
	snapshot: (state) => ({
		value: state.value,
		target: state.target,
		locked: state.locked,
		running: state.running,
		starved: state.starved,
		/** The applied pose for the model's moving half: rad or m. */
		pose: state.applied
	})
});
