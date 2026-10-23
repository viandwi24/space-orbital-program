import { resolve } from '$app/paths';
import type { DevTab } from './tabs';

/** The address of a developer page (`resolve` takes one literal route at a time, not a union). */
export const devHref = (path: DevTab['path']): string => (resolve as (route: string) => string)(path);
