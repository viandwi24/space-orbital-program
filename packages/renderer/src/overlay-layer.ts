/**
 * Mod overlays (plan 347, ADR 0296): the renderer's meshes for the shapes mods hand over as data.
 * Polylines are fat line segments (`LineMaterial`, which has a WebGPU twin), markers and labels are
 * sprites kept at their pixel size each frame. Body-fixed shapes hang under their body's holder so
 * they turn with the ground; inertial ones are placed at the body each sync. `on-top` shapes draw
 * without the depth test, after the scene.
 */
import {
	CanvasTexture,
	Group,
	SRGBColorSpace,
	Sprite,
	SpriteMaterial,
	type Object3D,
	type PerspectiveCamera,
	type Scene,
	type Texture,
	Vector3
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { dashSegments, type OverlayShape, type Vec3 } from '@orbital/core';
import { toRenderSpace } from './origin.ts';

/** One overlay's shapes as the host hands them over (already filtered by toggle and vessel). */
export interface OverlayInput {
	id: string;
	shapes: readonly OverlayShape[];
}

interface Drawn {
	shape: OverlayShape;
	object: Object3D;
	/** Sprites: their pixel size and the material to dispose. */
	px?: number;
	dispose(): void;
}

const ON_TOP_ORDER = 20;

/** `#rrggbb[aa]` to a hex colour and an opacity. */
function parseColor(c: string): { hex: number; opacity: number } {
	const hex = Number.parseInt(c.slice(1, 7), 16);
	const opacity = c.length === 9 ? Number.parseInt(c.slice(7, 9), 16) / 255 : 1;
	return { hex, opacity };
}

const glyphs = new Map<string, Texture | null>();
const GLYPH = 64;

/** A white glyph on a transparent square, tinted by the sprite; null without a DOM (tests). */
function glyph(style: string): Texture | null {
	if (glyphs.has(style)) return glyphs.get(style)!;
	let texture: Texture | null = null;
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = GLYPH;
		const g = canvas.getContext('2d');
		if (g) {
			const c = GLYPH / 2;
			const draw = (width: number, stroke: string): void => {
				g.strokeStyle = stroke;
				g.fillStyle = stroke;
				g.lineWidth = width;
				g.lineCap = 'round';
				g.beginPath();
				if (style === 'cross' || style === 'target') {
					const a = style === 'target' ? 12 : 6;
					for (const [dx, dy] of [
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1]
					] as const) {
						g.moveTo(c + dx * a, c + dy * a);
						g.lineTo(c + dx * 28, c + dy * 28);
					}
				}
				if (style === 'ring' || style === 'target')
					g.arc(c, c, style === 'target' ? 18 : 24, 0, Math.PI * 2);
				g.stroke();
				if (style === 'dot') {
					g.beginPath();
					g.arc(c, c, 10, 0, Math.PI * 2);
					g.fill();
				}
			};
			// a dark outline under the white glyph keeps it readable over a bright planet
			draw(9, 'rgba(8, 10, 14, 0.8)');
			draw(4.5, '#ffffff');
			texture = new CanvasTexture(canvas);
			texture.colorSpace = SRGBColorSpace;
		}
	}
	glyphs.set(style, texture);
	return texture;
}

/** A label's text on a canvas: white with a dark outline; its aspect for the sprite. */
function labelTexture(text: string): { texture: Texture | null; aspect: number } {
	if (typeof document === 'undefined') return { texture: null, aspect: 4 };
	const canvas = document.createElement('canvas');
	const g = canvas.getContext('2d');
	if (!g) return { texture: null, aspect: 4 };
	const font = '600 28px system-ui, sans-serif';
	g.font = font;
	const w = Math.ceil(g.measureText(text).width) + 16;
	canvas.width = w;
	canvas.height = 40;
	g.font = font;
	g.textBaseline = 'middle';
	g.lineJoin = 'round';
	g.strokeStyle = 'rgba(8, 10, 14, 0.85)';
	g.lineWidth = 6;
	g.strokeText(text, 8, 20);
	g.fillStyle = '#ffffff';
	g.fillText(text, 8, 20);
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	return { texture, aspect: w / 40 };
}

/** Where a shape's point is in its frame (the anchor of its object). */
const anchorOf = (s: OverlayShape): Vec3 => (s.kind === 'polyline' ? s.points[0]! : s.position);

export class OverlayLayer {
	private drawn: Drawn[] = [];
	private key = '';
	private readonly inertial = new Group();
	private resolution = { width: 1, height: 1 };

	constructor(
		scene: Scene,
		/** The body's holder (its centre and turning axes) in the scene, or undefined when not drawn. */
		private readonly holderOf: (body: string) => Object3D | undefined
	) {
		this.inertial.name = 'mod-overlays';
		scene.add(this.inertial);
	}

