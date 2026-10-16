/** Text for the save list: one line per save, how long ago, the slot label. */
import { formatDistance, formatDuration } from '../format';
import type { SaveKind, SaveSummary } from './game-save';

export const KIND_LABEL: Record<SaveKind, string> = {
	quick: 'Quicksave',
	auto: 'Autosave',
	manual: 'Saved'
};

/** "Two-stage · flying at 12.4 km · T+02:30", or "on rails" without an altitude. */
export function summaryLine(s: SaveSummary): string {
	const where =
		s.mode === 'flight'
			? s.altitude === null
				? 'flying'
				: `flying at ${formatDistance(s.altitude)}`
			: 'on rails';
	const extra = s.vessels > 1 ? ` · ${s.vessels} vessels` : '';
	const warp = s.warp > 1 ? ` · ${s.warp}x` : '';
	return `${s.vessel} · ${where}${extra}${warp} · T+${formatDuration(s.simTime)}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function ago(createdAt: number, now: number): string {
	const s = Math.max(0, Math.round((now - createdAt) / 1000));
	if (s < 45) return 'just now';
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
	if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
	if (s < 7 * 86_400) {
		const d = Math.round(s / 86_400);
		return `${d} ${d === 1 ? 'day' : 'days'} ago`;
	}
	return new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
