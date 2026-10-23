/**
 * The home body's radius for a save's summary (system audit finding 28): the running sim's own
 * home, so a save written from R&D, the Test Stand, Administration or the Astronaut Complex in a
 * Sol world measures altitudes over the Earth, not the stock Home the page's registries hold.
 */
import { homeBodyOf, type BodyDefinition } from '@orbital/core';

export interface HomeCatalog {
	bodies: readonly Pick<BodyDefinition, 'id' | 'radius' | 'parent' | 'star'>[];
	home?: string | undefined;
}

/** The catalog's home body radius, m (its `home`, else core's rule); 0 without bodies. */
export const homeRadiusOf = (catalog: HomeCatalog | null | undefined): number => {
	if (!catalog) return 0;
	const home = catalog.bodies.find((b) => b.id === catalog.home) ?? homeBodyOf(catalog.bodies);
	return home?.radius ?? 0;
};

/** The running sim's home body radius, m, once its catalog is ready; 0 if it never is. */
export async function worldHomeRadius(
	client: { ready: Promise<HomeCatalog> } | null
): Promise<number> {
	return homeRadiusOf(await client?.ready.catch(() => null));
}
