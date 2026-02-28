import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const runOpenclawStatus = async () => {
  const candidates: string[] = ["openclaw", "openclaw.cmd", "openclaw.exe"];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      candidates.unshift(path.join(appData, "npm", "openclaw.cmd"));
    }
  }

  let lastError: unknown;
  for (const bin of candidates) {
    try {
      const result = await execFileAsync(bin, ["status"], {
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      });
      return result.stdout;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error("openclaw not found");
};

export async function GET() {
  try {
    const stdout = await runOpenclawStatus();
    const lines = stdout.split(/\r?\n/).filter(Boolean).slice(-30);
    const stamped = [`[${new Date().toLocaleTimeString("ja-JP")}] openclaw status`, ...lines].join("\n");
    return NextResponse.json({ text: stamped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ text: `[${new Date().toLocaleTimeString("ja-JP")}] log取得失敗: ${msg}` });
  }
}
