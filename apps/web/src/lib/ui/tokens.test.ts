import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** The declarations of one rule block, `selector { ... }`, as name -> raw value. */
function block(selector: string): Map<string, string> {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) throw new Error(`block ${selector} not found in tokens.css`);
	const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
	const out = new Map<string, string>();
	for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
	return out;
}

const root = block(':root');
const highContrast = block(":root[data-contrast='more']");
const solidGlass = block(":root[data-glass='solid']");

/** A token's value with `var()` aliases followed, in the default theme or with an override block on top. */
function raw(name: string, over?: Map<string, string>): string {
	const v = over?.get(name) ?? root.get(name);
	if (v === undefined) throw new Error(`token ${name} not found in tokens.css`);
	const alias = /^var\((--[a-z0-9-]+)\)$/.exec(v);
	return alias ? raw(alias[1]!, over) : v;
}

/** `#rrggbb` or `rgb(r g b / a)` -> [r, g, b, a]. */
function token(name: string, over?: Map<string, string>): [number, number, number, number] {
	const v = raw(name, over);
	if (v.startsWith('#')) {
		const n = parseInt(v.slice(1), 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
	}
	const r = /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(v);
	if (!r) throw new Error(`token ${name}: unsupported value ${v}`);
	return [Number(r[1]), Number(r[2]), Number(r[3]), r[4] === undefined ? 1 : Number(r[4])];
}

const lin = (c: number): number => {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (c: readonly number[]): number =>
	0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
const contrast = (a: readonly number[], b: readonly number[]): number => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
};
const rgb = (name: string, over?: Map<string, string>): number[] => token(name, over).slice(0, 3);

/**
 * The glass over the worst case, a white backdrop (sunlit cloud, snow): the backdrop is first dimmed
 * by the filter's `brightness()` (ADR 0140), then the translucent surface is laid over it.
 */
const glassOverWhite = (over?: Map<string, string>): number[] => {
	const filter = raw('--glass-filter', over);
	const b = filter === 'none' ? 1 : Number(/brightness\(([\d.]+)\)/.exec(filter)?.[1] ?? 1);
	const [r, g, bl, a] = token('--surface-glass', over);
	return [r, g, bl].map((c) => c * a + 255 * b * (1 - a));
};

/** Every token of ADR 0107 point 1 (refs tokens without the `--sop-` prefix). */
const ADR_0107_TOKENS = [
	'--bg-space',
	'--bg-ground',
	'--bg-hangar',
	'--surface-glass',
	'--surface-solid',
	'--surface-dialog',
	'--surface-inset',
	'--surface-tile',
	'--surface-hover',
	'--surface-button',
	'--surface-scrim',
	'--glass-filter',
	'--border-subtle',
	'--border-divider',
	'--border-strong',
	'--text-primary',
	'--text-body',
	'--text-secondary',
	'--text-muted',
	'--text-subtle',
	'--text-disabled',
	'--accent',
	'--selected-bg',
	'--selected-fg',
	'--ok',
	'--warn',
	'--danger',
	'--offline',
	'--mnv-prograde',
	'--mnv-normal',
	'--mnv-radial',
	'--font-ui',
	'--font-mono',
	'--tracking-label',
	'--tracking-chip',
	'--radius-pill',
	'--radius-panel',
	'--radius-card',
	'--radius-row',
	'--radius-tile',
	'--radius-icon',
	'--margin-hud',
	'--margin-menu',
	'--panel-pad',
	'--panel-gap',
	'--capsule',
	'--round-btn',
	'--dot'
];

describe('ADR 0107 tokens', () => {
	it('every refs token exists', () => {
		const missing = ADR_0107_TOKENS.filter((t) => !root.has(t));
		expect(missing).toEqual([]);
	});
	it('the refs values are kept: accent, glass, status colours, radii, HUD spacing', () => {
		expect(raw('--accent')).toBe('#3e6ae1');
		expect(token('--surface-glass')).toEqual([22, 23, 26, 0.6]);
		expect(raw('--glass-filter')).toContain('blur(28px) saturate(160%)');
		expect([raw('--ok'), raw('--warn'), raw('--danger'), raw('--offline')]).toEqual([
			'#7bd88f',
			'#ffb86b',
			'#ff8a8e',
			'#ff5a5f'
		]);
		expect([raw('--radius-pill'), raw('--radius-panel')]).toEqual(['999px', '1rem']);
		expect([raw('--margin-hud'), raw('--panel-gap'), raw('--capsule')]).toEqual([
			'1.5rem',
			'0.75rem',
			'2.75rem'
		]);
	});
	it('Manrope is the interface font', () => {
		expect(raw('--font-ui').startsWith("'Manrope'")).toBe(true);
	});
});

describe('text floor (ADR 0109): no text token below 10 px at 100 %', () => {
	const sizes = [...root.entries()].filter(([n]) => /^--t-/.test(n));
	it('there are type tokens', () => {
		expect(sizes.length).toBeGreaterThan(5);
	});
	for (const [name, value] of sizes) {
		it(`${name} = ${value}`, () => {
			// rem so the UI scale applies; `max(10px, …rem)` keeps the floor at small scales (plan 215)
			const m = /^(?:max\(10px,\s*)?([\d.]+)rem\)?$/.exec(value);
			expect(m, `${name} must be in rem so the UI scale applies`).not.toBeNull();
			expect(Number(m![1]) * 16).toBeGreaterThanOrEqual(10);
		});
	}
	it('size tokens are in rem (the UI scale is the root font size, ADR 0140)', () => {
		const px = [...root.entries()].filter(
			([n, v]) =>
				/^--(s-\d|margin-|panel-|capsule$|round-|dot$|touch-|radius-)/.test(n) && /\dpx/.test(v)
		);
		expect(px.map(([n]) => n)).toEqual(['--radius-pill']);
	});
});

describe('contrast on glass, worst-case backdrop (4.5:1 body text, 3:1 large text and marks)', () => {
	const surfaces = (over?: Map<string, string>) => ({
		'glass over white': glassOverWhite(over),
		'surface-solid': rgb('--surface-solid', over),
		'surface-dialog': rgb('--surface-dialog', over)
	});
	const body = [
		'--text-primary',
		'--text-body',
		'--text-secondary',
		'--text-muted',
		'--accent-text',
		'--ok',
		'--warn',
		'--danger',
		'--mnv-prograde',
		'--mnv-normal',
		'--mnv-radial'
	];
	const large = ['--text-subtle', '--offline'];
	for (const [surface, bg] of Object.entries(surfaces())) {
		for (const t of body) {
			it(`${t} on ${surface} >= 4.5`, () => {
				expect(contrast(rgb(t), bg)).toBeGreaterThanOrEqual(4.5);
			});
		}
		for (const t of large) {
			it(`${t} on ${surface} >= 3`, () => {
				expect(contrast(rgb(t), bg)).toBeGreaterThanOrEqual(3);
			});
		}
	}
	it('text on the fills: white on the accent, dark on selected', () => {
		expect(contrast(rgb('--on-accent'), rgb('--accent'))).toBeGreaterThanOrEqual(4.5);
		expect(contrast(rgb('--selected-fg'), rgb('--selected-bg'))).toBeGreaterThanOrEqual(4.5);
	});
	it('high contrast: every text grey reaches 4.5 on every surface, borders are stronger', () => {
		for (const bg of Object.values(surfaces(highContrast))) {
			for (const t of [...body, '--text-subtle']) {
				expect(contrast(rgb(t, highContrast), bg), t).toBeGreaterThanOrEqual(4.5);
			}
		}
		expect(token('--border-subtle', highContrast)[3]).toBeGreaterThan(token('--border-subtle')[3]);
		expect(raw('--glass-filter', highContrast)).toBe('none');
	});
	it('the solid fallback turns the blur off and the glass opaque', () => {
		expect(raw('--glass-filter', solidGlass)).toBe('none');
		expect(token('--surface-glass', solidGlass)[3]).toBe(1);
	});
});

describe('legacy names (ADR 0026) still pass their old pairs', () => {
	const legacy = [
		'--text',
		'--text-dim',
		'--text-faint',
		'--c-accent',
		'--c-positive',
		'--c-warning'
	];
	for (const t of [...legacy, '--c-danger', '--c-violet']) {
		it(`${t} on the panel over white`, () => {
			expect(contrast(rgb(t), glassOverWhite())).toBeGreaterThanOrEqual(4.5);
		});
	}
	it('dark ink on the accent, warning and dim fills', () => {
		for (const fill of ['--c-accent', '--c-warning', '--text-dim']) {
			expect(contrast(rgb('--c-ink'), rgb(fill)), fill).toBeGreaterThanOrEqual(4.5);
		}
	});
});

describe('script editor syntax tokens (plan 030)', () => {
	const syntax = ['--syn-keyword', '--syn-string', '--syn-number', '--syn-comment', '--syn-api'];
	/** The error-line band drawn over the editor field. */
	const errorBand = (): number[] => {
		const [r, g, b, a] = token('--syn-error-line');
		const [fr, fg, fb] = token('--field');
		return [r * a + fr * (1 - a), g * a + fg * (1 - a), b * a + fb * (1 - a)];
	};
	for (const t of [...syntax, '--text', '--text-faint']) {
		it(`${t} on the editor field`, () => {
			expect(contrast(rgb(t), rgb('--field'))).toBeGreaterThanOrEqual(4.5);
		});
		it(`${t} on the error-line band`, () => {
			expect(contrast(rgb(t), errorBand())).toBeGreaterThanOrEqual(4.5);
		});
	}
	it('the syntax colours are distinguishable from plain text and each other', () => {
		const seen = new Set(syntax.map((t) => rgb(t).join(',')));
		expect(seen.size).toBe(syntax.length);
		expect(seen.has(rgb('--text').join(','))).toBe(false);
	});
});

describe('reduced motion', () => {
	it('tokens.css zeroes durations and animations under prefers-reduced-motion', () => {
		const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
		expect(reduced).not.toBeNull();
		expect(reduced![1]).toContain('--dur-fast: 0.01ms');
		expect(reduced![1]).toContain('animation-duration: 0.01ms');
		expect(reduced![1]).toContain('transition-duration: 0.01ms');
	});
});

// ---- the 10 px floor at every UI scale (plan 215, ADR 0205 point 6) ----

const SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

/** A length in px for a root font size of `16 × scale`: `Npx`, `Nrem` or `max(a, b)` of those. */
function pxAt(value: string, scale: number): number {
	const v = value.trim();
	const max = v.match(/^max\((.*),(.*)\)$/);
	if (max) return Math.max(pxAt(max[1]!, scale), pxAt(max[2]!, scale));
	const m = v.match(/^([0-9.]+)(px|rem)$/);
	if (!m) throw new Error(`cannot read the length "${v}"`);
	return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16 * scale;
}

describe('type tokens', () => {
	const tokens = [...css.matchAll(/(--t-[a-z]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!] as const);

	it('are all read', () => {
		expect(tokens.map(([n]) => n)).toEqual(
			expect.arrayContaining([
				'--t-label',
				'--t-small',
				'--t-button',
				'--t-value',
				'--t-xs',
				'--t-sm'
			])
		);
	});

	it.each(SCALES)('are at least 10 px at UI scale %s', (scale) => {
		for (const [name, value] of tokens) expect(pxAt(value, scale), name).toBeGreaterThanOrEqual(10);
	});

	it('scale with the UI above the floor', () => {
		const value = tokens.find(([n]) => n === '--t-value')![1];
		expect(pxAt(value, 1.5)).toBeCloseTo(19.5, 6);
		expect(pxAt(value, 0.8)).toBeCloseTo(10.4, 6);
	});
});
