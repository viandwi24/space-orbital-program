/**
 * Loading-screen shots (plan 379, ADR 0349): the pictures the world loading screen cycles through,
 * each with a caption. A plugin registers them with `ctx.loadingShots`. `image` is a path in the
 * plugin's package (format 3: `.png` or `.webp`); the game's own plugins keep theirs in the app's
 * `loading/` folder under the same relative path.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import { imageAssetPathSchema } from './mod-assets.ts';

export const loadingShotDefinitionSchema = z.object({
	/** `<plugin>.<name>`. */
	id: z.string().regex(DEFINITION_ID_PATTERN),
	/** The line under the picture. */
	caption: z.string().min(1).max(120),
	/** Where the picture lives: a `.webp` or `.png` path (no `.ktx2`: it is shown in an `img`). */
	image: imageAssetPathSchema.refine(
		(p) => !p.endsWith('.ktx2'),
		'a loading shot is a .png or .webp'
	),
	/** Showing order: lower first (default 0), then plugin order, then id. */
	order: z.number().int().min(-1000).max(1000).optional()
});

export type LoadingShotDefinition = z.infer<typeof loadingShotDefinitionSchema>;
