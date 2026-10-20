/**
 * Map-view objects: the orbit line and the vessel marker. Three objects only; the sampling math
 * lives in `orbit-line.ts`.
 */
import type { Vec3 } from '@orbital/core';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
import type { VesselType } from '@orbital/core';
import { iconPath } from './map-style.ts';
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

	setColor(color: number): void {
		this.material.color.setHex(color);
	}

	/** Line width in px (the active orbit is drawn wider). */
	setWidth(width: number): void {
		this.material.linewidth = width;
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

const iconTextures = new Map<VesselType | 'none', Texture | null>();
const ICON_SIZE = 64;

/** The white glyph of a type on a transparent square (tinted by the sprite); null without a DOM. */
function iconTexture(type: VesselType | undefined): Texture | null {
	const key = type ?? 'none';
	if (iconTextures.has(key)) return iconTextures.get(key)!;
	let texture: Texture | null = null;
	if (typeof document !== 'undefined' && typeof Path2D !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = ICON_SIZE;
		const g = canvas.getContext('2d');
		if (g) {
			const k = ICON_SIZE / 24;
			g.scale(k, k);
			g.lineCap = 'round';
			g.lineJoin = 'round';
			const path = new Path2D(iconPath(type));
			// a dark outline under a white stroke keeps the glyph readable over a bright planet
			g.strokeStyle = 'rgba(8, 10, 14, 0.85)';
			g.lineWidth = 3.6;
			g.stroke(path);
			g.strokeStyle = '#ffffff';
			g.lineWidth = 1.9;
			g.stroke(path);
			texture = new CanvasTexture(canvas);
			texture.colorSpace = SRGBColorSpace;
		}
	}
	iconTextures.set(key, texture);
	return texture;
}

/**
 * A vessel on the map: the icon of its type (plan 258), sized by the host each frame so it stays
 * visible from any distance. Without a DOM (tests) it is a plain tinted square.
 */
export class VesselMarker {
	readonly object: Sprite;
	private readonly material: SpriteMaterial;
	private type: VesselType | undefined;

	constructor(color = 0xffd54f) {
		this.material = new SpriteMaterial({ color, depthTest: false, transparent: true });
		this.material.map = iconTexture(undefined);
		this.object = new Sprite(this.material);
		this.object.renderOrder = 10;
		this.object.visible = false;
	}

	setType(type: VesselType | undefined): void {
		if (type === this.type && this.material.map !== undefined) return;
		this.type = type;
		this.material.map = iconTexture(type);
		this.material.needsUpdate = true;
	}

	setColor(color: number): void {
		this.material.color.setHex(color);
	}

	/** `radius` is the old dot's radius; the icon is a little wider than the dot was. */
	place(position: Vec3, radius: number): void {
		this.object.position.set(position.x, position.y, position.z);
		this.object.scale.setScalar(radius * 2.6);
	}

	dispose(): void {
		this.material.dispose();
	}
}
