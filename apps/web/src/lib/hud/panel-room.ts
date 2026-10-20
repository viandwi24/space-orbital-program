/**
 * Room the vessel panel takes on the right (plan 250, rancangan §7.3): the inspectors stand left of
 * it at every width, so they never cover the panel (below 1280 px it used to count as zero).
 */
export const panelRoom = (vesselOpen: boolean, panelWidthPx: number): string =>
	vesselOpen ? `${panelWidthPx / 16}rem` : '0rem';
