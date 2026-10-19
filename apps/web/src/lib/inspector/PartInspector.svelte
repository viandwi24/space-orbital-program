<script lang="ts">
	/**
	 * The part inspector (plan 214, ADR 0205 point 2): one part's name, its state and controls from its
	 * descriptors with typed values and "More", its action groups, its temperature while hot; Pin keeps
	 * it open (three at most), Highlight lights it in the view. One component for Flight and, with
	 * plan 218, the Hangar: the contract is `part`, `pinned`, `oncommand`.
	 */
	import type { Command, EntityId } from '@orbital/core';
	import Panel from '../ui/Panel.svelte';
	import Button from '../ui/Button.svelte';
	import ControlRows from '../vessel-panel/ControlRows.svelte';
	import { controlCommand, type ControlRow, type PartRow } from '../vessel-panel/vessel-model';

	let {
		vessel,
		part,
		pinned = false,
		oncommand,
		onpin,
		onclose,
		onhighlight,
		onfocus
	}: {
		vessel: EntityId;
		part: PartRow;
		pinned?: boolean;
		oncommand: (command: Command) => void;
		onpin: () => void;
		onclose: () => void;
		onhighlight: (part: EntityId | null) => void;
		/** Point the flight camera at this part (plan 226); absent in the Hangar. */
		onfocus?: (part: EntityId) => void;
	} = $props();

	let problem = $state<string | null>(null);
	function send(id: EntityId, c: ControlRow, value?: boolean | number | string): void {
		const r = controlCommand(vessel, id, c, value);
		if ('reason' in r) problem = r.reason;
		else {
			problem = null;
			oncommand(r.command);
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions: hover lights the part in the view -->
<div
	class="inspector"
	data-testid="inspector-{part.entity}"
	onmouseenter={() => onhighlight(part.entity)}
	onmouseleave={() => onhighlight(null)}
>
	<Panel title={part.title}>
		{#snippet aside()}
			<span class="tools">
				<button
					type="button"
					aria-pressed={pinned}
					aria-label={pinned ? 'Unpin' : 'Pin'}
					data-tip={pinned ? 'Unpin' : 'Pin: keep it open (three at most)'}
					data-testid="inspector-{part.entity}-pin"
					onclick={onpin}>{pinned ? 'Pinned' : 'Pin'}</button
				>
				<button
					type="button"
					aria-label="Close"
					data-testid="inspector-{part.entity}-close"
					onclick={onclose}>✕</button
				>
			</span>
		{/snippet}
		{#if onfocus}
			<div class="row">
				<Button onclick={() => onfocus(part.entity)} data-testid="inspector-{part.entity}-focus"
					>Focus camera</Button
				>
			</div>
		{/if}
		{#if part.controlPoint}
			<div class="row">
				<Button
					disabled={part.controlling}
					onclick={() => oncommand({ type: 'set-control-part', vessel, part: part.entity })}
					>{part.controlling ? 'Controlling from here' : 'Control from here'}</Button
				>
			</div>
		{/if}
		<ControlRows {part} {send} prefix="insp" typed />
		{#if part.controls.length === 0 && part.readouts.length === 0 && !part.heat}
			<p class="dim">No controls on this part.</p>
		{/if}
		{#if part.groups.length > 0}
			<p class="dim groups" data-testid="inspector-{part.entity}-groups">
				In {part.groups.join(', ')}
			</p>
		{/if}
		{#if problem}<p class="problem" role="status">{problem}</p>{/if}
	</Panel>
</div>

<style>
	.inspector {
		width: 20rem;
		pointer-events: auto;
	}
	.tools {
		display: flex;
		gap: 0.25rem;
	}
	.tools button {
		min-height: 1.75rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-secondary);
		background: var(--surface-button);
	}
	.tools button[aria-pressed='true'] {
		color: var(--selected-fg);
		background: var(--selected-bg);
	}
	.row {
		min-height: 2.75rem;
		display: flex;
		align-items: center;
	}
	.dim {
		margin: 0.25rem 0 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.problem {
		margin: 0.25rem 0 0;
		font-size: var(--t-small);
		color: var(--warn);
	}
</style>
