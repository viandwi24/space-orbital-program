/**
 * zod schemas for the sim <-> host protocol (ADR 0016). Commands arrive from outside the sim
 * (UI, Worker messages, scripts), so `Sim.dispatch` validates them with `commandSchema`; the VAB
 * validates saved designs with `vesselDesignSchema`. Output types equal the hand-written
 * protocol types (the `z.ZodType<...>` annotations make the compiler check that).
 */
import * as z from 'zod';
import { entityId, partId, bodyId } from './ids.ts';
import { definitionIdSchema } from './schemas.ts';
import type { Command, VesselDesign, VesselPlacement } from './protocol.ts';

const entity = z.int().nonnegative().transform(entityId);
const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });
const quat = z
	.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() })
	.refine((q) => Math.hypot(q.x, q.y, q.z, q.w) > 0, 'quaternion must not be zero');
const nodeName = z.string().min(1);
const index = z.int().nonnegative();

export const vesselDesignSchema: z.ZodType<VesselDesign> = z.object({
	formatVersion: z.union([z.literal(1), z.literal(2)]),
	name: z.string().min(1),
	parts: z
		.array(
			z.object({
				index,
				part: definitionIdSchema.transform(partId),
				parent: z
					.object({
						index,
						parentNode: nodeName,
						node: nodeName,
						radial: z.object({ angle: z.number(), y: z.number() }).optional()
					})
					.nullable(),
				symmetry: index.optional()
			})
		)
		.min(1),
	stages: z.array(z.array(index))
});

export const vesselPlacementSchema: z.ZodType<VesselPlacement> = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('surface'),
		body: definitionIdSchema.transform(bodyId).optional(),
		latitude: z
			.number()
			.min(-Math.PI / 2)
			.max(Math.PI / 2)
			.optional(),
		longitude: z.number().optional()
	}),
	z.object({
		kind: z.literal('state'),
		body: definitionIdSchema.transform(bodyId).optional(),
		position: vec3,
		velocity: vec3,
		orientation: quat.optional()
	})
]);

export const commandSchema: z.ZodType<Command> = z.discriminatedUnion('type', [
	z.object({ type: z.literal('throttle'), vessel: entity, value: z.number().min(0).max(1) }),
	z.object({
		type: z.literal('attitude'),
		vessel: entity,
		pitch: z.number().min(-1).max(1),
		yaw: z.number().min(-1).max(1),
		roll: z.number().min(-1).max(1)
	}),
	z.object({ type: z.literal('stage'), vessel: entity }),
	z.object({
		type: z.literal('action'),
		vessel: entity,
		part: entity,
		module: definitionIdSchema,
		action: z.string().min(1),
		args: z.unknown().optional()
	}),
	z.object({ type: z.literal('warp'), factor: z.number().min(1) }),
	z.object({
		type: z.literal('load-vessel'),
		design: vesselDesignSchema,
		placement: vesselPlacementSchema.optional()
	})
]);
