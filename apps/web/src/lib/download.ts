/** Hands text to the browser as a file to save (exports of plan 102 and later). */
export function downloadText(text: string, fileName: string, type = 'application/json'): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
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
