/**
 * The key bindings (plan 023, made remappable by plan 053, ADR 0061). Every remappable action is
 * defined once in `ACTIONS`; the player's changes are an *overrides* object (action id to key ids)
 * stored in the settings; `createKeymap` resolves both for the handlers in `flight-loop.ts` and
 * `vab/controller.svelte.ts`. One table feeds the help overlay, the settings dialog and the tooltips.
 *
 * A key id is `KeyboardEvent.code` for letters, digits and named keys (`KeyW`, `Digit1`, `Space`,
 * `F5`), the character itself for punctuation (`,` `.` `/` `?` `[` `]`, so it follows the layout,
 * as the flight handler always did for comma and period), and the right-hand modifier is folded onto
 * the left one.
 */
export type BindingMode = 'flight' | 'map' | 'vab';
/** Actions in the flight and map modes are active together, so they share one clash scope. */
export type BindingScope = 'flight' | 'vab';

export const BINDING_MODE_LABEL: Record<BindingMode, string> = {
	flight: 'Flight',
	map: 'Map view',
	vab: 'Vehicle assembly'
};

export const scopeOf = (mode: BindingMode): BindingScope => (mode === 'vab' ? 'vab' : 'flight');

export interface ActionSpec {
	id: string;
	mode: BindingMode;
	/** Heading it is listed under in the settings dialog. */
	group: string;
	label: string;
	defaults: readonly string[];
	/** Works on every page (the sound mute): its keys clash with the keys of every scope. */
	global?: boolean;
}

const flight = (group: string, id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'flight',
	group,
	label,
	defaults
});
const map = (id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'map',
	group: 'Maneuver nodes',
	label,
	defaults
});
const vab = (id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'vab',
	group: 'Build',
	label,
	defaults
});

