import { sendOperationalAlert } from "@/lib/alerts";

async function main() {
  if (process.env.ALERT_TEST_CONFIRM !== "SEND_TEST_ALERT") {
    throw new Error("设置 ALERT_TEST_CONFIRM=SEND_TEST_ALERT 后才能发送测试告警。");
  }
  const result = await sendOperationalAlert({
    event: "manual_alert_test",
    errorCode: "MANUAL_TEST",
    severity: "warning",
    context: { source: "npm_run_alert_test" }
  });
  if (!result.sent) throw new Error(result.reason);
  console.log("RealNeed alert test: SENT");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.slice(0, 200) : "ALERT_TEST_FAILED");
  process.exit(1);
});
