/** The host side of `PanelCanvas` (plan 112, ADR 0149 point 4): a real 2D context behind the declared subset. */
import type { PanelCanvas } from '@orbital/core';

/** The calls the adapter makes: `CanvasRenderingContext2D` has them all (and a test double can). */
export interface Context2D {
	fillStyle: unknown;
	strokeStyle: unknown;
	lineWidth: number;
	font: string;
	clearRect(x: number, y: number, w: number, h: number): void;
	beginPath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	arc(x: number, y: number, r: number, a: number, b: number): void;
	rect(x: number, y: number, w: number, h: number): void;
	closePath(): void;
	fill(): void;
	stroke(): void;
	fillText(text: string, x: number, y: number): void;
}

export function panelCanvas(
	ctx: Context2D,
	width: number,
	height: number,
	face: string
): PanelCanvas {
	return {
		width,
		height,
		clear: () => ctx.clearRect(0, 0, width, height),
		fillStyle: (c) => void (ctx.fillStyle = c),
		strokeStyle: (c) => void (ctx.strokeStyle = c),
		lineWidth: (w) => void (ctx.lineWidth = w),
		beginPath: () => ctx.beginPath(),
		moveTo: (x, y) => ctx.moveTo(x, y),
		lineTo: (x, y) => ctx.lineTo(x, y),
		arc: (x, y, r, a, b) => ctx.arc(x, y, r, a, b),
		rect: (x, y, w, h) => ctx.rect(x, y, w, h),
		closePath: () => ctx.closePath(),
		fill: () => ctx.fill(),
		stroke: () => ctx.stroke(),
		fillText: (text, x, y, size = 11) => {
			ctx.font = `${size}px ${face}`;
			ctx.fillText(String(text), x, y);
		}
	};
}
