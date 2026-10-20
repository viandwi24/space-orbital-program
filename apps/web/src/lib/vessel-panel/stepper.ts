/** − and + on a narrow panel (plan 250, rancangan §7.1): one step of a value control, kept in range. */
export interface Steppable {
	value?: boolean | number | string;
	min?: number;
	max?: number;
	step?: number;
}

/** The value one step down (`-1`) or up (`1`); the control's step, else a twentieth of its range. */
export function stepped(c: Steppable, direction: -1 | 1): number {
	const value = Number(c.value);
	const min = c.min ?? 0;
	const max = c.max ?? 1;
	const step = c.step && c.step > 0 ? c.step : (max - min) / 20;
	const next = value + direction * step;
	// land on the control's grid, without float dust
	const snapped = c.step && c.step > 0 ? min + Math.round((next - min) / step) * step : next;
	return Math.min(max, Math.max(min, Number(snapped.toPrecision(12))));
}
