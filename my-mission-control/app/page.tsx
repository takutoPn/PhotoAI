"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Task = { id: string; text: string; done: boolean; createdAt: number; doneAt?: number; category: string; status: string };
type Cycle = { id: string; label: string; minutes: number; createdAt: number };
type FocusSession = { id: string; minutes: number; createdAt: number };
type Cal = { id: string; summary: string; primary?: boolean };
type EventItem = { id: string; summary: string; start: string; htmlLink?: string; allDay?: boolean; calendarId: string };
type UsageParsed = { tokens?: string; cost?: string; model?: string };
type Weather = { city: string; source?: string; temp: number; min: number; max: number; weather: string; weatherIcon: string; cloth: string; rainText: string };

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatClock = (iso: string, allDay?: boolean) => (allDay ? "終日" : new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const isToday = (ts: number) => toYmd(new Date(ts)) === toYmd(new Date());

const parseUsage = (text: string): UsageParsed => {
  const tokens = text.match(/([\d,]+)\s*(tokens?|トークン)/i)?.[1];
  const cost = text.match(/\$\s*([\d.,]+)/)?.[1];
  const model = text.match(/model\s*[:=]\s*([^\n]+)/i)?.[1]?.trim();
  return { tokens, cost: cost ? `$${cost}` : undefined, model };
};

const decodeGoogleCid = (input: string) => {
  const raw = input.trim().replace(/^<|>$/g, "");
  const slackStyled = raw.includes("|") ? raw.split("|")[0] : raw;
  const cidMatch = slackStyled.match(/[?&]cid=([^&]+)/);
  if (!cidMatch) return slackStyled;

  const cid = decodeURIComponent(cidMatch[1]);
  if (cid.includes("@")) return cid;

  try {
    const norm = cid.replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const decoded = atob(padded);
    return decoded || cid;
  } catch {
    return cid;
  }
};

const WeatherIcon = ({ kind }: { kind?: string }) => {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  switch (kind) {
    case "sunny":
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" /></svg>;
    case "cloud":
      return <svg {...common}><path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.7-1.5A3.5 3.5 0 0 0 7 18Z" /></svg>;
    case "rainy":
    case "rainy_heavy":
      return <svg {...common}><path d="M7 14h10a4 4 0 0 0 0-8 5 5 0 0 0-9.7-1.5A3.5 3.5 0 0 0 7 14Z" /><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
  }
};

const NavIcon = ({ kind }: { kind: "dashboard" | "tasks" | "calendar" | "memory" | "token" }) => {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  switch (kind) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="5" /><rect x="13" y="10" width="8" height="11" /><rect x="3" y="13" width="8" height="8" /></svg>;
    case "tasks":
      return <svg {...common}><path d="M4 7h10" /><path d="M4 12h10" /><path d="M4 17h10" /><path d="M17 7l1.8 1.8L22 5.6" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
    case "memory":
      return <svg {...common}><path d="M12 3a6 6 0 0 1 6 6c0 2-1 3.5-2.3 4.8-.9.9-1.2 1.6-1.2 2.7H9.5c0-1.1-.3-1.8-1.2-2.7C7 12.5 6 11 6 9a6 6 0 0 1 6-6Z" /><path d="M9.5 19h5M10 22h4" /></svg>;
    case "token":
      return <svg {...common}><ellipse cx="12" cy="12" rx="8" ry="5" /><path d="M4 12v3c0 2.8 3.6 5 8 5s8-2.2 8-5v-3" /></svg>;
  }
};

