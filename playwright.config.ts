import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dev server with its own embedded database,
// reset and seeded before every run. Tests share one event, so they run one at a time.
const PORT = 3100;
const env = {
  PGLITE_DIR: ".data/e2e-db",
  SEED_LINKS_FILE: ".data/e2e-links.json",
  SEED_ACCESS_CLOSES_AT: "2030-01-01T00:00:00+10:00",
  APP_URL: `http://localhost:${PORT}`,
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  ANTHROPIC_API_KEY: "",
  RESEND_API_KEY: "",
  HUBSPOT_PRIVATE_APP_TOKEN: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npx tsx scripts/migrate.ts --reset && npx tsx scripts/seed.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/privacy`,
    timeout: 180_000,
    reuseExistingServer: false,
    env,
  },
});
