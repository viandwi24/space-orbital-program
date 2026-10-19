<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { GAME_NAME } from '../lib/public/about';
	import '@fontsource/manrope/latin-300.css';
	import '@fontsource/manrope/latin-400.css';
	import '@fontsource/manrope/latin-500.css';
	import '@fontsource/manrope/latin-600.css';
	import '@fontsource/manrope/latin-700.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '#lib/ui/tokens.css';
	import '#lib/ui/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { applyAudioSettings, pageAudio } from '../lib/audio/audio';
	import { musicForPath } from '../lib/audio/cues';
	import { detectInBrowser, missingFeatures } from '../lib/browser-support';
	import { chordIdOf } from '../lib/keybindings';
	import { settings } from '../lib/settings/settings.svelte';
	import BrowserNotice from '../lib/ui/BrowserNotice.svelte';
	import TooltipLayer from '../lib/ui/TooltipLayer.svelte';
	import ErrorScreen from '../lib/ui/ErrorScreen.svelte';
	import SmallScreenNotice from '../lib/ui/SmallScreenNotice.svelte';
	import LoadingScreen from '../lib/ui/LoadingScreen.svelte';
	import { describeError, dismissFatal, fatal, fatalSave } from '../lib/fatal-error.svelte';
	import { logBuffer } from '../lib/log-buffer';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The game starts only once the browser is known to be able to run it (plan 032, ADR 0040).
	let missing = $state<string[] | null>(null);
	onMount(() => {
		settings.start();
		// once after the key profiles arrived (plan 216, ADR 0206 point 5): say which keys are in force
		if (settings.keyNotice) {
			note =
				settings.keyProfile === 'ksp'
					? "Keys now follow KSP's. Orbital classic is in Settings, Controls."
					: "Your changed keys stay on Orbital classic. KSP's keys are in Settings, Controls.";
			noteTimer = setTimeout(() => (note = null), 8000);
			settings.dismissKeyNotice();
		}
		missing = missingFeatures(detectInBrowser());
		// The engine listens for the first gesture from here on (autoplay policy, plan 053).
		pageAudio();
		const typing = (e: Event): boolean => {
			const t = e.target;
			return (
				t instanceof HTMLTextAreaElement ||
				t instanceof HTMLInputElement ||
				(t instanceof HTMLElement && t.isContentEditable)
			);
		};
		// The mute key works on every page, and it says what it did.
		const onKey = (e: KeyboardEvent): void => {
			if (e.repeat || typing(e)) return;
			// a chord since plan 216 (Ctrl+M in the KSP profile); a plain key only without modifiers
			if (settings.keymap.actionFor('flight', chordIdOf(e)) !== 'mute') return;
			e.preventDefault();
			settings.setAudio({ muted: !settings.audio.muted });
			note = settings.audio.muted ? 'Sound muted' : 'Sound on';
			clearTimeout(noteTimer);
			noteTimer = setTimeout(() => (note = null), 1600);
		};
		// A small tick on every button, tab and link press (the UI volume).
		const onClick = (e: MouseEvent): void => {
			const el =
				e.target instanceof Element
					? e.target.closest('button, a[href], [role="tab"], [role="radio"]')
					: null;
			if (!el || el.closest('[data-silent]') || (el instanceof HTMLButtonElement && el.disabled))
				return;
			pageAudio().oneShot('click');
		};
		window.addEventListener('keydown', onKey);
		document.addEventListener('click', onClick, { capture: true });
		return () => {
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('click', onClick, { capture: true });
			clearTimeout(noteTimer);
		};
	});
	/** The error card's "Save and reload": the world is saved first (a failed save still reloads). */
	async function saveAndReload(): Promise<void> {
		try {
			await fatalSave.current?.();
		} catch (error) {
			logBuffer.add('error', 'save', `save before reload failed: ${describeError(error)}`);
		}
		location.reload();
	}
	let note = $state<string | null>(null);
	let noteTimer: ReturnType<typeof setTimeout> | undefined;
	// Volumes and mute from the settings reach the engine (and wait for it before the first gesture).
	$effect(() => {
		applyAudioSettings({ ...settings.audio });
	});
	// The ambient bed of the page (plan 227): crossfades when the player moves between screens.
	$effect(() => {
		const home = resolve('/');
		const path = page.url.pathname;
		const local = path.startsWith(home) ? '/' + path.slice(home.length) : path;
		pageAudio().setMusic(musicForPath(local));
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href={asset('favicon.png')} type="image/png" sizes="64x64" />
	<link rel="apple-touch-icon" href={asset('apple-touch-icon.png')} />
</svelte:head>

{#if missing === null}
	<LoadingScreen step="Checking your browser" />
	<noscript><p class="nojs">{GAME_NAME} needs JavaScript to run.</p></noscript>
{:else if missing.length > 0}
	<BrowserNotice {missing} />
{:else}
	<!-- A page that throws shows the error screen with a way out instead of a blank page (plan 023). -->
	<svelte:boundary>
		{@render children()}
		{#snippet failed(error)}
			<ErrorScreen
				message={error instanceof Error ? error.message : String(error)}
				onreload={() => location.reload()}
			/>
		{/snippet}
	</svelte:boundary>
{/if}

<!-- An uncaught error or rejection outside rendering (plan 202): a card over the page, not a dead page. -->
{#if fatal.current}
	<ErrorScreen
		overlay
		message={fatal.current.message}
		onreload={() => location.reload()}
		onsave={fatalSave.current ? saveAndReload : undefined}
		ondismiss={dismissFatal}
	/>
{/if}

{#if missing?.length === 0 && !([resolve('/roadmap'), resolve('/credits'), resolve('/glossary')] as string[]).includes(page.url.pathname)}<SmallScreenNotice
	/>{/if}

{#if note}<p class="note" role="status" data-testid="audio-note">{note}</p>{/if}

<!-- the page's one tooltip for every [data-tip] (plan 228) -->
<TooltipLayer />

<style>
	.note {
		position: fixed;
		z-index: 50;
		left: 50%;
		bottom: 96px;
		transform: translateX(-50%);
		margin: 0;
		padding: var(--s-2) var(--s-4);
		font-size: var(--t-sm);
		background: var(--panel-solid);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		pointer-events: none;
	}
	.nojs {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		background: var(--bg-void);
	}
</style>
