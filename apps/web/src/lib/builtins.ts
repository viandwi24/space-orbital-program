/**
 * The plugins built into the game (plan 124): stock and the real solar system. A world loads only
 * its own system's bodies (ADR 0184), so Sol's bodies never show in a stock world.
 */
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import type { Plugin, SystemChoice } from '@orbital/core';

export const BUILTIN_PLUGINS: readonly Plugin[] = [Stock, Sol];

/** The system tools load when no world says otherwise. */
export const STOCK_CHOICE: SystemChoice = { id: 'stock' };
