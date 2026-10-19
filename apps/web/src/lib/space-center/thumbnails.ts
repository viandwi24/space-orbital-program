/**
 * The session's build-menu thumbnails (plan 235, ADR 0227 point 5): one renderer queue for every
 * Space Center visit, created on the first request so a page without the menu draws nothing.
 */
import { createBuildingThumbnails, type BuildingThumbnails } from '@orbital/renderer';

let shared: BuildingThumbnails | null = null;
export const buildingThumbnails = (): BuildingThumbnails => (shared ??= createBuildingThumbnails());
