/**
 * Catalogue icon framing (plan 022): an orthographic camera looking at a part from a fixed
 * three-quarter direction, sized so the part fills a square with a small margin.
 */
import { Box3, OrthographicCamera, Vector3 } from 'three';

/** Direction from the part towards the camera. */
export const ICON_VIEW_DIR = new Vector3(0.62, 0.38, 0.69).normalize();

/** Positions `camera` and sets its frustum to frame `box`; returns the half-extent used. */
export function frameIcon(box: Box3, camera: OrthographicCamera, margin = 1.08): number {
	const centre = box.getCenter(new Vector3());
	const radius = box.getSize(new Vector3()).length() / 2;
	camera.position.copy(centre).addScaledVector(ICON_VIEW_DIR, radius * 4 + 1);
	camera.up.set(0, 1, 0);
	camera.lookAt(centre);
	camera.updateMatrixWorld(true);
	// Project the eight corners into camera space and take the largest half extent, so the square fits any part.
	const inv = camera.matrixWorldInverse;
	let half = 0;
	let cx = 0;
	let cy = 0;
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const x of [box.min.x, box.max.x]) {
		for (const y of [box.min.y, box.max.y]) {
			for (const z of [box.min.z, box.max.z]) {
				const p = new Vector3(x, y, z).applyMatrix4(inv);
				minX = Math.min(minX, p.x);
				maxX = Math.max(maxX, p.x);
				minY = Math.min(minY, p.y);
				maxY = Math.max(maxY, p.y);
			}
		}
	}
	cx = (minX + maxX) / 2;
	cy = (minY + maxY) / 2;
	half = (Math.max(maxX - minX, maxY - minY) / 2) * margin;
	camera.left = cx - half;
	camera.right = cx + half;
	camera.top = cy + half;
	camera.bottom = cy - half;
	camera.near = 0.1;
	camera.far = radius * 8 + 4;
	camera.updateProjectionMatrix();
	return half;
}
