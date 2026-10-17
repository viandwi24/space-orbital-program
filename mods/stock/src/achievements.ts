import { defineAchievement } from '@orbital/sdk';

/**
 * Stock achievements (plan 102, ADR 0147 point 6): one per first a player can make with the stock
 * parts today, unlocked across worlds in the local profile. None can be missed for good.
 */
export const STOCK_ACHIEVEMENTS = [
	defineAchievement({
		id: 'stock.liftoff',
		label: 'Liftoff',
		description: 'Fly a vessel more than a kilometre above the ground.',
		criteria: { milestone: 'launch' }
	}),
	defineAchievement({
		id: 'stock.orbit',
		label: 'Around the world',
		description: 'Reach a stable orbit of your home planet.',
		criteria: { milestone: 'orbit', body: 'home' }
	}),
	defineAchievement({
		id: 'stock.crewed-orbit',
		label: 'Someone aboard',
		description: 'Reach orbit with crew aboard.',
		criteria: { milestone: 'orbit', crewed: true }
	}),
	defineAchievement({
		id: 'stock.return',
		label: 'Safely home',
		description: 'Recover a vessel that has been in orbit.',
		criteria: { milestone: 'return', body: 'home' }
	}),
	defineAchievement({
		id: 'stock.flyby',
		label: 'Another world',
		description: "Enter another body's sphere of influence.",
		criteria: { milestone: 'flyby', body: 'away' }
	}),
	defineAchievement({
		id: 'stock.landing',
		label: 'Footprints',
		description: 'Land on another body.',
		criteria: { milestone: 'landing', body: 'away' }
	}),
	defineAchievement({
		id: 'stock.far-return',
		label: 'There and back',
		description: 'Recover a vessel that has been to another body.',
		hidden: true,
		criteria: { milestone: 'return', body: 'away' }
	})
];
