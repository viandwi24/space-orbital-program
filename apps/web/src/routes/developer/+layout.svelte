<script lang="ts">
	import DevShell from '../../lib/dev/DevShell.svelte';
	import type { LayoutProps } from './$types';

	/** Every developer page in one frame with Back, Main menu and the tabs (plan 375). */
	let { children }: LayoutProps = $props();
</script>

<DevShell>{@render children()}</DevShell>
