import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";

const TZ = "Asia/Tokyo";

const toDateString = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);

const plusDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(60, Number(searchParams.get("days") ?? 1)));

  const now = new Date();
  const start = toDateString(now);
  const end = toDateString(plusDays(now, days - 1));

  const timeMin = `${start}T00:00:00+09:00`;
  const timeMax = `${end}T23:59:59+09:00`;

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: "GOOGLE_API_ERROR", detail: body }, { status: res.status });
  }

  const data = await res.json();
  const items = (data.items ?? []).map((item: any) => ({
    id: item.id,
    summary: item.summary ?? "(no title)",
    start: item.start?.dateTime ?? item.start?.date,
    htmlLink: item.htmlLink,
    allDay: Boolean(item.start?.date)
  }));

  return NextResponse.json({ items });
}
