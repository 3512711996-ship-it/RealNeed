import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ message: "退款与功能权限已解除绑定。此接口仅保留历史路径，不再执行任何操作。" }, { status: 410 });
}