export default function Home() {
  const { data: session, status } = useSession();
  const [activePage, setActivePage] = useState<"dashboard" | "tasks" | "calendar" | "memory" | "token">("dashboard");

  const [taskInput, setTaskInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<string[]>(["P1", "P2", "P3"]);
  const [selectedCategory, setSelectedCategory] = useState("P2");
  const [newCategory, setNewCategory] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["未着手", "作業中", "確認中", "修正中", "作業済み"]);
  const [selectedStatus, setSelectedStatus] = useState("未着手");
  const [newStatus, setNewStatus] = useState("");

  const [durationMin, setDurationMin] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [cycleLabel, setCycleLabel] = useState("");
  const [cycleMinutes, setCycleMinutes] = useState("");
  const [cycles, setCycles] = useState<Cycle[]>([]);

  const [usageRaw, setUsageRaw] = useState("");
  const [channelName, setChannelName] = useState("#openclaw-missioncontrol");

  const [calendars, setCalendars] = useState<Cal[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [manualCalendarIds, setManualCalendarIds] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarError, setCalendarError] = useState("");
  const [calendarWarning, setCalendarWarning] = useState("");
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [weather, setWeather] = useState<Weather | null>(null);
  const [openclawLog, setOpenclawLog] = useState("ログは手動更新にしています");

  useEffect(() => {
    const t = localStorage.getItem("mmc.tasks.v8");
    const fs = localStorage.getItem("mmc.focus.v7");
    const c = localStorage.getItem("mmc.cycles.v7");
    const ch = localStorage.getItem("mmc.channel.v7");
    const ur = localStorage.getItem("mmc.usageRaw.v7");
    const selected = localStorage.getItem("mmc.selectedCalendars.v8");
    const manual = localStorage.getItem("mmc.manualCalendars.v8");
    const ctg = localStorage.getItem("mmc.categories.v8");
    const sts = localStorage.getItem("mmc.statuses.v8");
    if (t) setTasks(JSON.parse(t));
    if (fs) setFocusSessions(JSON.parse(fs));
    if (c) setCycles(JSON.parse(c));
    if (ch) setChannelName(ch);
    if (ur) setUsageRaw(ur);
    if (selected) setSelectedCalendarIds(JSON.parse(selected));
    if (manual) setManualCalendarIds(JSON.parse(manual));
    if (ctg) {
      const parsed = JSON.parse(ctg);
      setCategories(parsed);
      if (parsed[0]) setSelectedCategory(parsed[0]);
    }
    if (sts) {
      const parsed = JSON.parse(sts);
      setStatuses(parsed);
      if (parsed[0]) setSelectedStatus(parsed[0]);
    }
  }, []);

  useEffect(() => localStorage.setItem("mmc.tasks.v8", JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem("mmc.focus.v8", JSON.stringify(focusSessions)), [focusSessions]);
  useEffect(() => localStorage.setItem("mmc.cycles.v8", JSON.stringify(cycles)), [cycles]);
  useEffect(() => localStorage.setItem("mmc.channel.v8", channelName), [channelName]);
  useEffect(() => localStorage.setItem("mmc.usageRaw.v8", usageRaw), [usageRaw]);
  useEffect(() => localStorage.setItem("mmc.selectedCalendars.v8", JSON.stringify(selectedCalendarIds)), [selectedCalendarIds]);
  useEffect(() => localStorage.setItem("mmc.manualCalendars.v8", JSON.stringify(manualCalendarIds)), [manualCalendarIds]);
  useEffect(() => localStorage.setItem("mmc.categories.v8", JSON.stringify(categories)), [categories]);
  useEffect(() => localStorage.setItem("mmc.statuses.v8", JSON.stringify(statuses)), [statuses]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRunning(false);
          setFocusSessions((v) => [{ id: crypto.randomUUID(), minutes: durationMin, createdAt: Date.now() }, ...v].slice(0, 50));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, durationMin]);

  const loadCalendars = async () => {
    setCalendarError("");
    setCalendarWarning("");
    try {
      const res = await fetch("/api/calendar/calendars", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      const cs: Cal[] = data.items ?? [];
      setCalendars(cs);
      if (data.warning) setCalendarWarning(data.warning);
      if (!selectedCalendarIds.length) {
        const defaults = cs.filter((c) => c.primary).map((c) => c.id);
        setSelectedCalendarIds(defaults.length ? defaults : cs.slice(0, 1).map((c) => c.id));
      }
    } catch (e) {
      setCalendarError(`カレンダー一覧取得失敗: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  useEffect(() => {
    if (status === "authenticated") loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const refreshLog = async () => {
    try {
      const res = await fetch("/api/openclaw/logs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setOpenclawLog(data.text ?? "ログなし");
    } catch {
      setOpenclawLog("ログ取得失敗");
    }
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("/api/weather/tokyo", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setWeather(data);
      } catch {
        // noop
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => {
      clearInterval(weatherTimer);
    };
  }, []);

  const combinedCalendarIds = Array.from(new Set([...selectedCalendarIds, ...manualCalendarIds]));

  const loadEvents = async () => {
    if (!combinedCalendarIds.length) return;
    setLoadingCalendar(true);
    setCalendarError("");
    try {
      const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
      const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
      const timeMin = `${toYmd(monthStart)}T00:00:00+09:00`;
      const timeMax = `${toYmd(monthEnd)}T23:59:59+09:00`;
      const params = new URLSearchParams({ timeMin, timeMax, calendarIds: combinedCalendarIds.join(",") });
      const res = await fetch(`/api/calendar/events?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data.items ?? []);
    } catch (e) {
      setCalendarError(`予定取得失敗: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && combinedCalendarIds.length) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, monthCursor, combinedCalendarIds.join(",")]);

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), text, done: selectedStatus === "作業済み", createdAt: Date.now(), category: selectedCategory, status: selectedStatus }, ...prev]);
    setTaskInput("");
  };

  const addManualCalendar = () => {
    const id = decodeGoogleCid(manualInput);
    if (!id) return;
    setManualCalendarIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setManualInput("");
  };

  const addCategory = () => {
    const v = newCategory.trim();
    if (!v || categories.includes(v)) return;
    setCategories((prev) => [...prev, v]);
    setSelectedCategory(v);
    setNewCategory("");
  };

  const removeCategory = (v: string) => {
    if (categories.length <= 1) return;
    setCategories((prev) => prev.filter((x) => x !== v));
    setTasks((prev) => prev.map((t) => (t.category === v ? { ...t, category: categories.find((x) => x !== v) || "分類なし" } : t)));
    if (selectedCategory === v) {
      const next = categories.find((x) => x !== v);
      if (next) setSelectedCategory(next);
    }
  };

  const addStatus = () => {
    const v = newStatus.trim();
    if (!v || statuses.includes(v)) return;
    setStatuses((prev) => [...prev, v]);
    setSelectedStatus(v);
    setNewStatus("");
  };

  const removeStatus = (v: string) => {
    if (statuses.length <= 1) return;
    setStatuses((prev) => prev.filter((x) => x !== v));
    setTasks((prev) => prev.map((t) => (t.status === v ? { ...t, status: "未着手", done: false } : t)));
    if (selectedStatus === v) setSelectedStatus("未着手");
  };

  const todayDone = tasks.filter((t) => t.doneAt && isToday(t.doneAt)).length;
  const avgCycle = useMemo(() => {
    const todayCycles = cycles.filter((c) => isToday(c.createdAt));
    if (!todayCycles.length) return 0;
    return Math.round((todayCycles.reduce((sum, c) => sum + c.minutes, 0) / todayCycles.length) * 10) / 10;
  }, [cycles]);

  const usage = useMemo(() => parseUsage(usageRaw), [usageRaw]);

  const firstCell = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const startOffset = firstCell.getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const todayKey = toYmd(new Date());
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toYmd(tomorrow);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events) {
      const key = toYmd(new Date(e.start));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const todayEvents = eventsByDay.get(todayKey) ?? [];
  const tomorrowEvents = eventsByDay.get(tomorrowKey) ?? [];
  const bottlenecks = [...cycles].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  const inferredIntents = useMemo(() => {
    const fromTasks = tasks.filter((t) => !t.done).slice(0, 5).map((t) => `${t.text} を進めたい`);
    const defaults = [
      "でじるみAI対応を進めたい",
      "MissionControlのUI改善を進めたい",
      "カレンダー連携の精度を上げたい",
      "タスク運用を自動化したい",
      "Slack要約を毎日回したい"
    ];
    const merged = [...fromTasks, ...defaults];
    return Array.from(new Set(merged)).slice(0, 5);
  }, [tasks]);

  const slackSummary = useMemo(() => {
    const topOpen = tasks.filter((t) => !t.done).slice(0, 3).map((t) => `- [${t.category} / ${t.status}] ${t.text}`).join("\n");
    const topBottleneck = bottlenecks.map((b) => `- ${b.label}: ${b.minutes}分`).join("\n");
    const todayText = todayEvents.length ? todayEvents.map((e) => `- ${formatClock(e.start, e.allDay)} ${e.summary}`).join("\n") : "- 予定なし";
    const usageText = usage.tokens || usage.cost ? `🧠 Token: *${usage.tokens ?? "-"}* / Cost: *${usage.cost ?? "-"}*` : "🧠 Token: 未入力";
    return `📡 *Mission Control Daily Brief*\nチャンネル: ${channelName}\n\n✅ 完了タスク: *${todayDone}件*\n📅 今日の予定: *${todayEvents.length}件*\n📅 明日の予定: *${tomorrowEvents.length}件*\n📉 平均サイクルタイム: *${avgCycle}分*\n${usageText}\n\n*今日の予定*\n${todayText}\n\n*Next Actions*\n${topOpen || "- なし"}\n\n*Top Bottlenecks*\n${topBottleneck || "- 記録なし"}`;
  }, [channelName, todayDone, todayEvents, tomorrowEvents, avgCycle, usage, tasks, bottlenecks]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Mission</h2>
        <nav className="side-nav">
          <button className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}><NavIcon kind="dashboard" />ダッシュボード</button>
          <button className={activePage === "tasks" ? "active" : ""} onClick={() => setActivePage("tasks")}><NavIcon kind="tasks" />タスク</button>
          <button className={activePage === "calendar" ? "active" : ""} onClick={() => setActivePage("calendar")}><NavIcon kind="calendar" />カレンダー</button>
          <button className={activePage === "memory" ? "active" : ""} onClick={() => setActivePage("memory")}><NavIcon kind="memory" />メモリ</button>
          <button className={activePage === "token" ? "active" : ""} onClick={() => setActivePage("token")}><NavIcon kind="token" />トークン</button>
        </nav>
      </aside>

      <main className="container">
        <header><h1>My Mission Control</h1></header>

        <section className="content-grid">
          {activePage === "dashboard" ? (
            <>
              <div>
                <section className="kpi-grid dashboard-kpi">
                  <article className="kpi card"><h3>今日の完了</h3><strong>{todayDone}件</strong><small>タスク進捗</small></article>
                  <article className="kpi card"><h3>今日の予定</h3><strong>{todayEvents.length}件</strong><small>Google Calendar</small></article>
                  <article className="kpi card"><h3>明日の予定</h3><strong>{tomorrowEvents.length}件</strong><small>Google Calendar</small></article>
                  <article className="kpi card"><h3>平均サイクル</h3><strong>{avgCycle}分</strong><small>Focus記録</small></article>
                </section>
                <section className="card dashboard-main">
                  <div>
                    <h2>Today Focus</h2>
                    <p>未完了タスク: <b>{tasks.filter((t) => !t.done).length}件</b></p>
                    <p>次アクション: <b>{tasks.find((t) => !t.done)?.text ?? "なし"}</b></p>
                  </div>
                  <div className="mini-chart">
                    {Array.from({ length: 14 }).map((_, i) => {
                      const h = 20 + ((i * 13) % 60);
                      return <span key={i} style={{ height: `${h}px` }} />;
                    })}
                  </div>
                </section>
                <section className="card intent-box">
                  <h2>やりたそうなこと</h2>
                  <ul>
                    {inferredIntents.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </section>
              </div>
              <aside>
                <section className="card weather-widget">
                  <h2>東京の天気</h2>
                  <p className="weather-main weather-line">{weather ? <><WeatherIcon kind={weather.weatherIcon} /> {weather.weather} / {weather.temp}°C</> : "取得中..."}</p>
                  <p>{weather ? `最低 ${weather.min}°C / 最高 ${weather.max}°C` : "気温レンジ取得中"}</p>
                  <p className="muted">天気ソース: {weather?.source ?? "-"}</p>
                  <p>{weather?.cloth ?? "服装アドバイス取得中"}</p>
                  <p>{weather?.rainText ?? "雨具アドバイス取得中"}</p>
                </section>
                <section className="card log-widget">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <h2>OpenClaw ログ</h2>
                    <button onClick={refreshLog}>更新</button>
                  </div>
                  <pre className="log-pre">{openclawLog}</pre>
                </section>
              </aside>
            </>
          ) : null}

          {activePage === "tasks" ? (
            <div>
              <section className="card">
                <h2>タスク</h2>
                <div className="row"><input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="次にやること" /><select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select><select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select><button onClick={addTask}>追加</button></div>
                <div className="row" style={{ marginTop: 8 }}><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="分類を追加" /><button onClick={addCategory}>分類追加</button><input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder="進捗を追加" /><button onClick={addStatus}>進捗追加</button></div>
                <div className="row" style={{ marginTop: 8 }}>{categories.map((c) => <button key={c} onClick={() => removeCategory(c)}>分類削除: {c}</button>)}{statuses.map((s) => <button key={s} onClick={() => removeStatus(s)}>進捗削除: {s}</button>)}</div>
                <ul>{tasks.map((t) => <li key={t.id}><span className={t.done ? "done" : ""}>[{t.category}] {t.text}</span><select value={t.status} onChange={(e) => { const next = e.target.value; setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next, done: next === "作業済み", doneAt: next === "作業済み" ? Date.now() : undefined } : x)); }}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></li>)}</ul>
              </section>
              <section className="card">
                <h2>Focus Sprint + Bottleneck Radar</h2>
                <div className="row">{[15, 25, 45].map((m) => <button key={m} onClick={() => { setDurationMin(m); setTimeLeft(m * 60); setRunning(false); }}>{m}分</button>)}</div>
                <div className="timer">{formatTime(timeLeft)}</div>
                <div className="row"><button onClick={() => setRunning(true)}>開始</button><button onClick={() => setRunning(false)}>停止</button><button onClick={() => { setRunning(false); setTimeLeft(durationMin * 60); }}>リセット</button></div>
                <hr />
                <div className="row"><input value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} placeholder="工程名" /><input type="number" value={cycleMinutes} onChange={(e) => setCycleMinutes(e.target.value)} placeholder="分" min={1} /><button onClick={() => { const m = Number(cycleMinutes); if (!cycleLabel.trim() || !m || m <= 0) return; setCycles((prev) => [{ id: crypto.randomUUID(), label: cycleLabel.trim(), minutes: m, createdAt: Date.now() }, ...prev]); setCycleLabel(""); setCycleMinutes(""); }}>記録</button></div>
                <p>平均サイクル: <b>{avgCycle}分</b></p>
              </section>
            </div>
          ) : null}

          {activePage === "calendar" ? (
            <div>
              <section className="card">
                <h2>カレンダー</h2>
                <div className="row"><button onClick={loadEvents} disabled={status !== "authenticated" || loadingCalendar}>{loadingCalendar ? "読込中..." : "予定を更新"}</button></div>
                {calendarError ? <p className="error">{calendarError}</p> : null}
                {calendarWarning ? <p className="warn">{calendarWarning}</p> : null}
                <div className="calendar-picker">{calendars.map((c) => <label key={c.id} className="cal-check"><input type="checkbox" checked={selectedCalendarIds.includes(c.id)} onChange={() => setSelectedCalendarIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]))} /> {c.primary ? "⭐ " : ""}{c.summary}</label>)}</div>
                <div className="row"><input value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="追加カレンダーURL(?cid=...) or カレンダーID" /><button onClick={addManualCalendar}>ID追加</button></div>
                {manualCalendarIds.length ? <ul>{manualCalendarIds.map((id) => <li key={id}><code>{id}</code> <button onClick={() => setManualCalendarIds((prev) => prev.filter((x) => x !== id))}>削除</button></li>)}</ul> : null}
                <div className="calendar-split"><div><h3>今日の予定</h3><ul>{todayEvents.length ? todayEvents.map((e) => <li key={`${e.calendarId}-${e.id}`}>{formatClock(e.start, e.allDay)} {e.summary}</li>) : <li>予定なし</li>}</ul></div><div><h3>明日の予定</h3><ul>{tomorrowEvents.length ? tomorrowEvents.map((e) => <li key={`${e.calendarId}-${e.id}`}>{formatClock(e.start, e.allDay)} {e.summary}</li>) : <li>予定なし</li>}</ul></div></div>
                <div className="month-head"><button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>← 前月</button><h3>{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</h3><button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>翌月 →</button></div>
                <div className="month-weekdays">{WEEK.map((w) => <div key={w}>{w}</div>)}</div>
                <div className="month-grid">{Array.from({ length: startOffset }).map((_, i) => <div key={`blank-${i}`} className="day-cell muted" />)}{Array.from({ length: daysInMonth }).map((_, i) => { const day = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), i + 1); const key = toYmd(day); const dayEvents = eventsByDay.get(key) ?? []; return <div className="day-cell" key={key}><div className="day-head">{i + 1}</div>{dayEvents.slice(0, 2).map((e) => <div className="event-chip" key={`${e.calendarId}-${e.id}`}>● {e.summary}</div>)}{dayEvents.length > 2 ? <div className="event-chip">+{dayEvents.length - 2}件</div> : null}</div>; })}</div>
              </section>
              <section className="card"><h2>Google Calendar連携</h2><div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}><div><b>状態:</b> {status === "authenticated" ? `接続中 (${session?.user?.email})` : "未接続"}</div>{status === "authenticated" ? <button onClick={() => signOut()}>連携を解除</button> : <button onClick={() => signIn("google")}>Googleでログイン</button>}</div></section>
            </div>
          ) : null}

          {activePage === "memory" ? (
            <aside><section className="card"><h2>メモリ（Slack Brief）</h2><div className="row"><input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="#openclaw-missioncontrol" /><button onClick={() => navigator.clipboard.writeText(slackSummary)}>サマリーをコピー</button></div><pre>{slackSummary}</pre></section></aside>
          ) : null}

          {activePage === "token" ? (
            <aside><section className="card"><h2>トークン</h2><textarea value={usageRaw} onChange={(e) => setUsageRaw(e.target.value)} placeholder="/status の出力を貼り付け" rows={6} /><div className="row"><span>Token: <b>{usage.tokens ?? "-"}</b></span><span>Cost: <b>{usage.cost ?? "-"}</b></span><span>Model: <b>{usage.model ?? "-"}</b></span></div></section></aside>
          ) : null}
        </section>
      </main>
    </div>
  );
}
