/**
 * The Space Center tour (plan 377, ADR 0314): a short opt-in stepper on a world's first Space
 * Center visit. Each step waits for the real action (the camera, Build, placing the tour's tracking
 * dish, its construction, the Buildings strip, a visit, an upgrade, a demolish), or for Next on an
 * information step. Pure: the world layout feeds observations, the page draws the card.
 */

/** The building the tour has the player put up: a cheap, quick ground station. */
export const TOUR_BUILDING = 'stock.tracking-dish';

/** The pages a visit counts on: a building's own page, opened from its panel. */
const VISITS = new Set([
	'vab',
	'mission-center',
	'astronauts',
	'administration',
	'rnd',
	'test-stand'
]);

/** The tour's own building in the site, as the snapshot has it. */
export interface TourBuilding {
	id: string;
	state: 'active' | 'planned' | 'building' | 'upgrading';
	level: number;
}

/** What the tour reads: the page, the Space Center's overlay and the tour's building. */
export interface ScTourObservation {
	/** The in-world page: `space-center`, `vab`, … */
	place: string;
	/** Funds and construction time are on (Career). */
	economy: boolean;
	/** The camera was dragged round, and zoomed, on the Space Center. */
	orbited: boolean;
	zoomed: boolean;
	/** The Build strip is open, and its tool. */
	buildOpen: boolean;
	tool: 'place' | 'demolish';
	/** The kind being placed (the ghost follows the pointer), or null. */
	placing: string | null;
	/** The building selected in Focus, or null. */
	selected: string | null;
	/** The Buildings strip is open. */
	listOpen: boolean;
	/** A demolish confirm is open. */
	confirm: boolean;
	/** The tour's building, once placed; null before and after. */
	building: TourBuilding | null;
	/** The tour's building was placed and is gone now. */
	removed: boolean;
	/** Time warp now. */
	warp: number;
	/** The Found a branch picker is open. */
	branchOpen: boolean;
	/** Branch sites the world has. */
	branches: number;
}

export const QUIET_TOUR: ScTourObservation = {
	place: 'space-center',
	economy: false,
	orbited: false,
	zoomed: false,
	buildOpen: false,
	tool: 'place',
	placing: null,
	selected: null,
	listOpen: false,
	confirm: false,
	building: null,
	removed: false,
	warp: 1,
	branchOpen: false,
	branches: 0
};

export interface ScTourStep {
	id: string;
	title: string;
	/** The step's words; Career and Sandbox differ where money and time do. */
	text(o: ScTourObservation): string;
	/** The test id the highlight ring goes round, from what is open now. */
	point(o: ScTourObservation): string | null;
	/** The real action that completes it; absent: an information step, done on Next. */
	done?(o: ScTourObservation): boolean;
	/** An optional action: it completes the step, and Next skips it. */
	optional?: true;
}

