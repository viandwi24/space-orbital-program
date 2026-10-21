/**
 * The key bindings (plan 023, made remappable by plan 053, ADR 0061). Every remappable action is
 * defined once in `ACTIONS`; the player's changes are an *overrides* object (action id to key ids)
 * stored in the settings; `createKeymap` resolves both for the handlers in `flight-loop.ts` and
 * `vab/controller.svelte.ts`. One table feeds the help overlay, the settings dialog and the tooltips.
 *
 * A key id is `KeyboardEvent.code` for letters, digits and named keys (`KeyW`, `Digit1`, `Space`,
 * `F5`), the character itself for punctuation (`,` `.` `/` `?` `[` `]`, so it follows the layout,
 * as the flight handler always did for comma and period), and the right-hand modifier is folded onto
 * the left one. A chord (plan 216, ADR 0206) puts the held modifiers in front: `Alt+Digit1`,
 * `Ctrl+KeyM` (Shift is never a chord modifier: it is the throttle).
 *
 * Key profiles (plan 216, ADR 0206): `ksp`, the default, follows KSP; `classic` keeps the keys of
 * Orbital before plan 216. A profile is a full default table; the player's overrides apply on top.
 */
export type BindingMode = 'flight' | 'map' | 'vab' | 'carry' | 'tool' | 'eva';
/**
 * Clash scopes. Map keys act only in the map with a node selected, before the flight keys, so they
 * may share keys with flight actions (plan 216: I is a node key and RCS translation). EVA keys act
 * while a suit has focus, instead of the flight keys (plan 225).
 */
export type BindingScope = 'flight' | 'map' | 'vab' | 'carry' | 'tool' | 'eva';

export const KEY_PROFILES = ['ksp', 'classic'] as const;
export type KeyProfile = (typeof KEY_PROFILES)[number];
export const KEY_PROFILE_LABEL: Record<KeyProfile, string> = {
	ksp: 'KSP',
	classic: 'Orbital classic'
};
/** What a new player gets (settings format 4). The functions below default to `classic`, the table of `ACTIONS`. */
export const DEFAULT_KEY_PROFILE: KeyProfile = 'ksp';

export const BINDING_MODE_LABEL: Record<BindingMode, string> = {
	flight: 'Flight',
	map: 'Map view',
	vab: 'Vehicle assembly',
	carry: 'Carrying a part (Hangar)',
	tool: 'Move and rotate tools (Hangar)',
	eva: 'On EVA'
};

export const scopeOf = (mode: BindingMode): BindingScope => mode;

export interface ActionSpec {
	id: string;
	mode: BindingMode;
	/** Heading it is listed under in the settings dialog. */
	group: string;
	label: string;
	defaults: readonly string[];
	/** Works on every page (the sound mute): its keys clash with the keys of every scope. */
	global?: boolean;
	/**
	 * Declared for a later plan that binds its handler (plan 216: RCS, vessel switching, camera
	 * modes, ...). Hidden from the controls list and the help until then.
	 */
	pending?: boolean;
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
/** Keys while a part rides the cursor in the Hangar (plan 217): they may share keys with `vab`. */
const carry = (id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'carry',
	group: 'Carrying a part',
	label,
	defaults
});

/**
 * Keys of the Hangar's Move and Rotate tools while a part is selected (plan 279, ADR 0258): they may
 * share keys with `vab` and `carry`, as they act only while a tool is on.
 */
const tool = (id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'tool',
	group: 'Move and rotate tools',
	label,
	defaults
});

