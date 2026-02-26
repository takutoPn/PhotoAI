import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;
  if (!accessToken) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");
  const ids = (searchParams.get("calendarIds") ?? "").split(",").map((v) => v.trim()).filter(Boolean);

  if (!timeMin || !timeMax || ids.length === 0) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const responses = await Promise.all(
    ids.map(async (id) => {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });

      if (!res.ok) {
        return { calendarId: id, items: [] as any[] };
      }

      const data = await res.json();
      return {
        calendarId: id,
        items: (data.items ?? []).map((item: any) => ({
          id: item.id,
          summary: item.summary ?? "(no title)",
          start: item.start?.dateTime ?? item.start?.date,
          htmlLink: item.htmlLink,
          allDay: Boolean(item.start?.date)
        }))
      };
    })
  );

  const merged = responses.flatMap((r) => r.items.map((i: any) => ({ ...i, calendarId: r.calendarId })));
  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return NextResponse.json({ items: merged });
}
