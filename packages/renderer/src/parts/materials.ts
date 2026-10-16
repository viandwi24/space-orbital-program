/**
 * Material library: one `MeshPhysicalMaterial` / `MeshStandardMaterial` per (slot, colour),
 * shared by every part (ADR 0028). Paint slots take their colour from the part's palette; the
 * other slots have a fixed look. Lighting comes from the scene (sun, sky, environment map).
 */
import type { PartVisual } from '@orbital/core';
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, Vector2, type Material } from 'three';
import type { SlotName } from './builder.ts';
import { createPartTextures, type PartTextures } from './textures.ts';

export type Palette = NonNullable<PartVisual['palette']>;

export const DEFAULT_PALETTE = {
	primary: '#d8dbe0',
	secondary: '#23272d',
	accent: '#d9552b'
} as const;

/** Slots that must not pick up temperature glow (glass, lamps). */
export const NO_GLOW_SLOTS: ReadonlySet<SlotName> = new Set(['glass', 'lamp']);

export class MaterialLibrary {
	private readonly cache = new Map<string, Material>();
	private textures: PartTextures | null = null;

	constructor(private readonly textureSize: 128 | 256 | 512) {}

	private tex(): PartTextures {
		this.textures ??= createPartTextures(this.textureSize);
		return this.textures;
	}

	get(slot: SlotName, palette: Palette | undefined): Material {
		const colour = this.colourFor(slot, palette);
		const key = `${slot}|${colour}`;
		let m = this.cache.get(key);
		if (!m) {
			m = this.create(slot, colour);
			m.userData.slot = slot;
			this.cache.set(key, m);
		}
		return m;
	}

	private colourFor(slot: SlotName, palette: Palette | undefined): string {
		switch (slot) {
			case 'paint-primary':
				return palette?.primary ?? DEFAULT_PALETTE.primary;
			case 'paint-secondary':
				return palette?.secondary ?? DEFAULT_PALETTE.secondary;
			case 'paint-accent':
				return palette?.accent ?? DEFAULT_PALETTE.accent;
			case 'ablator':
				return palette?.primary ?? '#3a2d27';
			default:
				return '';
		}
	}

	private create(slot: SlotName, colour: string): Material {
		const t = this.tex();
		const paint = (c: string, rough: number): MeshPhysicalMaterial =>
			new MeshPhysicalMaterial({
				color: new Color(c),
				roughness: rough,
				metalness: 0.08,
				clearcoat: 0.55,
				clearcoatRoughness: 0.28,
				map: t.hullWeather,
				normalMap: t.hullNormal,
				normalScale: new Vector2(0.6, 0.6)
			});
		switch (slot) {
			case 'paint-primary':
			case 'paint-secondary':
			case 'paint-accent':
				return paint(colour, 0.42);
			case 'metal':
				return new MeshStandardMaterial({
					color: 0xaab0b8,
					metalness: 0.95,
					roughness: 0.34,
					normalMap: t.hullNormal,
					normalScale: new Vector2(0.35, 0.35)
				});
			case 'dark-metal':
				return new MeshStandardMaterial({
					color: 0x34383f,
					metalness: 0.85,
					roughness: 0.46,
					normalMap: t.hullNormal,
					normalScale: new Vector2(0.4, 0.4)
				});
			case 'foil':
				return new MeshStandardMaterial({
					color: 0xd2a94a,
					metalness: 1,
					roughness: 0.28,
					normalMap: t.foilNormal,
					normalScale: new Vector2(0.9, 0.9)
				});
			case 'glass':
				return new MeshPhysicalMaterial({
					color: 0x0a1116,
					metalness: 0,
					roughness: 0.05,
					clearcoat: 1,
					clearcoatRoughness: 0.03,
					envMapIntensity: 1.6
				});
			case 'ablator':
				return new MeshStandardMaterial({
					color: new Color(colour),
					roughness: 0.92,
					metalness: 0,
					map: t.tileMap,
					normalMap: t.tileNormal,
					normalScale: new Vector2(1, 1)
				});
			case 'nozzle':
				return new MeshStandardMaterial({
					color: 0x7a4a2a,
					metalness: 1,
					roughness: 0.36,
					normalMap: t.hullNormal,
					normalScale: new Vector2(0.3, 0.3)
				});
			case 'nozzle-inner':
				return new MeshStandardMaterial({ color: 0x1b1612, metalness: 0.6, roughness: 0.72 });
			case 'rubber':
				return new MeshStandardMaterial({ color: 0x15171a, metalness: 0, roughness: 0.9 });
			case 'lamp':
				return new MeshStandardMaterial({
					color: 0x000000,
					emissive: new Color(0.25, 0.9, 1),
					emissiveIntensity: 3.5,
					roughness: 0.4
				});
		}
	}

	dispose(): void {
		for (const m of this.cache.values()) m.dispose();
		this.cache.clear();
		this.textures?.dispose();
		this.textures = null;
	}
}