export const SC_TOUR_STEPS: readonly ScTourStep[] = [
	{
		id: 'camera',
		title: 'Look around',
		text: () =>
			'This is your Space Center. Drag on the ground to turn the view and scroll to zoom; right-drag (or Shift-drag) moves it. Try both.',
		point: () => null,
		done: (o) => o.orbited && o.zoomed
	},
	{
		id: 'build',
		title: 'Open Build',
		text: () => 'Press Build in the bar at the bottom: every building you can put up, by category.',
		point: () => 'sc-build',
		done: (o) => o.buildOpen || o.placing !== null
	},
	{
		id: 'pick',
		title: 'Pick a Tracking dish',
		text: (o) =>
			`Pick the Tracking dish: a ground station that links your vessels to home.${o.economy ? ' Its card shows the cost and the build time.' : ''}`,
		point: () => `sc-build-${TOUR_BUILDING}`,
		done: (o) => o.placing === TOUR_BUILDING
	},
	{
		id: 'place',
		title: 'Place it',
		text: () =>
			'Move the pointer over the ground: green fits, red says why not (another building, a road, the edge of the site). R or the turn button rotates it. Click a green spot.',
		point: () => 'sc-ghost',
		done: (o) => o.building !== null
	},
	{
		id: 'ready',
		title: 'Wait for it',
		text: (o) =>
			o.economy
				? 'Building costs funds and takes days: the panel shows when it is ready. Speed time up with the warp control at the top left until it runs. The tour gives this building’s cost back when you demolish it later.'
				: 'In a Sandbox world it is ready at once. In Career it costs funds and takes days; you warp time to finish it.',
		point: (o) => (o.economy ? 'hud-warp' : null),
		done: (o) => o.building?.state === 'active' || (o.building?.level ?? 0) > 0
	},
	{
		id: 'buildings',
		title: 'Your buildings',
		text: () =>
			'Close Build (Done) and open Buildings: every building on the site, with its level and state.',
		point: (o) => (o.buildOpen ? 'sc-build-done' : 'sc-buildings'),
		done: (o) => o.listOpen
	},
	{
		id: 'select',
		title: 'Select one',
		text: () =>
			'Click a building in the strip, or its pin on the site: the camera flies to it and its panel opens.',
		point: () => 'sc-buildings-list',
		done: (o) => o.selected !== null
	},
	{
		id: 'visit',
		title: 'Go inside',
		text: () =>
			'Select the Hangar, the Mission Center or the Astronaut Complex and press the button in its panel to go in.',
		point: () => 'sc-open',
		done: (o) => VISITS.has(o.place)
	},
	{
		id: 'back',
		title: 'Come back',
		text: () =>
			'Back to the Space Center: the Space Center icon in the menu bar at the top right always brings you here.',
		point: () => 'nav-space-center',
		done: (o) => o.place === 'space-center'
	},
	{
		id: 'upgrade',
		title: 'Upgrade',
		text: (o) =>
			`Select your Tracking dish and press Upgrade in its panel. Each level raises what a building gives: for a dish, range and data rate; for the Hangar, more parts; for the pad, heavier rockets.${o.economy ? ' An upgrade costs funds and days, like building.' : ''}`,
		point: (o) => (o.selected ? 'sc-upgrade' : 'sc-buildings'),
		done: (o) => (o.building?.level ?? 0) > 0 || o.building?.state === 'upgrading'
	},
	{
		id: 'demolish',
		title: 'Demolish',
		text: (o) =>
			`With the dish selected, press Demolish (or Cancel construction) at the foot of its panel and confirm in the red box. Demolishing cannot be undone.${o.economy ? ' The tour gives back what the dish cost.' : ''}`,
		point: (o) => (o.confirm ? 'sc-remove' : 'sc-demolish'),
		done: (o) => o.removed
	},
	{
		id: 'branch',
		title: 'Branches',
		text: (o) =>
			`Found a branch opens a second launch site elsewhere on the planet, with its own HQ to build first.${o.economy ? ' It costs the HQ’s price: worth it once a site closer to the equator or a second pad pays off.' : ''} Open it to have a look, or press Next: you do not need one yet.`,
		point: () => 'sc-found-branch',
		// opening the picker, or a branch already standing, is enough (owner, 2026-10-23: the step
		// stayed through five branches because it only waited for Next)
		done: (o) => o.branchOpen || o.branches > 0,
		optional: true
	},
	{
		id: 'finish',
		title: 'That’s the Space Center',
		text: () =>
			'You can build, visit, upgrade and demolish. Next, build your first rocket in the Hangar: the Lessons have a step-by-step one.',
		point: () => 'nav-vab'
	}
];

export type TourStatus = 'offered' | 'active' | 'done' | 'skipped';

/** A world's tour: where it stands, a step under review after Back, the tour building's id. */
export interface TourProgress {
	status: TourStatus;
	step: number;
	review: boolean;
	building?: string;
}

export const START_TOUR: TourProgress = { status: 'active', step: 0, review: false };

export const tourStep = (p: TourProgress): ScTourStep | null =>
	p.status === 'active' ? (SC_TOUR_STEPS[p.step] ?? null) : null;

/** "3 of 13". */
export const tourLabel = (p: TourProgress): string => `${p.step + 1} of ${SC_TOUR_STEPS.length}`;

const at = (p: TourProgress, step: number): TourProgress =>
	step >= SC_TOUR_STEPS.length
		? { ...p, status: 'done', step: SC_TOUR_STEPS.length, review: false }
		: { ...p, step, review: false };

/**
 * The progress after `o`: the step on show completes on its own action, one per observation; an
 * information step and a step under review wait for Next. The same object when nothing changed.
 */
export function advanceTour(p: TourProgress, o: ScTourObservation): TourProgress {
	if (p.status !== 'active' || p.review) return p;
	const step = SC_TOUR_STEPS[p.step];
	if (!step?.done) return p;
	return step.done(o) ? at(p, p.step + 1) : p;
}

/** Next: the step after, or the end. */
export const nextTour = (p: TourProgress): TourProgress =>
	p.status === 'active' ? at(p, p.step + 1) : p;

/** Back: the step before, shown for review (it waits for Next). */
export const backTour = (p: TourProgress): TourProgress =>
	p.status === 'active' && p.step > 0 ? { ...p, step: p.step - 1, review: true } : p;

export const skipTour = (p: TourProgress): TourProgress => ({ ...p, status: 'skipped' });

/** The tour's building in a site's buildings: the one recorded, else the one with a refund. */
export function tourBuildingOf(
	p: TourProgress,
	buildings: readonly (TourBuilding & { refund?: number })[]
): { building: TourBuilding | null; id: string | undefined; removed: boolean } {
	const found = p.building
		? buildings.find((b) => b.id === p.building)
		: buildings.find((b) => b.refund !== undefined);
	const id = p.building ?? found?.id;
	return {
		building: found ? { id: found.id, state: found.state, level: found.level } : null,
		id,
		removed: id !== undefined && found === undefined
	};
}

/** The tour's command flag: the dish placed during the tour carries `tour` (ADR 0314 point 4). */
export const placesTourBuilding = (p: TourProgress | null, kind: string): boolean =>
	p !== null &&
	p.status === 'active' &&
	p.building === undefined &&
	kind === TOUR_BUILDING &&
	['pick', 'place'].includes(SC_TOUR_STEPS[p.step]?.id ?? '');
