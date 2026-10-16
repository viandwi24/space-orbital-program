<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Kbd from '../ui/Kbd.svelte';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const groups: { title: string; rows: [string[], string][] }[] = [
		{
			title: 'Fly',
			rows: [
				[['Shift', 'Ctrl'], 'Throttle up, down'],
				[['Z', 'X'], 'Full throttle, cut'],
				[['W', 'S'], 'Pitch'],
				[['A', 'D'], 'Yaw'],
				[['Q', 'E'], 'Roll'],
				[['Space'], 'Fire the next stage']
			]
		},
		{
			title: 'Stability assist (SAS)',
			rows: [
				[['T'], 'SAS on (hold attitude), off'],
				[['1', '7'], 'Hold, prograde, retrograde, normal, antinormal, radial out, radial in'],
				[['8'], 'Point at the maneuver node']
			]
		},
		{
			title: 'Maneuver nodes (map view)',
			rows: [
				[['Click'], 'Click the orbit to add a node; drag a node along the orbit'],
				[
					['Drag'],
					'Drag a handle to add prograde, normal or radial delta-v (Shift coarse, Alt fine)'
				],
				[['I', 'K'], 'Selected node: prograde up, down'],
				[['L', 'J'], 'Normal up, down'],
				[['O', 'U'], 'Radial out, in'],
				[['Delete'], 'Remove the selected node']
			]
		},
		{
			title: 'See',
			rows: [
				[['M'], 'Map view'],
				[['Tab'], 'Map view: look at the next body'],
				[['V'], 'Speed reference: auto, surface, orbit'],
				[['Drag', 'Wheel'], 'Orbit and zoom the camera']
			]
		},
		{
			title: 'Time and menus',
			rows: [
				[[',', '.'], 'Time warp down, up'],
				[['F5', 'F9'], 'Quicksave, quickload'],
				[['Esc'], 'Pause menu'],
				[['?'], 'This list']
			]
		}
	];
</script>

<Dialog {open} title="Controls" {onclose}>
	<div class="groups">
		{#each groups as g (g.title)}
			<section>
				<h3>{g.title}</h3>
				<dl>
					{#each g.rows as [keys, what] (what)}
						<dt>
							{#each keys as k, i (k)}{#if i > 0}<span class="or">/</span>{/if}<Kbd>{k}</Kbd>{/each}
						</dt>
						<dd>{what}</dd>
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
