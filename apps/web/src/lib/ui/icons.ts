/** Own icon set: 24 x 24 grid, stroked paths, drawn for this game (plan 021). */
export const ICONS = {
	menu: 'M4 7h16M4 12h16M4 17h16',
	map: 'M12 8.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 0 0 0-7.6ZM3.6 16.5C2 12.5 7 6.5 15.5 5.2M20.4 7.5c1.5 4-3.4 9.6-11.5 11.3',
	script: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.6 5.5l-3.2 13',
	help: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17ZM9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 16.6v.1',
	pause: 'M8.5 5.5v13M15.5 5.5v13',
	play: 'M8 5.5v13l10.5-6.5Z',
	slower: 'M12.5 6.5l-5.5 5.5 5.5 5.5M18.5 6.5L13 12l5.5 5.5',
	faster: 'M5.5 6.5L11 12l-5.5 5.5M11.5 6.5l5.5 5.5-5.5 5.5',
	back: 'M10.5 6l-6 6 6 6M4.5 12h15',
	close: 'M6 6l12 12M18 6L6 18',
	check: 'M5 12.5l4.5 4.5L19 7.5',
	info: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17ZM12 11v5.2M12 7.9v.1',
	alert: 'M12 4l9 16H3ZM12 10.5v4M12 17.4v.1',
	flame:
		'M12 3c.8 3.4 5.2 5.2 5.2 10a5.2 5.2 0 0 1-10.4 0c0-2 .9-3.3 2.1-4.3.2 1.5.9 2.2 1.6 2.4C10.1 8.6 10.8 5.6 12 3Z',
	stage: 'M12 4v12M7 11l5 5 5-5M6 20h12',
	up: 'M12 19V6M6.5 11.5L12 6l5.5 5.5',
	down: 'M12 5v13M6.5 12.5L12 18l5.5-5.5',
	// Parts (stagingIcon names)
	command: 'M8 20v-8.5C8 8 9.7 5.6 12 4c2.3 1.6 4 4 4 7.5V20ZM8 15h8M12 8.4v.1',
	wheel:
		'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15ZM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z',
	tank: 'M7.5 4h9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM6.5 9h11M6.5 15h11',
	engine: 'M9.5 3.5h5V9M9.5 9V3.5M7.5 9h9l3 10.5h-15Z',
	decoupler: 'M5 8.5h14M5 15.5h14M12 10.5v3M8 10.5v3M16 10.5v3',
	legs: 'M12 4.5v8.5M12 13l-6 6.5M12 13l6 6.5M4 19.5h4M16 19.5h4',
	shield: 'M12 3.5l7 2.8V12c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5V6.3Z',
	part: 'M6 6h12v12H6Z'
} as const;

export type IconName = keyof typeof ICONS;

export const isIconName = (name: string): name is IconName => name in ICONS;
