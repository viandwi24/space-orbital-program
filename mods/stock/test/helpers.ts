/**
 * Test support: build a real ModuleContext for one module instance without a sim. The world and
 * event bus are the real ones (SDK test exports, ADR 0014); the physics backend refuses every
 * call, because stock hooks must not need it.
 */
import {
	createEventBus,
	createWorld,
	loadPlugins,
	type ModuleContext,
	type ModuleDefinition,
	type PhysicsBackend,
	type Vec3,
	type VesselApi
} from '@orbital/sdk';
import { Stock } from '../src/index.ts';

const unavailable = (): never => {
	throw new Error('the physics backend is not available in stock module unit tests');
};

export const noPhysics: PhysicsBackend = {
	createBody: unavailable,
	removeBody: unavailable,
	createFixedJoint: unavailable,
	removeJoint: unavailable,
	applyForce: unavailable,
	applyTorque: unavailable,
	setMass: unavailable,
	contacts: unavailable,
	step: unavailable,
	getTransform: unavailable,
	setTransform: unavailable,
	getVelocity: unavailable,
	setVelocity: unavailable,
	dispose: unavailable
};

export const loaded = loadPlugins([Stock]);

/** A recording `VesselApi`: resources are a plain map, forces and detach requests are logged. */
export interface FakeVessel extends VesselApi {
	control: { throttle: number; pitch: number; roll: number; yaw: number };
	ambient: { pressure: number; density: number; altitude: number };
	stock: Record<string, number>;
	forces: Array<{ force: Vec3; point?: Vec3 }>;
	torques: Vec3[];
	detached: Array<{ node: string; impulse?: number }>;
	/** What `airVelocity` returns, part frame. */
	air: Vec3;
	/** When set, `airVelocity(point)` returns this instead of `air`. */
	airAt?: (point: Vec3) => Vec3;
	/** What `centreOfMass` returns, part frame. */
	centre: Vec3;
	/** What `torqueDemand` returns. */
	demand: Vec3;
}

export function fakeVessel(stock: Record<string, number> = {}): FakeVessel {
	const v: FakeVessel = {
		time: 0,
		control: { throttle: 0, pitch: 0, roll: 0, yaw: 0 },
		ambient: { pressure: 0, density: 0, altitude: 0 },
		stock,
		forces: [],
		torques: [],
		detached: [],
		air: { x: 0, y: 0, z: 0 },
		centre: { x: 0, y: 0, z: 0 },
		demand: { x: 0, y: 0, z: 0 },
		get centreOfMass() {
			return v.centre;
		},
		get torqueDemand() {
			return v.demand;
		},
		applyForce(force, point) {
			v.forces.push(point ? { force, point } : { force });
		},
		airVelocity(point) {
			return v.airAt ? v.airAt(point ?? { x: 0, y: 0, z: 0 }) : v.air;
		},
		applyTorque(torque) {
			v.torques.push(torque);
		},
		resources: {
			amount: (r) => v.stock[r] ?? 0,
			withdraw(r, amount) {
				const taken = Math.min(v.stock[r] ?? 0, amount);
				v.stock[r] = (v.stock[r] ?? 0) - taken;
				return taken;
			},
			deposit(r, amount) {
				v.stock[r] = (v.stock[r] ?? 0) + amount;
				return amount;
			}
		},
		detach(node, impulse) {
			v.detached.push(impulse === undefined ? { node } : { node, impulse });
		}
	};
	return v;
}

/** Parse `input` with the module's schema and create fresh state from it, as the sim will. */
export function contextFor<In, Out, State>(
	module: ModuleDefinition<In, Out, State>,
	input: In,
	vessel: VesselApi = fakeVessel()
): ModuleContext<Out, State> {
	if (!module.config || !module.state) {
		throw new Error(
			`module "${module.id}" needs a config schema and a state factory for this helper`
		);
	}
	const world = createWorld();
	const config = module.config.parse(input);
	return {
		world,
		events: createEventBus(),
		registries: loaded.registries,
		physics: noPhysics,
		entity: world.createEntity(),
		config,
		state: module.state(config),
		vessel
	};
}
