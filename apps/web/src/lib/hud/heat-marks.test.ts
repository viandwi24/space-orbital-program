import { bodyId, entityId, type Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { HEAT_BARS, heatMarks } from './heat-marks';

const part = (id: number, temperature: number, maxTemperature = 1000) => ({
	id: entityId(id),
	position: { x: id, y: 0, z: 0 },
	temperature,
	maxTemperature
});
const snap = (parts: object[]): Snapshot =>
	({
		t: 0,
		bodies: [{ id: bodyId('stock.home'), position: { x: 100, y: 0, z: 0 } }],
		vessels: [
			{ id: entityId(1), soi: bodyId('stock.home'), position: { x: 10, y: 0, z: 0 }, parts }
		]
	}) as unknown as Snapshot;
const project = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y });

describe('heatMarks', () => {
	it('lists only the parts that show a temperature, hottest first, at their projected spot', () => {
		const marks = heatMarks(snap([part(1, 300), part(2, 700), part(3, 950)]), entityId(1), project);
		expect(marks.map((m) => Number(m.part))).toEqual([3, 2]);
		expect(marks[0]).toMatchObject({ x: 113, fill: 0.95, critical: true });
		expect(marks[1]).toMatchObject({ x: 112, fill: 0.7, critical: false });
	});
	it('caps the bars, skips parts behind the camera and clamps over-limit parts to a full bar', () => {
		const many = Array.from({ length: HEAT_BARS + 3 }, (_, i) => part(i + 1, 800 + i));
		expect(heatMarks(snap(many), entityId(1), project)).toHaveLength(HEAT_BARS);
		expect(heatMarks(snap([part(1, 2000)]), entityId(1), project)[0]!.fill).toBe(1);
		expect(heatMarks(snap([part(1, 900)]), entityId(1), () => null)).toEqual([]);
		expect(heatMarks(snap([part(1, 900)]), entityId(9), project)).toEqual([]);
	});
});
