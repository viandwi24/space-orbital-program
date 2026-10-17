/** Stock site templates (plan 092, ADRs 0097 point 6 and 0177): quick starts for Create World. */
import { defineSiteTemplate } from '@orbital/sdk';

const DEG = Math.PI / 180;

export const STOCK_SITE_TEMPLATES = [
	defineSiteTemplate({
		id: 'stock.equatorial-coast',
		label: 'Equatorial coast',
		description: 'The most rotation boost and every inclination; launches go east over the sea.',
		criteria: { absLatitude: [0, 5 * DEG], seaEast: true }
	}),
	defineSiteTemplate({
		id: 'stock.mid-latitude-coast',
		label: 'Mid-latitude coast',
		description: 'Less boost, no low inclinations; downrange over the sea.',
		criteria: { absLatitude: [25 * DEG, 45 * DEG], seaEast: true }
	}),
	defineSiteTemplate({
		id: 'stock.inland-plateau',
		label: 'Inland plateau',
		description: 'High ground far from the sea: spent stages fall on land.',
		criteria: { absLatitude: [0, 50 * DEG], inland: true, minElevation: 0.65 }
	}),
	defineSiteTemplate({
		id: 'stock.high-latitude',
		label: 'High latitude',
		description: 'Polar orbits come cheap; equatorial ones need a plane change.',
		criteria: { absLatitude: [55 * DEG, 70 * DEG] }
	}),
	defineSiteTemplate({
		id: 'stock.island',
		label: 'Island',
		description: 'Sea on every side: any launch azimuth goes over water.',
		criteria: { absLatitude: [0, 40 * DEG], island: true, seaDistance: 150_000 }
	})
] as const;
