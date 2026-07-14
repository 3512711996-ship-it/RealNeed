import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "支付配置接口已下线。支持入口位于 /support，且不会影响任何功能。" }, { status: 410 });
}
