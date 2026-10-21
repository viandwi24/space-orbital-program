/**
 * Stock parts, one file per part family (plan 207). Part plans add parts to their family's file;
 * `../index.ts` registers them in a fixed order.
 */
export * from './aero.ts';
export * from './command.ts';
export * from './comms.ts';
export * from './docking.ts';
export * from './engines.ts';
export * from './ground.ts';
export * from './life-support.ts';
export * from './lights.ts';
export * from './power.ts';
export * from './rcs.ts';
export * from './recovery.ts';
export * from './science.ts';
export * from './structure.ts';
export * from './tanks.ts';
export * from './missions.ts';
export * from './robotics.ts';

import {
	PartBoosterLiquid,
	PartEngineVacuum,
	PartEngineWide,
	PartSrbLarge,
	PartSrbSmall
} from './engines.ts';
import { PartLaunchClamp } from './ground.ts';
import { PartHeatShieldWide } from './recovery.ts';
import {
	PartDecouplerWide,
	PartFairingBase,
	PartFairingBaseLarge,
	PartFairingBaseSmall,
	PartFairingPanel
} from './structure.ts';
import { PartTankWide, PartTankWideShort } from './tanks.ts';

/** Plan 210: two more solid motors, the vacuum engine, the 2.5 m class and the launch clamp. */
export const STOCK_PROPULSION_PACK = [
	PartSrbSmall,
	PartSrbLarge,
	PartBoosterLiquid,
	PartEngineVacuum,
	PartTankWideShort,
	PartTankWide,
	PartEngineWide,
	PartDecouplerWide,
	PartHeatShieldWide,
	PartLaunchClamp
] as const;

/** Plan 219: fairing bases in three sizes and the panel they throw off. */
export const STOCK_FAIRING_PARTS = [
	PartFairingBaseSmall,
	PartFairingBase,
	PartFairingBaseLarge,
	PartFairingPanel
] as const;

import { STOCK_CLASS_CONES } from './aero.ts';
import { PartDockingPort3750 } from './docking.ts';
import { STOCK_CLASS_HEAT_SHIELDS } from './recovery.ts';
import { STOCK_CLASS_STRUCTURE } from './structure.ts';
import { STOCK_CLASS_TANKS } from './tanks.ts';

/**
 * Plan 289 (ADR 0256): a structural set in the size classes 0.625, 1.875, 3.75, 5 and 7.5 m,
 * drawn by the existing generators. Registered after every older part, so their order stays.
 */
export const STOCK_SIZE_CLASS_PARTS = [
	...STOCK_CLASS_TANKS,
	...STOCK_CLASS_STRUCTURE,
	...STOCK_CLASS_CONES,
	...STOCK_CLASS_HEAT_SHIELDS,
	PartDockingPort3750
] as const;
