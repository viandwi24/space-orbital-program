<script lang="ts">
	/** Draws an evaluated panel view (plan 112, ADR 0149 point 3) with the HUD's own components. */
	import Meter from '../ui/Meter.svelte';
	import Sparkline from '../ui/Sparkline.svelte';
	import StatCell from '../ui/StatCell.svelte';
	import Switch from '../ui/Switch.svelte';
	import Button from '../ui/Button.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import Self from './PanelView.svelte';
	import PanelTabs from './PanelTabs.svelte';
	import { getContext } from 'svelte';
	import { OPEN_TAB, clampEntry, type ShownNode } from './evaluate';
	import { pickTool } from './pick-tool.svelte';

	let {
		node,
		onaction
	}: {
		node: ShownNode;
		/**
		 * A button, switch, select or number field at `path` was used (`on` for a switch, the value
		 * for a select or a number field).
		 */
		onaction: (path: string, on?: boolean | string | number) => void;
	} = $props();

	/** A `pick` button at `path` is the armed map pick (plan 366). */
	const armedHere = (path: string): boolean => pickTool.armed?.key.endsWith(`/${path}`) === true;

	/** The nearest tabs' opener, for a notice's button (ADR 0288). */
	const openTab = getContext<((id: string) => void) | undefined>(OPEN_TAB);

	/** A number field committed (Enter or leaving it): clamped, then sent. */
	function commit(e: Event, n: Extract<ShownNode, { kind: 'number' }>): void {
		const input = e.currentTarget as HTMLInputElement;
		const v = Number(input.value);
		if (input.value.trim() === '' || !Number.isFinite(v)) {
			input.value = n.value === null ? '' : String(n.value);
			return;
		}
		const c = clampEntry(n, v);
		input.value = String(c);
		onaction(n.path, c);
	}
</script>

