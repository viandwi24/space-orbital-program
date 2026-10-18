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
	import { detectInBrowser, missingFeatures } from '../lib/browser-support';
	import { keyIdOf } from '../lib/keybindings';
	import { settings } from '../lib/settings/settings.svelte';
	import BrowserNotice from '../lib/ui/BrowserNotice.svelte';
	import ErrorScreen from '../lib/ui/ErrorScreen.svelte';
	import SmallScreenNotice from '../lib/ui/SmallScreenNotice.svelte';
	import LoadingScreen from '../lib/ui/LoadingScreen.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The game starts only once the browser is known to be able to run it (plan 032, ADR 0040).
	let missing = $state<string[] | null>(null);
	onMount(() => {
		settings.start();
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
			if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
			if (settings.keymap.actionFor('flight', keyIdOf(e)) !== 'mute') return;
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
	let note = $state<string | null>(null);
	let noteTimer: ReturnType<typeof setTimeout> | undefined;
	// Volumes and mute from the settings reach the engine (and wait for it before the first gesture).
	$effect(() => {
		applyAudioSettings({ ...settings.audio });
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

{#if missing?.length === 0 && !([resolve('/roadmap'), resolve('/credits')] as string[]).includes(page.url.pathname)}<SmallScreenNotice
	/>{/if}

{#if note}<p class="note" role="status" data-testid="audio-note">{note}</p>{/if}

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
