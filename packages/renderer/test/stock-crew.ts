/** Test support (plan 375): the crew content stock registers, set as the renderer's table. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { crewContentOf, setCrewContent } from '../src/crew/content.ts';

export const stockRegistries = loadPlugins([Stock]).registries;
setCrewContent(crewContentOf(stockRegistries));
