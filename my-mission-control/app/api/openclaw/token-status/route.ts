import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

async function runStatus() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const home = os.homedir();
    const candidates = [
      appData ? path.join(appData, "npm", "openclaw.cmd") : "",
      home ? path.join(home, "AppData", "Roaming", "npm", "openclaw.cmd") : "",
      "openclaw.cmd",
      "openclaw"
    ].filter(Boolean);

    for (const cmdPath of candidates) {
      try {
        const { stdout } = await execFileAsync("cmd.exe", ["/c", cmdPath, "status"], { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
        return stdout;
      } catch {
        // try next
      }
    }
    throw new Error("openclaw status failed");
  }

  const { stdout } = await execFileAsync("openclaw", ["status"], { timeout: 10000, maxBuffer: 1024 * 1024 });
  return stdout;
}

export async function GET() {
  try {
    const text = await runStatus();
    const line = text.split(/\r?\n/).find((l) => /\d+(?:\.\d+)?k\s*\/\s*\d+(?:\.\d+)?k\s*\(\d+%\)/i.test(l)) ?? "";
    return NextResponse.json({ line, text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "status_failed" }, { status: 500 });
  }
}
