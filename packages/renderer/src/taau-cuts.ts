/**
 * Camera cuts for TAAU (plan 393, ADR 0331): the frames after which the history is no use. The
 * resolve reprojects last frame's image with the velocity of what moved; when the camera was put
 * somewhere else (the map opened, another vessel, a launch, a teleport by the debug tools, a jump of
 * the field of view) there is nothing to reproject from and the history must start again. Pure:
 * the renderer feeds it what it knows each frame.
 */

export interface CutInput {
	/** What the view is showing: the map or the flight, the vessel followed, the focus; a change is a cut. */
	view: string;
	/** The camera's vertical field of view, degrees. */
	fov: number;
	/** The camera's orientation as a unit quaternion (x, y, z, w). */
	rotation: readonly [number, number, number, number];
	/** The canvas size the pipeline draws, px. */
	size: readonly [number, number];
	/** The preset and the TAAU scale the pipeline was built for. */
	pipeline: string;
}

/** A turn of this many radians between two frames is a cut (the camera was placed, not moved). */
export const CUT_TURN = 1.2;
/** A change of the field of view over this share is a cut (a zoom is not). */
export const CUT_FOV = 0.25;

/** The angle between two orientations, rad. */
export function turnBetween(
	a: readonly [number, number, number, number],
	b: readonly [number, number, number, number]
): number {
	const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
	return 2 * Math.acos(Math.min(1, d));
}

/** Remembers the last frame and says whether this one is a cut. */
export class CutDetector {
	private last: CutInput | null = null;

	/** True when the history of the frame before is no use to this frame. The first frame is a cut. */
	observe(now: CutInput): boolean {
		const was = this.last;
		this.last = now;
		if (!was) return true;
		if (now.view !== was.view || now.pipeline !== was.pipeline) return true;
		if (now.size[0] !== was.size[0] || now.size[1] !== was.size[1]) return true;
		if (Math.abs(now.fov - was.fov) > CUT_FOV * was.fov) return true;
		return turnBetween(was.rotation, now.rotation) > CUT_TURN;
	}

	/** Forget the last frame: the next one is a cut. */
	reset(): void {
		this.last = null;
	}
}
