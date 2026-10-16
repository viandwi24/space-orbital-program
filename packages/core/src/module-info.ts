/**
 * Reading module descriptors (ADR 0033): `describeModule` for tools, and the pure curve helper
 * they share. Environment-neutral.
 */
import * as z from 'zod';
import type { EngineInfo, ModuleDefinition, ModuleInfo } from './definitions.ts';
import { parseModuleConfig } from './plugin.ts';
import { moduleInfoSchema } from './schemas.ts';

/** Standard gravity, m/s²: converts Isp (s) to exhaust speed, thrust / (massFlow · G0). */
export const STANDARD_GRAVITY = 9.80665;

/** Surface pressure of the reference (home) atmosphere, Pa: where tools evaluate "sea level". */
export const SEA_LEVEL_PRESSURE = 101_325;

/**
 * Thrust of an engine at full throttle in ambient `pressure` (Pa): the piecewise-linear curve of
 * its descriptor, clamped to the first and last point.
 */
export function thrustAtPressure(curve: EngineInfo['thrust'], pressure: number): number {
	const first = curve[0];
	if (!first) return 0;
	if (!(pressure > first.pressure)) return first.thrust;
	for (let i = 1; i < curve.length; i++) {
		const a = curve[i - 1]!;
		const b = curve[i]!;
		if (pressure <= b.pressure) {
			return (
				a.thrust + ((b.thrust - a.thrust) * (pressure - a.pressure)) / (b.pressure - a.pressure)
			);
		}
	}
	return curve[curve.length - 1]!.thrust;
}

/**
 * The descriptor of `module` for a part configured with `rawConfig`, or `undefined` when the
 * module has no `describe`. `view` is the module's snapshot view on a live vessel; without it the
 * state is a fresh `state(config)`. Throws an `Error` naming the module when the config or the
 * descriptor is invalid.
 */
export function describeModule(
	module: ModuleDefinition,
	rawConfig: unknown,
	view?: unknown
): ModuleInfo | undefined {
	if (!module.describe) return undefined;
	const parsed = parseModuleConfig(module, rawConfig ?? (module.config ? {} : undefined));
	if (!parsed.ok) throw new Error(`describe "${module.id}": ${parsed.message}`);
	const state = view ?? module.state?.(parsed.value as never);
	const info = moduleInfoSchema.safeParse(module.describe(parsed.value as never, state as never));
	if (!info.success) {
		throw new Error(
			`module "${module.id}" returned an invalid descriptor: ${z.prettifyError(info.error)}`
		);
	}
	return info.data;
}
