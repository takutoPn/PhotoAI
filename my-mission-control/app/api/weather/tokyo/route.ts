import { NextResponse } from "next/server";

const clothesSuggestion = (minC: number, maxC: number, rainMm: number) => {
  const rainText = rainMm >= 1 ? "雨具: 傘必須" : rainMm > 0 ? "雨具: 折りたたみ傘推奨" : "雨具: なくてOK";

  let cloth = "服装: 上着あり / 長袖";
  if (maxC <= 12) {
    cloth = "服装: コート必須 / 厚着";
  } else if (minC >= 10 && maxC <= 20) {
    cloth = "服装: コートなし / 厚着";
  } else if (minC >= 15 && maxC <= 25) {
    cloth = "服装: 上着あり / 長袖";
  } else if (minC >= 20 && maxC <= 30) {
    cloth = "服装: 上着あり / 半袖";
  } else if (minC >= 25) {
    cloth = "服装: 半袖";
  }

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
