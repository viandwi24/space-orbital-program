// Bundles the two scripts of the script sandbox (ADR 0038) into static/sandbox/:
//   script-sandbox-frame-main.js  the iframe document's bootstrap (src/lib/script-sandbox-frame-main.ts)
//   script-sandbox-worker.js  the script Worker (src/lib/script-sandbox-worker.ts), a classic
//                             self-contained script: the iframe turns its text into a blob Worker,
//                             so it must not import anything at run time.
// Not done by Vite: the page fetches the Worker's text and hands it to the iframe, which has no
// network, and that has to work the same in `vite dev` and in the static build.
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outdir = `${root}static/sandbox`;
await mkdir(outdir, { recursive: true });
for (const stale of ['script-sandbox-frame-main.js', 'script-sandbox-worker.js']) {
	await rm(`${outdir}/${stale}`, { force: true });
}

const result = await Bun.build({
	entrypoints: [
		`${root}src/lib/script-sandbox-frame-main.ts`,
		`${root}src/lib/script-sandbox-worker.ts`
	],
	outdir,
	target: 'browser',
	format: 'iife',
	minify: true,
	naming: '[dir]/[name].[ext]',
	// The emscripten glue reads `import.meta.url` to find its .wasm; the bytes are passed in
	// instead (`wasmBinary`), and a classic blob script has no `import.meta`.
	define: { 'import.meta.url': '"https://sandbox.invalid/"' }
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
for (const output of result.outputs) {
	console.log(`${output.path.replace(root, '')}  ${(output.size / 1024).toFixed(0)} KB`);
}
