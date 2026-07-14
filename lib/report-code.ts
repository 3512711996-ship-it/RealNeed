import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateReportCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `RN-${formatDate(new Date())}-${randomSuffix(4)}`;
    const existing = await prisma.ideaJudgmentRecord.findUnique({
      where: { reportCode: code },
      select: { id: true }
    });

    if (!existing) return code;
  }

  throw new Error("无法生成唯一 reportCode，请稍后重试。");
}

function randomSuffix(length: number) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
