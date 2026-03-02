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
    // Some Google setups keep returning 403 on calendarList.
    // Continue with primary calendar so the app stays usable.
    return NextResponse.json({
      items: [
        {
          id: "primary",
          summary: "マイカレンダー",
          primary: true,
          backgroundColor: "#4285F4"
        }
      ]
    });
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
