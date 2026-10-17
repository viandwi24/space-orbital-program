/**
 * The root switches the tokens read (plan 086, ADR 0140): the UI scale is `--ui-scale` (the root font
 * size, base.css), high contrast is `data-contrast="more"`, the solid glass fallback is `data-glass="solid"`.
 * Each takes the element so tests can pass a stand-in; pages pass `document.documentElement`.
 */
import type { InterfaceSettings } from '../settings/settings';

type Root = Pick<HTMLElement, 'dataset'> & { style: Pick<CSSStyleDeclaration, 'setProperty'> };

export function applyInterface(root: Root, settings: InterfaceSettings): void {
	root.style.setProperty('--ui-scale', String(settings.scale));
	if (settings.highContrast) root.dataset.contrast = 'more';
	else delete root.dataset.contrast;
}

/** Panels drop the blur for the solid surface: the `low` preset and the governor's lowest rungs. */
export function setGlassFallback(root: Root, solid: boolean): void {
	if (solid) root.dataset.glass = 'solid';
	else delete root.dataset.glass;
}
