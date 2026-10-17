/** The input every panel selector reads (plan 112, ADR 0149 point 2), built once per HUD update. */
import type { BodyDefinition, EntityId, PanelInput, Snapshot } from '@orbital/core';
import { computeTelemetry } from '../telemetry';

export function panelInputOf(
	snapshot: Snapshot,
	vessel: EntityId | null,
	bodies: readonly Pick<BodyDefinition, 'id' | 'radius'>[]
): PanelInput {
	const v = vessel === null ? undefined : snapshot.vessels.find((s) => s.id === vessel);
	const t = v ? computeTelemetry(snapshot, v.id, bodies) : null;
	return {
		snapshot,
		vessel: v ?? null,
		altitude: t?.altitude ?? null,
		speed: t?.speed ?? null,
		time: snapshot.t
	};
}
