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

export async function GET() {
  const session = await getServerSession(authOptions);
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const yyyyMmDd = toDateString(now); // 2026-02-26
  const timeMin = `${yyyyMmDd}T00:00:00+09:00`;
  const timeMax = `${yyyyMmDd}T23:59:59+09:00`;

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
    htmlLink: item.htmlLink
  }));

  return NextResponse.json({ items });
}