export const ACTIONS = [
	flight('Fly', 'throttleUp', 'Throttle up', 'ShiftLeft'),
	flight('Fly', 'throttleDown', 'Throttle down', 'ControlLeft'),
	flight('Fly', 'throttleFull', 'Full throttle', 'KeyZ'),
	flight('Fly', 'throttleCut', 'Cut throttle', 'KeyX'),
	flight('Fly', 'pitchPlus', 'Pitch +', 'KeyW'),
	flight('Fly', 'pitchMinus', 'Pitch −', 'KeyS'),
	flight('Fly', 'yawMinus', 'Yaw −', 'KeyA'),
	flight('Fly', 'yawPlus', 'Yaw +', 'KeyD'),
	flight('Fly', 'rollMinus', 'Roll −', 'KeyQ'),
	flight('Fly', 'rollPlus', 'Roll +', 'KeyE'),
	flight('Fly', 'stage', 'Fire the next stage', 'Space'),
	flight('Stability assist (SAS)', 'sasToggle', 'SAS on (hold attitude), off', 'KeyT'),
	flight('Stability assist (SAS)', 'sasHold', 'Hold attitude', 'Digit1'),
	// Custom action groups of the design (plan 110, ADR 0174 point 5): the number pad by default.
	flight('Action groups', 'customGroup1', 'Custom group 1', 'Numpad1'),
	flight('Action groups', 'customGroup2', 'Custom group 2', 'Numpad2'),
	flight('Action groups', 'customGroup3', 'Custom group 3', 'Numpad3'),
	flight('Action groups', 'customGroup4', 'Custom group 4', 'Numpad4'),
	flight('Action groups', 'customGroup5', 'Custom group 5', 'Numpad5'),
	flight('Action groups', 'customGroup6', 'Custom group 6', 'Numpad6'),
	flight('Action groups', 'customGroup7', 'Custom group 7', 'Numpad7'),
	flight('Action groups', 'customGroup8', 'Custom group 8', 'Numpad8'),
	flight('Action groups', 'customGroup9', 'Custom group 9', 'Numpad9'),
	flight('Action groups', 'customGroup10', 'Custom group 10', 'Numpad0'),
	flight('Stability assist (SAS)', 'sasPrograde', 'Prograde', 'Digit2'),
	flight('Stability assist (SAS)', 'sasRetrograde', 'Retrograde', 'Digit3'),
	flight('Stability assist (SAS)', 'sasNormal', 'Normal', 'Digit4'),
	flight('Stability assist (SAS)', 'sasAntinormal', 'Antinormal', 'Digit5'),
	flight('Stability assist (SAS)', 'sasRadialOut', 'Radial out', 'Digit6'),
	flight('Stability assist (SAS)', 'sasRadialIn', 'Radial in', 'Digit7'),
	flight('Stability assist (SAS)', 'sasManeuver', 'Point at the maneuver node', 'Digit8'),
	flight('Stability assist (SAS)', 'sasTarget', 'Point at the target', 'Digit9'),
	flight('Stability assist (SAS)', 'sasAntiTarget', 'Point away from the target', 'Digit0'),
	flight('Stability assist (SAS)', 'sasLevel', 'Level wings (aircraft)', ';'),
	// Aircraft (plan 063, ADR 0161): pitch trim and the wheels' brakes
	flight('Aircraft', 'trimUp', 'Trim nose up', ']'),
	flight('Aircraft', 'trimDown', 'Trim nose down', '['),
	flight('Aircraft', 'brakes', 'Brakes on or off', 'KeyC'),
	flight('See', 'map', 'Map view', 'KeyM'),
	flight('See', 'speedMode', 'Speed reference: auto, surface, orbit, target', 'KeyV'),
	flight('See', 'targetNext', 'Next target: each body, each other vessel, none', 'KeyY'),
	flight('Time and menus', 'warpDown', 'Time warp down', ','),
	flight('Time and menus', 'warpUp', 'Time warp up', '.'),
	flight('Time and menus', 'quicksave', 'Quicksave', 'F5'),
	flight('Time and menus', 'quickload', 'Quickload', 'F9'),
	flight('Time and menus', 'help', 'Show the controls list', '?', 'F1'),
	// with Alt held (plan 203, ADR 0200 point 1): F12 alone is the browser's developer tools
	flight('Time and menus', 'debug', 'Debug panel (hold Alt)', 'F12'),
	{
		// every page (plan 205, ADR 0201 point 6); Space also pauses on the pages without a Space key
		id: 'pause',
		mode: 'flight',
		group: 'Time and menus',
		label: 'Pause or resume the world clock',
		defaults: ['KeyP'],
		global: true
	},
	{
		id: 'mute',
		mode: 'flight',
		group: 'Time and menus',
		label: 'Mute or unmute sound',
		defaults: ['KeyN'],
		global: true
	},
	map('mapFocus', 'Look at the next body', 'Tab'),
	map('nodePrograde', 'Selected node: prograde up', 'KeyI'),
	map('nodeRetrograde', 'Selected node: prograde down', 'KeyK'),
	map('nodeNormal', 'Selected node: normal up', 'KeyL'),
	map('nodeAntinormal', 'Selected node: normal down', 'KeyJ'),
	map('nodeRadialOut', 'Selected node: radial out', 'KeyO'),
	map('nodeRadialIn', 'Selected node: radial in', 'KeyU'),
	map('nodeDelete', 'Remove the selected node', 'Delete'),
	vab('symmetry', 'Symmetry: 1, 2, 3, 4, 6-way', 'KeyX'),
	vab('turnPlus', 'Turn radial sites, or a selected radial part', 'KeyQ'),
	vab('turnMinus', 'Turn the other way', 'KeyE'),
	vab('nextSite', 'Choose the next site', 'Tab'),
	vab('place', 'Place the part', 'Enter', 'Space'),
	vab('prevPart', 'Select the previous part', '['),
	vab('nextPart', 'Select the next part', ']'),
	vab('carry', 'Carry the selected part (Shift: the whole group)', 'KeyM', 'KeyG'),
	vab('detach', 'Detach the selected part', 'KeyD'),
	vab('delete', 'Delete the selected part (Shift: with what hangs on it)', 'Delete'),
	vab('subAssembly', 'Save the selection as a sub-assembly', 'KeyA'),
	vab('frame', 'Frame the vessel', 'KeyF'),
	vab('search', 'Search the catalogue', '/')
] as const satisfies readonly ActionSpec[];

