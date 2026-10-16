<script lang="ts">
	import { ICONS, isIconName } from './icons';

	let { name, size = 20 }: { name: string; size?: number } = $props();
	const d = $derived(isIconName(name) ? ICONS[name] : ICONS.part);
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
