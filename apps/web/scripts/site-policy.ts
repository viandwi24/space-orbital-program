/**
 * The one Content-Security-Policy of the static build (plan 202): every inline script of every
 * page, plus the script sandbox's bootstrap (a srcdoc iframe inherits the page's policy, ADR 0038).
 * One policy for all pages, because a `_headers` host joins every matching rule: per-page policies
 * on `/*` and `/flight` would both apply and block each other's hashes. `serve.ts` and
 * `emit-headers.ts` both use it, so the local server and the hosts send the same header.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentSecurityPolicy, inlineScripts, sha256Source } from '../src/lib/hosting-headers';
import { MOD_FRAME_BOOTSTRAP } from '../src/lib/dock/mod-frame';

/** Every `.html` file under `root`. */
export function htmlFiles(root: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) out.push(...htmlFiles(path));
		else if (entry.name.endsWith('.html')) out.push(path);
	}
	return out.sort();
}

/** The hashes the policy allows, sorted and without repeats. */
export async function siteHashes(root: string): Promise<string[]> {
	const scripts = new Set<string>();
	for (const file of htmlFiles(root)) {
		for (const s of inlineScripts(readFileSync(file, 'utf8'))) scripts.add(s);
	}
	scripts.add(readFileSync(join(root, 'sandbox/script-sandbox-frame-main.js'), 'utf8'));
	// a mod panel's own UI runs in a srcdoc frame that inherits this policy (plan 330, ADR 0285)
	scripts.add(MOD_FRAME_BOOTSTRAP);
	const hashes = await Promise.all([...scripts].map((s) => sha256Source(s)));
	return [...new Set(hashes)].sort();
}

export async function sitePolicy(root: string): Promise<string> {
	return contentSecurityPolicy(await siteHashes(root));
}
