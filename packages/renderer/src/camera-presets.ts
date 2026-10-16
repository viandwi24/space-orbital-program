/**
 * Deterministic camera and time-of-day presets for the pad screenshots (dev tooling, plan 019).
 * Pure data: `Renderer.debug.applyPreset` feeds them to the renderer; they never touch the
 * simulation. Orbit and ascent screenshots use the real sim state and only set the camera.
 */
export interface EnvironmentPreset {
	name: string;
	/** Sun elevation/azimuth at the launch site (deg, azimuth clockwise from north); null keeps the real sun. */
	sun: { elevation: number; azimuth: number } | null;
	/** Orbit camera: yaw/pitch (rad) and distance (m). */
	rig: { yaw: number; pitch: number; distance: number };
}

export const ENVIRONMENT_PRESETS: readonly EnvironmentPreset[] = [
	{
		name: 'pad-noon',
		sun: { elevation: 62, azimuth: 150 },
		rig: { yaw: 0.9, pitch: 0.18, distance: 32 }
	},
	{
		name: 'pad-low-sun',
		sun: { elevation: 6, azimuth: 100 },
		rig: { yaw: -0.4, pitch: 0.1, distance: 26 }
	},
	{ name: 'pad-morning', sun: null, rig: { yaw: 2.2, pitch: 0.1, distance: 30 } },
	{ name: 'pad-close', sun: null, rig: { yaw: 2.0, pitch: 0.1, distance: 8 } },
	{
		name: 'pad-night',
		sun: { elevation: -30, azimuth: 80 },
		rig: { yaw: 0.9, pitch: 0.2, distance: 34 }
	}
];

export const findPreset = (name: string): EnvironmentPreset | undefined =>
	ENVIRONMENT_PRESETS.find((p) => p.name === name);
