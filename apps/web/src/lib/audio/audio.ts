/**
 * The page's one audio engine (plan 053): created on first use in the browser, never on the server
 * or in tests that do not ask for it. Settings reach it through `applyAudioSettings`.
 */
import { browserAudioEnv, createAudioEngine, type AudioEngine } from './engine';
import type { Volumes } from './params';

let engine: AudioEngine | null = null;
let volumes: Volumes | null = null;

export function pageAudio(): AudioEngine {
	if (engine === null) {
		engine = createAudioEngine(browserAudioEnv());
		if (volumes) engine.setVolumes(volumes);
	}
	return engine;
}

/** Volumes and mute from the settings; kept for an engine that does not exist yet. */
export function applyAudioSettings(next: Volumes): void {
	volumes = { ...next };
	engine?.setVolumes(volumes);
}
