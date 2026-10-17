<script lang="ts">
	import { ICONS, isIconName } from './icons';

	let {
		name,
		path,
		size = 20
	}: {
		name?: string;
		/** Path data on the 24 x 24 grid instead of a named icon (a mod's category, plan 069). */
		path?: string;
		size?: number;
	} = $props();
	// An unknown name draws the part icon (ADR 0146 point 4).
	const d = $derived(path ?? (name !== undefined && isIconName(name) ? ICONS[name] : ICONS.part));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	<path {d} />
</svg>