export type ActionId = (typeof ACTIONS)[number]['id'];

/** The clash scopes an action's keys occupy. */
const slotsOf = (a: ActionSpec): BindingScope[] =>
	a.global ? ['flight', 'vab'] : [scopeOf(a.mode)];

const BY_ID = new Map<string, ActionSpec>(ACTIONS.map((a) => [a.id, a]));
/** The slot (1..10) of a custom-group action, or undefined (plan 110). */
export function customGroupSlot(id: string): number | undefined {
	const m = /^customGroup(\d+)$/.exec(id);
	return m ? Number(m[1]) : undefined;
}

export const isActionId = (id: string): id is ActionId => BY_ID.has(id);
export const actionSpec = (id: ActionId): ActionSpec => BY_ID.get(id)!;

/** The player's changes: action id to its keys. Absent means the defaults. */
export type Bindings = Partial<Record<ActionId, readonly string[]>>;
/** Every action with its keys. */
export type KeyTable = Record<ActionId, readonly string[]>;

/** Key ids no action may take: they have fixed jobs (pause menu, camera, second Delete). */
export const RESERVED_KEYS: readonly string[] = [
	'Escape',
	'Backspace',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'+',
	'-',
	'=',
	'_'
];

/** Keys that cannot be rebound, shown read-only so the list is complete. */
export const FIXED_KEYS: readonly {
	scope: BindingScope;
	keys: readonly string[];
	label: string;
}[] = [
	{ scope: 'flight', keys: ['Escape'], label: 'Pause menu' },
	{ scope: 'flight', keys: ['Drag', 'Wheel'], label: 'Orbit and zoom the camera' },
	{ scope: 'vab', keys: ['Escape'], label: 'Let go of the part, clear the selection' },
	{ scope: 'vab', keys: ['Ctrl+Z', 'Ctrl+Y'], label: 'Undo, redo' },
	{ scope: 'vab', keys: ['Ctrl+S'], label: 'Save to the library' },
	{ scope: 'vab', keys: ['Arrows', '+', '-'], label: 'Orbit and zoom the view (canvas focused)' }
];

const FOLD: Record<string, string> = {
	ShiftRight: 'ShiftLeft',
	ControlRight: 'ControlLeft',
	AltRight: 'AltLeft',
	MetaRight: 'MetaLeft'
};
const PUNCTUATION = /^[^A-Za-z0-9\s]$/u;

/** The key id of a keyboard event (see the file comment). */
export function keyIdOf(e: { key: string; code: string }): string {
	if (e.key.length === 1 && PUNCTUATION.test(e.key)) return e.key;
	return FOLD[e.code] ?? e.code;
}

const NAMED: Record<string, string> = {
	ShiftLeft: 'Shift',
	ControlLeft: 'Ctrl',
	AltLeft: 'Alt',
	MetaLeft: 'Cmd',
	Escape: 'Esc',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓'
};

/** What the player sees on the key cap. */
export function keyLabel(id: string): string {
	const named = NAMED[id];
	if (named) return named;
	if (/^Key[A-Z]$/.test(id)) return id.slice(3);
	if (/^Digit\d$/.test(id)) return id.slice(5);
	if (/^Numpad\d$/.test(id)) return `Num ${id.slice(6)}`;
	return id;
}

/** True for what the capture field may store: a real key id, not reserved, not a bare Meta. */
export function bindableKey(id: string): boolean {
	return id.length > 0 && id.length <= 24 && !RESERVED_KEYS.includes(id) && id !== 'MetaLeft';
}

/** The defaults, or the overrides where the player changed an action. */
export function resolveBindings(overrides: Bindings = {}): KeyTable {
	const table = {} as Record<string, readonly string[]>;
	for (const a of ACTIONS) table[a.id] = overrides[a.id as ActionId] ?? a.defaults;
	return table as KeyTable;
}

