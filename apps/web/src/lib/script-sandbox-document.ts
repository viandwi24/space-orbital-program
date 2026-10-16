/**
 * Builds the sandbox iframe's document (ADR 0038) from the template in
 * `static/sandbox/script-sandbox.html` and the bundled bootstrap script. The iframe gets it as
 * `srcdoc` rather than `src`: nothing is fetched by the frame, and the policy names the one inline
 * script by its SHA-256 hash instead of trusting a URL.
 */

const HASH_MARKER = '{{SCRIPT_HASH}}';
const SCRIPT_MARKER = '{{BOOTSTRAP}}';

/** `sha256-<base64>` of `text` as a CSP source expression (without the quotes). */
export async function cspHash(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	let binary = '';
	for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
	return `sha256-${btoa(binary)}`;
}

export async function buildSandboxDocument(template: string, bootstrap: string): Promise<string> {
	if (!template.includes(HASH_MARKER) || !template.includes(SCRIPT_MARKER)) {
		throw new Error('the sandbox template lacks its markers');
	}
	// An inline script ends at the first `</script`: a bundle containing one would break out.
	if (/<\/script/i.test(bootstrap) || /<!--/.test(bootstrap)) {
		throw new Error('the sandbox bootstrap cannot be inlined (it contains a script terminator)');
	}
	const hash = await cspHash(bootstrap);
	// Function replacers: the bundle may contain `$&` and friends, which a string would interpret.
	return template.replace(HASH_MARKER, () => hash).replace(SCRIPT_MARKER, () => bootstrap);
}
