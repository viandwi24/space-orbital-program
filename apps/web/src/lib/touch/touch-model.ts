/**
 * Touch input as numbers (plan 053, ADR 0063). Pure: pointer geometry in, the same attitude axes,
 * throttle and camera factors the keyboard produces out. The overlay component only feeds it
 * coordinates and paints what it returns.
 */
import type { TouchChoice } from '../settings/settings';

const clamp = (x: number, lo: number, hi: number): number =>
	Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0;

/** Fraction of the stick's radius inside which nothing is sent. */
export const STICK_DEADZONE = 0.15;

export interface Axes {
	pitch: number;
	yaw: number;
}

/**
 * The steering pad: the thumb's offset from the pad centre (`dx` right, `dy` down, px) against the
 * pad radius. Up is pitch +, right is yaw +, as W and D are. Radial dead zone, then rescaled so the
 * output reaches 1 at the rim; beyond the rim it stays 1.
 */
export function stickAxes(dx: number, dy: number, radius: number): Axes {
	if (!(radius > 0)) return { pitch: 0, yaw: 0 };
	const x = clamp(dx / radius, -1e3, 1e3);
	const y = clamp(dy / radius, -1e3, 1e3);
	const len = Math.hypot(x, y);
	if (len <= STICK_DEADZONE) return { pitch: 0, yaw: 0 };
	const scaled = Math.min(1, (len - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / len;
	return { pitch: clamp(-y * scaled, -1, 1), yaw: clamp(x * scaled, -1, 1) };
}

/** Roll from the two hold buttons: both or neither is 0. */
export const rollAxis = (minus: boolean, plus: boolean): number => (plus ? 1 : 0) - (minus ? 1 : 0);

/** The throttle slider: pointer `y` on a track from `top` (full) down `height` px (zero). */
export function throttleFromSlider(y: number, top: number, height: number): number {
	if (!(height > 0)) return 0;
	return clamp(1 - (y - top) / height, 0, 1);
}

/** Pinch: the camera zoom factor from the previous and current distance between two fingers. */
export function pinchZoomFactor(previous: number, current: number): number {
	if (!(previous > 0) || !(current > 0)) return 1;
	// Fingers apart (current > previous) zoom in, which is a factor under 1 (the wheel's convention).
	return clamp(previous / current, 0.5, 2);
}

/** Whether the on-screen controls show: the player's choice, or the primary pointer for Automatic. */
export function touchControlsOn(choice: TouchChoice, coarsePrimary: boolean): boolean {
	return choice === 'on' || (choice === 'auto' && coarsePrimary);
}

/** The viewport (CSS px) below which the "made for larger screens" notice shows (ADR 0063). */
export const MIN_VIEWPORT = { width: 900, height: 500 } as const;

export function isSmallScreen(viewport: { width: number; height: number }): boolean {
	return viewport.width < MIN_VIEWPORT.width || viewport.height < MIN_VIEWPORT.height;
}
