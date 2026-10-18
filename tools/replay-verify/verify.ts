/**
 * Re-simulates a replay file and checks every checkpoint (plan 131, ADR 0159 point 4). Boots the
 * mods the start save names from the plugins in this repository, with the web host's settings
 * (16 solver iterations; terrain heights when the replay says the host had them):
 *
 *   bun tools/replay-verify/verify.ts <file.orbital-replay.json>
 *
 * Prints the verdict; exits 0 when every checkpoint matches, 1 on a mismatch, 2 on a bad file.
 */
import { createBodyTerrainField, readReplay, type Plugin, type ReplayFile } from '@orbital/core';
import Sample from '../../examples/mod-sample/src/index.ts';
import Stock from '@orbital/mod-stock';
import Sol from '@orbital/mod-sol';
import { createRapierBackend } from '@orbital/physics';
import { createSim, verifyReplay, type ReplayVerdict } from '@orbital/sim';

const KNOWN: Record<string, Plugin> = { stock: Stock, sol: Sol, sample: Sample };

/** The verdict for a replay file's text. */
export async function verifyReplayText(text: string): Promise<ReplayVerdict & { bad?: true }> {
	const read = readReplay(text);
	if (!read.ok) return { ok: false, reason: read.reason, bad: true };
	const replay: ReplayFile = read.replay;
	const mods = ((replay.start as { mods?: { id: string }[] }).mods ?? []).map((m) => m.id);
	const missing = mods.filter((id) => !KNOWN[id]);
	if (missing.length > 0)
		return {
			ok: false,
			reason: `this verifier cannot boot the mods ${missing.join(', ')}`,
			bad: true
		};
	return verifyReplay(
		(resume) =>
			createSim({
				plugins: mods.map((id) => KNOWN[id]!),
				backendFactory: () => createRapierBackend({ solverIterations: 16 }),
				...(replay.terrain ? { terrain: createBodyTerrainField } : {}),
				resume
			} as never),
		replay
	);
}

if (import.meta.main) {
	const file = process.argv[2];
	if (!file) {
		console.error('usage: bun tools/replay-verify/verify.ts <replay file>');
		process.exit(2);
	}
	const verdict = await verifyReplayText(await Bun.file(file).text());
	if (verdict.ok) {
		console.log(`ok: ${verdict.commands} commands, ${verdict.checkpoints} checkpoints match`);
		process.exit(0);
	}
	console.error(`rejected: ${verdict.reason}`);
	process.exit(verdict.bad ? 2 : 1);
}
