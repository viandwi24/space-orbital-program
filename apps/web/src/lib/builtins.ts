/**
 * The plugins built into the game (plan 124): stock, the real solar system and Auto Dock (plan
 * 310). A world loads only its own system's bodies (ADR 0184), so Sol's bodies never show in a
 * stock world.
 */
import AutoDock from '@orbital/mod-autodock';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import type { Plugin, SystemChoice } from '@orbital/core';

export const BUILTIN_PLUGINS: readonly Plugin[] = [Stock, Sol, AutoDock];

/** The system tools load when no world says otherwise. */
export const STOCK_CHOICE: SystemChoice = { id: 'stock' };
