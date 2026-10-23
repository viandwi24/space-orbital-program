/**
 * The sample's portrait, painted in code at build time (no binary art in the repository): a 96 px
 * PNG of a red band cap over a sky-blue face. A real mod would ship `assets/portraits/band.png`.
 */
import { encodePng } from '../../tools/mod-build/glb.ts';

const SIZE = 96;

export function bandPortrait(): Uint8Array {
	const rgba = new Uint8Array(SIZE * SIZE * 4);
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			const u = (x - SIZE / 2) / (SIZE / 2);
			const v = (y - SIZE / 2) / (SIZE / 2);
			const face = Math.hypot(u, (v - 0.05) * 1.1) < 0.6;
			const cap = v < -0.25 && Math.abs(u) < 0.62 && v > -0.75;
			const eye = Math.hypot(Math.abs(u) - 0.22, v - 0.02) < 0.09;
			let c = Math.hypot(u, v) < 1 ? [27, 34, 51, 255] : [0, 0, 0, 0];
			if (face) c = [142, 197, 242, 255];
			if (eye) c = [42, 26, 20, 255];
			if (cap) c = [179, 32, 42, 255];
			if (cap && Math.abs(v + 0.32) < 0.05) c = [242, 201, 76, 255];
			rgba.set(c, (y * SIZE + x) * 4);
		}
	}
	return encodePng(SIZE, SIZE, rgba);
}

export default (): Record<string, Uint8Array> => ({ 'portraits/band.png': bandPortrait() });
