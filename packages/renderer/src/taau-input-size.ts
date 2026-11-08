/**
 * The size of TAAU's input image (plan 418). three's TAAU node reads the scene pass's target size in a
 * hook that runs before the pass resizes its target (PassNode.updateBefore calls `setSize` with the
 * drawing buffer size times the resolution scale, floored). On the frame of a rung, preset or canvas
 * change that hook therefore sees the old size, and the mesh terrain's distance image, drawn from the
 * size it is given, came out at the old size while the scene drew at the new one. The renderer knows
 * the drawing buffer and the scale already, so it computes the size the pass is about to have.
 */
export function taauInputSize(
	drawingWidth: number,
	drawingHeight: number,
	scale: number
): { width: number; height: number } {
	// the same floor as PassNode.setSize; never an empty target
	return {
		width: Math.max(1, Math.floor(drawingWidth * scale)),
		height: Math.max(1, Math.floor(drawingHeight * scale))
	};
}
