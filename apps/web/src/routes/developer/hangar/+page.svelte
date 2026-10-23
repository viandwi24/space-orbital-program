<script lang="ts">
	/**
	 * The sandbox Hangar (plan 375): the world Hangar's screen with no world. Every part of the loaded
	 * plugins, no tech tree and no funds, its own library, the studio look by default.
	 * `?blueprint=<id>` opens a blueprint (the Blueprints tab's Open in the Hangar).
	 */
	import HangarPage from '../../../lib/vab/HangarPage.svelte';

	const blueprint =
		typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('blueprint');
</script>

<svelte:head><title>Hangar sandbox · Developer</title></svelte:head>

<HangarPage sandbox {blueprint} />
