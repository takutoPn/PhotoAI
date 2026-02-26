"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type Task = { id: string; text: string; done: boolean; createdAt: number; doneAt?: number; priority: "P1" | "P2" | "P3" };
type Cycle = { id: string; label: string; minutes: number; createdAt: number };
type FocusSession = { id: string; minutes: number; createdAt: number };
type Cal = { id: string; summary: string; primary?: boolean; backgroundColor?: string };
type EventItem = { id: string; summary: string; start: string; htmlLink?: string; allDay?: boolean; calendarId: string };
type UsageParsed = { tokens?: string; cost?: string; model?: string };

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

export default function Home() {
  const { data: session, status } = useSession();

  const [taskInput, setTaskInput] = useState("");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3">("P2");
  const [tasks, setTasks] = useState<Task[]>([]);

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
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendarError, setCalendarError] = useState("");
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const t = localStorage.getItem("mmc.tasks.v6");
    const fs = localStorage.getItem("mmc.focus.v6");
    const c = localStorage.getItem("mmc.cycles.v6");
    const ch = localStorage.getItem("mmc.channel.v6");
    const ur = localStorage.getItem("mmc.usageRaw.v6");
    const selected = localStorage.getItem("mmc.selectedCalendars.v6");
    if (t) setTasks(JSON.parse(t));
    if (fs) setFocusSessions(JSON.parse(fs));
    if (c) setCycles(JSON.parse(c));
    if (ch) setChannelName(ch);
    if (ur) setUsageRaw(ur);
    if (selected) setSelectedCalendarIds(JSON.parse(selected));
  }, []);

  useEffect(() => localStorage.setItem("mmc.tasks.v6", JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem("mmc.focus.v6", JSON.stringify(focusSessions)), [focusSessions]);
  useEffect(() => localStorage.setItem("mmc.cycles.v6", JSON.stringify(cycles)), [cycles]);
  useEffect(() => localStorage.setItem("mmc.channel.v6", channelName), [channelName]);
  useEffect(() => localStorage.setItem("mmc.usageRaw.v6", usageRaw), [usageRaw]);
  useEffect(() => localStorage.setItem("mmc.selectedCalendars.v6", JSON.stringify(selectedCalendarIds)), [selectedCalendarIds]);

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
    try {
      const res = await fetch("/api/calendar/calendars", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cs: Cal[] = data.items ?? [];
      setCalendars(cs);
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

  const loadEvents = async () => {
    if (!selectedCalendarIds.length) return;
    setLoadingCalendar(true);
    setCalendarError("");
    try {
      const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
      const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
      const timeMin = `${toYmd(monthStart)}T00:00:00+09:00`;
      const timeMax = `${toYmd(monthEnd)}T23:59:59+09:00`;
      const params = new URLSearchParams({ timeMin, timeMax, calendarIds: selectedCalendarIds.join(",") });
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
    if (status === "authenticated" && selectedCalendarIds.length) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, monthCursor, selectedCalendarIds.join(",")]);

  const toggleCalendar = (id: string) => {
    setSelectedCalendarIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), text, done: false, createdAt: Date.now(), priority }, ...prev]);
    setTaskInput("");
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

  const slackSummary = useMemo(() => {
    const topOpen = tasks.filter((t) => !t.done).sort((a, b) => (a.priority < b.priority ? -1 : 1)).slice(0, 3).map((t) => `- [${t.priority}] ${t.text}`).join("\n");
    const topBottleneck = bottlenecks.map((b) => `- ${b.label}: ${b.minutes}分`).join("\n");
    const todayText = todayEvents.length ? todayEvents.map((e) => `- ${formatClock(e.start, e.allDay)} ${e.summary}`).join("\n") : "- 予定なし";
    const usageText = usage.tokens || usage.cost ? `🧠 Token: *${usage.tokens ?? "-"}* / Cost: *${usage.cost ?? "-"}*` : "🧠 Token: 未入力";
    return `📡 *Mission Control Daily Brief*\nチャンネル: ${channelName}\n\n✅ 完了タスク: *${todayDone}件*\n📅 今日の予定: *${todayEvents.length}件*\n📅 明日の予定: *${tomorrowEvents.length}件*\n📉 平均サイクルタイム: *${avgCycle}分*\n${usageText}\n\n*今日の予定*\n${todayText}\n\n*Next Actions*\n${topOpen || "- なし"}\n\n*Top Bottlenecks*\n${topBottleneck || "- 記録なし"}`;
  }, [channelName, todayDone, todayEvents, tomorrowEvents, avgCycle, usage, tasks, bottlenecks]);

  return (
    <main className="container">
      <header><h1>My Mission Control</h1><p>Slack運用前提の個人ワークフロー・コックピット</p></header>

      <section className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><b>Google Calendar連携:</b> {status === "authenticated" ? `接続中 (${session?.user?.email})` : "未接続"}</div>
        {status === "authenticated" ? <button onClick={() => signOut()}>Google連携を解除</button> : <button onClick={() => signIn("google")}>Googleでログイン</button>}
      </section>

      <section className="kpi-grid">
        <article className="kpi card"><h3>今日の完了</h3><strong>{todayDone}件</strong></article>
        <article className="kpi card"><h3>今日の予定</h3><strong>{todayEvents.length}件</strong></article>
        <article className="kpi card"><h3>明日の予定</h3><strong>{tomorrowEvents.length}件</strong></article>
      </section>

      <section className="card">
        <h2>1) Priority Inbox</h2>
        <div className="row"><input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="次にやること" /><select value={priority} onChange={(e) => setPriority(e.target.value as "P1" | "P2" | "P3")}><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select><button onClick={addTask}>追加</button></div>
        <ul>{tasks.map((t) => <li key={t.id}><label><input type="checkbox" checked={t.done} onChange={() => setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done, doneAt: x.done ? undefined : Date.now() } : x)))} /> <span className={t.done ? "done" : ""}>[{t.priority}] {t.text}</span></label></li>)}</ul>
      </section>

      <section className="card">
        <h2>2) Focus Sprint + Bottleneck Radar</h2>
        <div className="row">{[15, 25, 45].map((m) => <button key={m} onClick={() => { setDurationMin(m); setTimeLeft(m * 60); setRunning(false); }}>{m}分</button>)}</div>
        <div className="timer">{formatTime(timeLeft)}</div>
        <div className="row"><button onClick={() => setRunning(true)}>開始</button><button onClick={() => setRunning(false)}>停止</button><button onClick={() => { setRunning(false); setTimeLeft(durationMin * 60); }}>リセット</button></div>
        <hr />
        <div className="row"><input value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} placeholder="工程名" /><input type="number" value={cycleMinutes} onChange={(e) => setCycleMinutes(e.target.value)} placeholder="分" min={1} /><button onClick={() => { const m = Number(cycleMinutes); if (!cycleLabel.trim() || !m || m <= 0) return; setCycles((prev) => [{ id: crypto.randomUUID(), label: cycleLabel.trim(), minutes: m, createdAt: Date.now() }, ...prev]); setCycleLabel(""); setCycleMinutes(""); }}>記録</button></div>
        <p>平均サイクル: <b>{avgCycle}分</b></p>
      </section>

      <section className="card">
        <h2>3) Calendar</h2>
        <div className="row"><button onClick={loadEvents} disabled={status !== "authenticated" || loadingCalendar}>{loadingCalendar ? "読込中..." : "予定を更新"}</button></div>
        {calendarError ? <p className="error">{calendarError}</p> : null}

        <div className="calendar-picker">
          {calendars.map((c) => (
            <label key={c.id} className="cal-check"><input type="checkbox" checked={selectedCalendarIds.includes(c.id)} onChange={() => toggleCalendar(c.id)} /> {c.primary ? "⭐ " : ""}{c.summary}</label>
          ))}
        </div>

        <div className="calendar-split">
          <div><h3>今日の予定</h3><ul>{todayEvents.length ? todayEvents.map((e) => <li key={`${e.calendarId}-${e.id}`}>{formatClock(e.start, e.allDay)} {e.summary}</li>) : <li>予定なし</li>}</ul></div>
          <div><h3>明日の予定</h3><ul>{tomorrowEvents.length ? tomorrowEvents.map((e) => <li key={`${e.calendarId}-${e.id}`}>{formatClock(e.start, e.allDay)} {e.summary}</li>) : <li>予定なし</li>}</ul></div>
        </div>

        <div className="month-head">
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>← 前月</button>
          <h3>{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</h3>
          <button onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>翌月 →</button>
        </div>

        <div className="month-weekdays">{WEEK.map((w) => <div key={w}>{w}</div>)}</div>
        <div className="month-grid">
          {Array.from({ length: startOffset }).map((_, i) => <div key={`blank-${i}`} className="day-cell muted" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), i + 1);
            const key = toYmd(day);
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <div className="day-cell" key={key}>
                <div className="day-head">{i + 1}</div>
                {dayEvents.slice(0, 2).map((e) => <div className="event-chip" key={`${e.calendarId}-${e.id}`}>● {e.summary}</div>)}
                {dayEvents.length > 2 ? <div className="event-chip">+{dayEvents.length - 2}件</div> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>4) Slack Daily Brief Composer</h2>
        <div className="row"><input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="#openclaw-missioncontrol" /><button onClick={() => navigator.clipboard.writeText(slackSummary)}>サマリーをコピー</button></div>
        <pre>{slackSummary}</pre>
      </section>

      <section className="card">
        <h2>5) AI Token 使用状況</h2>
        <textarea value={usageRaw} onChange={(e) => setUsageRaw(e.target.value)} placeholder="/status の出力を貼り付け" rows={6} />
        <div className="row"><span>Token: <b>{usage.tokens ?? "-"}</b></span><span>Cost: <b>{usage.cost ?? "-"}</b></span><span>Model: <b>{usage.model ?? "-"}</b></span></div>
      </section>
    </main>
  );
}
