/**
 * A posable person (plan 341, ADR 0291): the character's pieces merged into one `SkinnedMesh` with
 * rigid one-bone weights and vertex colours, drawn with one shared `MeshStandardMaterial`
 * (`createCrewMaterial`): one draw call per figure, the same shader for every person. The caller
 * places and turns the mesh; `pose` moves the limbs.
 */
import {
	Bone,
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	Matrix4,
	MeshStandardMaterial,
	Skeleton,
	SkinnedMesh,
	Uint16BufferAttribute,
	type Material
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GeometryBuilder, SlotName } from '../parts/builder.ts';
import {
	BONES,
	PARENT,
	PIVOTS,
	buildCharacter,
	roleColour,
	type BoneName,
	type Role
} from './character.ts';
import { DEFAULT_APPEARANCE, OUTFITS, type CharacterSpec } from './outfits.ts';
import type { PersonPose } from './poses.ts';

/** The one material every walker shares: vertex colours, a soft cloth-and-vinyl finish. */
export function createCrewMaterial(): MeshStandardMaterial {
	const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
	m.name = 'crew';
	return m;
}

/** One geometry of every piece, coloured per role, with skin indices (one bone each). */
export function characterGeometry(spec: CharacterSpec): BufferGeometry {
	const outfit = OUTFITS[spec.outfit];
	const look = spec.appearance ?? DEFAULT_APPEARANCE;
	const colour = new Color();
	const parts = buildCharacter(spec).map((p) => {
		const g = p.geometry;
		const n = g.getAttribute('position').count;
		colour.setHex(roleColour(p.role, outfit, look));
		const c = new Float32Array(n * 3);
		const si = new Uint16Array(n * 4);
		const sw = new Float32Array(n * 4);
		const bone = BONES.indexOf(p.bone);
		for (let i = 0; i < n; i++) {
			c[i * 3] = colour.r;
			c[i * 3 + 1] = colour.g;
			c[i * 3 + 2] = colour.b;
			si[i * 4] = bone;
			sw[i * 4] = 1;
		}
		g.setAttribute('color', new Float32BufferAttribute(c, 3));
		g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
		g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
		return g;
	});
	const merged = mergeGeometries(parts, false);
	for (const g of parts) g.dispose();
	if (!merged) throw new Error('Crew geometry could not be merged');
	merged.deleteAttribute('uv');
	return merged;
}

export interface Person {
	mesh: SkinnedMesh;
	bones: Readonly<Record<BoneName, Bone>>;
	pose(p: PersonPose): void;
	dispose(): void;
}

export function createPerson(spec: CharacterSpec, material: Material): Person {
	const geometry = characterGeometry(spec);
	const bones = {} as Record<BoneName, Bone>;
	for (const name of BONES) {
		const b = new Bone();
		b.name = name;
		const at = PIVOTS[name];
		const parent = PARENT[name];
		const from = parent ? PIVOTS[parent] : [0, 0, 0];
		b.position.set(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
		bones[name] = b;
		if (parent) bones[parent].add(b);
	}
	const mesh = new SkinnedMesh(geometry, material);
	mesh.name = `crew-${spec.outfit}`;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.add(bones.root);
	mesh.updateMatrixWorld(true);
	mesh.bind(new Skeleton(BONES.map((n) => bones[n])));
	const rest = Object.fromEntries(BONES.map((n) => [n, bones[n].position.y])) as Record<
		BoneName,
		number
	>;
	return {
		mesh,
		bones,
		pose(p) {
			bones.body.position.y = rest.body + p.bob;
			bones.body.rotation.set(p.lean, 0, 0);
			bones.head.rotation.set(p.headPitch, p.headYaw, p.headRoll);
			bones.armL.rotation.set(-p.armLPitch, 0, p.armLRaise);
			bones.armR.rotation.set(-p.armRPitch, 0, -p.armRRaise);
			bones.legL.rotation.set(-p.legLPitch, 0, 0);
			bones.legR.rotation.set(-p.legRPitch, 0, 0);
		},
		dispose() {
			geometry.dispose();
			mesh.skeleton.dispose();
		}
	};
}

/** The material slot each role takes on a part model (the EVA suit, ADR 0291 point 4). */
const PART_SLOT: Readonly<Record<Role, SlotName>> = {
	skin: 'skin',
	hair: 'hair',
	eye: 'eye',
	pupil: 'rubber',
	mouth: 'rubber',
	tongue: 'blush',
	blush: 'blush',
	suit: 'paint-primary',
	legs: 'paint-primary',
	hat: 'paint-primary',
	pack: 'paint-primary',
	trim: 'metal',
	accent: 'paint-accent',
	boots: 'paint-secondary',
	gloves: 'paint-secondary',
	dark: 'rubber',
	metal: 'metal',
	lens: 'glass',
	paper: 'eye'
};

/**
 * Lays a figure into a part's builders: the helmet into `moving`, the rest into `fixed`, scaled by
 * `scale` with the feet at `footY` (part frame). Returns the head's centre, the helmet's pivot.
 */
export function addCharacterToPart(
	fixed: GeometryBuilder,
	moving: GeometryBuilder,
	spec: CharacterSpec,
	scale: number,
	footY: number
): [number, number, number] {
	const m = new Matrix4().makeScale(scale, scale, scale).setPosition(0, footY, 0);
	for (const p of buildCharacter(spec)) {
		(p.helmet ? moving : fixed).add(PART_SLOT[p.role], p.geometry, m);
	}
	return [0, footY + PIVOTS.head[1] * scale + 0.32 * scale, 0];
}

