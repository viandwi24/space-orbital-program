/**
 * Ripples and splashes at the waterline (plan 193, ADR 0182). A part crosses the water plane when
 * its bounding sphere spans the body's radius over water. It gets rings that expand and fade; a
 * part that has just come down into the water at speed also gets a splash. Everything follows from
 * the snapshot: no sim state, no extra protocol.
 */
import type { Quat, Vec3 } from '@orbital/core';
import {
	ConeGeometry,
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	Object3D,
	Quaternion,
	RingGeometry,
	Vector3
} from 'three';

export interface WaterlinePart {
	/** Stable id of the part across snapshots. */
	key: string;
	/** Part centre relative to the body centre, inertial axes, m. */
	centre: Vec3;
	/** Radius of the part's bounding sphere, m. */
	reach: number;
	/** Width of the part across, m (sets the ring size). */
	width: number;
}

export interface WaterlineCrossing {
	key: string;
	/** Where the part meets the water: its centre dropped onto the water plane, body-relative, m. */
	point: Vec3;
	/** Unit up at that point (inertial axes). */
	up: Vec3;
	width: number;
}

const rotateInverse = (q: Quat, v: Vec3): Vec3 => {
	// v' = q* v q
	const [x, y, z, w] = [-q.x, -q.y, -q.z, q.w];
	const ix = w * v.x + y * v.z - z * v.y;
	const iy = w * v.y + z * v.x - x * v.z;
	const iz = w * v.z + x * v.y - y * v.x;
	const iw = -x * v.x - y * v.y - z * v.z;
	return {
		x: ix * w + iw * -x + iy * -z - iz * -y,
		y: iy * w + iw * -y + iz * -x - ix * -z,
		z: iz * w + iw * -z + ix * -y - iy * -x
	};
};

/**
 * The parts that cross the water plane (`|r| = radius`) over water. `bodyRotation` turns body-fixed
 * into inertial axes, and `waterAt` takes a body-fixed unit direction, as the sim's `waterUnder` does.
 */
export function waterlineCrossings(
	parts: readonly WaterlinePart[],
	bodyRotation: Quat,
	radius: number,
	waterAt: (direction: Vec3) => boolean
): WaterlineCrossing[] {
	const out: WaterlineCrossing[] = [];
	for (const p of parts) {
		const r = Math.hypot(p.centre.x, p.centre.y, p.centre.z);
		if (r === 0 || Math.abs(r - radius) > p.reach) continue;
		const up = { x: p.centre.x / r, y: p.centre.y / r, z: p.centre.z / r };
		if (!waterAt(rotateInverse(bodyRotation, up))) continue;
		out.push({
			key: p.key,
			point: { x: up.x * radius, y: up.y * radius, z: up.z * radius },
			up,
			width: p.width
		});
	}
	return out;
}

/** Seconds one ripple ring takes to expand and fade; three rings run a third apart. */
export const RIPPLE_PERIOD = 1.8;
export const RIPPLE_RINGS = 3;
/** Seconds a splash lasts, and the downward speed below which a part entering the water makes none, m/s. */
export const SPLASH_DURATION = 1.4;
export const SPLASH_MIN_SPEED = 2;
/** At most this many crossings get rings (the effects budget, ADR 0090). */
export const MAX_RIPPLE_PARTS = 16;

/** Ring `k` at time `t`: radius as a multiple of the part width, and opacity. */
export function rippleRing(t: number, k: number): { scale: number; opacity: number } {
	const f = (((t / RIPPLE_PERIOD + k / RIPPLE_RINGS) % 1) + 1) % 1;
	return { scale: 0.55 + 1.4 * f, opacity: 0.45 * (1 - f) * Math.min(1, f * 6) };
}

/** A splash `age` seconds old: ring radius and spray height as multiples of the part width, opacity. */
export function splashState(age: number): { ring: number; spray: number; opacity: number } {
	if (!(age >= 0) || age >= SPLASH_DURATION) return { ring: 0, spray: 0, opacity: 0 };
	const f = age / SPLASH_DURATION;
	return {
		ring: 0.6 + 3.4 * (1 - (1 - f) * (1 - f)),
		spray: 2.2 * Math.sin(Math.PI * Math.min(1, f * 1.4)),
		opacity: 0.8 * (1 - f)
	};
}

const ringGeometry = new RingGeometry(0.42, 0.5, 48);
const sprayGeometry = new ConeGeometry(0.5, 1, 20, 1, true);
const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);

interface Splash {
	age: number;
	ring: Mesh;
	spray: Mesh;
}

