/**
 * Whether a `part-damaged` event is the active vessel's hard landing (plan 257): the touchdown toast
 * and cue belong to the vessel the player flies, not to a booster or debris landing far away.
 */
export function isOwnTouchdown(
	event: { type: string; cause?: string; vessel?: number | null },
	active: number | null
): boolean {
	return (
		event.type === 'part-damaged' &&
		event.cause !== 'overheat' &&
		active !== null &&
		event.vessel === active
	);
}
