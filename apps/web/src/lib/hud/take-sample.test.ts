import { describe, expect, it } from 'vitest';
import { takeableSample } from './take-sample';

const part = (id: number, x: number, held: boolean) => ({
	id,
	definition: 'stock.surface-sampler',
	position: { x, y: 0, z: 0 },
	modules: { 'stock.experiment': { holdsSample: held } }
});
const snapshot = (extra: object[] = []) =>
	({
		vessels: [
			{ id: 9, soi: 'home', position: { x: 0, y: 0, z: 0 }, parts: [] },
			{
				id: 1,
				soi: 'home',
				position: { x: 10, y: 0, z: 0 },
				parts: [part(5, -8, true), part(6, 3, true)]
			},
			...extra
		]
	}) as never;

describe('takeableSample', () => {
	it('is the nearest part that holds a sample within reach', () => {
		const offer = takeableSample(snapshot(), 9);
		expect(offer).toMatchObject({ vessel: 1, part: 5 }); // 2 m away; the other is 13 m
	});
	it('is null out of reach, or when no part holds a sample', () => {
		const far = {
			vessels: [
				{ id: 9, soi: 'home', position: { x: 0, y: 0, z: 0 }, parts: [] },
				{ id: 1, soi: 'home', position: { x: 50, y: 0, z: 0 }, parts: [part(5, 0, true)] }
			]
		} as never;
		expect(takeableSample(far, 9)).toBeNull();
		const empty = {
			vessels: [
				{ id: 9, soi: 'home', position: { x: 0, y: 0, z: 0 }, parts: [] },
				{ id: 1, soi: 'home', position: { x: 1, y: 0, z: 0 }, parts: [part(5, 0, false)] }
			]
		} as never;
		expect(takeableSample(empty, 9)).toBeNull();
	});
});
