<!--
	What one mod's data patches changed on the running page (plan 079, ADR 0170): per field, the
	entry, the path, the old and new value and the plugin that made the change; a patch that did not
	apply shows its reason.
-->
<script lang="ts">
	import type { PatchReport } from '@orbital/core';
	import { patchChangeLabel } from './format';

	let { patches }: { patches: readonly PatchReport[] } = $props();
</script>

{#if patches.length > 0}
	<ul class="patches" aria-label="Data this mod patches">
		{#each patches as patch (patch.id)}
			{#if patch.disabled}
				<li class="bad">
					Patch <code>{patch.id}</code> did not apply: {patch.disabled}
				</li>
			{:else if patch.changes.length === 0}
				<li class="dim">Patch <code>{patch.id}</code> matched nothing</li>
			{:else}
				{#each patch.changes as change, i (i)}
					<li>
						<code>{change.entry}</code> · <code>{change.path}</code> ·
						<span class="num">{patchChangeLabel(change)}</span>, patched by
						<code>{patch.by}</code>
					</li>
				{/each}
			{/if}
		{/each}
	</ul>
{/if}

<style>
	.patches {
		list-style: none;
		margin: var(--s-1) 0 0;
		padding: 0;
		display: grid;
		gap: var(--s-1);
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.patches li {
		overflow-wrap: anywhere;
	}
	.bad {
		color: var(--c-danger, #ff8a7a);
	}
	.num {
		font-family: var(--font-num);
		color: var(--text);
	}
	code {
		font-family: var(--font-num);
		font-size: 0.9em;
	}
</style>
