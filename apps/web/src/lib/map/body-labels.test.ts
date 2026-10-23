import { describe, expect, it } from 'vitest';
import { STOCK_BODY_IDS } from './body-labels-fixture';
import {
	placeBodyLabels,
	projectBodies,
	siteLabelsShown,
	SITE_LABEL_MIN_RADIUS,
	type ScreenBody
} from './body-labels';

const name = (id: string) => id.slice(id.lastIndexOf('.') + 1);
const W = 1280;
const H = 800;

describe('body names on the map (plan 382)', () => {
	it('projects the centre and the disc radius of a body', () => {
		const project = (p: { x: number; y: number; z: number }) => ({
			x: 100 + p.x / 1000,
			y: 200 + p.y / 1000,
			hidden: false
		});
		const [b] = projectBodies(
			[{ id: 'a', position: { x: 0, y: 0, z: 0 } }],
			new Map([['a', 50_000]]),
			project
		);
		expect(b).toMatchObject({ id: 'a', x: 100, y: 200, hidden: false });
		expect(b!.radius).toBeCloseTo(50, 6);
		// the centre reads hidden inside its own sphere; only another body hides it
		const inside = (p: { x: number; y: number; z: number }) => ({
			x: 100 + p.x / 1000,
			y: 200 + p.y / 1000,
			hidden: p.x === 0 && p.y === 0
		});
		const at = [{ id: 'a', position: { x: 0, y: 0, z: 0 } }];
		const radii = new Map([['a', 50_000]]);
		expect(projectBodies(at, radii, inside)[0]!.hidden).toBe(false);
		const covered = () => ({ x: 1, y: 1, hidden: true });
		expect(projectBodies(at, radii, covered)[0]!.hidden).toBe(true);
	});

	it('names every one of 15 well-separated bodies of the overview', () => {
		const bodies: ScreenBody[] = STOCK_BODY_IDS.map((id, i) => ({
			id,
			x: 80 + (i % 5) * 240,
			y: 120 + Math.floor(i / 5) * 200,
			radius: 3,
			hidden: false
		}));
		const labels = placeBodyLabels(bodies, name, W, H);
		expect(labels).toHaveLength(15);
		expect(labels.every((l) => l.text.length > 0)).toBe(true);
	});

	it('crowded bodies: the bigger keeps its name, a name never covers another', () => {
		const crowd: ScreenBody[] = [
			{ id: 'sun', x: 600, y: 400, radius: 20, hidden: false },
			{ id: 'kiln', x: 603, y: 402, radius: 2, hidden: false },
			{ id: 'vesper', x: 640, y: 400, radius: 3, hidden: false },
			{ id: 'home', x: 900, y: 300, radius: 4, hidden: false }
		];
		const labels = placeBodyLabels(crowd, name, W, H);
		const ids = labels.map((l) => l.id);
		expect(ids).toContain('sun');
		expect(ids).not.toContain('kiln');
		expect(ids).toContain('home');
		for (const a of labels)
			for (const b of labels)
				if (a !== b)
					expect(Math.abs(a.x - b.x) > 20 || Math.abs(a.y - b.y) >= 15).toBe(true);
	});

	it('leaves out bodies that are off screen, hidden behind another, or fill the view', () => {
		const labels = placeBodyLabels(
			[
				{ id: 'off', x: -400, y: 100, radius: 3, hidden: false },
				{ id: 'behind', x: 300, y: 300, radius: 3, hidden: true },
				{ id: 'big', x: 640, y: 400, radius: 600, hidden: false },
				{ id: 'ok', x: 800, y: 500, radius: 3, hidden: false }
			],
			name,
			W,
			H
		);
		expect(labels.map((l) => l.id)).toEqual(['ok']);
	});

	it('the name sits under the disc', () => {
		const [l] = placeBodyLabels([{ id: 'home', x: 500, y: 300, radius: 60, hidden: false }], name, W, H);
		expect(l!.y).toBeGreaterThan(300 + 60);
	});

	it('the Space Center name shows only when its body is big on the screen', () => {
		const screen: ScreenBody[] = [
			{ id: 'stock.home', x: 0, y: 0, radius: SITE_LABEL_MIN_RADIUS - 1, hidden: false }
		];
		expect(siteLabelsShown(screen, 'stock.home')).toBe(false);
		screen[0]!.radius = SITE_LABEL_MIN_RADIUS;
		expect(siteLabelsShown(screen, 'stock.home')).toBe(true);
		expect(siteLabelsShown(screen, 'stock.unknown')).toBe(false);
	});
});
