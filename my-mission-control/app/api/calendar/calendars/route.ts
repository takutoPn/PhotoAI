import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  url.searchParams.set("minAccessRole", "reader");
  url.searchParams.set("showHidden", "false");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 403) {
      // Fallback: some accounts return 403 for calendarList without extra consent.
      // We can still operate with primary calendar.
      return NextResponse.json({
        items: [
          {
            id: "primary",
            summary: "マイカレンダー (primary)",
            primary: true,
            backgroundColor: "#4285F4"
          }
        ],
        warning: "calendarList へのアクセスが 403 のため primary のみ表示しています。"
      });
    }
    return NextResponse.json({ error: "GOOGLE_API_ERROR", detail }, { status: res.status });
  }

  const data = await res.json();
  const items = (data.items ?? []).map((c: any) => ({
    id: c.id,
    summary: c.summary,
    primary: Boolean(c.primary),
    backgroundColor: c.backgroundColor
  }));

  return NextResponse.json({ items });
}
