<script lang="ts">
	import '@fontsource/barlow-semi-condensed/latin-400.css';
	import '@fontsource/barlow-semi-condensed/latin-500.css';
	import '@fontsource/barlow-semi-condensed/latin-600.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '#lib/ui/tokens.css';
	import '#lib/ui/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { detectInBrowser, missingFeatures } from '../lib/browser-support';
	import { settings } from '../lib/settings/settings.svelte';
	import BrowserNotice from '../lib/ui/BrowserNotice.svelte';
	import ErrorScreen from '../lib/ui/ErrorScreen.svelte';
	import LoadingScreen from '../lib/ui/LoadingScreen.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The game starts only once the browser is known to be able to run it (plan 032, ADR 0040).
	let missing = $state<string[] | null>(null);
	onMount(() => {
		settings.start();
		missing = missingFeatures(detectInBrowser());
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href="/favicon.png" type="image/png" sizes="64x64" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</svelte:head>

{#if missing === null}
	<LoadingScreen step="Checking your browser" />
	<noscript><p class="nojs">Orbital needs JavaScript to run.</p></noscript>
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

<style>
	.nojs {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		background: var(--bg-void);
	}
</style>
