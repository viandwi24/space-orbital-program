/**
 * Mode card art (plan 317, ADR 0273 point 3): the design's line art for the five stock presets
 * (V3_CHANGES §4.2, `CreateWorldV3.dc.html`) and a generated orbit glyph for any other preset, both in
 * a 240 x 150 box. A preset's own `illustration` wins over both (the page decides).
 */
import { seeded } from './system-art';

export interface ArtPath {
	d: string;
	stroke: string;
	width: number;
	fill: string;
	dash: string;
}

export interface ModeArt {
	/** The mode's colour: the card's glow, the summary's planet. */
	color: string;
	paths: ArtPath[];
}

const C = '#E4E4E7';
const P = (d: string, stroke = C, width = 1.6, fill = 'none', dash = ''): ArtPath => ({
	d,
	stroke,
	width,
	fill,
	dash
});

const STOCK: Record<string, { color: string; art: (c: string) => ArtPath[] }> = {
	'stock.sandbox': {
		color: '#7FB2FF',
		art: (c) => [
			P('M120 22 C134 36 138 56 138 76 L146 96 H94 L102 76 C102 56 106 36 120 22 Z'),
			P('M112 58 A8 8 0 1 0 128 58 A8 8 0 1 0 112 58', c),
			P('M112 96 L108 116 M128 96 L132 116'),
			P('M114 100 Q120 128 126 100', c, 1.6, c),
			P(
				'M40 44 H64 V60 H40 Z M176 40 L196 52 L184 70 L164 58 Z M54 96 A10 10 0 1 0 74 96 A10 10 0 1 0 54 96 M170 98 H200 M185 83 V113',
				C,
				1.2,
				'none',
				'3 3'
			),
			P('M60 132 C80 118 100 146 120 132 C140 118 160 146 180 132', c, 1.2, 'none', '2 4')
		]
	},
	'stock.science': {
		color: '#7BD88F',
		art: (c) => [
			P('M94 75 A26 26 0 1 0 146 75 A26 26 0 1 0 94 75', C, 1.6, 'rgba(255,255,255,0.04)'),
			P('M40 92 C70 46 170 40 200 58 C230 76 170 116 120 108', c),
			P('M196 56 A4 4 0 1 0 204 56 A4 4 0 1 0 196 56', c, 1.6, c),
			P('M44 30 L48 38 L56 42 L48 46 L44 54 L40 46 L32 42 L40 38 Z', c, 1.2),
			P('M182 104 V118 L172 134 H200 L190 118 V104 Z M176 126 H196', C, 1.4)
		]
	},
	'stock.career': {
		color: '#FFB86B',
		art: (c) => [
			P('M40 128 H200'),
			P('M54 128 V84 H84 V128 M92 128 V56 H120 V128 M128 128 V96 H156 V128'),
			P('M164 108 L176 92 L188 98 L204 70', c, 2),
			P('M196 70 H204 V78', c, 2),
			P('M168 40 A9 9 0 1 0 186 40 A9 9 0 1 0 168 40 M177 35 V45', c, 1.4),
			P('M60 96 H66 M60 106 H66 M98 70 H104 M98 82 H104 M98 94 H104 M134 106 H140', C, 1.2)
		]
	},
	'stock.career-hardcore': {
		color: '#FF8A8E',
		art: (c) => [
			P('M102 50 H138 L150 104 H90 Z', C, 1.6, 'rgba(255,255,255,0.04)'),
			P('M112 66 A8 8 0 1 0 128 66 A8 8 0 1 0 112 66'),
			P('M24 124 H86 L96 108 L106 138 L116 116 L124 124 H216', c, 2),
			P('M176 34 L186 52 H166 Z M176 41 V46 M176 49 V49.5', c, 1.4)
		]
	},
	'stock.career-engineering': {
		color: '#C792EA',
		art: (c) => [
			P('M92 74 A28 28 0 1 0 148 74 A28 28 0 1 0 92 74', C, 1.6),
			P('M110 74 A10 10 0 1 0 130 74 A10 10 0 1 0 110 74', c),
			P(
				'M120 38 V46 M120 102 V110 M84 74 H92 M148 74 H156 M95 49 L101 55 M139 93 L145 99 M95 99 L101 93 M139 55 L145 49',
				C,
				3
			),
			P('M168 112 L196 84 A10 10 0 1 1 208 96 L180 124 Z', c, 1.4),
			P('M40 104 H68 L74 132 H34 Z', C, 1.4)
		]
	}
};

/** The mode's art: the stock line art, or an orbit glyph seeded by the preset id in its own colour. */
export function modeArt(presetId: string): ModeArt {
	const stock = STOCK[presetId];
	if (stock) return { color: stock.color, paths: stock.art(stock.color) };
	const r = seeded(presetId);
	const hue = Math.round(r() * 360);
	const color = `hsl(${hue} 70% 72%)`;
	const paths: ArtPath[] = [
		P('M100 75 A20 20 0 1 0 140 75 A20 20 0 1 0 100 75', C, 1.6, 'rgba(255,255,255,0.04)')
	];
	const rings = 2 + Math.floor(r() * 2);
	for (let i = 0; i < rings; i++) {
		const rx = 40 + i * 26;
		const ry = 14 + i * 9;
		const tilt = Math.round((r() - 0.5) * 40);
		paths.push(
			P(
				`M${120 - rx} 75 A${rx} ${ry} ${tilt} 1 0 ${120 + rx} 75 A${rx} ${ry} ${tilt} 1 0 ${120 - rx} 75`,
				i === 0 ? color : C,
				1.2,
				'none',
				i === rings - 1 ? '3 4' : ''
			)
		);
		const a = r() * Math.PI * 2;
		const x = 120 + rx * Math.cos(a);
		const y = 75 + ry * Math.sin(a);
		paths.push(
			P(`M${(x - 4).toFixed(1)} ${y.toFixed(1)} a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0`, color, 1.4, color)
		);
	}
	return { color, paths };
}

/** `#rrggbb` or `hsl(…)` with an alpha, for glows. */
export function withAlpha(color: string, alpha: number): string {
	if (color.startsWith('#') && color.length === 7) {
		const n = parseInt(color.slice(1), 16);
		return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
	}
	if (color.startsWith('hsl(')) return color.replace(')', ` / ${alpha})`);
	return color;
}
