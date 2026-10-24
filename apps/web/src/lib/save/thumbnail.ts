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
		const crop = thumbnailCrop(source.width, source.height);
		ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
		const url = out.toDataURL('image/jpeg', 0.7);
		return url.startsWith('data:image/jpeg') ? url : null;
	} catch {
		return null;
	}
}

/** The 16:9 box of a `width` x `height` canvas that the thumbnail shows: centred, as large as fits. */
export function thumbnailCrop(
	width: number,
	height: number
): { x: number; y: number; width: number; height: number } {
	const want = THUMB_WIDTH / THUMB_HEIGHT;
	let sw = width;
	let sh = width / want;
	if (sh > height) {
		sh = height;
		sw = height * want;
	}
	return { x: (width - sw) / 2, y: (height - sh) / 2, width: sw, height: sh };
}

/**
 * The same picture without stalling the frame (plan 408): the canvas is snapshotted and scaled by
 * `createImageBitmap` (call it in the task that drew the frame), and the JPEG is encoded off the main
 * thread by `OffscreenCanvas.convertToBlob`. The synchronous version read the WebGPU canvas back and
 * encoded on the main thread, 15 to 60 ms at every autosave. Null where it cannot be drawn.
 */
export async function captureThumbnailAsync(source: HTMLCanvasElement): Promise<string | null> {
	try {
		if (source.width === 0 || source.height === 0) return null;
		if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined')
			return null;
		const crop = thumbnailCrop(source.width, source.height);
		const bitmap = await createImageBitmap(source, crop.x, crop.y, crop.width, crop.height, {
			resizeWidth: THUMB_WIDTH,
			resizeHeight: THUMB_HEIGHT,
			resizeQuality: 'medium'
		});
		const out = new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT);
		const ctx = out.getContext('2d');
		if (!ctx) {
			bitmap.close();
			return null;
		}
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const blob = await out.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
		const url = await new Promise<string | null>((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
		return url?.startsWith('data:image/jpeg') ? url : null;
	} catch {
		return null;
	}
}
