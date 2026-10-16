/**
 * Selection, hover and ghost looks of the VAB view (plan 022), plus the attach-node markers.
 * Highlights are a second mesh on the part's own geometry with an additive rim shader, so the part
 * keeps its real materials; the ghost swaps them for one translucent material.
 */
import {
	AdditiveBlending,
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	Object3D,
	Quaternion,
	RingGeometry,
	ShaderMaterial,
	TorusGeometry,
	Vector3,
	type Material
} from 'three';
import type { VabNode, VabNodeState } from './scene-model.ts';

/** `xray` is the faint see-through pass of a ghost (depth test off), so a copy behind the vessel still reads. */
export type HighlightKind = 'hover' | 'select' | 'flag' | 'ghost' | 'xray';

/** Colours match the UI tokens (`--c-accent`, `--c-positive`, `--c-danger`). */
export const HIGHLIGHT_COLOURS = {
	accent: 0x5ccfff,
	positive: 0x5fe3a1,
	danger: 0xff6a6a
} as const;

interface Look {
	colour: number;
	base: number;
	rim: number;
	pulse: number;
	/** Exponent of the rim falloff: lower is a wider band (a thicker outline). */
	power: number;
}

const LOOKS: Record<HighlightKind, Look> = {
	hover: { colour: HIGHLIGHT_COLOURS.accent, base: 0.1, rim: 1.1, pulse: 0, power: 2.2 },
	select: { colour: HIGHLIGHT_COLOURS.accent, base: 0.16, rim: 2.2, pulse: 0.25, power: 2.2 },
	flag: { colour: HIGHLIGHT_COLOURS.danger, base: 0.22, rim: 1.6, pulse: 0.35, power: 2.2 },
	ghost: { colour: HIGHLIGHT_COLOURS.positive, base: 0.05, rim: 1.4, pulse: 0.15, power: 2.2 },
	// A flat fin seen face-on has no rim, so the fill must show it on its own.
	xray: { colour: HIGHLIGHT_COLOURS.positive, base: 0.17, rim: 1.0, pulse: 0.1, power: 1.6 }
};

/**
 * High-contrast looks: no pulsing (steady outlines are easier to see), wider rims, brighter and
 * more saturated colours. Rim and fill are additive over the dark hangar, so the outline luminance
 * is far above the 4.5:1 that WCAG asks for text (checked in `highlight.test.ts`).
 */
const HIGH_CONTRAST: Record<HighlightKind, Look> = {
	hover: { colour: 0xcff6ff, base: 0.22, rim: 2.2, pulse: 0, power: 1.0 },
	select: { colour: 0xffffff, base: 0.3, rim: 3.2, pulse: 0, power: 1.0 },
	flag: { colour: 0xff8a8a, base: 0.34, rim: 2.8, pulse: 0, power: 1.0 },
	ghost: { colour: 0xa8ffd0, base: 0.08, rim: 1.5, pulse: 0, power: 1.0 },
	xray: { colour: 0xa8ffd0, base: 0.12, rim: 1.2, pulse: 0, power: 0.9 }
};

const VERT = `
varying vec3 vN;
varying vec3 vV;
void main() {
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	vN = normalize(normalMatrix * normal);
	vV = normalize(-mv.xyz);
	gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform vec3 uColor;
uniform float uBase;
uniform float uRim;
uniform float uPulse;
uniform float uTime;
uniform float uPower;
varying vec3 vN;
varying vec3 vV;
void main() {
	// max(): a rounding error can push the dot product past 1, and pow of a negative is NaN, which the bloom blur spreads into black blocks.
	float f = pow(max(0.0, 1.0 - abs(dot(normalize(vN), normalize(vV)))), uPower);
	float p = 1.0 + uPulse * sin(uTime * 4.0);
	gl_FragColor = vec4(uColor * (uBase + uRim * f) * p, 1.0);
}`;