/** The action that already uses `key` in the scope of `id` (other than `id` itself), or null. */
export function findClash(table: KeyTable, id: ActionId, key: string): ActionId | null {
	const mine = slotsOf(actionSpec(id));
	for (const a of ACTIONS) {
		if (a.id === id || !slotsOf(a).some((s) => mine.includes(s))) continue;
		if (table[a.id as ActionId].includes(key)) return a.id as ActionId;
	}
	return null;
}

/** Every `scope:key` used by two actions; empty for a sound table. Used by the tests and the validator. */
export function bindingClashes(table: KeyTable): string[] {
	const seen = new Map<string, string>();
	const out: string[] = [];
	for (const a of ACTIONS) {
		for (const key of table[a.id as ActionId]) {
			for (const scope of slotsOf(a)) {
				const slot = `${scope}:${key}`;
				const prior = seen.get(slot);
				if (prior !== undefined) out.push(`${slot} (${prior} / ${a.id})`);
				else seen.set(slot, a.id);
			}
		}
	}
	return out;
}

/** Drop overrides equal to the defaults so the stored value only holds real changes. */
function normalise(overrides: Bindings): Bindings {
	const out: Bindings = {};
	for (const a of ACTIONS) {
		const keys = overrides[a.id as ActionId];
		if (keys === undefined) continue;
		if (keys.length === a.defaults.length && keys.every((k, i) => k === a.defaults[i])) continue;
		out[a.id as ActionId] = keys;
	}
	return out;
}

export type RebindResult =
	| { ok: true; bindings: Bindings }
	| { ok: false; reason: 'reserved' }
	| { ok: false; reason: 'clash'; with: ActionId };

/** Give `id` the single key `key`. A key another action of the same scope uses is a clash. */
export function rebind(bindings: Bindings, id: ActionId, key: string): RebindResult {
	if (!bindableKey(key)) return { ok: false, reason: 'reserved' };
	const clash = findClash(resolveBindings(bindings), id, key);
	if (clash !== null) return { ok: false, reason: 'clash', with: clash };
	return { ok: true, bindings: normalise({ ...bindings, [id]: [key] }) };
}

/** `id` takes `key`, and the action that had it takes all of `id`'s previous keys. */
export function swapBindings(bindings: Bindings, id: ActionId, key: string): Bindings {
	const table = resolveBindings(bindings);
	const other = findClash(table, id, key);
	if (other === null) return normalise({ ...bindings, [id]: [key] });
	return normalise({ ...bindings, [id]: [key], [other]: table[id] });
}

export function resetBinding(bindings: Bindings, id: ActionId): Bindings {
	const next = { ...bindings };
	delete next[id];
	return next;
}

/**
 * A stored value made safe (ADR 0061, point 4): unknown actions, empty or reserved keys and
 * overrides that clash with another action fall back to that action's defaults.
 */
export function repairBindings(raw: Readonly<Record<string, unknown>>): Bindings {
	let candidate: Bindings = {};
	for (const a of ACTIONS) {
		const value = raw[a.id];
		if (!Array.isArray(value)) continue;
		const keys = [...new Set(value.filter((k): k is string => typeof k === 'string'))].slice(0, 4);
		if (keys.length === 0 || !keys.every(bindableKey)) continue;
		candidate[a.id as ActionId] = keys;
	}
	candidate = normalise(candidate);
	// Drop the overrides involved in a clash until none is left (the defaults do not clash).
	for (let guard = 0; guard < ACTIONS.length; guard++) {
		const table = resolveBindings(candidate);
		const bad = ACTIONS.find(
			(a) =>
				candidate[a.id as ActionId] !== undefined &&
				table[a.id as ActionId].some((k) => findClash(table, a.id as ActionId, k) !== null)
		);
		if (!bad) break;
		candidate = resetBinding(candidate, bad.id as ActionId);
	}
	return candidate;
}

