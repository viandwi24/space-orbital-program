import { describe, expect, it } from 'vitest';
import { NO_PICK, nextPlacement, SNAP_PX, type PointerFacts } from './placement-pick';

const facts = (f: Partial<PointerFacts<string>> = {}): PointerFacts<string> => ({
	nodeHit: null,
	rings: [],
	overGhost: false,
	site: null,
	free: [1, 2, 3],
	snapOn: true,
	...f
});

describe('nextPlacement (plan 348, ADR 0297)', () => {
	it('a ring within the snap radius on screen is the candidate', () => {
		const p = nextPlacement(NO_PICK, facts({ rings: [{ index: 4, px: SNAP_PX - 1 }], site: 'side' }));
		expect(p).toEqual({ node: 4, site: null, free: null });
	});

	it('a ring outside the snap radius is not: the surface under the pointer is', () => {
		const p = nextPlacement(NO_PICK, facts({ rings: [{ index: 4, px: SNAP_PX + 10 }], site: 'side' }));
		expect(p).toEqual({ node: null, site: 'side', free: null });
	});

	it('with no ring near and no surface the part follows the cursor, never a default node', () => {
		const p = nextPlacement(NO_PICK, facts({ rings: [{ index: 0, px: 70 }] }));
		expect(p).toEqual({ node: null, site: null, free: [1, 2, 3] });
	});

	it('the ring the pointer ray hits wins', () => {
		expect(nextPlacement(NO_PICK, facts({ nodeHit: 2, site: 'side' })).node).toBe(2);
	});

	it('with node snapping off rings near the pointer are ignored', () => {
		const p = nextPlacement(NO_PICK, facts({ snapOn: false, rings: [{ index: 1, px: 2 }], site: 's' }));
		expect(p.site).toBe('s');
	});

	it('over the ghost the shown place stays', () => {
		const prev = { node: null, site: 'side', free: null };
		expect(nextPlacement(prev, facts({ overGhost: true, site: null }))).toBe(prev);
	});

	it('hysteresis: a snapped ring holds up to 1.5 times the snap radius', () => {
		const prev = { node: 3, site: null, free: null };
		const p = nextPlacement(prev, facts({ rings: [{ index: 3, px: SNAP_PX * 1.4 }], site: 'side' }));
		expect(p.node).toBe(3);
		const gone = nextPlacement(prev, facts({ rings: [{ index: 3, px: SNAP_PX * 1.6 }], site: 'side' }));
		expect(gone).toEqual({ node: null, site: 'side', free: null });
	});

	it('hysteresis: a ring only slightly nearer does not steal the snap, a much nearer one does', () => {
		const prev = { node: 3, site: null, free: null };
		const close = nextPlacement(
			prev,
			facts({ rings: [{ index: 3, px: 30 }, { index: 5, px: 25 }] })
		);
		expect(close.node).toBe(3);
		const much = nextPlacement(prev, facts({ rings: [{ index: 3, px: 30 }, { index: 5, px: 10 }] }));
		expect(much.node).toBe(5);
	});
});
