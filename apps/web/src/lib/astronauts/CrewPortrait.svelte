<script lang="ts">
	/**
	 * A crew member's face (plan 341, ADR 0291): the crew character's portrait for their id, outfit
	 * and mood, painted once on a canvas and cached.
	 */
	import { portraitUrl } from '@orbital/renderer/crew';
	import { portraitSpec, type PortraitMember } from './portrait-model';

	let { member, size = 40 }: { member: PortraitMember; size?: number } = $props();
	const src = $derived(portraitUrl(portraitSpec(member), size));
</script>

{#if src}
	<img class="face" {src} alt="" width={size} height={size} data-testid="crew-portrait" />
{:else}
	<span class="face" style="width:{size}px;height:{size}px" aria-hidden="true"></span>
{/if}

<style>
	.face {
		display: block;
		flex: none;
		border-radius: 50%;
	}
</style>
