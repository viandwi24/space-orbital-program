import { describe, expect, it } from 'vitest';
import { applyInterface, setGlassFallback } from './root-theme';

const fakeRoot = () => {
	const props = new Map<string, string>();
	return {
		dataset: {} as DOMStringMap,
		style: { setProperty: (k: string, v: string | null) => void props.set(k, v ?? '') },
		props
	};
};

describe('root theme switches', () => {
	it('the UI scale and high contrast land on the root, and come off again', () => {
		const root = fakeRoot();
		applyInterface(root, { scale: 1.5, highContrast: true, centreVessel: false });
		expect(root.props.get('--ui-scale')).toBe('1.5');
		expect(root.dataset.contrast).toBe('more');
		applyInterface(root, { scale: 1, highContrast: false, centreVessel: false });
		expect(root.props.get('--ui-scale')).toBe('1');
		expect('contrast' in root.dataset).toBe(false);
	});
	it('the glass fallback toggles data-glass', () => {
		const root = fakeRoot();
		setGlassFallback(root, true);
		expect(root.dataset.glass).toBe('solid');
		setGlassFallback(root, false);
		expect('glass' in root.dataset).toBe(false);
	});
});
