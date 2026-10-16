/**
 * Map-view objects: the orbit line and the vessel marker. Three objects only; the sampling math
 * lives in `orbit-line.ts`.
 */
import type { Vec3 } from '@orbital/core';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import { sampleOrbit, type OrbitalElements } from './orbit-line.ts';

const orbitKey = (el: OrbitalElements): string =>
	`${el.a},${el.e},${el.i},${el.raan},${el.argp},${el.m0},${el.epoch}`;

/** One orbit polyline. Points are relative to the SOI body, so position the object at the body. */
export class OrbitLine {
	readonly object: Line2;
	private readonly material: LineMaterial;
	private key = '';

	constructor(color = 0x4fc3f7, linewidth = 2) {
		this.material = new LineMaterial({ color, linewidth });
		this.object = new Line2(new LineGeometry(), this.material);
		this.object.visible = false;
		// Points span the whole orbit; the default bounding sphere is empty, so skip frustum culling.
		this.object.frustumCulled = false;
	}

	/** Re-samples only when the elements changed; `undefined` hides the line. */
	setOrbit(el: OrbitalElements | undefined, maxRadius?: number): void {
		if (!el) {
			this.object.visible = false;
			this.key = '';
			return;
		}
		const key = orbitKey(el);
		if (key !== this.key) {
			const flat: number[] = [];
			for (const p of sampleOrbit(el, maxRadius === undefined ? {} : { maxRadius })) {
				flat.push(p.x, p.y, p.z);
			}
			this.object.geometry.dispose();
			const geometry = new LineGeometry();
			geometry.setPositions(flat);
			this.object.geometry = geometry;
			this.key = key;
		}
		this.object.visible = true;
	}

	/** Draws the given points (relative to the object's position) instead of an orbit; `[]` hides the line. */
	setPoints(points: readonly Vec3[]): void {
		this.key = 'points';
		if (points.length < 2) {
			this.object.visible = false;
			return;
		}
		const flat: number[] = [];
		for (const p of points) flat.push(p.x, p.y, p.z);
		this.object.geometry.dispose();
		const geometry = new LineGeometry();
		geometry.setPositions(flat);
		this.object.geometry = geometry;
		this.object.visible = true;
	}

	/** `LineMaterial.linewidth` is in pixels and needs the viewport size. */
	setResolution(width: number, height: number): void {
		this.material.resolution.set(width, height);
	}

	dispose(): void {
		this.object.geometry.dispose();
		this.material.dispose();
	}
}

const markerGeometry = new SphereGeometry(1, 16, 8);

/** A vessel dot sized by the host each frame (`setScale`) so it stays visible from any distance. */
export class VesselMarker {
	readonly object: Mesh;
	private readonly material: MeshBasicMaterial;

	constructor(color = 0xffd54f) {
		this.material = new MeshBasicMaterial({ color });
		this.object = new Mesh(markerGeometry, this.material);
		this.object.visible = false;
	}

	place(position: Vec3, radius: number): void {
		this.object.position.set(position.x, position.y, position.z);
		this.object.scale.setScalar(radius);
	}

	dispose(): void {
		this.material.dispose();
	}
}