/** One shared material per kind; the view updates `uTime` on all of them. */
export class HighlightMaterials {
	private readonly materials = new Map<HighlightKind, ShaderMaterial>();
	private highContrast = false;
	readonly ghost = new MeshStandardMaterial({
		color: 0x9fe4ff,
		transparent: true,
		opacity: 0.5,
		roughness: 0.35,
		metalness: 0.1,
		emissive: new Color(0x2a8fb8),
		emissiveIntensity: 0.6,
		depthWrite: false
	});

	get(kind: HighlightKind): ShaderMaterial {
		let m = this.materials.get(kind);
		if (!m) {
			const look = this.look(kind);
			m = new ShaderMaterial({
				vertexShader: VERT,
				fragmentShader: FRAG,
				transparent: true,
				depthWrite: false,
				// The x-ray pass shows through whatever stands in front.
				depthTest: kind !== 'xray',
				blending: AdditiveBlending,
				polygonOffset: true,
				polygonOffsetFactor: -1,
				polygonOffsetUnits: -1,
				uniforms: {
					uColor: { value: new Color(look.colour) },
					uBase: { value: look.base },
					uRim: { value: look.rim },
					uPulse: { value: look.pulse },
					uPower: { value: look.power },
					uTime: { value: 0 }
				}
			});
			this.materials.set(kind, m);
		}
		return m;
	}

	private look(kind: HighlightKind): Look {
		return (this.highContrast ? HIGH_CONTRAST : LOOKS)[kind];
	}

	/** Thicker, brighter, steady outlines for the high-contrast option. */
	setHighContrast(on: boolean): void {
		this.highContrast = on;
		for (const [kind, m] of this.materials) {
			const look = this.look(kind);
			(m.uniforms.uColor!.value as Color).set(look.colour);
			m.uniforms.uBase!.value = look.base;
			m.uniforms.uRim!.value = look.rim;
			m.uniforms.uPulse!.value = look.pulse;
			m.uniforms.uPower!.value = look.power;
		}
		this.ghost.opacity = on ? 0.62 : 0.5;
		this.ghost.color.set(on ? 0xd6f6ff : 0x9fe4ff);
		this.ghost.emissive.set(on ? 0x46b4dc : 0x2a8fb8);
		this.ghost.emissiveIntensity = on ? 0.4 : 0.6;
	}

	/** Look parameters in force, for tests and the page's legend. */
	lookOf(kind: HighlightKind): Readonly<Look> {
		return this.look(kind);
	}

	setTime(t: number): void {
		for (const m of this.materials.values()) m.uniforms.uTime!.value = t;
	}

	dispose(): void {
		for (const m of this.materials.values()) m.dispose();
		this.ghost.dispose();
		this.materials.clear();
	}
}

/** Adds an overlay mesh to every mesh under `root`; returns them for removal. */
export function addOverlay(root: Object3D, material: Material): Mesh[] {
	const added: Mesh[] = [];
	root.traverse((o) => {
		if (!(o instanceof Mesh) || o.userData.overlay) return;
		const overlay = new Mesh(o.geometry as BufferGeometry, material);
		overlay.userData.overlay = true;
		overlay.raycast = () => {};
		overlay.renderOrder = 5;
		o.add(overlay);
		added.push(overlay);
	});
	return added;
}

export function removeOverlay(meshes: readonly Mesh[]): void {
	for (const m of meshes) m.removeFromParent();
}

/** Turns a part model into a ghost: one translucent material and no shadows. */
export function makeGhost(root: Object3D, material: Material): void {
	root.traverse((o) => {
		if (o instanceof Mesh) {
			o.material = material;
			o.castShadow = false;
			o.receiveShadow = false;
		}
	});
}

// --- attach node markers ------------------------------------------------------------------------------------

const NODE_STYLE: Record<VabNodeState, { colour: number; opacity: number; scale: number }> = {
	free: { colour: HIGHLIGHT_COLOURS.accent, opacity: 0.55, scale: 1 },
	target: { colour: HIGHLIGHT_COLOURS.accent, opacity: 1, scale: 1.08 },
	active: { colour: HIGHLIGHT_COLOURS.positive, opacity: 1, scale: 1.18 }
};

