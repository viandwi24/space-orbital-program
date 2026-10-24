/**
 * The sample planet's map, painted in code at build time (no binary art in the repository): 512 x 256
 * RGBA, red the elevation (0.46 is the sea), green the moisture, blue the temperature, alpha the
 * rockiness. A real mod would ship `assets/maps/verdant.png`, drawn or exported from a planet tool.
 */
import { encodePng } from '../../tools/mod-build/glb.ts';

export const MAP_WIDTH = 512;
export const MAP_HEIGHT = 256;

/** A smooth blob of height `h` centred on (cx, cy) in map texels, radius r. */
const blob = (x: number, y: number, cx: number, cy: number, r: number, h: number): number => {
	const dx = Math.min(Math.abs(x - cx), MAP_WIDTH - Math.abs(x - cx));
	const d = Math.hypot(dx, (y - cy) * 1.4) / r;
	return d >= 1 ? 0 : h * (1 - d * d) ** 2;
};

/** Elevation 0..1 at a texel: two continents with a highland on the first, sea elsewhere. */
export function elevation(x: number, y: number): number {
	const land =
		blob(x, y, 150, 120, 95, 0.55) +
		blob(x, y, 160, 100, 38, 0.3) +
		blob(x, y, 370, 140, 80, 0.5) +
		blob(x, y, 300, 60, 30, 0.2);
	const ripple = 0.025 * Math.sin(x * 0.19) * Math.cos(y * 0.23);
	return Math.min(1, Math.max(0, 0.3 + land + ripple));
}

export function verdantMap(): Uint8Array {
	const rgba = new Uint8Array(MAP_WIDTH * MAP_HEIGHT * 4);
	for (let y = 0; y < MAP_HEIGHT; y++) {
		const lat = Math.abs(y / MAP_HEIGHT - 0.5) * 2;
		for (let x = 0; x < MAP_WIDTH; x++) {
			const e = elevation(x, y);
			const moist = 0.35 + 0.4 * Math.sin(x * 0.05 + y * 0.03) ** 2;
			const temp = Math.max(0, 1 - lat * 1.1 - Math.max(0, e - 0.6) * 1.2);
			rgba.set(
				[
					Math.round(e * 255),
					Math.round(moist * 255),
					Math.round(temp * 255),
					Math.round(Math.max(0, (e - 0.55) * 2) * 255)
				],
				(y * MAP_WIDTH + x) * 4
			);
		}
	}
	return encodePng(MAP_WIDTH, MAP_HEIGHT, rgba);
}

export default (): Record<string, Uint8Array> => ({ 'maps/verdant.png': verdantMap() });