{#if node.kind === 'section'}
	<div class="section">
		{#if node.title}<h3>{node.title}</h3>{/if}
		<div class="grid" class:one={node.columns === 1}>
			{#each node.children as child, i (i)}
				<Self node={child} {onaction} />
			{/each}
		</div>
	</div>
{:else if node.kind === 'tabs'}
	<PanelTabs {node} {onaction} />
{:else if node.kind === 'progress'}
	{#if node.value !== null || node.text !== null}<div class="wide">
		<span class="k">{node.label}{#if node.text}<span class="v">{node.text}</span>{/if}</span>
		<div
			class="bar"
			role="progressbar"
			aria-label={node.label}
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={node.value === null ? undefined : Math.round(node.value * 100)}
		>
			<div class="fill" style="width: {node.value === null ? 0 : node.value * 100}%"></div>
		</div>
	</div>{/if}
{:else if node.kind === 'number'}
	<label class="field">
		<span class="k">{node.label}</span>
		<span class="entry">
			<input
				type="number"
				inputmode="decimal"
				min={node.min}
				max={node.max}
				step={node.step ?? 'any'}
				value={node.value ?? ''}
				onchange={(e) => commit(e, node)}
				onkeydown={(e) => {
					if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
					e.stopPropagation(); // typing digits must not fire flight keys
				}}
				data-testid="panel-number-{node.path}"
			/>{#if node.unit}<span class="unit">{node.unit}</span>{/if}
		</span>
	</label>
{:else if node.kind === 'notice'}
	{#if node.text}
		<div class="notice {node.tone}" role={node.tone === 'warn' ? 'note' : 'status'}>
			<span>{node.text}</span>
			{#if node.action && openTab}
				<Button
					variant="ghost"
					onclick={() => openTab(node.action!.tab)}
					data-testid="panel-notice-action-{node.action.tab}">{node.action.label} →</Button
				>
			{/if}
		</div>
	{/if}
{:else if node.kind === 'readout'}
	<StatCell label={node.label} value={node.value} {...node.unit ? { unit: node.unit } : {}} />
{:else if node.kind === 'meter'}
	<div class="wide">
		<span class="k">{node.label}</span>
		{#if node.value === null}<span class="v">[—]</span>{:else}<Meter
				value={node.value}
				label={node.label}
			/>{/if}
	</div>
{:else if node.kind === 'switch'}
	<div class="wide line">
		<span class="name">{node.label}</span>
		<Switch checked={node.on} label={node.label} onchange={(on) => onaction(node.path, on)} />
	</div>
{:else if node.kind === 'select'}
	<div class="wide">
		<span class="k" aria-hidden="true">{node.label}</span>
		<Segmented
			label={node.label}
			value={node.value ?? ''}
			options={node.options}
			onchange={(v) => onaction(node.path, v)}
			testid="panel-select-{node.path}"
		/>
	</div>
{:else if node.kind === 'button'}
	<!-- a toned button (ADR 0287) takes one column, so Engage and Abort sit side by side -->
	<div class={node.tone ? 'act' : 'wide'}>
		<Button
			variant={node.tone ?? 'default'}
			disabled={!node.enabled}
			onclick={() => onaction(node.path)}
			aria-pressed={node.pick !== undefined ? armedHere(node.path) : undefined}
			data-testid="panel-button-{node.path}"
			>{node.pick !== undefined && armedHere(node.path) ? 'Cancel pick' : node.label}</Button
		>
		{#if node.pick !== undefined && armedHere(node.path)}
			<p class="pickhint" role="status">{node.pick}</p>
		{/if}
	</div>
{:else if node.kind === 'list'}
	<div class="wide">
		{#if node.label}<span class="k">{node.label}</span>{/if}
		<ul>
			{#each node.items as item, i (i)}
				<li>
					<span>{item.name}</span>{#if item.value}<span class="v">{item.value}</span>{/if}
					{#if item.actions}
						<span class="row-actions">
							{#each item.actions as a (a.path)}
								<Button
									variant="ghost"
									disabled={!a.enabled}
									onclick={() => onaction(a.path)}
									data-testid="panel-action-{a.path}">{a.label}</Button
								>
							{/each}
						</span>
					{/if}
				</li>
			{:else}
				<li class="none">[—]</li>
			{/each}
		</ul>
	</div>
{:else if node.kind === 'sparkline'}
	<div class="wide">
		<span class="k"
			>{node.label}<span class="v"
				>{node.last === null
					? '[—]'
					: node.last.toLocaleString('en-US', {
							maximumFractionDigits: 1
						})}</span
			></span
		>
		<Sparkline values={node.values} label={node.label} />
	</div>
{/if}

<style>
	.section {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.375rem;
	}
	h3 {
		margin: 0;
		padding: 0 0.25rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.act {
		display: grid;
	}
	.act :global(.btn) {
		width: 100%;
	}
	.wide.line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.name {
		font-size: var(--t-small);
		font-weight: 600;
		color: var(--text-primary);
	}
	.grid.one {
		grid-template-columns: minmax(0, 1fr);
	}
	.bar {
		height: 0.375rem;
		border-radius: var(--radius-pill);
		background: var(--surface-track);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width var(--dur-med, 0.2s) var(--ease, ease);
	}
	.field {
		display: grid;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.entry {
		display: flex;
		align-items: baseline;
		gap: 0.25rem;
	}
	input {
		width: 100%;
		min-width: 0;
		padding: 0.125rem 0.25rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-icon);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}
	.unit {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.notice {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.5rem;
		margin: 0;
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-tile);
		border-left: 2px solid var(--border-strong);
		background: var(--surface-inset);
		font-size: var(--t-small);
		line-height: 1.35;
		color: var(--text-secondary);
	}
	.notice.warn {
		border-left-color: var(--warn);
		color: var(--text-primary);
	}
	.notice.active {
		border-left-color: var(--accent);
		color: var(--text-primary);
	}
	.wide {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.k {
		display: flex;
		justify-content: space-between;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.v {
		font-size: var(--t-small);
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-primary);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.125rem 0;
	}
	.row-actions {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}
	.pickhint {
		grid-column: 1 / -1;
		margin: 0.25rem 0 0;
		font-size: var(--t-small);
		color: var(--accent, #7cc4ff);
	}
</style>
