/**
 * zod schemas for the sim <-> host protocol (ADR 0016). Commands arrive from outside the sim
 * (UI, Worker messages, scripts), so `Sim.dispatch` validates them with `commandSchema`; the VAB
 * validates saved designs with `vesselDesignSchema`. Output types equal the hand-written
 * protocol types (the `z.ZodType<...>` annotations make the compiler check that).
 */
import * as z from 'zod';
import { entityId, partId, bodyId } from './ids.ts';
import { definitionIdSchema } from './schemas.ts';
import {
	MAX_NODE_DV,
	SAS_MODES,
	type Command,
	type VesselDesign,
	type VesselPlacement
} from './protocol.ts';

const entity = z.int().nonnegative().transform(entityId);
const vec3 = z.object({ x: z.number(), y: z.number(), z: z.number() });
const quat = z
	.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() })
	.refine((q) => Math.hypot(q.x, q.y, q.z, q.w) > 0, 'quaternion must not be zero');
const nodeName = z.string().min(1);
const index = z.int().nonnegative();

export const vesselDesignSchema: z.ZodType<VesselDesign> = z.object({
	formatVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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
				symmetry: index.optional(),
				tilt: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
				link: z.object({ index, angle: z.number(), y: z.number() }).optional()
			})
		)
		.min(1),
	stages: z.array(z.array(index)),
	groups: z
		.array(
			z.object({
				slot: z.int().min(1).max(10),
				label: z.string().min(1).max(40),
				members: z.array(
					z.object({ part: index, module: z.string().min(1), action: z.string().min(1) })
				)
			})
		)
		.optional()
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
	}),
	z.object({
		kind: z.literal('site'),
		site: z.string().min(1),
		pad: z.int().min(0).optional()
	})
]);

const targetRefSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('body'), id: definitionIdSchema.transform(bodyId) }),
	z.object({ kind: z.literal('vessel'), id: entity })
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
		type: z.literal('sas'),
		vessel: entity,
		mode: z.enum(SAS_MODES).optional(),
		reference: z.enum(['surface', 'orbit']).optional()
	}),
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
		type: z.literal('warp-to'),
		time: z.number().refine(Number.isFinite, 'time must be finite'),
		factor: z.number().min(1)
	}),
	z.object({
		type: z.literal('node-set'),
		vessel: entity,
		id: index.optional(),
		time: z.number().refine(Number.isFinite, 'time must be finite'),
		prograde: z.number().min(-MAX_NODE_DV).max(MAX_NODE_DV),
		normal: z.number().min(-MAX_NODE_DV).max(MAX_NODE_DV),
		radial: z.number().min(-MAX_NODE_DV).max(MAX_NODE_DV)
	}),
	z.object({ type: z.literal('node-remove'), vessel: entity, id: index.optional() }),
	z.object({ type: z.literal('target-set'), vessel: entity, target: targetRefSchema.nullable() }),
	z.object({
		type: z.literal('load-vessel'),
		design: vesselDesignSchema,
		placement: vesselPlacementSchema.optional(),
		crew: z.array(z.object({ member: z.string().min(1), part: index })).optional()
	}),
	z.object({
		type: z.literal('set-rule'),
		rule: z.string().min(1),
		value: z.union([z.boolean(), z.number(), z.string()])
	}),
	z.object({ type: z.literal('recover-vessel'), vessel: entity }),
	z.object({ type: z.literal('move-data'), vessel: entity, item: z.string().min(1), to: entity }),
	z.object({ type: z.literal('delete-data'), vessel: entity, item: z.string().min(1) }),
	z.object({
		type: z.literal('action-group'),
		vessel: entity,
		group: z.string().min(1),
		value: z.union([z.boolean(), z.number(), z.string()]).optional()
	}),
	z.object({
		type: z.literal('place-building'),
		site: z.string().min(1),
		kind: z.string().min(1),
		cell: z.object({ i: z.int(), j: z.int() }),
		rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
		id: z.string().min(1)
	}),
	z.object({ type: z.literal('remove-building'), site: z.string().min(1), id: z.string().min(1) }),
	z.object({ type: z.literal('upgrade-building'), site: z.string().min(1), id: z.string().min(1) }),
	z.object({
		type: z.literal('found-site'),
		id: z.string().min(1),
		name: z.string().min(1).max(60),
		latitude: z
			.number()
			.min(-Math.PI / 2)
			.max(Math.PI / 2),
		longitude: z.number().refine(Number.isFinite, 'must be finite'),
		body: z.string().min(1).optional()
	}),
	z.object({
		type: z.literal('objective-start'),
		source: z.object({ kind: z.enum(['contract', 'mission']), id: z.string().min(1) }),
		vessel: entity.optional()
	}),
	z.object({
		type: z.literal('crew-hire'),
		profession: z.enum(['pilot', 'engineer', 'scientist', 'tourist'])
	}),
	z.object({ type: z.literal('crew-dismiss'), member: z.string().min(1) }),
	z.object({
		type: z.literal('market-buy'),
		commodity: z.string().min(1),
		amount: z.number().positive(),
		site: z.string().min(1)
	}),
	z.object({
		type: z.literal('deploy-base'),
		vessel: entity,
		id: z.string().min(1),
		name: z.string().min(1).max(60)
	}),
	z.object({ type: z.literal('join-site'), vessel: entity, site: z.string().min(1) }),
	z.object({
		type: z.literal('create-route'),
		id: z.string().min(1),
		from: z.string().min(1),
		to: z.string().min(1),
		commodity: z.string().min(1),
		amount: z.number().positive()
	}),
	z.object({ type: z.literal('delete-route'), id: z.string().min(1) }),
	z.object({
		type: z.literal('market-sell'),
		commodity: z.string().min(1),
		amount: z.number().positive(),
		site: z.string().min(1)
	}),
	z.object({ type: z.literal('research'), node: z.string().min(1) }),
	z.object({
		type: z.literal('crew-transfer'),
		vessel: entity,
		member: z.string().min(1),
		to: entity
	}),
	z.object({ type: z.literal('crew-eva'), vessel: entity, member: z.string().min(1) }),
	z.object({ type: z.literal('crew-board'), suit: entity, vessel: entity }),
	z.object({
		type: z.literal('crew-walk'),
		vessel: entity,
		heading: z.number().finite(),
		speed: z.number().finite().min(0)
	}),
	z.object({ type: z.literal('plant-flag'), vessel: entity }),
	z.object({ type: z.literal('transmit-data'), vessel: entity, item: z.string().min(1) }),
	z.object({ type: z.literal('strategy-activate'), strategy: z.string().min(1) }),
	z.object({ type: z.literal('strategy-end'), strategy: z.string().min(1) }),
	z.object({ type: z.literal('comms-inspect'), vessel: entity.nullable() }),
	z.object({ type: z.literal('contract-accept'), offer: z.string().min(1) }),
	z.object({ type: z.literal('contract-decline'), offer: z.string().min(1) }),
	z.object({ type: z.literal('contract-cancel'), contract: z.string().min(1) }),
	z.object({
		type: z.literal('set-grade'),
		part: z.string().min(1),
		grade: z.enum(['economy', 'standard', 'proven'])
	}),
	z.object({ type: z.literal('static-fire'), part: z.string().min(1) }),
	z.object({ type: z.literal('fix-anomaly'), report: z.string().min(1) }),
	z.object({ type: z.literal('repair'), suit: entity, vessel: entity, part: entity })
]);
