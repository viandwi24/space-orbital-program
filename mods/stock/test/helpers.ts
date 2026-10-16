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
	type PhysicsBackend
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
	step: unavailable,
	getTransform: unavailable,
	setTransform: unavailable,
	getVelocity: unavailable,
	setVelocity: unavailable,
	dispose: unavailable
};

export const loaded = loadPlugins([Stock]);

/** Parse `input` with the module's schema and create fresh state from it, as the sim will. */
export function contextFor<In, Out, State>(
	module: ModuleDefinition<In, Out, State>,
	input: In
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
		state: module.state(config)
	};
}
