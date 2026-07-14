import { collectProductionConfigurationErrors } from "@/lib/production-config";

async function main() {
  const errors = collectProductionConfigurationErrors("web");
  if (errors.length) throw new Error(`PRODUCTION_CONFIG_INVALID:${errors.join(",")}`);
  const baseUrl = new URL(process.env.PUBLIC_APP_URL as string);
  const checks = [
    { path: "/api/health/live", status: 200 },
    { path: "/api/health/ready", status: 200 },
    { path: "/", status: 200 },
    { path: "/terms", status: 200 },
    { path: "/privacy", status: 200 }
  ];
  for (const check of checks) {
    const response = await fetch(new URL(check.path, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status !== check.status) throw new Error(`SMOKE_HTTP_${response.status}:${check.path}`);
    assertHeader(response, "content-security-policy");
    assertHeader(response, "x-content-type-options", "nosniff");
    if (baseUrl.protocol === "https:") assertHeader(response, "strict-transport-security");
  }
  console.log(`RealNeed production smoke: PASS (${checks.length} routes)`);
}

function assertHeader(response: Response, name: string, expected?: string) {
  const value = response.headers.get(name);
  if (!value || (expected && !value.toLowerCase().includes(expected.toLowerCase()))) {
    throw new Error(`SMOKE_MISSING_HEADER:${name}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.slice(0, 240) : "PRODUCTION_SMOKE_FAILED");
  process.exit(1);
});
