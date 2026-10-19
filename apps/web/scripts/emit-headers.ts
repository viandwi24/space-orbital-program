/**
 * After `vite build` (plan 202): writes `build/_headers` for a host that reads one (the production
 * host, Cloudflare Pages) and, with `META_CSP=1` (the GitHub Pages preview), puts the policy into
 * every page as a `<meta>`. A meta policy has no `frame-ancestors` (`architecture/hosting.md`).
 *
 *   bun scripts/emit-headers.ts [buildDir]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headersFile, injectMetaCsp } from '../src/lib/hosting-headers';
import { htmlFiles, sitePolicy } from './site-policy';

const root = process.argv[2] ?? join(import.meta.dir, '../build');
const policy = await sitePolicy(root);
writeFileSync(join(root, '_headers'), headersFile(policy));
let pages = 0;
if (process.env.META_CSP === '1') {
	for (const file of htmlFiles(root)) {
		writeFileSync(file, injectMetaCsp(readFileSync(file, 'utf8'), policy));
		pages += 1;
	}
}
console.log(`_headers written${pages ? `, meta policy in ${pages} pages` : ''}`);