/** Keys while a suit has focus (plan 225, ADR 0209 point 2): the same in both profiles. */
const eva = (id: string, label: string, ...defaults: string[]): ActionSpec => ({
	id,
	mode: 'eva',
	group: 'On EVA',
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
	// classic keeps `[`/`]` for the trim; the KSP profile switches vessels on them (plans 216, 221)
	flight('Aircraft', 'trimUp', 'Trim nose up', ']'),
	flight('Aircraft', 'trimDown', 'Trim nose down', '['),
	flight('See', 'vesselNext', 'Next vessel within 2.5 km', 'PageDown'),
	flight('See', 'vesselPrev', 'Previous vessel within 2.5 km', 'PageUp'),
	flight('Aircraft', 'brakes', 'Brakes on or off', 'KeyC'),
	// plan 245: the KSP profile brakes while B is held; classic keeps the C toggle and has this on Alt+C
	flight('Aircraft', 'brakesHold', 'Brakes while the key is held', 'Alt+KeyC'),
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
	// Plan 216 (ADR 0206): keys the KSP profile has, for the plans that wire them
	flight('Parts', 'gear', 'Landing gear up or down', 'KeyG'),
	flight('Parts', 'lights', 'Lights on or off', 'KeyU'),
	flight('Fly', 'abort', 'Abort: stop programs, cut the engines and fire the Abort group', 'Backspace'),
	// plan 311 (ADR 0272 point 5): the player's kill switch for autopilots and scripts
	flight('Fly', 'programStop', 'Stop the programs (autopilot, script) flying this vessel', 'Delete'),
	flight('Fly', 'precision', 'Fine control', 'CapsLock'),
	flight('RCS', 'rcsToggle', 'RCS on or off', 'KeyR'),
	flight('RCS', 'translateForward', 'Translate forward', 'KeyH'),
	flight('RCS', 'translateBack', 'Translate back', "'"),
	flight('RCS', 'translateLeft', 'Translate left', 'KeyJ'),
	flight('RCS', 'translateRight', 'Translate right', 'KeyL'),
	flight('RCS', 'translateDown', 'Translate down', 'KeyI'),
	flight('RCS', 'translateUp', 'Translate up', 'KeyK'),
	flight('Aircraft', 'trimYawLeft', 'Trim yaw left', 'Alt+KeyA'),
	flight('Aircraft', 'trimYawRight', 'Trim yaw right', 'Alt+KeyD'),
	flight('Aircraft', 'trimRollLeft', 'Trim roll left', 'Alt+KeyQ'),
	flight('Aircraft', 'trimRollRight', 'Trim roll right', 'Alt+KeyE'),
	flight('Aircraft', 'trimReset', 'Reset the trim', 'Alt+KeyX'),
	flight('See', 'cameraMode', 'Next camera mode', '\\'),
	flight('See', 'cameraReset', 'Camera back on the vessel', '`'),
	flight('See', 'hideUi', 'Hide the interface', 'F2'),
	flight('See', 'screenshot', 'Screenshot', 'F10'),
	flight('Time and menus', 'stopWarp', 'Stop time warp', '/'),
	map('mapFocus', 'Look at the next body', 'Tab'),
	map('nodePrograde', 'Selected node: prograde up', 'KeyI'),
	map('nodeRetrograde', 'Selected node: prograde down', 'KeyK'),
	map('nodeNormal', 'Selected node: normal up', 'KeyL'),
	map('nodeAntinormal', 'Selected node: normal down', 'KeyJ'),
	map('nodeRadialOut', 'Selected node: radial out', 'KeyO'),
	map('nodeRadialIn', 'Selected node: radial in', 'KeyU'),
	map('nodeDelete', 'Remove the selected node', 'Delete'),
	vab('symmetry', 'Symmetry: 1 to 8 copies (Shift: fewer)', 'KeyX'),
	vab('mirror', 'Mirror symmetry on or off', 'KeyR'),
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
	vab('search', 'Search the catalogue', '/'),
	vab('toolPlace', 'Tool: place and pick parts', 'Digit1'),
	vab('toolMove', 'Tool: move the selected part (offset)', 'Digit2'),
	vab('toolRotate', 'Tool: rotate the selected part', 'Digit3'),
	vab('snapNodes', 'Snap to nodes on or off (off: any surface at the cursor)', 'KeyH'),
	carry('pitchUp', 'Turn the carried part: pitch up', 'KeyW'),
	carry('pitchDown', 'Turn the carried part: pitch down', 'KeyS'),
	carry('rollLeft', 'Turn the carried part: roll left', 'KeyA'),
	carry('rollRight', 'Turn the carried part: roll right', 'KeyD'),
	carry('yawLeft', 'Turn the carried part: yaw left', 'KeyQ'),
	carry('yawRight', 'Turn the carried part: yaw right', 'KeyE'),
	carry('turnReset', 'Reset the turn of the carried part', 'Space'),
	carry('angleSnap', 'Angle snap on or off', 'KeyC'),
	tool('toolUp', 'Move up (+Y), or pitch (+X turn)', 'KeyW'),
	tool('toolDown', 'Move down (-Y), or pitch back', 'KeyS'),
	tool('toolLeft', 'Move left (-X), or roll (+Z turn)', 'KeyA'),
	tool('toolRight', 'Move right (+X), or roll back', 'KeyD'),
	tool('toolFore', 'Move forward (+Z), or yaw (+Y turn)', 'KeyQ'),
	tool('toolAft', 'Move back (-Z), or yaw back', 'KeyE'),
	tool('toolFrame', 'Local or absolute axes', 'KeyF'),
	tool('toolReset', 'Reset the offset or the rotation', 'KeyR'),
	eva('evaForward', 'Walk or fly forward (climb up a ladder)', 'KeyW'),
	eva('evaBack', 'Walk or fly back (climb down a ladder)', 'KeyS'),
	eva('evaLeft', 'Walk or fly left', 'KeyA'),
	eva('evaRight', 'Walk or fly right', 'KeyD'),
	eva('evaRun', 'Run (jetpack: up)', 'ShiftLeft'),
	eva('evaDown', 'Jetpack: down', 'ControlLeft'),
	eva('evaTurnLeft', 'Jetpack: turn left', 'KeyQ'),
	eva('evaTurnRight', 'Jetpack: turn right', 'KeyE'),
	eva('evaJump', 'Jump (let go of a ladder)', 'Space'),
	eva('evaJetpack', 'Jetpack on or off', 'KeyR'),
	eva('evaGrab', 'Grab or let go of a ladder', 'KeyF'),
	eva('evaBoard', 'Board at a hatch or ladder', 'KeyB'),
	eva('evaHelmet', 'Helmet on or off (breathable air only)', 'KeyO'),
	// P is pause on every page (plan 205), so the personal chute takes U (ADR 0237)
	eva('evaChute', 'Personal parachute: deploy, then cut', 'KeyU')
] as const satisfies readonly ActionSpec[];

export type ActionId = (typeof ACTIONS)[number]['id'];

/**
 * Where the KSP profile differs from `ACTIONS` (whose defaults are the classic profile; ADR 0206):
 * brakes held on B (plan 245), action groups on the digits, SAS modes and the trim on Alt, the vessel keys on the
 * brackets, the camera on V and translate-back on N, so the mute moves to Ctrl+M and the speed
 * reference to a click on its read-out.
 */
const KSP_DEFAULTS: Partial<Record<string, readonly string[]>> = {
	brakes: [],
	brakesHold: ['KeyB'],
	sasHold: ['Alt+Digit1'],
	sasPrograde: ['Alt+Digit2'],
	sasRetrograde: ['Alt+Digit3'],
	sasNormal: ['Alt+Digit4'],
	sasAntinormal: ['Alt+Digit5'],
	sasRadialOut: ['Alt+Digit6'],
	sasRadialIn: ['Alt+Digit7'],
	sasManeuver: ['Alt+Digit8'],
	sasTarget: ['Alt+Digit9'],
	sasAntiTarget: ['Alt+Digit0'],
	...Object.fromEntries(
		Array.from({ length: 10 }, (_, i) => [
			`customGroup${i + 1}`,
			[`Digit${(i + 1) % 10}`, `Numpad${(i + 1) % 10}`]
		])
	),
	trimUp: ['Alt+KeyS'],
	trimDown: ['Alt+KeyW'],
	speedMode: [],
	mute: ['Ctrl+KeyM'],
	translateBack: ['KeyN'],
	vesselNext: [']'],
	vesselPrev: ['['],
	cameraMode: ['KeyV']
};

/** The defaults of an action in a profile. */
export function profileDefaults(profile: KeyProfile, id: ActionId): readonly string[] {
	const spec = actionSpec(id);
	return (profile === 'ksp' ? KSP_DEFAULTS[id] : undefined) ?? spec.defaults;
}

/** The clash scopes an action's keys occupy. */
const slotsOf = (a: ActionSpec): BindingScope[] =>
	a.global ? ['flight', 'map', 'vab'] : [scopeOf(a.mode)];

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

/** Key ids no action may take: they have fixed jobs (pause menu, camera). Backspace is Abort since plan 216. */
export const RESERVED_KEYS: readonly string[] = [
	'Escape',
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

const MODIFIER_KEYS = new Set(['ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft']);
const CHORD = /^((?:Ctrl|Alt|Cmd)\+)+/;

/**
 * The chord id of a keyboard event: the key id with the held Ctrl, Alt and Cmd in front, in that
 * order (`Alt+Digit1`). A modifier pressed on its own is its plain key id. Alt and Option change the
 * character on macOS, so a chord's key is always the `code` (letters, digits) or the unshifted
 * punctuation of the key id.
 */
export function chordIdOf(e: {
	key: string;
	code: string;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
}): string {
	const base = FOLD[e.code] ?? e.code;
	if (MODIFIER_KEYS.has(base)) return base;
	const mods = `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.metaKey ? 'Cmd+' : ''}`;
	// with a modifier the character is unreliable (Option+2 types ™): use the code
	return mods === '' ? keyIdOf(e) : mods + base;
}

/** The key of a chord without its modifiers (`Alt+KeyW` → `KeyW`). */
export const chordKey = (id: string): string => id.replace(CHORD, '');

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
	const mods = CHORD.exec(id)?.[0];
	if (mods && id.length > mods.length) return mods + keyLabel(id.slice(mods.length));
	const named = NAMED[id];
	if (named) return named;
	if (/^Key[A-Z]$/.test(id)) return id.slice(3);
	if (/^Digit\d$/.test(id)) return id.slice(5);
	if (/^Numpad\d$/.test(id)) return `Num ${id.slice(6)}`;
	if (id === 'CapsLock') return 'Caps Lock';
	if (id === 'PageUp') return 'Page Up';
	if (id === 'PageDown') return 'Page Down';
	return id;
}

/** True for what the capture field may store: a real key id or chord, not reserved, not a bare Meta. */
export function bindableKey(id: string): boolean {
	const key = chordKey(id);
	return (
		id.length > 0 &&
		id.length <= 32 &&
		key.length > 0 &&
		!RESERVED_KEYS.includes(key) &&
		key !== 'MetaLeft'
	);
}

/** The profile's defaults, or the overrides where the player changed an action. */
export function resolveBindings(
	overrides: Bindings = {},
	profile: KeyProfile = 'classic'
): KeyTable {
	const table = {} as Record<string, readonly string[]>;
	for (const a of ACTIONS)
		table[a.id] = overrides[a.id as ActionId] ?? profileDefaults(profile, a.id as ActionId);
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

/** Drop overrides equal to the profile's defaults so the stored value only holds real changes. */
function normalise(overrides: Bindings, profile: KeyProfile): Bindings {
	const out: Bindings = {};
	for (const a of ACTIONS) {
		const keys = overrides[a.id as ActionId];
		if (keys === undefined) continue;
		const defaults = profileDefaults(profile, a.id as ActionId);
		if (keys.length === defaults.length && keys.every((k, i) => k === defaults[i])) continue;
		out[a.id as ActionId] = keys;
	}
	return out;
}

export type RebindResult =
	| { ok: true; bindings: Bindings }
	| { ok: false; reason: 'reserved' }
	| { ok: false; reason: 'clash'; with: ActionId };

/** Give `id` the single key `key`. A key another action of the same scope uses is a clash. */
export function rebind(
	bindings: Bindings,
	id: ActionId,
	key: string,
	profile: KeyProfile = 'classic'
): RebindResult {
	if (!bindableKey(key)) return { ok: false, reason: 'reserved' };
	const clash = findClash(resolveBindings(bindings, profile), id, key);
	if (clash !== null) return { ok: false, reason: 'clash', with: clash };
	return { ok: true, bindings: normalise({ ...bindings, [id]: [key] }, profile) };
}

/** `id` takes `key`, and the action that had it takes all of `id`'s previous keys. */
export function swapBindings(
	bindings: Bindings,
	id: ActionId,
	key: string,
	profile: KeyProfile = 'classic'
): Bindings {
	const table = resolveBindings(bindings, profile);
	const other = findClash(table, id, key);
	if (other === null) return normalise({ ...bindings, [id]: [key] }, profile);
	return normalise({ ...bindings, [id]: [key], [other]: table[id] }, profile);
}

export function resetBinding(bindings: Bindings, id: ActionId): Bindings {
	const next = { ...bindings };
	delete next[id];
	return next;
}

/** The overrides that clash in `profile` (each is involved in a clash with another action). */
export function clashingOverrides(bindings: Bindings, profile: KeyProfile): ActionId[] {
	const table = resolveBindings(bindings, profile);
	return ACTIONS.filter(
		(a) =>
			bindings[a.id as ActionId] !== undefined &&
			table[a.id as ActionId].some((k) => findClash(table, a.id as ActionId, k) !== null)
	).map((a) => a.id as ActionId);
}

/**
 * Switch the profile (plan 216): every override that does not clash in the new profile stays. The
 * ones that do are listed for the player, who keeps each (and the other action falls back to the
 * profile) or takes the profile's keys; `keep` names the overrides to keep.
 */
export function switchProfile(
	bindings: Bindings,
	to: KeyProfile,
	keep: readonly ActionId[] = []
): { bindings: Bindings; clashes: ActionId[] } {
	const clashes = clashingOverrides(bindings, to);
	let next: Bindings = normalise(bindings, to);
	for (const id of clashes) {
		if (keep.includes(id)) {
			// the player keeps this key: the other action keeps the profile's other keys, if it has any
			const table = resolveBindings(next, to);
			for (const key of next[id] ?? []) {
				const other = findClash(table, id, key);
				const rest = other === null ? [] : table[other].filter((k) => k !== key);
				if (other !== null && rest.length > 0) next = { ...next, [other]: rest };
			}
		} else next = resetBinding(next, id);
	}
	return { bindings: repairBindings(next as Record<string, unknown>, to), clashes };
}

/**
 * A stored value made safe (ADR 0061, point 4): unknown actions, empty or reserved keys and
 * overrides that clash with another action fall back to that action's defaults.
 */
export function repairBindings(
	raw: Readonly<Record<string, unknown>>,
	profile: KeyProfile = 'classic'
): Bindings {
	let candidate: Bindings = {};
	for (const a of ACTIONS) {
		const value = raw[a.id];
		if (!Array.isArray(value)) continue;
		const keys = [...new Set(value.filter((k): k is string => typeof k === 'string'))].slice(0, 4);
		if (keys.length === 0 || !keys.every(bindableKey)) continue;
		candidate[a.id as ActionId] = keys;
	}
	candidate = normalise(candidate, profile);
	// Drop the overrides involved in a clash until none is left (the defaults do not clash).
	for (let guard = 0; guard < ACTIONS.length; guard++) {
		const bad = clashingOverrides(candidate, profile)[0];
		if (bad === undefined) break;
		candidate = resetBinding(candidate, bad);
	}
	return candidate;
}

export interface Keymap {
	/** The profile under the player's overrides. */
	readonly profile: KeyProfile;
	keys(id: ActionId): readonly string[];
	/** The action a key id triggers in a scope, or null. */
	actionFor(scope: BindingScope, key: string): ActionId | null;
	/** The first key of an action as shown on a key cap ("" if it has none). */
	label(id: ActionId): string;
	/** Key caps of an action: every key, labelled. */
	labels(id: ActionId): string[];
}

export function createKeymap(bindings: Bindings = {}, profile: KeyProfile = 'classic'): Keymap {
	const table = resolveBindings(bindings, profile);
	const lookup = new Map<string, ActionId>();
	for (const a of ACTIONS) {
		for (const k of table[a.id as ActionId])
			for (const scope of slotsOf(a)) lookup.set(`${scope}:${k}`, a.id as ActionId);
	}
	return {
		profile,
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
			{ actions: ['stage'], text: 'Fire the next stage' },
			{ actions: ['gear', 'lights'], text: 'Landing gear, lights' },
			{
				actions: ['abort'],
				text: 'Abort: stop programs, cut the engines, fire the Abort group (set in the Hangar)'
			},
			{ actions: ['programStop'], text: 'Stop the autopilot and script flying this vessel' },
			{ actions: ['precision'], text: 'Fine control (Caps Lock on)' }
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
		id: 'rcs',
		title: 'RCS',
		mode: 'flight',
		rows: [
			{ actions: ['rcsToggle'], text: 'RCS on or off' },
			{ actions: ['translateForward', 'translateBack'], text: 'Translate forward, back' },
			{ actions: ['translateLeft', 'translateRight'], text: 'Translate left, right' },
			{ actions: ['translateDown', 'translateUp'], text: 'Translate down, up' }
		]
	},
	{
		id: 'aircraft',
		title: 'Aircraft',
		mode: 'flight',
		rows: [
			{ actions: ['trimUp', 'trimDown'], text: 'Trim nose up, down' },
			{ actions: ['trimYawLeft', 'trimYawRight'], text: 'Trim yaw left, right' },
			{ actions: ['trimRollLeft', 'trimRollRight'], text: 'Trim roll left, right' },
			{ actions: ['trimReset'], text: 'Reset the trim' },
			{ actions: ['brakes'], text: 'Brakes on or off' },
			{ actions: ['brakesHold'], text: 'Brakes while the key is held' }
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
			{ actions: ['vesselPrev', 'vesselNext'], text: 'Previous, next vessel within 2.5 km' },
			{ actions: [], fixed: ['Drag', 'Wheel'], text: 'Orbit and zoom the camera' },
			{ actions: ['cameraMode'], text: 'Camera mode: Auto, Free, Orbital, Locked' },
			{
				actions: ['cameraReset'],
				fixed: ['Middle click'],
				text: 'Camera on a part, back on the vessel'
			},
			{ actions: ['hideUi'], text: 'Hide the interface (Esc shows it again)' },
			{ actions: ['screenshot'], text: 'Screenshot (PNG download)' }
		]
	},
	{
		id: 'time',
		title: 'Time and menus',
		mode: 'flight',
		rows: [
			{ actions: ['warpDown', 'warpUp'], text: 'Time warp down, up' },
			{ actions: ['stopWarp'], text: 'Stop time warp (back to 1×)' },
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
			{
				actions: [],
				fixed: ['Drag'],
				text: 'Drag a placed part to carry it with what hangs on it; drop it on the catalogue to delete it'
			},
			{ actions: [], fixed: ['Alt+Click'], text: 'Copy a part and what hangs on it' },
			{ actions: [], fixed: ['Wheel'], text: 'Move the view up and down (Shift or Ctrl: zoom)' },
			{ actions: [], fixed: ['Middle click'], text: 'Centre the view on a part' },
			{ actions: ['symmetry'], text: 'Symmetry: 1 to 8 copies (Shift: fewer)' },
			{ actions: ['mirror'], text: 'Mirror symmetry on or off' },
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
		id: 'carry',
		title: 'Carrying a part',
		mode: 'carry',
		rows: [
			{ actions: ['pitchUp', 'pitchDown'], text: 'Pitch the carried part (Shift: 5 degrees)' },
			{ actions: ['rollLeft', 'rollRight'], text: 'Roll it' },
			{ actions: ['yawLeft', 'yawRight'], text: 'Yaw it' },
			{ actions: ['turnReset'], text: 'Reset its turn' },
			{ actions: ['angleSnap'], text: 'Angle snap on or off' }
		]
	},
	{
		id: 'tool',
		title: 'Move and rotate tools',
		mode: 'tool',
		rows: [
			{ actions: ['toolPlace', 'toolMove', 'toolRotate'], text: 'Place, Move or Rotate tool' },
			{
				actions: ['toolUp', 'toolDown'],
				text: 'Move: up, down 0.1 m (Shift 0.01 m). Rotate: pitch 15 degrees (Shift 5)'
			},
			{ actions: ['toolLeft', 'toolRight'], text: 'Move: left, right. Rotate: roll' },
			{ actions: ['toolFore', 'toolAft'], text: 'Move: forward, back. Rotate: yaw' },
			{ actions: ['toolFrame'], text: 'Local (the part’s) or absolute (the vessel’s) axes' },
			{ actions: ['toolReset'], text: 'Reset the offset (Move) or the rotation (Rotate)' },
			{
				actions: [],
				fixed: ['Drag'],
				text: 'Drag an arrow or a ring of the gizmo (Shift: fine, Alt: no snap)'
			},
			{ actions: ['snapNodes'], text: 'Snap to nodes on or off: off places on any surface' }
		]
	},
	{
		id: 'eva',
		title: 'On EVA',
		mode: 'eva',
		rows: [
			{
				actions: ['evaForward', 'evaLeft', 'evaBack', 'evaRight'],
				text: 'Walk, relative to the view'
			},
			{ actions: ['evaRun'], text: 'Run; with the jetpack on, up' },
			{ actions: ['evaJump'], text: 'Jump; on a ladder, let go' },
			{ actions: ['evaJetpack'], text: 'Jetpack on or off' },
			{ actions: ['evaDown'], text: 'Jetpack: down' },
			{ actions: ['evaTurnLeft', 'evaTurnRight'], text: 'Jetpack: turn' },
			{ actions: ['evaGrab'], text: 'Grab a ladder within 1 m, or let go' },
			{ actions: ['evaBoard'], text: 'Board at a hatch or from a ladder' },
			{ actions: ['evaHelmet'], text: 'Helmet on or off; off only in breathable air' },
			{ actions: ['evaChute'], text: 'Personal parachute: deploy, then cut the canopy' }
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
