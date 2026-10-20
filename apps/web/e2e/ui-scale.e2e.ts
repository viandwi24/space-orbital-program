import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/**
 * The UI scale floor (plan 086, ADR 0107 point 6): at the largest scale, 150 %, on the smallest
 * supported screen, a 1024 x 768 tablet in landscape, every flight HUD panel stays on screen.
 */
test.use({ viewport: { width: 1024, height: 768 } });

test('at UI scale 150 % no flight HUD panel extends past a 1024 x 768 viewport', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(() => {
		const stored = JSON.parse(localStorage.getItem('orbital.settings') ?? '{}');
		localStorage.setItem(
			'orbital.settings',
			JSON.stringify({
				...stored,
				v: 3,
				touch: 'off',
				interface: { scale: 1.5, highContrast: false }
			})
		);
	});
	await launchTwoStage(page);
	// the setting reached the root: 1 rem is 24 px
	await expect
		.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
		.toBe('24px');

	// the HUD regions (top left, top centre, top right, bottom left, bottom centre) and each panel in them
	const outside = await page.evaluate(() => {
		const panels = document.querySelectorAll<HTMLElement>('.ui > div, .ui > div > *');
		const out: string[] = [];
		const ui = document.querySelector('.ui');
		// what the player can see: a panel inside a box that scrolls (plan 215: staging scrolls inside its
		// capped box) is clipped to that box, so only the visible part must stay on screen
		const visible = (el: HTMLElement): DOMRect => {
			let r = el.getBoundingClientRect();
			for (let p = el.parentElement; p && p !== ui; p = p.parentElement) {
				const o = getComputedStyle(p);
				if (/(auto|scroll|hidden|clip)/.test(`${o.overflowX} ${o.overflowY}`)) {
					const c = p.getBoundingClientRect();
					r = new DOMRect(
						Math.max(r.left, c.left),
						Math.max(r.top, c.top),
						Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)),
						Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top))
					);
				}
			}
			return r;
		};
		for (const el of panels) {
			const full = el.getBoundingClientRect();
			if (full.width === 0 || full.height === 0) continue;
			const r = visible(el);
			if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) {
				const name = el.dataset.testid ?? el.getAttribute('aria-label') ?? el.className;
				out.push(
					`${name}: ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)}`
				);
			}
		}
		return { count: panels.length, out };
	});
	expect(outside.count).toBeGreaterThan(5);
	expect(outside.out).toEqual([]);
	expect(errors).toEqual([]);
});

test('on the low preset the HUD panels draw the solid surface without blur (ADR 0140)', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.addInitScript(() => {
		localStorage.setItem('orbital.graphics', 'low');
		localStorage.setItem('orbital.graphics.auto', 'off');
	});
	await launchTwoStage(page);
	await expect(page.locator('html')).toHaveAttribute('data-glass', 'solid');
	const panel = await page.evaluate(() => {
		const el = document.querySelector('.ui section.panel');
		if (!el) return null;
		const css = getComputedStyle(el);
		return { filter: css.backdropFilter, background: css.backgroundColor };
	});
	expect(panel).toEqual({ filter: 'none', background: 'rgb(20, 21, 24)' });
	expect(errors).toEqual([]);
});
