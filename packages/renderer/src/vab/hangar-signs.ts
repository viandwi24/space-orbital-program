/**
 * Signage of the hangar (plan 029): the layout of one small atlas shared by every plate on the
 * columns (numbers, safety signs) and the painter that fills it with a 2D canvas. The geometry in
 * `hangar.ts` only needs the cell rectangles, so it builds without a canvas (Bun tests); the view
 * paints the atlas after the page fonts load.
 */

export const SIGN_ATLAS = { width: 1024, height: 512, cell: 128 } as const;

export interface SignCell {
	/** Pixel rectangle in the atlas. */
	x: number;
	y: number;
	w: number;
	h: number;
}

const C = SIGN_ATLAS.cell;

/** Column numbers 1..7 in the top row. */
export const numberCell = (n: number): SignCell => ({ x: ((n - 1) % 8) * C, y: 0, w: C, h: C });

/** Wide safety plates in the lower rows, two cells wide. */
export const SAFETY_CELLS = {
	exit: { x: 0, y: C, w: 2 * C, h: C },
	hardHat: { x: 2 * C, y: C, w: 2 * C, h: C },
	ear: { x: 4 * C, y: C, w: 2 * C, h: C },
	fire: { x: 6 * C, y: C, w: 2 * C, h: C },
	noSmoking: { x: 0, y: 2 * C, w: 2 * C, h: C },
	lox: { x: 2 * C, y: 2 * C, w: 2 * C, h: C },
	crane: { x: 4 * C, y: 2 * C, w: 2 * C, h: C },
	walk: { x: 6 * C, y: 2 * C, w: 2 * C, h: C }
} as const satisfies Record<string, SignCell>;

export type SafetySign = keyof typeof SAFETY_CELLS;

const FONT = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';

/** A minimal slice of `CanvasRenderingContext2D`, so tests can pass a recorder. */
export type SignContext = Pick<
	CanvasRenderingContext2D,
	| 'fillStyle'
	| 'strokeStyle'
	| 'lineWidth'
	| 'font'
	| 'textAlign'
	| 'textBaseline'
	| 'fillRect'
	| 'strokeRect'
	| 'fillText'
	| 'beginPath'
	| 'moveTo'
	| 'lineTo'
	| 'closePath'
	| 'fill'
	| 'stroke'
	| 'arc'
>;

function plate(ctx: SignContext, c: SignCell, fill: string, edge: string): void {
	ctx.fillStyle = edge;
	ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
	ctx.fillStyle = fill;
	ctx.fillRect(c.x + 8, c.y + 8, c.w - 16, c.h - 16);
}

function label(
	ctx: SignContext,
	c: SignCell,
	text: string,
	size: number,
	colour: string,
	dy = 0
): void {
	ctx.fillStyle = colour;
	ctx.font = `700 ${size}px ${FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, c.x + c.w / 2, c.y + c.h / 2 + dy);
}

/** Paints the whole atlas. Everything is flat and high contrast so it reads at a few pixels. */
export function paintSignAtlas(ctx: SignContext): void {
	ctx.fillStyle = '#10151b';
	ctx.fillRect(0, 0, SIGN_ATLAS.width, SIGN_ATLAS.height);
	for (let n = 1; n <= 7; n++) {
		const c = numberCell(n);
		plate(ctx, c, '#e3a61f', '#10151b');
		label(ctx, c, `${n}`, 96, '#10151b', 4);
	}
	const s = SAFETY_CELLS;
	plate(ctx, s.exit, '#1f9d62', '#e8f6ee');
	label(ctx, s.exit, 'EXIT', 64, '#ffffff', 2);
	plate(ctx, s.hardHat, '#2a6fd6', '#e8eefc');
	label(ctx, s.hardHat, 'HARD HAT', 40, '#ffffff', -14);
	label(ctx, s.hardHat, 'AREA', 40, '#ffffff', 26);
	plate(ctx, s.ear, '#2a6fd6', '#e8eefc');
	label(ctx, s.ear, 'EAR', 40, '#ffffff', -14);
	label(ctx, s.ear, 'PROTECTION', 34, '#ffffff', 26);
	plate(ctx, s.fire, '#c0392b', '#fbeae7');
	label(ctx, s.fire, 'FIRE', 48, '#ffffff', -16);
	label(ctx, s.fire, 'POINT', 40, '#ffffff', 28);
	plate(ctx, s.noSmoking, '#f4f4ef', '#c0392b');
	label(ctx, s.noSmoking, 'NO NAKED', 34, '#c0392b', -14);
	label(ctx, s.noSmoking, 'FLAMES', 34, '#c0392b', 24);
	plate(ctx, s.lox, '#e3a61f', '#10151b');
	label(ctx, s.lox, 'CRYOGENIC', 32, '#10151b', -14);
	label(ctx, s.lox, 'LIQUID O2', 34, '#10151b', 24);
	plate(ctx, s.crane, '#e3a61f', '#10151b');
	label(ctx, s.crane, 'OVERHEAD', 34, '#10151b', -14);
	label(ctx, s.crane, 'LIFTING', 38, '#10151b', 24);
	plate(ctx, s.walk, '#1f9d62', '#e8f6ee');
	label(ctx, s.walk, 'WALKWAY', 40, '#ffffff', 0);
}

/** The lettering above the door and on the side wall, in one canvas of this size. */
export const BAY_SIGN = { width: 2048, height: 384 } as const;

export function paintBaySign(ctx: SignContext): void {
	const { width, height } = BAY_SIGN;
	ctx.fillStyle = '#0b1219';
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = '#e3a61f';
	ctx.fillRect(0, 0, 24, height);
	ctx.fillRect(width - 24, 0, 24, height);
	ctx.fillStyle = '#e8eff8';
	ctx.font = `700 196px ${FONT}`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText('ASSEMBLY BAY 1', 96, 210);
	ctx.fillStyle = '#5ccfff';
	ctx.font = `500 84px ${FONT}`;
	ctx.fillText('VEHICLE ASSEMBLY BUILDING', 102, 326);
	// Chevrons on the right, a hint of the accent ring.
	ctx.strokeStyle = '#e3a61f';
	ctx.lineWidth = 22;
	for (let i = 0; i < 3; i++) {
		const x = width - 360 + i * 90;
		ctx.beginPath();
		ctx.moveTo(x, 90);
		ctx.lineTo(x + 70, height / 2);
		ctx.lineTo(x, height - 90);
		ctx.stroke();
	}
}
