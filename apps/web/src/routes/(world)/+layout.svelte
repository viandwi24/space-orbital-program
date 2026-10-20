<script lang="ts">
	/**
	 * The Base layout of every in-world page (plan 204, ADR 0201): it holds the world's one sim (the
	 * world session) from the first in-world page until the player leaves the world, the two-tab
	 * lock, the autosave cadence and the bars. Pages render only while this tab holds the world.
	 */
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		calendarOf,
		formatDate,
		homeBodyOf,
		type Epoch,
		type RuleValue,
		type Snapshot,
		type VesselDesign,
		type WorldInfo
	} from '@orbital/core';
	import DebugPanel from '../../lib/debug/DebugPanel.svelte';
	import SaveDialog from '../../lib/save/SaveDialog.svelte';
	import LoadDialog from '../../lib/save/LoadDialog.svelte';
	import { listEntries, withFallback } from '../../lib/vab/library';
	import { indexedDbStore } from '../../lib/vab/library-idb';
	import { partLookup } from '../../lib/catalog';
	import WorldShell from '../../lib/layout/WorldShell.svelte';
	import SettingsDialog from '../../lib/ui/SettingsDialog.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import { createBellFeed } from '../../lib/layout/status-bar';
	import { worldSession } from '../../lib/world-session';
	import { isTypingTarget } from '../../lib/typing-target';
	import { WARP_STEPS, warpStepsFor } from '../../lib/warp';
	import { bootWorld } from '../../lib/world-boot';
	import { createWorldLock, type LockState, type WorldLock } from '../../lib/world-lock';
	import { createAutosaver, type AutosaveReason } from '../../lib/save/autosave';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import type { SaveRequest } from '../../lib/save/saves';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { activePlugins } from '../../lib/mods/runtime';
	import { activeWorldId } from '../../lib/worlds/worlds';
	import { loadWorldCatalog } from '../../lib/worlds/catalog';
	import WorldSettingsDialog from '../../lib/worlds/WorldSettingsDialog.svelte';
	import { starterRocket } from '../../lib/design';
	import { scriptIsActive } from '../../lib/script-state';
	import {
		backupFileName,
		exportBackup,
		exportPromptDue,
		exported,
		remindLater
	} from '../../lib/save/backup';
	import { loadReminder, saveReminder } from '../../lib/save/backup-state';
	import { openSaveStore } from '../../lib/save/open-store';
	import { downloadText } from '../../lib/download';
	import type { Catalog } from '../../lib/messages';
	import { settings } from '../../lib/settings/settings.svelte';
	import { bodyLabel } from '../../lib/hud-model';
	import { keyIdOf } from '../../lib/keybindings';
	import { clockState, placePauses } from '../../lib/clock-state';
	import { createDebugApi, exposeDebugApi, flightDebug, type DebugHost } from '../../lib/debug/api';
	import { fatalSave } from '../../lib/fatal-error.svelte';
	import { lessonNotice, placeBlocked } from '../../lib/onboarding/lesson-gate.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** Paths of the in-world pages (the `(world)` group keeps their URLs). */
	const IN_WORLD = [
		'/flight',
		'/vab',
		'/space-center',
		'/mission-center',
		'/launch',
		'/astronauts',
		'/rnd',
		'/administration',
		'/test-stand',
		'/mods'
	];
	const PLACES: Record<string, string> = {
		'/flight': 'Flight',
		'/vab': 'Hangar',
		'/space-center': 'Space Center',
		'/mission-center': 'Mission Center',
		'/launch': 'Launch',
		'/astronauts': 'Astronaut Complex',
		'/rnd': 'R&D',
		'/administration': 'Administration',
		'/test-stand': 'Test Stand',
		'/mods': 'Mods'
	};
	const base = resolve('/').replace(/\/$/, '');
	const local = (path: string): string =>
		path.startsWith(base) ? path.slice(base.length) || '/' : path;
	const inWorld = (path: string): boolean =>
		IN_WORLD.some((p) => local(path) === p || local(path).startsWith(`${p}/`));
	const place = $derived(PLACES[local(page.url.pathname)] ?? '');

	const worldId = activeWorldId();
	let lockState = $state<LockState>('asking');
	let lock: WorldLock | null = null;
	let snapshot = $state.raw<Snapshot | null>(null);
	let warp = $state(1);
	/** The warp levels of the world's system (a Sol world adds 100k×). */
	let warpSteps = $state<readonly number[]>(WARP_STEPS);
	let catalog = $state.raw<Catalog | null>(null);
	let savedAt = $state<number | null>(null);
	let world = $state({ name: 'Legacy world', mode: 'Sandbox' });
	let settingsOpen = $state(false);
	/** The Debug panel on every page but Flight, which has its own with the flight's Info tab (plan 248). */
	let debugOpen = $state(false);
	let debugHost = $state.raw<DebugHost | null>(null);
	async function debugDesigns(): Promise<Array<{ name: string; design: VesselDesign }>> {
		if (!catalog) return [];
		try {
			const entries = await listEntries(
				withFallback(indexedDbStore()),
				partLookup(catalog),
				'vessel'
			);
			return entries.flatMap((e) => (e.ok ? [{ name: e.record.name, design: e.design }] : []));
		} catch {
			return [];
		}
	}
	/** A script runs in the world (plan 239): outside Flight a sign offers to go back or stop it. */
	let scriptRunning = $state(false);
	function stopScript(): void {
		worldSession.client?.stopScript();
		worldSession.scriptSandbox()?.close();
		scriptRunning = false;
	}
	// the backup reminder (plan 230): after the first hour of play, then weekly; "later" waits a day
	let backupDue = $state(false);
	$effect(() => {
		const tick = () => {
			const r = loadReminder();
			const next = { ...r, playedMs: r.playedMs + 60_000 };
			saveReminder(next);
			backupDue = exportPromptDue(next, Date.now());
		};
		backupDue = exportPromptDue(loadReminder(), Date.now());
		const timer = setInterval(tick, 60_000);
		return () => clearInterval(timer);
	});
	async function backupNow(): Promise<void> {
		const { store, worlds } = await openSaveStore();
		const now = Date.now();
		downloadText(JSON.stringify(await exportBackup(store, worlds, now)), backupFileName(now));
		saveReminder(exported(loadReminder(), now));
		backupDue = false;
	}
	// World settings during play (plan 230, ADR 0230): rules toward easier only, with the changelog
	let worldSettingsOpen = $state(false);
	let worldChangelog = $state.raw<WorldInfo['changelog']>([]);
	let worldSettingsNote = $state<string | null>(null);
	const worldRules = loadWorldCatalog().rules;
	async function refreshChangelog(): Promise<void> {
		const client = worldSession.client;
		if (!client) return;
		worldChangelog = (await client.save()).worldInfo.changelog;
		const id = worldSession.worldId ?? worldId;
		void saves.worldsService().then((w) => w.setChangelog(id, worldChangelog));
	}
	function openWorldSettings(): void {
		worldSettingsOpen = true;
		worldSettingsNote = null;
		void refreshChangelog();
	}
	async function setWorldRule(rule: string, value: RuleValue): Promise<void> {
		const r = await worldSession.client?.dispatch({ type: 'set-rule', rule, value });
		worldSettingsNote = r && !r.ok ? r.reason : null;
		if (r?.ok) {
			await refreshChangelog();
			await worldSession.saveNow();
		}
	}
	const bell = createBellFeed();
	// a changed debris cap reaches the running sim at once (plan 223)
	$effect(() => {
		const cap = settings.time.debrisCap;
		const client = worldSession.client;
		if (client)
			void client.ready
				.then(() => client.dispatch({ type: 'set-debris-cap', cap }))
				.catch(() => {});
	});

	// ---- the clock (plan 205, ADR 0201 points 4 to 8) -------------------------------------------
	let playerPaused = $state(false);
	let tabHidden = $state(false);
	let holds = $state(0);
	const pauseAllowed = $derived(snapshot?.rules?.['stock.pause-allowed'] !== false);
	const menuHeld = $derived(holds > 0 && placePauses('Menu', settings.time.places));
	const placeHere = $derived(placePauses(place, settings.time.places));
	const clockView = $derived(
		clockState({
			playerPaused,
			placePaused: placeHere || menuHeld,
			place: menuHeld && !placeHere ? 'Menu' : place,
			tabHidden,
			keepRunningHidden: settings.time.keepRunningHidden,
			pauseAllowed,
			warp
		})
	);
	let sentPause: boolean | null = null;
	let pausedClient: unknown = null;
	$effect(() => {
		const pause = !clockView.ticks;
		const client = worldSession.client;
		void snapshot; // a new client (boot or load) is told again
		if (!client || (pause === sentPause && client === pausedClient)) return;
		sentPause = pause;
		pausedClient = client;
		client.setPaused(pause);
	});
	function togglePause(): void {
		if (!pauseAllowed) {
			bell.push({ source: 'clock', text: 'This world does not allow pausing.' });
			return;
		}
		playerPaused = !playerPaused;
	}

	const calendarLengths = $derived.by(() => {
		if (!catalog?.bodies.length) return { day: 86_400, year: 365 * 86_400 };
		const c = calendarOf(catalog.bodies);
		return c.kind === 'fictional'
			? { day: c.dayLength, year: c.yearLength ?? Number.POSITIVE_INFINITY }
			: { day: 86_400, year: 365.25 * 86_400 };
	});
	const homeName = $derived.by(() => {
		const id = catalog?.home ?? catalog?.bodies.find((b) => b.parent === undefined)?.id;
		return id ? bodyLabel(id) : '';
	});

	const clock = $derived.by(() => {
		if (!snapshot || !catalog?.bodies.length) return '';
		const epoch: Epoch = catalog.epoch ?? { day: 0, fraction: 0 };
		return formatDate(calendarOf(catalog.bodies), epoch, snapshot.t).text;
	});

	// ---- autosave (ADR 0201 point 11) ----------------------------------------------------------
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		collect: () => collect(),
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		world: () => worldSession.worldId ?? worldId
	});
	// the Debug panel pauses like the menu (plan 257)
	$effect(() => {
		worldSession.hold('debug', debugOpen);
		return () => worldSession.hold('debug', false);
	});
	// a result of the menu's Save or Load shows for a few seconds
	$effect(() => {
		if (saves.note === null || saves.loadOpen || saves.saveOpen) return;
		const timer = setTimeout(() => (saves.note = null), 3500);
		return () => clearTimeout(timer);
	});
	const autosaver = createAutosaver(() => performance.now());
	let saving = false;

	/**
	 * A save of a world with no flight yet (plan 237): only an explicit `saveNow` writes one (a
	 * branch founded before the first launch); the envelope then carries the starter design and no
	 * focus. The timer keeps waiting for a flight.
	 */
	let saveWithoutFlight = false;

	/** The vessel in focus if it still exists, else the save's. */
	async function collect(): Promise<SaveRequest> {
		if (worldSession.collect) return worldSession.collect();
		const client = worldSession.client;
		const focus = worldSession.focus;
		const from = worldSession.base;
		const design =
			focus?.design ?? from?.design ?? (saveWithoutFlight ? starterRocket() : undefined);
		if (!client || !design) throw new Error('There is nothing to save in this world yet.');
		const alive = (id: number | null | undefined): number | null =>
			id != null && (snapshot?.vessels.some((v) => v.id === id) ?? false) ? id : null;
		const info = snapshot && catalog ? homeBodyOf(catalog.bodies) : undefined;
		return {
			sim: await client.save(),
			focus: alive(focus?.vessel ?? from?.focus),
			design,
			thumbnail: null,
			bodyRadius: info?.radius ?? 600_000
		};
	}
	const canSave = (): boolean =>
		worldSession.client !== null &&
		(worldSession.collect !== null || worldSession.focus !== null || worldSession.base !== null);

	async function save(reason: AutosaveReason | null): Promise<void> {
		if (reason === null || saving) return;
		saving = true;
		try {
			if (await saves.autosave()) {
				autosaver.saved();
				worldSession.saved();
			}
		} finally {
			saving = false;
		}
	}
	const autosaveState = () => ({ flying: canSave(), paused: false, busy: saving || saves.busy });

	// ---- leaving the world ---------------------------------------------------------------------
	let leaving = false;
	beforeNavigate((nav) => {
		const to = nav.to?.url;
		// a lesson closes some places (plan 229): the try is cancelled and its reason shown
		const closed = to && inWorld(to.pathname) ? placeBlocked(local(to.pathname)) : null;
		if (closed !== null && nav.type !== 'leave') {
			nav.cancel();
			lessonNotice.show(closed);
			return;
		}
		if (!to || inWorld(to.pathname) || leaving || nav.type === 'leave') return;
		// out of the world: save first, then go (the sim stops with the layout)
		nav.cancel();
		leaving = true;
		void save(autosaver.request('pagehide', autosaveState())).finally(() => void goto(to));
	});

	// a lesson's "closed" reason belongs to the page it was shown on (plan 229)
	afterNavigate(() => lessonNotice.clear());

	onMount(() => {
		const presets = loadWorldCatalog().presets;
		void saves.worldsService().then(async (w) => {
			const record = await w.get(worldId);
			if (!record) return;
			const preset =
				presets.find((p) => p.id === record.preset) ??
				presets.find((p) => p.id === `stock.${record.preset}`);
			world = { name: record.name, mode: preset?.label ?? record.preset };
		});

		lock = createWorldLock({
			worldId,
			tab: crypto.randomUUID(),
			channel: (name) => {
				const ch = new BroadcastChannel(name);
				return ch as unknown as import('../../lib/world-lock').ChannelLike;
			}
		});
		lockState = lock.state;
		const offLock = lock.onChange((s) => {
			lockState = s;
			// another tab took over: this one lets go of the sim
			if (s === 'blocked') worldSession.end();
		});

		let offClient: Array<() => void> = [];
		const attach = (): void => {
			for (const off of offClient) off();
			offClient = [];
			const client = worldSession.client;
			snapshot = worldSession.snapshot;
			void worldSession.client?.ready
				.then((r) => (warpSteps = warpStepsFor(r.systemId)))
				.catch(() => {});
			if (!client) return;
			// the debug API on every in-world page (plan 203, from the layout since plan 205)
			const host: DebugHost = {
				snapshot: () => worldSession.snapshot,
				vessel: () => {
					const id = worldSession.focus?.vessel ?? worldSession.base?.focus ?? null;
					return id === null ? null : (id as ReturnType<DebugHost['vessel']>);
				},
				send: (command) => client.dispatch(command),
				onSnapshot: (listener) => client.onSnapshot((s) => listener(s)),
				bodies: () => catalog?.bodies ?? [],
				home: () => catalog?.home ?? catalog?.bodies.find((b) => b.parent === undefined)?.id ?? '',
				notice: (toast) => flightDebug.current?.notice?.(toast),
				vesselOnScreen: () => flightDebug.current?.vesselOnScreen?.() ?? null,
				partOnScreen: (part) => flightDebug.current?.partOnScreen?.(part) ?? null
			};
			offClient.push(exposeDebugApi(window, createDebugApi(host), host));
			debugHost = host;
			offClient.push(() => (debugHost = null));
			void client.ready.then((c) => (catalog = c)).catch(() => {});
			// the player's debris cap (plan 223): a setting, not a world rule, so sent each session
			void client.ready
				.then(() => client.dispatch({ type: 'set-debris-cap', cap: settings.time.debrisCap }))
				.catch(() => {});
			// Debug mode from Settings on every in-world page (plan 203; Flight did it alone before
			// plan 236), and the world's "used cheats" mark
			let modeSent: boolean | null = null;
			let marked = false;
			offClient.push(
				client.onSnapshot((s, w) => {
					snapshot = s;
					if (w !== undefined) warp = w;
					const d = s.debug;
					if (d?.access === 'opt-in' && d.mode !== settings.debug && modeSent !== settings.debug) {
						modeSent = settings.debug;
						void client.dispatch({ type: 'debug-mode', on: settings.debug });
					}
					if (d?.usedCheats && !marked) {
						marked = true;
						void saves.worldsService().then((x) => x.markUsedCheats(worldId));
					}
				}),
				// a script keeps flying when the player leaves Flight (plan 239, ADR 0232)
				client.onScript((e) => {
					if (e.kind !== 'script-status') return;
					scriptRunning = scriptIsActive(e.status);
					// the script ended: the iframe goes, and with it a Worker still spinning (ADR 0038)
					if (!scriptRunning) worldSession.scriptSandbox()?.close();
				}),
				client.onSimEvent((e) => {
					if (e.type === 'vessel-destroyed')
						bell.push({ source: 'sim', text: `Vessel lost: ${e.reason}` });
					else if (e.type === 'soi-changed')
						bell.push({ source: 'sim', text: `A vessel entered ${e.to}` });
					else if (e.type === 'maneuver-complete')
						bell.push({ source: 'sim', text: 'A maneuver node was burned' });
					else if (e.type === 'alarm') bell.push({ source: 'alarm', text: `Alarm: ${e.name}` });
					else if (e.type === 'warp-stopped')
						bell.push({ source: 'clock', text: `Warp stopped: ${e.reason}` });
					else if (e.type === 'power-depleted')
						bell.push({ source: 'sim', text: 'Out of power: a probe is uncontrolled' });
					else if (e.type === 'vessel-frozen')
						bell.push({
							source: 'sim',
							text: `A vessel was frozen by time warp (${e.reason}); slow down to bring it back`
						});
					else if (e.type === 'building-ready')
						bell.push({
							source: 'construction',
							text: `Construction done: ${e.kind} level ${e.level}`
						});
				})
			);
		};
		const offSession = worldSession.onChange(() => {
			attach();
			savedAt = worldSession.savedAt;
		});
		// an event save inside the minimum gap is not dropped: it waits for the gap to pass
		let pending: 'stage' | 'landed' | 'change' | null = null;
		// the error card's "Save and reload" (plan 202): an autosave now, past the gap
		fatalSave.current = async () => {
			if (!canSave()) return false;
			const written = await saves.autosave();
			if (written) {
				autosaver.saved();
				worldSession.saved();
			}
			return written;
		};
		worldSession.requestSave = (reason) => {
			const now = autosaver.request(reason, autosaveState());
			if (now) void save(now);
			else pending = reason;
		};
		worldSession.openWorldSettings = openWorldSettings;
		worldSession.saveNow = async () => {
			if (worldSession.client === null || saving) return false;
			saveWithoutFlight = !canSave();
			try {
				await save('change');
			} finally {
				saveWithoutFlight = false;
			}
			return true;
		};

		const typing = (e: Event): boolean => {
			const t = e.target;
			return t instanceof HTMLElement && isTypingTarget(t);
		};
		// P pauses on every page; Space too where it has no job of its own (not Flight, not Hangar)
		const onKey = (e: KeyboardEvent): void => {
			if (e.altKey && e.code === 'F12' && !e.repeat && place !== 'Flight') {
				e.preventDefault();
				debugOpen = true;
				return;
			}
			if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
			const id = keyIdOf(e);
			const space = id === 'Space' && place !== 'Flight' && place !== 'Hangar' && place !== '';
			if (settings.keymap.actionFor('flight', id) !== 'pause' && !space) return;
			if (document.querySelector('dialog[open]')) return;
			e.preventDefault();
			togglePause();
		};
		let hiddenAt = 0;
		const onVisible = (): void => {
			tabHidden = document.visibilityState === 'hidden';
			if (tabHidden) hiddenAt = performance.now();
			else if (settings.time.keepRunningHidden && hiddenAt > 0) {
				// browsers slow a hidden tab down: the world catches up from the wall clock
				worldSession.client?.catchUp((performance.now() - hiddenAt) / 1000);
			}
		};
		window.addEventListener('keydown', onKey);
		document.addEventListener('visibilitychange', onVisible);
		const offHolds = worldSession.onChange(() => (holds = worldSession.holds.size));
		const timer = setInterval(() => {
			const due = pending ? autosaver.request(pending, autosaveState()) : null;
			if (due) pending = null;
			void save(due ?? autosaver.tick(autosaveState()));
		}, 1000);
		const onHidden = (): void => {
			if (document.visibilityState === 'hidden')
				void save(autosaver.request('hidden', autosaveState()));
		};
		const onPageHide = (): void => void save(autosaver.request('pagehide', autosaveState()));
		document.addEventListener('visibilitychange', onHidden);
		window.addEventListener('pagehide', onPageHide);
		return () => {
			clearInterval(timer);
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('visibilitychange', onVisible);
			offHolds();
			document.removeEventListener('visibilitychange', onHidden);
			window.removeEventListener('pagehide', onPageHide);
			for (const off of offClient) off();
			offSession();
			offLock();
			lock?.release();
			worldSession.requestSave = () => {};
			worldSession.saveNow = () => Promise.resolve(false);
			worldSession.openWorldSettings = () => {};
			fatalSave.current = null;
			worldSession.end();
		};
	});

	// the world's sim starts once this tab holds the world, whichever page opened first
	$effect(() => {
		if (lockState !== 'held') return;
		if (worldSession.client === null) void bootWorld(worldSession, worldId).catch(() => {});
	});
