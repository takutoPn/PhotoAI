import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const { stdout } = await execFileAsync("openclaw", ["status"], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });

    const lines = stdout.split(/\r?\n/).filter(Boolean).slice(-30);
    const stamped = [`[${new Date().toLocaleTimeString("ja-JP")}] openclaw status`, ...lines].join("\n");
    return NextResponse.json({ text: stamped });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ text: `[${new Date().toLocaleTimeString("ja-JP")}] log取得失敗: ${msg}` });
  }
}
