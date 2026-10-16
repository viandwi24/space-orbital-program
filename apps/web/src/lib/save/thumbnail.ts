/** A small JPEG of the flight view for the save list. Browser only; returns null where it cannot draw. */
export const THUMB_WIDTH = 192;
export const THUMB_HEIGHT = 108;

/**
 * Scale `source` (the renderer's canvas, read right after a frame was drawn) into a
 * `THUMB_WIDTH` x `THUMB_HEIGHT` JPEG data URL, cropping to the 16:9 box. Never throws: a tainted
 * or lost canvas gives null and the save goes without a picture.
 */
export function captureThumbnail(source: HTMLCanvasElement): string | null {
	try {
		if (source.width === 0 || source.height === 0) return null;
		const out = document.createElement('canvas');
		out.width = THUMB_WIDTH;
		out.height = THUMB_HEIGHT;
		const ctx = out.getContext('2d');
		if (!ctx) return null;
		const want = THUMB_WIDTH / THUMB_HEIGHT;
		let sw = source.width;
		let sh = source.width / want;
		if (sh > source.height) {
			sh = source.height;
			sw = source.height * want;
		}
		ctx.drawImage(
			source,
			(source.width - sw) / 2,
			(source.height - sh) / 2,
			sw,
			sh,
			0,
			0,
			THUMB_WIDTH,
			THUMB_HEIGHT
		);
		const url = out.toDataURL('image/jpeg', 0.7);
		return url.startsWith('data:image/jpeg') ? url : null;
	} catch {
		return null;
	}
}
