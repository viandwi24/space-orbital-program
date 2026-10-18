// Copies three's Basis Universal transcoder into static/basis/ (plan 065, ADR 0160 point 4): the
// glTF provider's KTX2Loader fetches it from /basis/ only when a mod model uses KTX2 textures, so a
// game without such a model downloads nothing more. The files are three's (Apache-2.0, Binomial
// LLC); they are copied at build time, not committed.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// three is the renderer's dependency, not the web app's: resolve it from there
const renderer = dirname(createRequire(import.meta.url).resolve('@orbital/renderer/package.json'));
const three = dirname(createRequire(join(renderer, 'package.json')).resolve('three/package.json'));
const from = join(three, 'examples/jsm/libs/basis');
const outdir = join(root, 'static/basis');
await mkdir(outdir, { recursive: true });
for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
	await copyFile(join(from, file), join(outdir, file));
	console.log(
		`static/basis/${file}  ${((await stat(join(outdir, file))).size / 1024).toFixed(0)} KB`
	);
}
