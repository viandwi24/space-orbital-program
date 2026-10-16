// Sample script for the sample mod. Paste it into the script panel in flight on a vessel that
// carries a "Sample Telemetry Beacon": it pings the beacon every 5 simulated seconds and prints
// what the beacon reports (`modules` of a part holds each module's `snapshot`).
const beacon = ship.parts.find((p) => 'sample.beacon' in p.modules);
if (!beacon) {
	print('no sample beacon on this vessel');
} else {
	for (let i = 0; i < 6; i++) {
		const answer = await action(beacon.id, 'sample.beacon', 'ping');
		if (!answer.ok) print('ping refused: ' + answer.reason);
		await wait(5);
		const now = ship.parts.find((p) => p.id === beacon.id);
		print('t=' + Math.floor(ship.t) + ' s: ' + JSON.stringify(now.modules['sample.beacon']));
	}
}
