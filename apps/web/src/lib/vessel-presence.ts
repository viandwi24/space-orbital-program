/**
 * Whether the player's vessel is still in the sim (plan 047). A vessel that is missing from a
 * snapshot was destroyed (ADR 0021 removes wreckage and debris), but only a snapshot taken after
 * `load-vessel` was handled can say so: the Worker posts its snapshots on a 16 ms timer, so the
 * answer to `load-vessel` reaches the page before the first snapshot that contains the vessel.
 * Judging the snapshot that was already there made a healthy launch show "Vessel lost" whenever a
 * HUD update landed in that gap (about 1 launch in 12 in Firefox, whose frames are slower).
 *
 * Worker messages arrive in the order they were posted, so every snapshot received after the
 * `load-vessel` answer was taken after the sim loaded the vessel.
 */
import type { EntityId, Snapshot } from '@orbital/core';

export interface VesselPresence {
	/** A snapshot arrived from the sim. */
	snapshot(snapshot: Snapshot): void;
	/** `load-vessel` was answered with `vessel`: later snapshots include it. */
	attach(vessel: EntityId): void;
	/** True once a snapshot taken after the load no longer holds the vessel. */
	lost(): boolean;
}

export function createVesselPresence(): VesselPresence {
	let vessel: EntityId | null = null;
	/** The newest snapshot received since `attach`. */
	let fresh: Snapshot | null = null;
	return {
		snapshot(snapshot) {
			if (vessel !== null) fresh = snapshot;
		},
		attach(id) {
			vessel = id;
			fresh = null;
		},
		lost() {
			return vessel !== null && fresh !== null && !fresh.vessels.some((v) => v.id === vessel);
		}
	};
}
