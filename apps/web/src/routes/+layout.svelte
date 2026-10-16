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
	import BrowserNotice from '../lib/ui/BrowserNotice.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The game starts only once the browser is known to be able to run it (plan 032, ADR 0040).
	let missing = $state<string[] | null>(null);
	onMount(() => {
		missing = missingFeatures(detectInBrowser());
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if missing === null}
	<noscript><p style="padding: 1rem">Orbital needs JavaScript.</p></noscript>
{:else if missing.length > 0}
	<BrowserNotice {missing} />
{:else}
	{@render children()}
{/if}
