/** Display-unit helpers. Simulation state is SI; conversion happens only here in the UI. */
export function formatDistance(metres: number): string {
	const abs = Math.abs(metres);
	if (abs >= 1e9) return `${(metres / 1e9).toFixed(2)} Gm`;
	if (abs >= 1e6) return `${(metres / 1e6).toFixed(2)} Mm`;
	if (abs >= 1e3) return `${(metres / 1e3).toFixed(2)} km`;
	return `${metres.toFixed(0)} m`;
}

export function formatSpeed(mps: number): string {
	return `${mps.toFixed(1)} m/s`;
}
