/**
 * What an open dialog does to a flight (plans 205, 203, 257): any of them quiets the flight keys; all
 * of them, the Debug panel included, freeze the sim and hold the world clock as the Menu place does.
 */
export interface OpenDialogs {
	pause: boolean;
	help: boolean;
	settings: boolean;
	load: boolean;
	save: boolean;
	debug: boolean;
}

export const dialogOpen = (d: OpenDialogs): boolean =>
	d.pause || d.help || d.settings || d.load || d.save || d.debug;