export interface Keymap {
	keys(id: ActionId): readonly string[];
	/** The action a key id triggers in a scope, or null. */
	actionFor(scope: BindingScope, key: string): ActionId | null;
	/** The first key of an action as shown on a key cap ("" if it has none). */
	label(id: ActionId): string;
	/** Key caps of an action: every key, labelled. */
	labels(id: ActionId): string[];
}

export function createKeymap(bindings: Bindings = {}): Keymap {
	const table = resolveBindings(bindings);
	const lookup = new Map<string, ActionId>();
	for (const a of ACTIONS) {
		for (const k of table[a.id as ActionId])
			for (const scope of slotsOf(a)) lookup.set(`${scope}:${k}`, a.id as ActionId);
	}
	return {
		keys: (id) => table[id],
		actionFor: (scope, key) => lookup.get(`${scope}:${key}`) ?? null,
		label: (id) => (table[id][0] === undefined ? '' : keyLabel(table[id][0])),
		labels: (id) => table[id].map(keyLabel)
	};
}

export const DEFAULT_KEYMAP: Keymap = createKeymap();

/** One line of the help overlay: what the keys do, in words. */
export interface HelpRow {
	/** Actions whose keys the row shows; the keys join with "/". */
	actions: readonly ActionId[];
	/** Show only the first and last key joined by a dash (a range such as 1–7). */
	range?: boolean;
	/** Read-only keys and mouse gestures of this row instead of actions. */
	fixed?: readonly string[];
	text: string;
}

export interface BindingGroup {
	id: string;
	title: string;
	mode: BindingMode;
	rows: readonly HelpRow[];
}

