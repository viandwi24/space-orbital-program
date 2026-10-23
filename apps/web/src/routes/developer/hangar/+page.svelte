<script lang="ts">
	/**
	 * The sandbox Hangar (plan 375): the world Hangar's screen with no world. Every part of the loaded
	 * plugins (with the viewers' "Include disabled mods" switch, those too), no tech tree and no
	 * funds, its own library, the studio look by default. `?blueprint=<id>` opens a blueprint (the
	 * Blueprints tab's Open in the Hangar).
	 */
	import HangarPage from '../../../lib/vab/HangarPage.svelte';
	import { devPlugins, readIncludeDisabled } from '../../../lib/dev/dev-content';

	const blueprint =
		typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('blueprint');
	const withDisabled = readIncludeDisabled();
</script>

<svelte:head><title>Hangar sandbox · Developer</title></svelte:head>

{#if withDisabled}
	{#await devPlugins(true) then dev}
		<HangarPage sandbox {blueprint} plugins={dev.plugins} />
	{/await}
{:else}
	<HangarPage sandbox {blueprint} />
{/if}
