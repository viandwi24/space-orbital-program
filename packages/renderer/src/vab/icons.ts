/**
 * Catalogue icon framing (plan 022): an orthographic camera looking at a part from a fixed
 * three-quarter direction, sized so the part fills a square with a small margin.
 */
import { Box3, OrthographicCamera, Vector3, type Mesh, type Object3D } from 'three';

/**
 * Direction from the part towards the camera: from the side and about 15 degrees above (plan 291),
 * so a part reads by its silhouette and not by the face of its top joint.
 */
export const ICON_VIEW_DIR = new Vector3(0.66, 0.26, 0.7).normalize();

/**
 * Bounds of what is drawn: meshes on a visible path only (plan 291). `Box3.setFromObject` also
 * counts hidden pieces, such as an RCS block's plumes or a parachute's packed canopy, which made
 * small parts a dot in their icon. Falls back to the full bounds when nothing is visible.
 */
export function visibleBounds(root: Object3D): Box3 {
	const box = new Box3();
	root.updateMatrixWorld(true);
	root.traverseVisible((o) => {
		if ((o as Mesh).isMesh) box.expandByObject(o, false);
	});
	return box.isEmpty() ? new Box3().setFromObject(root) : box;
}

/**
 * Positions `camera` and sets its frustum to frame `box`; returns the half-height used. `aspect`
 * (width / height) widens the frustum for non-square thumbnails; the box always fits with `margin`.
 */
export function frameIcon(
	box: Box3,
	camera: OrthographicCamera,
	margin = 1.08,
	aspect = 1,
	dir: Vector3 = ICON_VIEW_DIR
): number {
	const centre = box.getCenter(new Vector3());
	const radius = box.getSize(new Vector3()).length() / 2;
	camera.position.copy(centre).addScaledVector(dir, radius * 4 + 1);
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
	half = (Math.max((maxX - minX) / aspect, maxY - minY) / 2) * margin;
	camera.left = cx - half * aspect;
	camera.right = cx + half * aspect;
	camera.top = cy + half;
	camera.bottom = cy - half;
	camera.near = 0.1;
	camera.far = radius * 8 + 4;
	camera.updateProjectionMatrix();
	return half;
}
