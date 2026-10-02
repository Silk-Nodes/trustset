import { defineConfig } from "@playwright/test";

/* three suites. local: the owner's whole flow on a fresh anvil. api: the
   guards on the same local server, sending nothing. live: read only checks
   against the deployed site. the services suite is plain node, see services/ */
export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./setup/local.ts",
  use: {
    trace: "retain-on-failure",
    /* the Google Chrome already installed, so nothing is downloaded; PW_EXE
       points at another browser binary instead */
    ...(process.env.PW_EXE ? { launchOptions: { executablePath: process.env.PW_EXE } } : { channel: "chrome" }),
  },
  projects: [
    { name: "local", testMatch: /owner\.spec\.ts/ },
    { name: "api", testMatch: /api\.spec\.ts/ },
    { name: "live", testMatch: /live\.spec\.ts/, use: { baseURL: process.env.E2E_LIVE_URL || "https://trustset.silknodes.io" } },
  ],
});