/** The meshes: rings per crossing part, splashes on fresh entries. Positions are set in render space. */
export class WaterlineEffects {
	/** A plain `Object3D`: the scene's direct `Group` children are the vessels. */
	readonly root = new Object3D();
	private readonly rings: Mesh[] = [];
	private readonly splashes = new Map<string, Splash>();
	private wet = new Set<string>();
	private time = 0;

	constructor() {
		this.root.name = 'waterline';
		for (let k = 0; k < MAX_RIPPLE_PARTS * RIPPLE_RINGS; k++) {
			const mesh = new Mesh(ringGeometry, this.material(0xe8f4ff));
			mesh.visible = false;
			this.rings.push(mesh);
			this.root.add(mesh);
		}
	}

	private material(color: number): MeshBasicMaterial {
		return new MeshBasicMaterial({
			color,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			side: DoubleSide
		});
	}

	/** Rings that show now (for tests and the frame budget). */
	get activeRings(): number {
		return this.rings.filter((r) => r.visible).length;
	}
	get activeSplashes(): number {
		return this.splashes.size;
	}

	/**
	 * Place this frame's effects. `toRender` maps a body-relative point to render space; `downSpeed`
	 * is the part's speed into the water, m/s (positive down), to decide a splash on entry.
	 */
	update(
		crossings: readonly WaterlineCrossing[],
		dt: number,
		toRender: (bodyRelative: Vec3) => Vec3,
		downSpeed: (key: string) => number
	): void {
		this.time += Math.max(0, dt);
		const now = new Set(crossings.map((c) => c.key));
		let used = 0;
		const q = new Quaternion();
		for (const c of crossings.slice(0, MAX_RIPPLE_PARTS)) {
			const at = toRender(c.point);
			q.setFromUnitVectors(Z, new Vector3(c.up.x, c.up.y, c.up.z));
			for (let k = 0; k < RIPPLE_RINGS; k++) {
				const mesh = this.rings[used++]!;
				const { scale, opacity } = rippleRing(this.time + c.key.length * 0.37, k);
				mesh.position.set(at.x, at.y, at.z);
				mesh.quaternion.copy(q);
				mesh.scale.setScalar(Math.max(0.5, c.width) * scale * 2);
				(mesh.material as MeshBasicMaterial).opacity = opacity;
				mesh.visible = true;
			}
			if (
				!this.wet.has(c.key) &&
				!this.splashes.has(c.key) &&
				downSpeed(c.key) >= SPLASH_MIN_SPEED
			) {
				const splash: Splash = {
					age: 0,
					ring: new Mesh(ringGeometry, this.material(0xffffff)),
					spray: new Mesh(sprayGeometry, this.material(0xf2f8ff))
				};
				this.root.add(splash.ring, splash.spray);
				this.splashes.set(c.key, splash);
			}
			const s = this.splashes.get(c.key);
			if (s) {
				s.ring.position.set(at.x, at.y, at.z);
				s.ring.quaternion.copy(q);
				s.spray.quaternion.setFromUnitVectors(Y, new Vector3(c.up.x, c.up.y, c.up.z));
				s.spray.userData['at'] = at;
				s.spray.userData['up'] = c.up;
				s.spray.userData['width'] = c.width;
			}
		}
		for (let k = used; k < this.rings.length; k++) this.rings[k]!.visible = false;
		for (const [key, s] of this.splashes) {
			s.age += Math.max(0, dt);
			const st = splashState(s.age);
			if (st.opacity <= 0) {
				s.ring.removeFromParent();
				s.spray.removeFromParent();
				(s.ring.material as MeshBasicMaterial).dispose();
				(s.spray.material as MeshBasicMaterial).dispose();
				this.splashes.delete(key);
				continue;
			}
			const width = Math.max(0.5, (s.spray.userData['width'] as number | undefined) ?? 1);
			s.ring.scale.setScalar(width * st.ring * 2);
			(s.ring.material as MeshBasicMaterial).opacity = st.opacity;
			const at = s.spray.userData['at'] as Vec3 | undefined;
			const up = s.spray.userData['up'] as Vec3 | undefined;
			if (at && up) {
				const h = width * st.spray;
				s.spray.position.set(at.x + (up.x * h) / 2, at.y + (up.y * h) / 2, at.z + (up.z * h) / 2);
				s.spray.scale.set(width * 1.2, Math.max(1e-3, h), width * 1.2);
			}
			(s.spray.material as MeshBasicMaterial).opacity = st.opacity * 0.7;
		}
		this.wet = now;
	}

	dispose(): void {
		for (const r of this.rings) (r.material as MeshBasicMaterial).dispose();
		for (const s of this.splashes.values()) {
			(s.ring.material as MeshBasicMaterial).dispose();
			(s.spray.material as MeshBasicMaterial).dispose();
		}
		this.splashes.clear();
		this.root.clear();
	}
}
