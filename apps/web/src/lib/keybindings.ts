/**
 * The key bindings the game documents (plan 023). One list feeds the help overlay and the settings
 * dialog; the handlers (`flight-loop.ts`, `vab/controller.svelte.ts`) are the code that acts on
 * them, and `keybindings.test.ts` pins this list against duplicates. The 1.0 bindings are fixed:
 * the list is read-only (rebinding is on the roadmap).
 */
export type BindingMode = 'flight' | 'map' | 'vab';

export interface Binding {
	/** Every key the row covers, as typed on the keyboard; used to detect clashes. */
	keys: readonly string[];
	/** What the player sees instead of `keys` (a range such as `1-7`, or a pair). */
	show?: readonly string[];
	action: string;
}

export interface BindingGroup {
	id: string;
	title: string;
	mode: BindingMode;
	rows: readonly Binding[];
}

export const BINDING_MODE_LABEL: Record<BindingMode, string> = {
	flight: 'Flight',
	map: 'Map view',
	vab: 'Vehicle assembly'
};

export const BINDING_GROUPS: readonly BindingGroup[] = [
	{
		id: 'fly',
		title: 'Fly',
		mode: 'flight',
		rows: [
			{ keys: ['Shift', 'Ctrl'], action: 'Throttle up, down' },
			{ keys: ['Z', 'X'], action: 'Full throttle, cut' },
			{ keys: ['W', 'S'], action: 'Pitch' },
			{ keys: ['A', 'D'], action: 'Yaw' },
			{ keys: ['Q', 'E'], action: 'Roll' },
			{ keys: ['Space'], action: 'Fire the next stage' }
		]
	},
	{
		id: 'sas',
		title: 'Stability assist (SAS)',
		mode: 'flight',
		rows: [
			{ keys: ['T'], action: 'SAS on (hold attitude), off' },
			{
				keys: ['1', '2', '3', '4', '5', '6', '7'],
				show: ['1', '7'],
				action: 'Hold, prograde, retrograde, normal, antinormal, radial out, radial in'
			},
			{ keys: ['8'], action: 'Point at the maneuver node' }
		]
	},
	{
		id: 'see',
		title: 'See',
		mode: 'flight',
		rows: [
			{ keys: ['M'], action: 'Map view' },
			{ keys: ['V'], action: 'Speed reference: auto, surface, orbit' },
			{ keys: ['Drag', 'Wheel'], action: 'Orbit and zoom the camera' }
		]
	},
	{
		id: 'time',
		title: 'Time and menus',
		mode: 'flight',
		rows: [
			{ keys: [',', '.'], action: 'Time warp down, up' },
			{ keys: ['F5', 'F9'], action: 'Quicksave, quickload' },
			{ keys: ['Esc'], action: 'Pause menu' },
			{ keys: ['?', 'F1'], action: 'This list' }
		]
	},
	{
		id: 'nodes',
		title: 'Maneuver nodes',
		mode: 'map',
		rows: [
			{ keys: ['Tab'], action: 'Look at the next body' },
			{ keys: ['Click'], action: 'Click the orbit to add a node; drag a node along the orbit' },
			{
				keys: ['Drag'],
				action: 'Drag a handle to add prograde, normal or radial delta-v (Shift coarse, Alt fine)'
			},
			{ keys: ['I', 'K'], action: 'Selected node: prograde up, down' },
			{ keys: ['L', 'J'], action: 'Normal up, down' },
			{ keys: ['O', 'U'], action: 'Radial out, in' },
			{ keys: ['Delete'], action: 'Remove the selected node' }
		]
	},
	{
		id: 'build',
		title: 'Build',
		mode: 'vab',
		rows: [
			{ keys: ['Click'], action: 'Pick a part, then click a ring or a tank side to attach it' },
			{ keys: ['X'], action: 'Symmetry: 1, 2, 3, 4, 6-way' },
			{ keys: ['Q', 'E'], action: 'Turn radial sites, or a selected radial part' },
			{ keys: ['Tab', 'Enter'], action: 'Choose a site, place the part' },
			{ keys: ['[', ']'], action: 'Select the previous, next part' },
			{ keys: ['M'], action: 'Carry the selected part (Shift: the whole group)' },
			{ keys: ['D'], action: 'Detach the selected part' },
			{ keys: ['Delete'], action: 'Delete the selected part (Shift: with what hangs on it)' },
			{ keys: ['A'], action: 'Save the selection as a sub-assembly' },
			{ keys: ['F'], action: 'Frame the vessel' },
			{ keys: ['/'], action: 'Search the catalogue' },
			{ keys: ['Ctrl+Z', 'Ctrl+Y'], action: 'Undo, redo' },
			{ keys: ['Ctrl+S'], action: 'Save to the library' },
			{ keys: ['Esc'], action: 'Let go of the part, clear the selection' }
		]
	}
];

/** Mouse gestures share names across modes on purpose; they are not keys. */
const POINTER = new Set(['Click', 'Drag', 'Wheel']);

/** Keys that appear more than once in a mode; empty when the list has no clashes. */
export function bindingClashes(groups: readonly BindingGroup[] = BINDING_GROUPS): string[] {
	const seen = new Map<string, string>();
	const clashes: string[] = [];
	for (const g of groups) {
		// The map view adds to the flight keys, so its keys must not clash with flight either.
		const scopes: BindingMode[] = g.mode === 'map' ? ['flight'] : [g.mode];
		for (const row of g.rows) {
			for (const key of row.keys) {
				if (POINTER.has(key)) continue;
				const id = `${scopes[0]}:${key}`;
				const prior = seen.get(id);
				if (prior !== undefined) clashes.push(`${g.mode} ${key} (${prior} / ${row.action})`);
				else seen.set(id, row.action);
			}
		}
	}
	return clashes;
}