	/** Rebuilds the meshes when the shapes changed (compared as JSON). */
	set(layers: readonly OverlayInput[]): void {
		const key = JSON.stringify(layers);
		if (key === this.key) return;
		this.key = key;
		this.clear();
		for (const layer of layers) for (const shape of layer.shapes) this.build(shape);
	}

	private build(shape: OverlayShape): void {
		const { hex, opacity } = parseColor(shape.color);
		const onTop = (shape.depth ?? 'on-top') === 'on-top';
		const anchor = anchorOf(shape);
		let drawn: Drawn;
		if (shape.kind === 'polyline') {
			const rel = shape.points.map((p) => ({
				x: p.x - anchor.x,
				y: p.y - anchor.y,
				z: p.z - anchor.z
			}));
			const flat: number[] = [];
			for (const p of dashSegments(rel, shape.dash)) flat.push(p.x, p.y, p.z);
			const geometry = new LineSegmentsGeometry();
			geometry.setPositions(flat);
			const material = new LineMaterial({
				color: hex,
				linewidth: shape.width ?? 2,
				transparent: opacity < 1 || onTop,
				opacity,
				depthTest: !onTop,
				depthWrite: false
			});
			// the mod's colour as given: no exposure or tone curve (they washed the green to white)
			material.toneMapped = false;
			material.resolution.set(this.resolution.width, this.resolution.height);
			const line = new LineSegments2(geometry, material);
			line.frustumCulled = false;
			drawn = {
				shape,
				object: line,
				dispose: () => {
					geometry.dispose();
					material.dispose();
				}
			};
		} else {
			const label = shape.kind === 'label' ? labelTexture(shape.text) : null;
			const material = new SpriteMaterial({
				color: hex,
				opacity,
				transparent: true,
				depthTest: !onTop,
				depthWrite: false,
				map: label ? label.texture : glyph(shape.kind === 'marker' ? shape.style : 'dot')
			});
			material.toneMapped = false;
			const sprite = new Sprite(material);
			if (label) {
				// the text sits above and right of the point, clear of a marker there
				sprite.center.set(-0.04, -0.6);
				sprite.userData.aspect = label.aspect;
			}
			drawn = {
				shape,
				object: sprite,
				px: shape.kind === 'label' ? 18 : (shape.size ?? 20),
				dispose: () => {
					if (label?.texture) label.texture.dispose();
					material.dispose();
				}
			};
		}
		drawn.object.renderOrder = onTop ? ON_TOP_ORDER : 0;
		drawn.object.position.set(anchor.x, anchor.y, anchor.z);
		const parent = shape.frame === 'body-fixed' ? this.holderOf(shape.body) : this.inertial;
		if (!parent) return; // a body the scene does not draw: nothing to hang it on
		parent.add(drawn.object);
		this.drawn.push(drawn);
	}

	/** Inertial shapes at their body (after the floating origin moved); views by `map`. */
	place(bodyWorld: ReadonlyMap<string, Vec3>, origin: Vec3, map: boolean): void {
		for (const d of this.drawn) {
			const views = d.shape.views;
			const inView = !views || views.includes(map ? 'map' : 'flight');
			const centre = bodyWorld.get(d.shape.body);
			d.object.visible = inView && centre !== undefined;
			if (d.shape.frame !== 'inertial' || !centre) continue;
			const a = anchorOf(d.shape);
			const p = toRenderSpace({ x: centre.x + a.x, y: centre.y + a.y, z: centre.z + a.z }, origin);
			d.object.position.set(p.x, p.y, p.z);
		}
	}

	/** Every frame: sprites keep their pixel size at any distance. */
	frame(camera: PerspectiveCamera, viewportHeight: number): void {
		const k = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
		for (const d of this.drawn) {
			if (d.px === undefined || !d.object.visible) continue;
			const w = d.object.getWorldPosition(scratch);
			const dist = w.distanceTo(camera.position);
			const h = d.px * k * dist;
			const aspect = (d.object.userData.aspect as number | undefined) ?? 1;
			d.object.scale.set(h * aspect, h, 1);
		}
	}

	setResolution(width: number, height: number): void {
		this.resolution = { width, height };
		for (const d of this.drawn) {
			const m = (d.object as Partial<LineSegments2>).material as LineMaterial | undefined;
			if (m && 'resolution' in m) m.resolution.set(width, height);
		}
	}

	/** Number of shapes drawn (tests, Debug → Info). */
	get count(): number {
		return this.drawn.length;
	}

	clear(): void {
		for (const d of this.drawn) {
			d.object.removeFromParent();
			d.dispose();
		}
		this.drawn = [];
	}

	dispose(): void {
		this.clear();
		this.inertial.removeFromParent();
	}
}

const scratch = new Vector3();
