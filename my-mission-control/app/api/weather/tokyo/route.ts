import { NextResponse } from "next/server";

const clothesSuggestion = (tempC: number, rainMm: number) => {
  const rainText = rainMm >= 1 ? "雨具: 傘必須" : rainMm > 0 ? "雨具: 折りたたみ傘推奨" : "雨具: なくてOK";
  let cloth = "服装: 長袖 + 薄手アウター";
  if (tempC >= 30) cloth = "服装: 半袖 + 通気性重視";
  else if (tempC >= 24) cloth = "服装: 半袖または薄手長袖";
  else if (tempC >= 18) cloth = "服装: 長袖シャツ";
  else if (tempC >= 12) cloth = "服装: ライトジャケット";
  else cloth = "服装: コート推奨";
  return { cloth, rainText };
};

export async function GET() {
  try {
    // Tokyo station area
    const lat = 35.6812;
    const lon = 139.7671;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("current", "temperature_2m,weather_code,precipitation");
    url.searchParams.set("timezone", "Asia/Tokyo");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "WEATHER_FETCH_FAILED" }, { status: 502 });
    }
    const data = await res.json();
    const current = data.current ?? {};
    const temp = Number(current.temperature_2m ?? 0);
    const rain = Number(current.precipitation ?? 0);
    const code = Number(current.weather_code ?? 0);

    const codeMap: Record<number, string> = {
      0: "快晴",
      1: "晴れ",
      2: "一部くもり",
      3: "くもり",
      45: "霧",
      51: "霧雨",
      61: "小雨",
      63: "雨",
      65: "強い雨",
      71: "雪",
      80: "にわか雨",
      95: "雷雨"
    };

    const weather = codeMap[code] ?? `天気コード:${code}`;
    const suggestion = clothesSuggestion(temp, rain);

    return NextResponse.json({
      city: "東京",
      temp,
      weather,
      rain,
      ...suggestion
    });
  } catch {
    return NextResponse.json({ error: "WEATHER_INTERNAL_ERROR" }, { status: 500 });
  }
}
