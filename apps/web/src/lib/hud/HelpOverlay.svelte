<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { BINDING_GROUPS, helpKeys } from '../keybindings';
	import { settings } from '../settings/settings.svelte';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	// One list feeds this overlay and the settings dialog (plan 023); the VAB keys show there only.
	const groups = BINDING_GROUPS.filter((g) => g.mode !== 'vab');
</script>

<Dialog {open} title="Controls" {onclose}>
	<div class="groups">
		{#each groups as g (g.title)}
			<section>
				<h3>{g.title}</h3>
				<dl>
					{#each g.rows as r (r.text)}
						{@const shown = helpKeys(r, settings.keymap)}
						<dt>
							{#each shown.caps as k, i (i)}{#if i > 0}<span class="or">{shown.joiner}</span
									>{/if}<Kbd>{k}</Kbd>{/each}
						</dt>
						<dd>{r.text}</dd>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
	<div class="foot"><Button variant="primary" onclick={onclose}>Close</Button></div>
</Dialog>

<style>
	.groups {
		display: grid;
		gap: var(--s-4);
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}
	h3 {
		margin: 0 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-dim);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--s-2) var(--s-3);
		margin: 0;
		align-items: center;
	}
	dt {
		display: flex;
		gap: 3px;
		align-items: center;
	}
	dd {
		margin: 0;
		font-size: var(--t-sm);
	}
	.or {
		color: var(--text-faint);
		font-size: var(--t-xs);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-5);
	}
</style>
