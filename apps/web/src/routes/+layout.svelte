<script lang="ts">
	import '@fontsource/barlow-semi-condensed/latin-400.css';
	import '@fontsource/barlow-semi-condensed/latin-500.css';
	import '@fontsource/barlow-semi-condensed/latin-600.css';
	import '@fontsource/ibm-plex-mono/latin-400.css';
	import '@fontsource/ibm-plex-mono/latin-500.css';
	import '#lib/ui/tokens.css';
	import '#lib/ui/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
