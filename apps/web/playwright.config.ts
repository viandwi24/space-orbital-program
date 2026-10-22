import { defineConfig, devices } from '@playwright/test';

// Cross-browser end-to-end suite (plan 032, ADR 0040): Playwright's bundled Chromium, Firefox and
// WebKit against the production build. Never the player's installed browsers.
const port = Number(process.env.E2E_PORT ?? 5192);

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	timeout: 180_000,
	expect: { timeout: 20_000 },
	// One page at a time per engine: the flight tests use real time and software-rendered WebGL.
	workers: Number(process.env.E2E_WORKERS ?? 1),
	// One retry: a retry that passes is reported as "flaky", not hidden. (The Firefox "Vessel lost"
	// on the pad was a page bug, fixed in plan 047; it is not what this is for.)
	retries: 1,
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${port}`,
		trace: 'retain-on-failure',
		// the Hangar's "Start a vessel" modal (plan 350) is off for the suite; its own spec turns it on
		storageState: {
			cookies: [],
			origins: [
				{
					origin: `http://localhost:${port}`,
					localStorage: [{ name: 'orbital.vab.hideStart', value: '1' }]
				}
			]
		}
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } }
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }
		}
	],
	webServer: {
		// E2E_HEADERS=1 serves the build with the production headers and Content-Security-Policy
		// (`scripts/serve.ts`, plan 023) instead of Vite's preview server.
		command: process.env.E2E_HEADERS
			? `bun run build && bun scripts/serve.ts ${port}`
			: `bun run build && bun run preview --port ${port} --strictPort`,
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000
	}
});
