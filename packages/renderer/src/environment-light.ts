/**
 * Image-based light from the procedural sky (ADR 0027): the sky/ground seen from the vessel is
 * rendered to a cube and prefiltered with PMREM whenever the sun or the altitude changed enough.
 * Needs a `WebGLRenderer`, so it lives outside `scene.ts`.
 */
import {
	BackSide,
	Color,
	Mesh,
	PMREMGenerator,
	Scene,
	ShaderMaterial,
	SphereGeometry,
	Vector3,
	type WebGLRenderer,
	type WebGLRenderTarget
} from 'three';
import type { Environment } from './environment.ts';
import { PRESETS } from './presets.ts';
import { createAtmosphereUniforms } from './planet.ts';
import { skyEnvFragment, skyEnvVertex } from './shaders/sky-env.glsl.ts';
import type { Vec3 } from '@orbital/core';

export class EnvironmentLight {
	private readonly pmrem: PMREMGenerator;
	private readonly scene = new Scene();
	private readonly material: ShaderMaterial;
	private target: WebGLRenderTarget | null = null;
	private key = '';

	constructor(gl: WebGLRenderer, environment: Environment) {
		this.pmrem = new PMREMGenerator(gl);
		this.material = new ShaderMaterial({
			name: 'sky-env',
			vertexShader: skyEnvVertex,
			fragmentShader: skyEnvFragment,
			side: BackSide,
			depthWrite: false,
			defines: { VIEW_SAMPLES: 8, LIGHT_SAMPLES: 3 },
			uniforms: {
				...createAtmosphereUniforms(environment.atmosphere),
				uUp: { value: new Vector3(0, 1, 0) },
				uAlt: { value: 0 },
				uSunDir: { value: new Vector3(1, 0, 0) },
				uGroundAlbedo: { value: new Color(0.14, 0.2, 0.07) },
				uNight: { value: new Vector3(0.0035, 0.0048, 0.0095) }
			}
		});
		const dome = new Mesh(new SphereGeometry(10, 32, 16), this.material);
		dome.frustumCulled = false;
		this.scene.add(dome);
	}

	/** Forces a new capture on the next update (preset change). */
	invalidate(): void {
		this.key = '';
	}

	/** Re-captures when the environment key changed; returns the prefiltered cube or null before the first capture. */
	update(environment: Environment, up: Vec3, sun: Vec3): WebGLRenderTarget | null {
		const key = environment.state.envKey;
		if (key === this.key && this.target) return this.target;
		this.key = key;
		const u = this.material.uniforms;
		(u.uUp!.value as Vector3).set(up.x, up.y, up.z);
		u.uAlt!.value = environment.state.altitude;
		(u.uSunDir!.value as Vector3).set(sun.x, sun.y, sun.z);
		const size = PRESETS[environment.currentPreset].envSize;
		this.target?.dispose();
		this.target = this.pmrem.fromScene(this.scene, 0.02, 0.1, 100, { size });
		return this.target;
	}

	dispose(): void {
		this.target?.dispose();
		this.pmrem.dispose();
		this.material.dispose();
	}
}