export const BINDING_GROUPS: readonly BindingGroup[] = [
	{
		id: 'fly',
		title: 'Fly',
		mode: 'flight',
		rows: [
			{ actions: ['throttleUp', 'throttleDown'], text: 'Throttle up, down' },
			{ actions: ['throttleFull', 'throttleCut'], text: 'Full throttle, cut' },
			{ actions: ['pitchPlus', 'pitchMinus'], text: 'Pitch' },
			{ actions: ['yawMinus', 'yawPlus'], text: 'Yaw' },
			{ actions: ['rollMinus', 'rollPlus'], text: 'Roll' },
			{ actions: ['stage'], text: 'Fire the next stage' }
		]
	},
	{
		id: 'sas',
		title: 'Stability assist (SAS)',
		mode: 'flight',
		rows: [
			{ actions: ['sasToggle'], text: 'SAS on (hold attitude), off' },
			{
				actions: [
					'sasHold',
					'sasPrograde',
					'sasRetrograde',
					'sasNormal',
					'sasAntinormal',
					'sasRadialOut',
					'sasRadialIn'
				],
				range: true,
				text: 'Hold, prograde, retrograde, normal, antinormal, radial out, radial in'
			},
			{ actions: ['sasManeuver'], text: 'Point at the maneuver node' },
			{ actions: ['sasTarget', 'sasAntiTarget'], text: 'Point at the target, away from it' },
			{ actions: ['sasLevel'], text: 'Level wings (aircraft)' }
		]
	},
	{
		id: 'aircraft',
		title: 'Aircraft',
		mode: 'flight',
		rows: [
			{ actions: ['trimUp', 'trimDown'], text: 'Trim nose up, down' },
			{ actions: ['brakes'], text: 'Brakes on or off' }
		]
	},
	{
		id: 'see',
		title: 'See',
		mode: 'flight',
		rows: [
			{ actions: ['map'], text: 'Map view' },
			{ actions: ['speedMode'], text: 'Speed reference: auto, surface, orbit, target' },
			{ actions: ['targetNext'], text: 'Next target: each body, each other vessel, none' },
			{ actions: [], fixed: ['Drag', 'Wheel'], text: 'Orbit and zoom the camera' }
		]
	},
	{
		id: 'time',
		title: 'Time and menus',
		mode: 'flight',
		rows: [
			{ actions: ['warpDown', 'warpUp'], text: 'Time warp down, up' },
			{ actions: ['quicksave', 'quickload'], text: 'Quicksave, quickload' },
			{ actions: [], fixed: ['Esc'], text: 'Pause menu' },
			{ actions: ['help'], text: 'This list' },
			{ actions: ['debug'], fixed: ['Alt'], text: 'Debug panel (hold Alt)' },
			{ actions: ['pause'], text: 'Pause or resume the world clock' },
			{ actions: ['mute'], text: 'Mute or unmute sound' }
		]
	},
	{
		id: 'nodes',
		title: 'Maneuver nodes',
		mode: 'map',
		rows: [
			{ actions: ['mapFocus'], text: 'Look at the next body' },
			{
				actions: [],
				fixed: ['Click'],
				text: 'Click the orbit to add a node; drag a node along the orbit'
			},
			{
				actions: [],
				fixed: ['Drag'],
				text: 'Drag a handle to add prograde, normal or radial delta-v (Shift coarse, Alt fine)'
			},
			{ actions: ['nodePrograde', 'nodeRetrograde'], text: 'Selected node: prograde up, down' },
			{ actions: ['nodeNormal', 'nodeAntinormal'], text: 'Normal up, down' },
			{ actions: ['nodeRadialOut', 'nodeRadialIn'], text: 'Radial out, in' },
			{ actions: ['nodeDelete'], text: 'Remove the selected node' }
		]
	},
	{
		id: 'build',
		title: 'Build',
		mode: 'vab',
		rows: [
			{
				actions: [],
				fixed: ['Click'],
				text: 'Pick a part, then click a ring or a tank side to attach it'
			},
			{ actions: ['symmetry'], text: 'Symmetry: 1, 2, 3, 4, 6-way' },
			{ actions: ['turnPlus', 'turnMinus'], text: 'Turn radial sites, or a selected radial part' },
			{ actions: ['nextSite', 'place'], text: 'Choose a site, place the part' },
			{ actions: ['prevPart', 'nextPart'], text: 'Select the previous, next part' },
			{ actions: ['carry'], text: 'Carry the selected part (Shift: the whole group)' },
			{ actions: ['detach'], text: 'Detach the selected part' },
			{ actions: ['delete'], text: 'Delete the selected part (Shift: with what hangs on it)' },
			{ actions: ['subAssembly'], text: 'Save the selection as a sub-assembly' },
			{ actions: ['frame'], text: 'Frame the vessel' },
			{ actions: ['search'], text: 'Search the catalogue' },
			{ actions: [], fixed: ['Ctrl+Z', 'Ctrl+Y'], text: 'Undo, redo' },
			{ actions: [], fixed: ['Ctrl+S'], text: 'Save to the library' },
			{ actions: [], fixed: ['Esc'], text: 'Let go of the part, clear the selection' }
		]
	},
	{
		id: 'groups',
		title: 'Action groups',
		mode: 'flight',
		rows: [
			{
				actions: [
					'customGroup1',
					'customGroup2',
					'customGroup3',
					'customGroup4',
					'customGroup5',
					'customGroup6',
					'customGroup7',
					'customGroup8',
					'customGroup9',
					'customGroup10'
				],
				range: true,
				text: 'Custom action groups 1 to 10 of the design'
			}
		]
	}
];

/** The key caps a help row shows with the keys now in force. */
export function helpKeys(row: HelpRow, keymap: Keymap): { caps: string[]; joiner: '/' | '–' } {
	if (row.fixed) return { caps: [...row.fixed], joiner: '/' };
	if (row.range) {
		// A range reads "1–7" only while the keys are still consecutive digits.
		const ids = row.actions.map((a) => keymap.keys(a)[0] ?? '');
		const digits = ids.map((k) => (/^Digit\d$/.test(k) ? Number(k.slice(5)) : NaN));
		if (digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1)) {
			return {
				caps: [keymap.label(row.actions[0]!), keymap.label(row.actions.at(-1)!)],
				joiner: '–'
			};
		}
	}
	return { caps: row.actions.map((a) => keymap.label(a)).filter((c) => c !== ''), joiner: '/' };
}
