import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** `--name: #rrggbb` or `rgb(r g b / a)` -> [r, g, b, a]. */
function token(name: string): [number, number, number, number] {
	const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
	if (!m) throw new Error(`token ${name} not found in tokens.css`);
	const v = m[1]!.trim();
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
export const contrast = (a: readonly number[], b: readonly number[]): number => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
};
/** A translucent surface over the worst case: a white (sunlit cloud, snow) scene. */
const overWhite = (name: string): number[] => {
	const [r, g, b, a] = token(name);
	return [r, g, b].map((c) => c * a + 255 * (1 - a));
};

const surfaces = {
	'panel over white': overWhite('--panel'),
	'panel-raised over white': overWhite('--panel-raised'),
	'panel-solid': token('--panel-solid').slice(0, 3),
	field: token('--field').slice(0, 3)
};
const texts = ['--text', '--text-dim', '--text-faint'];
const accents = ['--c-accent', '--c-positive', '--c-warning', '--c-danger', '--c-violet'];

describe('text tokens meet WCAG AA (4.5:1) on every surface, worst-case backdrop', () => {
	for (const [surface, bg] of Object.entries(surfaces)) {
		for (const t of [...texts, ...accents]) {
			it(`${t} on ${surface}`, () => {
				expect(contrast(token(t), bg)).toBeGreaterThanOrEqual(4.5);
			});
		}
	}
	it('dark ink on the accent and warning fills', () => {
		expect(contrast(token('--c-ink'), token('--c-accent'))).toBeGreaterThanOrEqual(4.5);
		expect(contrast(token('--c-ink'), token('--c-warning'))).toBeGreaterThanOrEqual(4.5);
		expect(contrast(token('--c-ink'), token('--text-dim'))).toBeGreaterThanOrEqual(4.5);
	});
});

describe('reduced motion', () => {
	it('tokens.css zeroes durations and animations under prefers-reduced-motion', () => {
		const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
		expect(block).not.toBeNull();
		expect(block![1]).toContain('--dur-fast: 0.01ms');
		expect(block![1]).toContain('animation-duration: 0.01ms');
		expect(block![1]).toContain('transition-duration: 0.01ms');
	});
});
