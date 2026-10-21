/**
 * Line icons for milestones and achievements (plan 317, V3_CHANGES §3; 24 x 24 stroked paths from
 * `WorldsV3.dc.html`, plus the kinds the design does not draw).
 */
import type { MilestoneKind } from '@orbital/core';

const ROCKET =
	'M12 2 C15 5 16 9 16 13 L18 17 H6 L8 13 C8 9 9 5 12 2 Z M10 17 L9.5 21 M14 17 L14.5 21';
const CREW = 'M12 3 A8 8 0 1 1 11.99 3 Z M7 10 H17 V12 Q12 15.5 7 12 Z M7 20 H17';
const ORBIT = 'M12 9.5 A2.5 2.5 0 1 1 11.99 9.5 Z M3 12 A9 4.5 0 1 0 21 12 A9 4.5 0 1 0 3 12 Z';

export const MILESTONE_ICONS: Record<MilestoneKind, string> = {
	launch: ROCKET,
	orbit: ORBIT,
	flyby: 'M8 12 A5 5 0 1 1 7.99 12 Z M18 6 A2.5 2.5 0 1 1 17.99 6 Z M12 9 L15.5 7',
	landing: 'M6 21 V3 M6 4 H17 L14.5 8 L17 12 H6',
	return: 'M3 11 Q12 1 21 11 Z M3 11 L12 21 L21 11 M12 11 V21',
	eva: CREW,
	dock: 'M4 12 H10 M14 12 H20 M10 8 V16 M14 8 V16',
	undock: 'M3 12 H8 M16 12 H21 M8 8 V16 M16 8 V16'
};

/** A crewed first shows the crew icon (the design's "First crewed launch"). */
export const milestoneIcon = (kind: MilestoneKind, crewed: boolean): string =>
	crewed && (kind === 'launch' || kind === 'orbit') ? CREW : MILESTONE_ICONS[kind];

/** The "?" of a hidden achievement. */
export const HIDDEN_ICON = 'M9 9 A3 3 0 1 1 13 11.8 C12.3 12.2 12 12.8 12 13.5 V14 M12 17.5 V18';
