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
	// One retry: Firefox lost the vessel on the pad in about 1 of 12 launches (journal 032, draft
	// plan 047); a retry that passes is reported as "flaky", not hidden.
	retries: 1,
	reporter: [['list']],
	use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
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
		command: `bun run build && bun run preview --port ${port} --strictPort`,
		url: `http://localhost:${port}`,
		reuseExistingServer: !process.env.CI,
		timeout: 300_000
	}
});