</script>

{#if lockState === 'blocked'}
	<main class="blocked" data-testid="world-blocked">
		<h1>This world is open in another tab</h1>
		<p>One tab runs a world at a time, so its clock and saves stay in one place.</p>
		<div class="row">
			<Button variant="primary" onclick={() => lock?.takeOver()} data-testid="world-take-over"
				>Take over</Button
			>
			<a href={resolve('/')}>Home</a>
		</div>
	</main>
{:else if lockState === 'held'}
	<WorldShell
		{snapshot}
		{warp}
		path={local(page.url.pathname)}
		calendar={calendarLengths}
		date={clock}
		{world}
		system={homeName ? `${homeName} system` : ''}
		{place}
		home={homeName}
		focus={worldSession.focus?.vessel ?? worldSession.base?.focus ?? null}
		{savedAt}
		mods={activePlugins().length}
		{bell}
		onsettings={() => (settingsOpen = true)}
		onworldsettings={openWorldSettings}
		onhome={() => void goto(resolve('/'))}
		clockChip={clockView.chip}
		paused={!clockView.ticks}
		pauseLocked={!pauseAllowed}
		onpause={togglePause}
		onsave={canSave() ? () => saves.showSave() : undefined}
		onload={() => void saves.showLoad()}
		ondebug={() => (debugOpen = true)}
		onchip={clockView.state === 'paused-place'
			? () => settings.setTime({ places: { [menuHeld && !placeHere ? 'Menu' : place]: false } })
			: undefined}
		{warpSteps}
		onwarp={(factor) => void worldSession.client?.dispatch({ type: 'warp', factor })}
	>
		{@render children()}
	</WorldShell>
	{#if lessonNotice.reason && local(page.url.pathname) !== '/flight'}
		<p class="lesson-notice" role="status" data-testid="lesson-notice">{lessonNotice.reason}</p>
	{/if}
	{#if local(page.url.pathname) !== '/flight'}
		<DebugPanel
			open={debugOpen}
			onclose={() => (debugOpen = false)}
			host={debugHost}
			info={() => null}
			resetFrames={() => {}}
			world={world.name}
			designs={debugDesigns}
		/>
		<SaveDialog {saves} suggestion={`${world.name} ${place}`.trim()} />
		<LoadDialog {saves} />
		{#if saves.note && !saves.loadOpen && !saves.saveOpen}
			<p class="savenote" class:error={saves.noteIsError} role="status">{saves.note}</p>
		{/if}
	{/if}
	<SettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />
	{#if scriptRunning && local(page.url.pathname) !== '/flight'}
		<div class="script-sign" role="status" data-testid="script-running">
			<span>A script is flying your vessel.</span>
			<button
				type="button"
				onclick={() => void goto(resolve('/(world)/flight'))}
				data-testid="script-back">Back to Flight</button
			>
			<button type="button" onclick={stopScript} data-testid="script-stop">Stop</button>
		</div>
	{/if}
	{#if backupDue}
		<div class="backup" role="status" data-testid="backup-prompt">
			<span>Back up your worlds: one file keeps every world and save safe from the browser.</span>
			<button type="button" onclick={() => void backupNow()} data-testid="backup-now"
				>Export now</button
			>
			<button
				type="button"
				onclick={() => {
					saveReminder(remindLater(loadReminder(), Date.now()));
					backupDue = false;
				}}
				data-testid="backup-later">Remind me later</button
			>
		</div>
	{/if}
	<WorldSettingsDialog
		open={worldSettingsOpen}
		rules={worldRules}
		values={snapshot?.rules ?? {}}
		changelog={worldChangelog}
		dayLength={calendarLengths.day}
		note={worldSettingsNote}
		onset={(rule, value) => void setWorldRule(rule, value)}
		onclose={() => (worldSettingsOpen = false)}
	/>
{/if}

<style>
	.blocked {
		display: grid;
		place-content: center;
		gap: var(--s-3);
		min-height: 100vh;
		padding: var(--s-5);
		text-align: center;
		color: var(--text-body);
	}
	.blocked h1 {
		margin: 0;
		font-weight: 300;
		color: var(--text-primary);
	}
	.script-sign {
		position: fixed;
		left: 50%;
		top: calc(5rem + var(--safe-top, 0px));
		transform: translateX(-50%);
		z-index: 45;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-left: 3px solid var(--accent-text);
		border-radius: var(--radius-card);
	}
	.script-sign button {
		padding: 0.25rem 0.625rem;
		font: inherit;
		color: var(--text-body);
		background: rgb(255 255 255 / 0.08);
		border: 0;
		border-radius: var(--radius-row);
		cursor: pointer;
	}
	.backup {
		position: fixed;
		left: 50%;
		bottom: calc(3.5rem + var(--safe-bottom, 0px));
		transform: translateX(-50%);
		z-index: 45;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		max-width: min(40rem, calc(100vw - 2rem));
		padding: var(--s-2) var(--s-3);
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-card);
	}
	.backup button {
		flex: none;
		padding: 0.25rem 0.625rem;
		font: inherit;
		color: var(--text-body);
		background: rgb(255 255 255 / 0.08);
		border: 0;
		border-radius: var(--radius-row);
		cursor: pointer;
	}
	.savenote {
		position: fixed;
		z-index: 45;
		top: calc(5rem + var(--safe-top));
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: var(--s-2, 0.5rem) var(--s-4, 1rem);
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
		pointer-events: none;
	}
	.savenote.error {
		border-color: var(--c-danger);
	}
	.lesson-notice {
		position: fixed;
		left: 50%;
		bottom: var(--s-6, 2rem);
		transform: translateX(-50%);
		max-width: 28rem;
		margin: 0;
		padding: var(--s-3) var(--s-4);
		font-size: var(--t-small);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-left: 3px solid var(--accent-text);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		z-index: 40;
	}
	.row {
		display: flex;
		gap: var(--s-4);
		justify-content: center;
		align-items: center;
	}
</style>
