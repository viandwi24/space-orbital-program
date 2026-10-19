/** Hands text to the browser as a file to save (exports of plan 102 and later). */
export function downloadText(text: string, fileName: string, type = 'application/json'): void {
	downloadBlob(new Blob([text], { type }), fileName);
}

/** Hands a blob to the browser as a file to save (a screenshot PNG, plan 226). */
export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A file name from a title: lower case, dashes, no path characters. */
export const fileNameOf = (title: string, extension: string): string =>
	`${
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'export'
	}.${extension}`;

/** A screenshot's name (plan 226): the world and the mission time, `my-world-t-0012345.png`. */
export const screenshotName = (world: string, met: number): string =>
	fileNameOf(`${world} T ${String(Math.max(0, Math.floor(met))).padStart(7, '0')}`, 'png');
