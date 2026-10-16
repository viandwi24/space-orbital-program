<script lang="ts">
	import { resolveVesselDesign, type VesselDesign } from '@orbital/core';
	import { goto } from '$app/navigation';
	import { loadCatalog, partLookup } from '../../lib/catalog';
	import {
		addPart,
		emptyDesign,
		freeNodes,
		parseDesign,
		referenceTwoStage,
		removePart,
		serialiseDesign,
		setPartStage,
		stageOf
	} from '../../lib/design';
	import { loadDraft, saveDraft } from '../../lib/storage';

	const catalog = loadCatalog();
	const lookup = partLookup(catalog);
	const titleOf = (id: string): string => lookup.get(id)?.title ?? id;

	// Replaced wholesale on every edit, so `$state.raw` is enough.
	let design = $state.raw<VesselDesign>(emptyDesign());
	let notice = $state('');
	let newPart = $state(catalog.parts[0]?.id ?? '');
	let parentIndex = $state<number | null>(null);
	let parentNode = $state('');
	let node = $state('');
	let fileInput: HTMLInputElement;

	// Restore the last design (written by this page) on first load.
	const draft = loadDraft();
	if (draft) {
		const parsed = parseDesign(draft, lookup);
		if (parsed.ok) design = parsed.design;
	}

	const resolved = $derived(design.parts.length > 0 ? resolveVesselDesign(design, lookup) : null);
	const errors = $derived(
		resolved === null ? ['Add a root part (the command pod).'] : resolved.ok ? [] : resolved.errors
	);
	const hasControl = $derived(design.parts.some((p) => p.part === 'stock.command-pod'));
	const dryMass = $derived(design.parts.reduce((m, p) => m + (lookup.get(p.part)?.mass ?? 0), 0));
	const stageCount = $derived(design.stages.length + 1);

	const isRoot = $derived(design.parts.length === 0);
	const parentChoices = $derived(
		design.parts.filter((p) => freeNodes(design, lookup, p.index).length > 0)
	);
	const parentNodes = $derived(parentIndex === null ? [] : freeNodes(design, lookup, parentIndex));
	const newNodes = $derived(Object.keys(lookup.get(newPart)?.attach ?? {}));

	$effect(() => {
		// Keep the attach pickers on valid choices as the design changes.
		if (!isRoot && (parentIndex === null || !parentChoices.some((p) => p.index === parentIndex))) {
			parentIndex = parentChoices.at(-1)?.index ?? null;
		}
		if (!parentNodes.includes(parentNode)) {
			// Stacks usually grow downwards: prefer the lower node of the part above.
			parentNode = (parentNodes.includes('bottom') ? 'bottom' : parentNodes[0]) ?? '';
		}
		if (!newNodes.includes(node)) node = newNodes[0] ?? '';
	});

	function edit(next: VesselDesign): void {
		design = next;
		saveDraft(serialiseDesign(next));
	}

	function add(): void {
		notice = '';
		try {
			const next = addPart(
				design,
				newPart,
				isRoot || parentIndex === null ? null : { index: parentIndex, parentNode, node }
			);
			edit(next);
			// The next part usually continues the stack below the one just added.
			parentIndex = next.parts.at(-1)?.index ?? null;
			parentNode = '';
		} catch (error) {
			notice = (error as Error).message;
		}
	}

	function download(): void {
		const url = URL.createObjectURL(
			new Blob([serialiseDesign(design)], { type: 'application/json' })
		);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${design.name.replace(/[^\w-]+/g, '_') || 'vessel'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function upload(): Promise<void> {
		const file = fileInput.files?.[0];
		if (!file) return;
		const parsed = parseDesign(await file.text(), lookup);
		if (parsed.ok) {
			edit(parsed.design);
			notice = `Loaded "${parsed.design.name}".`;
		} else {
			notice = `Not loaded: ${parsed.errors.join('; ')}`;
		}
		fileInput.value = '';
	}

	function launch(): void {
		saveDraft(serialiseDesign(design));
		void goto('/flight');
	}
</script>

<svelte:head><title>VAB · Orbital</title></svelte:head>

<main>
	<header>
		<h1>Vehicle Assembly</h1>
		<a href="/">Home</a>
	</header>

	<section class="row">
		<label
			>Name <input
				value={design.name}
				oninput={(e) => edit({ ...design, name: e.currentTarget.value || 'Untitled vessel' })}
			/></label
		>
		<button type="button" onclick={() => edit(referenceTwoStage())}>Load two-stage example</button>
		<button type="button" onclick={() => edit(emptyDesign())}>Clear</button>
		<button type="button" onclick={download} disabled={design.parts.length === 0}>Save JSON</button>
		<button type="button" onclick={() => fileInput.click()}>Load JSON</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			hidden
			onchange={upload}
		/>
	</section>

	<section>
		<h2>Add part</h2>
		<div class="row">
			<label>
				Part
				<select bind:value={newPart}>
					{#each catalog.parts as p (p.id)}
						<option value={p.id}>{p.title} ({p.mass} kg)</option>
					{/each}
				</select>
			</label>
			{#if !isRoot}
				<label>
					Attach to
					<select bind:value={parentIndex}>
						{#each parentChoices as p (p.index)}
							<option value={p.index}>#{p.index} {titleOf(p.part)}</option>
						{/each}
					</select>
				</label>
				<label>
					at node
					<select bind:value={parentNode}>
						{#each parentNodes as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</label>
				<label>
					via this part's node
					<select bind:value={node}>
						{#each newNodes as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</label>
			{/if}
			<button type="button" onclick={add}>{isRoot ? 'Place root' : 'Attach'}</button>
		</div>
	</section>

	<section>
		<h2>Parts (top to bottom of the build order)</h2>
		{#if design.parts.length === 0}
			<p class="muted">Empty. Place a root part, or load the example.</p>
		{:else}
			<table>
				<thead>
					<tr><th>#</th><th>Part</th><th>Attached to</th><th>Fires on stage</th><th></th></tr>
				</thead>
				<tbody>
					{#each design.parts as p (p.index)}
						<tr>
							<td>{p.index}</td>
							<td>{titleOf(p.part)}</td>
							<td>
								{#if p.parent}
									#{p.parent.index} ({p.parent.parentNode} to {p.parent.node})
								{:else}
									root
								{/if}
							</td>
							<td>
								<select
									aria-label="Stage of part {p.index}"
									value={stageOf(design, p.index) ?? ''}
									onchange={(e) => {
										const v = e.currentTarget.value;
										edit(setPartStage(design, p.index, v === '' ? null : Number(v)));
									}}
								>
									<option value="">never</option>
									{#each Array.from({ length: stageCount }, (_, k) => k) as k (k)}
										<option value={k}>stage {k + 1}</option>
									{/each}
								</select>
							</td>
							<td
								><button type="button" onclick={() => edit(removePart(design, p.index))}
									>Remove</button
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section>
		{#each errors as e (e)}<p class="error">{e}</p>{/each}
		{#if resolved?.ok && !hasControl}
			<p class="error">No command pod: the vessel cannot be controlled.</p>
		{/if}
		{#if notice}<p class="muted">{notice}</p>{/if}
		<p class="muted">
			{design.parts.length} parts · dry mass {dryMass} kg · {design.stages.length} stage{design
				.stages.length === 1
				? ''
				: 's'} (Space fires the next one)
		</p>
		<button type="button" class="go" onclick={launch} disabled={!resolved?.ok || !hasControl}
			>Launch</button
		>
	</section>
</main>

<style>
	main {
		max-width: 62rem;
		margin: 0 auto;
		padding: var(--s-4) var(--s-4) var(--s-6);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	h1 {
		font-size: var(--t-xl);
		font-weight: 600;
		margin: var(--s-2) 0;
	}
	h2 {
		font-size: var(--t-md);
		font-weight: 600;
		color: var(--text-dim);
		margin: var(--s-5) 0 var(--s-2);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
		align-items: end;
	}
	label {
		display: grid;
		gap: 2px;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	input,
	select,
	button {
		min-height: 32px;
		padding: 0 var(--s-2);
		font-size: var(--t-sm);
		background: var(--panel-raised);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	button:hover:not(:disabled) {
		border-color: var(--c-accent);
	}
	button:disabled {
		opacity: 0.45;
	}
	.go {
		background: var(--c-accent);
		border-color: var(--c-accent);
		color: var(--c-ink);
		font-weight: 600;
		padding: 0 var(--s-5);
		margin-top: var(--s-3);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-sm);
	}
	th,
	td {
		text-align: left;
		padding: var(--s-1) var(--s-2);
		border-bottom: 1px solid var(--line);
	}
	th {
		color: var(--text-dim);
		font-weight: 500;
	}
	.muted {
		color: var(--text-dim);
	}
	.error {
		color: var(--c-danger);
		margin: 2px 0;
	}
</style>
