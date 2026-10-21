/**
 * Card art a mod may give a preset or a system variant (plan 317, ADR 0273 point 4): a `data:` URL of
 * an SVG, PNG, WebP or JPEG image, at most `MAX_ILLUSTRATION_CHARS` characters. Without one, the host
 * draws generated art from the definition's data. Hosts show it only as an image, never inline, so
 * an SVG's script never runs.
 */
import * as z from 'zod';

/** Longest illustration, characters of the `data:` URL (128 KiB). */
export const MAX_ILLUSTRATION_CHARS = 128 * 1024;

const DATA_URL = /^data:image\/(svg\+xml|png|webp|jpeg)(;charset=[a-z0-9-]+)?(;base64)?,/i;

export const illustrationSchema = z
	.string()
	.max(MAX_ILLUSTRATION_CHARS, `expected at most ${MAX_ILLUSTRATION_CHARS} characters`)
	.regex(DATA_URL, 'expected a data: URL of an SVG, PNG, WebP or JPEG image');

/** The optional art fields: `illustration` for the card, `icon` for the square badge. */
export interface Illustrated {
	/** Card art (`data:` URL, ADR 0273); absent: the host's generated art. */
	illustration?: string;
	/** Square icon (`data:` URL, ADR 0273); absent: the host's generated icon. */
	icon?: string;
}
