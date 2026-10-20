<script lang="ts">
	/**
	 * The action group editor (plan 218, ADR 0174 and 0225): pick a group, its parts light in the
	 * view; for a custom group, click a part and tick the switches and triggers it should fire.
	 * Stock groups follow the parts' own controls and are shown, not edited.
	 */
	import { EDITOR_SLOTS, customMembers, slotLabel } from '../editor/groups';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	const open = $derived(vab.groupPick !== null);
	const countOf = (slot: number): number =>
		new Set(customMembers(vab.current.design, slot).map((m) => m.part)).size;
	const label = $derived.by(() => {
		const pick = vab.groupPick;
		if (pick === null) return '';
		if (vab.groupSlot !== null) return slotLabel(vab.groupSlot);
		return vab.stockGroups.find((g) => g.id === pick)?.label ?? pick;
	});
</script>

<section class="groups" aria-label="Action groups" data-testid="group-editor">
	<header>
		<h3>Action groups</h3>
		<button
			type="button"
			class="edit"
			aria-pressed={open}
			data-testid="group-editor-toggle"
			onclick={() => vab.pickGroup(open ? null : 'custom.1')}>{open ? 'Done' : 'Edit'}</button
		>
	</header>
	{#if open}
		<label class="pick">
			<span class="dim">Group</span>
			<select
				data-testid="group-pick"
				value={vab.groupPick}
				onchange={(e) => vab.pickGroup(e.currentTarget.value)}
			>
				{#each vab.stockGroups as g (g.id)}<option value={g.id}>{g.label}</option>{/each}
				{#each EDITOR_SLOTS as k (k)}
					<option value="custom.{k}"
						>{slotLabel(k)}{countOf(k) > 0 ? ` · ${countOf(k)}` : ''}</option
					>
				{/each}
			</select>
		</label>
		<p class="status" data-testid="group-status">
			<span class="dot" class:on={vab.groupParts.length > 0} aria-hidden="true"></span>
			{label}: {vab.groupParts.length === 0
				? 'no parts'
				: `${vab.groupParts.length} part${vab.groupParts.length === 1 ? '' : 's'}`}
		</p>
		{#if vab.groupSlot === null}
			<p class="dim">
				A stock group holds the controls made for it. Pick a custom group to add others; the Abort
				group is what Backspace fires in flight.
			</p>
		{:else if vab.selected === null}
			<p class="dim">Click a part to choose what it does in this group.</p>
		{:else if vab.selectedGroupActions.length === 0}
			<p class="dim">{vab.titleOfPart(vab.selected)} has no switch or trigger.</p>
		{:else}
			<ul class="acts" aria-label="Controls of {vab.titleOfPart(vab.selected)}">
				{#each vab.selectedGroupActions as a (a.module + '/' + a.id)}
					<li>
						<label>
							<input
								type="checkbox"
								checked={a.member}
								data-testid="group-member-{a.id}"
								onchange={(e) => vab.setGroupMember(a.module, a.id, e.currentTarget.checked)}
							/>
							<span>{a.label}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.groups {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		backdrop-filter: blur(28px) saturate(160%);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 6px;
	}
	h3 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.edit {
		height: 24px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-secondary);
		background: var(--surface-button);
	}
	.edit[aria-pressed='true'] {
		color: var(--text-primary);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 6px;
		font-size: var(--t-small);
	}
	.pick select {
		flex: 1;
		height: 28px;
		font: inherit;
		color: var(--text-primary);
		background: var(--surface-inset);
		border: 0;
		border-radius: var(--radius-tile);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		padding: 0 6px;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.dot {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.dot.on {
		background: var(--ok);
	}
	.dim {
		margin: 0;
		padding: 0 6px;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.acts {
		list-style: none;
		margin: 0;
		padding: 0 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.acts label {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 2rem;
		font-size: var(--t-small);
		color: var(--text-primary);
	}
</style>