/** Geometry and materials shared by all node markers. */
export class NodeMarkerKit {
	private readonly ring = new TorusGeometry(1, 0.035, 10, 64);
	/** High contrast: twice the tube, so the ring is at least 3 px wide at working distances. */
	private readonly ringThick = new TorusGeometry(1, 0.075, 12, 64);
	private highContrast = false;
	private readonly disc = new RingGeometry(0.0, 0.92, 48, 1);
	private readonly shaft = new CylinderGeometry(0.018, 0.018, 1, 8).translate(0, 0.5, 0);
	private readonly head = new ConeGeometry(0.08, 0.2, 14).translate(0, 0.1, 0);
	private readonly materials = new Map<string, MeshBasicMaterial>();

	private material(state: VabNodeState, part: 'ring' | 'disc'): MeshBasicMaterial {
		const key = `${state}|${part}`;
		let m = this.materials.get(key);
		if (!m) {
			const s = NODE_STYLE[state];
			const hc = this.highContrast;
			m = new MeshBasicMaterial({
				color: new Color(hc && state !== 'active' ? 0xd9f6ff : s.colour).multiplyScalar(
					part === 'ring' ? (hc ? 3 : 2.4) : 1.0
				),
				transparent: true,
				opacity: part === 'ring' ? (hc ? Math.max(0.92, s.opacity) : s.opacity) : s.opacity * 0.22,
				blending: AdditiveBlending,
				depthTest: false,
				depthWrite: false,
				toneMapped: false
			});
			this.materials.set(key, m);
		}
		return m;
	}

	/** Switches the ring style; the caller rebuilds the markers it holds. */
	setHighContrast(on: boolean): void {
		if (this.highContrast === on) return;
		this.highContrast = on;
		for (const m of this.materials.values()) m.dispose();
		this.materials.clear();
	}

	/** A marker standing at the node, facing along `dir`: ring around the end face, disc, short arrow. */
	create(node: VabNode): Group {
		const g = new Group();
		g.userData.state = node.state;
		g.position.set(...node.position);
		const dir = new Vector3(...node.dir).normalize();
		g.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir));
		const r = node.radius * 1.12;
		const ring = new Mesh(
			this.highContrast ? this.ringThick : this.ring,
			this.material(node.state, 'ring')
		);
		ring.scale.setScalar(r);
		const disc = new Mesh(this.disc, this.material(node.state, 'disc'));
		disc.scale.setScalar(r);
		g.add(ring, disc);
		if (node.state !== 'free') {
			// Arrow along +Z of the marker (= dir): shows where the new part will go.
			const len = Math.max(0.5, node.radius * 0.9);
			const shaft = new Mesh(this.shaft, this.material(node.state, 'ring'));
			shaft.rotation.x = Math.PI / 2;
			shaft.scale.set(1, len, 1);
			const head = new Mesh(this.head, this.material(node.state, 'ring'));
			head.rotation.x = Math.PI / 2;
			head.position.z = len;
			g.add(shaft, head);
		}
		for (const o of g.children) {
			o.renderOrder = 20;
			o.raycast = () => {};
		}
		g.scale.setScalar(NODE_STYLE[node.state].scale);
		return g;
	}

	dispose(): void {
		this.ring.dispose();
		this.ringThick.dispose();
		this.disc.dispose();
		this.shaft.dispose();
		this.head.dispose();
		for (const m of this.materials.values()) m.dispose();
	}
}

/** Pulse of the markers that invite a click. */
export function pulseMarkers(markers: Iterable<Object3D>, time: number): void {
	for (const m of markers) {
		const state = m.userData.state as VabNodeState;
		if (state === 'free') continue;
		m.scale.setScalar(NODE_STYLE[state].scale * (1 + 0.06 * Math.sin(time * 5)));
	}
}
