/** Design format 5 (plan 358, ADR 0333): the inverse side link, placed where the radial link it reverses puts the parts. */
import { describe, expect, test } from 'bun:test';
import {
	isInverseLink,
	partId,
	resolveVesselDesign,
	type PartDefinition,
	type VesselDesign
} from '../src/index.ts';

const stackNodes = (h: number) => ({
	top: {
		pos: [0, h / 2, 0] as [number, number, number],
		dir: [0, 1, 0] as [number, number, number]
	},
	bottom: {
		pos: [0, -h / 2, 0] as [number, number, number],
		dir: [0, -1, 0] as [number, number, number]
	}
});
const defs = new Map<string, PartDefinition>([
	[
		'test.pod',
		{
			id: 'test.pod',
			title: 'pod',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.5, height: 1 },
			attach: stackNodes(1)
		}
	],
	[
		'test.tank',
		{
			id: 'test.tank',
			title: 'tank',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.5, height: 2 },
			attach: stackNodes(2)
		}
	],
	[
		'test.plate',
		{
			id: 'test.plate',
			title: 'plate',
			mass: 1,
			shape: { kind: 'box', size: [0.2, 0.4, 0.4] },
			attach: { radial: { pos: [-0.1, 0, 0], dir: [-1, 0, 0] } }
		}
	]
]);
const lookup = { get: (id: string) => defs.get(id) };
const pod = { index: 0, part: partId('test.pod'), parent: null };
const plate = (parent: VesselDesign['parts'][number]['parent']) => ({
	index: 1,
	part: partId('test.plate'),
	parent
});
const design = (parts: VesselDesign['parts'], formatVersion: VesselDesign['formatVersion'] = 5) =>
	({ formatVersion, name: 'inverse', parts, stages: [] }) as VesselDesign;
const ok = (d: VesselDesign) => {
	const r = resolveVesselDesign(d, lookup);
	if (!r.ok) throw new Error(r.errors.join('; '));
	return r.parts;
};

describe('the inverse side link', () => {
	// the plate on the pod's side by a radial link, and the pod on the plate's node by its own surface
	const radial = plate({
		index: 0,
		parentNode: 'surface',
		node: 'radial',
		radial: { angle: 0, y: 0 }
	});
	const inverse = {
		...pod,
		parent: {
			index: 1,
			parentNode: 'radial',
			node: 'surface',
			surface: {
				point: [0.5, 0, 0] as [number, number, number],
				normal: [1, 0, 0] as [number, number, number]
			}
		}
	};

	test('puts the pod where the radial link has it relative to the plate', () => {
		const a = ok(design([pod, radial]));
		const b = ok(design([{ ...plate(null) }, inverse]));
		expect(isInverseLink(inverse.parent)).toBe(true);
		const near = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThan(1e-9);
		near(b[0]!.position.x - b[1]!.position.x, a[0]!.position.x - a[1]!.position.x);
		near(b[0]!.position.y - b[1]!.position.y, a[0]!.position.y - a[1]!.position.y);
		near(b[0]!.position.z - b[1]!.position.z, a[0]!.position.z - a[1]!.position.z);
	});

	test('needs format 5, a point on the child and a node of the parent', () => {
		const err = (d: VesselDesign) => {
			const r = resolveVesselDesign(d, lookup);
			return r.ok ? '' : r.errors.join('; ');
		};
		const root = plate(null);
		expect(err(design([root, inverse], 4))).toContain('needs formatVersion 5');
		const far = {
			...inverse,
			parent: {
				...inverse.parent,
				surface: {
					point: [3, 0, 0] as [number, number, number],
					normal: [1, 0, 0] as [number, number, number]
				}
			}
		};
		expect(err(design([root, far]))).toContain('is not on');
		expect(
			err(design([root, { ...inverse, parent: { ...inverse.parent, parentNode: 'nowhere' } }]))
		).toContain('has no node "nowhere"');
	});

	test('a format 4 design with a plain surface link is untouched', () => {
		expect(ok(design([pod, radial], 4))).toHaveLength(2);
	});
});
