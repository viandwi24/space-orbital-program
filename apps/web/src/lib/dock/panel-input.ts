/** The input every panel selector reads (plan 112, ADR 0149 point 2), built once per HUD update. */
import { GRAVITATIONAL_CONSTANT, type BodyDefinition, type EntityId, type PanelInput, type Snapshot } from '@orbital/core';
import { computeTelemetry } from '../telemetry';

export function panelInputOf(
	snapshot: Snapshot,
	vessel: EntityId | null,
	bodies: readonly (Pick<BodyDefinition, 'id' | 'radius'> &
		Partial<Pick<BodyDefinition, 'mass' | 'atmosphere'>>)[],
	/** The HUD's delta-v for the active vessel (ADR 0288), when it has one. */
	deltaV: number | null = null
): PanelInput {
	const v = vessel === null ? undefined : snapshot.vessels.find((s) => s.id === vessel);
	const t = v ? computeTelemetry(snapshot, v.id, bodies) : null;
	const b = v ? bodies.find((x) => String(x.id) === String(v.soi)) : undefined;
	return {
		snapshot,
		vessel: v ?? null,
		altitude: t?.altitude ?? null,
		speed: t?.speed ?? null,
		time: snapshot.t,
		// the body the vessel orbits and the HUD's delta-v (ADR 0288)
		body:
			b && b.mass !== undefined
				? {
						id: String(b.id),
						radius: b.radius,
						mu: GRAVITATIONAL_CONSTANT * b.mass,
						atmosphereHeight: b.atmosphere?.height ?? 0
					}
				: null,
		deltaV: deltaV !== null && Number.isFinite(deltaV) ? deltaV : null
	};
}
