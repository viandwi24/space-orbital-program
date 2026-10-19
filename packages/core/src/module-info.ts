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
 * Air temperature over altitude of the US Standard Atmosphere 1976 (plan 212, ADR 0204 point 1),
 * `[m, K]`: the layer bases to 86 km, then the start of the thermosphere's rise. A body's
 * `atmosphere.temperatureCurve` may use it as is or scaled.
 */
export const STANDARD_ATMOSPHERE_TEMPERATURE: ReadonlyArray<readonly [number, number]> = [
	[0, 288.15],
	[11_000, 216.65],
	[20_000, 216.65],
	[32_000, 228.65],
	[47_000, 270.65],
	[51_000, 270.65],
	[71_000, 214.65],
	[86_000, 186.87],
	[100_000, 195.08]
];

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

// --- per-part settings (plan 219, ADR 0224; plan 218, ADR 0225) -------------------------------------

/**
 * A module's raw config on one part: the part definition's config with the design part's `settings`
 * for that module laid over it, field by field (what the sim spawns and the Hangar shows).
 */
export function withSettings(base: unknown, own: Record<string, unknown> | undefined): unknown {
	if (!own) return base;
	if (base === undefined) return own;
	if (typeof base !== 'object' || base === null) return base;
	return { ...(base as Record<string, unknown>), ...own };
}

/**
 * The settings of one module after a Hangar control sets `value` at `path` (a descriptor's `build`):
 * the top field of the path is written whole, copied from the current config with the value placed
 * deep inside, so a nested field (a tank's `contents.<resource>.amount`) keeps its siblings.
 */
export function settingsWith(
	base: unknown,
	own: Record<string, unknown> | undefined,
	path: string | readonly string[],
	value: unknown
): Record<string, unknown> {
	const keys = typeof path === 'string' ? [path] : path;
	if (keys.length === 0) throw new Error('settingsWith: empty path');
	const current = withSettings(base, own);
	const put = (into: unknown, at: readonly string[]): unknown => {
		if (at.length === 0) return value;
		const obj =
			typeof into === 'object' && into !== null && !Array.isArray(into)
				? (into as Record<string, unknown>)
				: {};
		return { ...obj, [at[0]!]: put(obj[at[0]!], at.slice(1)) };
	};
	const top = keys[0]!;
	const field = (current as Record<string, unknown> | undefined)?.[top];
	return { ...(own ?? {}), [top]: put(field, keys.slice(1)) };
}
