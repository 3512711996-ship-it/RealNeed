import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" }
    },
    {
      name: "mobile-375",
      use: { ...devices["iPhone 13 mini"], viewport: { width: 375, height: 812 } }
    },
    {
      name: "mobile-390",
      use: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } }
    },
    {
      name: "mobile-430",
      use: { ...devices["Pixel 7"], viewport: { width: 430, height: 932 } }
    }
  ]
});
