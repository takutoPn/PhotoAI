import { NextResponse } from "next/server";

const clothesSuggestion = (minC: number, maxC: number, rainMm: number) => {
  const rainText = rainMm >= 1 ? "雨具: 傘必須" : rainMm > 0 ? "雨具: 折りたたみ傘推奨" : "雨具: なくてOK";

  const patterns = [
    { key: "パターン1", min: -5, max: 12, cloth: "コート必須 / 厚着" },
    { key: "パターン2", min: 10, max: 20, cloth: "コートなし / 厚着" },
    { key: "パターン3", min: 15, max: 25, cloth: "上着あり / 長袖" },
    { key: "パターン4", min: 20, max: 30, cloth: "上着あり / 半袖" },
    { key: "パターン5", min: 25, max: 45, cloth: "半袖" }
  ];

  const exact = patterns.find((p) => minC >= p.min && maxC <= p.max);
  const pick = exact ?? [...patterns]
    .map((p) => ({
      ...p,
      score: Math.abs(((minC + maxC) / 2) - ((p.min + p.max) / 2))
    }))
    .sort((a, b) => a.score - b.score)[0];

  return { cloth: `服装: ${pick.cloth} (${pick.key})`, rainText };
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
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
    url.searchParams.set("forecast_days", "1");
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
    const min = Number(data?.daily?.temperature_2m_min?.[0] ?? temp);
    const max = Number(data?.daily?.temperature_2m_max?.[0] ?? temp);

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
    const suggestion = clothesSuggestion(min, max, rain);

    const iconMap: Record<number, string> = {
      0: "sunny",
      1: "sunny",
      2: "partly_cloudy",
      3: "cloud",
      45: "foggy",
      51: "drizzle",
      61: "rainy",
      63: "rainy",
      65: "rainy_heavy",
      71: "snowing",
      80: "rainy",
      95: "thunderstorm"
    };

    return NextResponse.json({
      city: "東京",
      source: "Open-Meteo",
      temp,
      min,
      max,
      weather,
      weatherIcon: iconMap[code] ?? "partly_cloudy",
      rain,
      ...suggestion
    });
  } catch {
    return NextResponse.json({ error: "WEATHER_INTERNAL_ERROR" }, { status: 500 });
  }
}
