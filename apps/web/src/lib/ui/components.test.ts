/** The base components of plan 086 (refs components, ADR 0107), rendered server-side. */
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BackButton from './BackButton.svelte';
import Capsule from './Capsule.svelte';
import Chip from './Chip.svelte';
import ListRow from './ListRow.svelte';
import SignalBars from './SignalBars.svelte';
import StatCell from './StatCell.svelte';
import Switch from './Switch.svelte';

const text = (t: string) => createRawSnippet(() => ({ render: () => `<span>${t}</span>` }));

describe('Switch', () => {
	const html = (checked: boolean | 'mixed') =>
		render(Switch, { props: { checked, label: 'Lights' } }).body;

	it('on and off are a switch with aria-checked true / false', () => {
		expect(html(true)).toMatch(/role="switch"/);
		expect(html(true)).toMatch(/aria-checked="true"/);
		expect(html(false)).toMatch(/aria-checked="false"/);
	});
	it('mixed renders aria-checked="mixed" (a tri-state checkbox: the switch role has no mixed state)', () => {
		const h = html('mixed');
		expect(h).toMatch(/aria-checked="mixed"/);
		expect(h).toMatch(/role="checkbox"/);
		expect(h).toMatch(/class="[^"]*\bmixed\b/);
	});
	it('is named for assistive tech', () => {
		expect(html(false)).toMatch(/aria-label="Lights"/);
	});
});

describe('Chip', () => {
	it('fills by default and outlines on request', () => {
		const fill = render(Chip, { props: { children: text('ORBIT') } }).body;
		const outline = render(Chip, { props: { outline: true, children: text('NEXT') } }).body;
		expect(fill).toContain('ORBIT');
		expect(fill).not.toMatch(/class="[^"]*\boutline\b/);
		expect(outline).toMatch(/class="[^"]*\boutline\b/);
	});
});

describe('StatCell', () => {
	it('shows label, value and unit', () => {
		const h = render(StatCell, { props: { label: 'Altitude', value: '72,081', unit: 'm' } }).body;
		expect(h).toContain('Altitude');
		expect(h).toContain('72,081');
		expect(h.replace(/<!--.*?-->/g, '')).toMatch(/72,081 <span class="unit[^"]*">m<\/span>/);
	});
	it('an unknown value is the honest placeholder, never 0', () => {
		for (const value of [null, undefined, '']) {
			const h = render(StatCell, { props: { label: 'Δv', value, unit: 'm/s' } }).body;
			expect(h).toContain('[—]');
			expect(h).not.toContain('m/s');
		}
	});
});

describe('ListRow', () => {
	it('is a plain row without onclick, a button with it', () => {
		const plain = render(ListRow, { props: { name: 'Antenna', sub: 'Direct' } }).body;
		const button = render(ListRow, { props: { name: 'Antenna', onclick: () => {} } }).body;
		expect(plain).not.toContain('<button');
		expect(plain).toContain('Direct');
		expect(button).toContain('<button');
	});
	it('selected marks the row for assistive tech, not by colour alone', () => {
		const h = render(ListRow, { props: { name: 'Pad', selected: true, onclick: () => {} } }).body;
		expect(h).toMatch(/aria-current="true"/);
	});
	it('renders the trailing control', () => {
		const h = render(ListRow, { props: { name: 'Lights', trailing: text('CTRL') } }).body;
		expect(h).toContain('CTRL');
	});
});

describe('SignalBars', () => {
	const html = (level: number, offline = false) =>
		render(SignalBars, { props: { level, offline } }).body;
	it('lights as many bars as the level, clamped to 0..4, and says it in words', () => {
		expect(html(3)).toMatch(/data-level="3"/);
		expect(html(3)).toMatch(/aria-label="Signal 3 of 4"/);
		expect(html(9)).toMatch(/data-level="4"/);
		expect(html(-1)).toMatch(/data-level="0"/);
		expect(html(3).match(/class="[^"]*\blit\b/g)).toHaveLength(3);
	});
	it('offline is a cross plus a label, with no lit bar', () => {
		const h = html(4, true);
		expect(h).toMatch(/aria-label="No signal"/);
		expect(h).toContain('class="cross');
		expect(h.match(/class="[^"]*\blit\b/g)).toBeNull();
	});
});

describe('BackButton and Capsule', () => {
	it('the back button is a named button, or a link with href', () => {
		expect(render(BackButton, { props: {} }).body).toMatch(/<button[^>]*aria-label="Back"/);
		expect(render(BackButton, { props: { href: '/', label: 'Home' } }).body).toMatch(
			/<a[^>]*href="\/"[^>]*aria-label="Home"|<a[^>]*aria-label="Home"[^>]*href="\/"/
		);
	});
	it('the capsule passes attributes through', () => {
		const h = render(Capsule, {
			props: { role: 'toolbar', 'aria-label': 'Time', children: text('x') }
		}).body;
		expect(h).toMatch(/role="toolbar"/);
		expect(h).toMatch(/aria-label="Time"/);
	});
});
