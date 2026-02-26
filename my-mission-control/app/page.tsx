"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
  priority: "P1" | "P2" | "P3";
};

type Cycle = { id: string; label: string; minutes: number; createdAt: number };
type FocusSession = { id: string; minutes: number; createdAt: number };
type EventItem = { start: Date; summary: string };

type UsageParsed = {
  tokens?: string;
  cost?: string;
  model?: string;
};

const isToday = (ts: number) => {
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const toYmd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

const parseIcsDate = (raw: string) => {
  const v = raw.trim();
  if (/^\d{8}T\d{6}Z$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(Date.UTC(y, m, d, hh, mm, ss));
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const hh = Number(v.slice(9, 11));
    const mm = Number(v.slice(11, 13));
    const ss = Number(v.slice(13, 15));
    return new Date(y, m, d, hh, mm, ss);
  }
  if (/^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    return new Date(y, m, d, 0, 0, 0);
  }
  return null;
};

const formatTime = (sec: number) => {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
};

const formatEventTime = (d: Date) =>
  d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  });

const parseUsage = (text: string): UsageParsed => {
  const tokens = text.match(/([\d,]+)\s*(tokens?|トークン)/i)?.[1];
  const cost = text.match(/\$\s*([\d.,]+)/)?.[1];
  const model = text.match(/model\s*[:=]\s*([^\n]+)/i)?.[1]?.trim();
  return {
    tokens,
    cost: cost ? `$${cost}` : undefined,
    model
  };
};

export default function Home() {
  // Existing 3 tools
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

  const [channelName, setChannelName] = useState("#openclaw-missioncontrol");

  // New 1: AI token usage panel
  const [usageRaw, setUsageRaw] = useState("");

  // New 2: Google Calendar URL panel
  const [calendarUrl, setCalendarUrl] = useState("");
  const [eventsToday, setEventsToday] = useState<EventItem[]>([]);
  const [calendarError, setCalendarError] = useState("");
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("mmc.tasks.v3");
    const fs = localStorage.getItem("mmc.focus.v3");
    const c = localStorage.getItem("mmc.cycles.v3");
    const ch = localStorage.getItem("mmc.channel.v3");
    const ur = localStorage.getItem("mmc.usageRaw.v3");
    const cu = localStorage.getItem("mmc.calendarUrl.v3");

    if (t) setTasks(JSON.parse(t));
    if (fs) setFocusSessions(JSON.parse(fs));
    if (c) setCycles(JSON.parse(c));
    if (ch) setChannelName(ch);
    if (ur) setUsageRaw(ur);
    if (cu) setCalendarUrl(cu);
  }, []);

  useEffect(() => localStorage.setItem("mmc.tasks.v3", JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem("mmc.focus.v3", JSON.stringify(focusSessions)), [focusSessions]);
  useEffect(() => localStorage.setItem("mmc.cycles.v3", JSON.stringify(cycles)), [cycles]);
  useEffect(() => localStorage.setItem("mmc.channel.v3", channelName), [channelName]);
  useEffect(() => localStorage.setItem("mmc.usageRaw.v3", usageRaw), [usageRaw]);
  useEffect(() => localStorage.setItem("mmc.calendarUrl.v3", calendarUrl), [calendarUrl]);

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

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), text, done: false, createdAt: Date.now(), priority }, ...prev]);
    setTaskInput("");
  };

  const toggleDone = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() } : t))
    );
  };

  const addCycle = () => {
    const m = Number(cycleMinutes);
    if (!cycleLabel.trim() || !m || m <= 0) return;
    setCycles((prev) =>
      [{ id: crypto.randomUUID(), label: cycleLabel.trim(), minutes: m, createdAt: Date.now() }, ...prev].slice(0, 50)
    );
    setCycleLabel("");
    setCycleMinutes("");
  };

  const fetchTodayEvents = async () => {
    if (!calendarUrl.trim()) return;
    setLoadingCalendar(true);
    setCalendarError("");
    setEventsToday([]);

    try {
      const res = await fetch(calendarUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      const lines = text.replace(/\r\n /g, "").split(/\r?\n/);
      const blocks: string[][] = [];
      let current: string[] | null = null;

      for (const line of lines) {
        if (line === "BEGIN:VEVENT") current = [];
        else if (line === "END:VEVENT" && current) {
          blocks.push(current);
          current = null;
        } else if (current) current.push(line);
      }

      const today = toYmd(new Date());
      const parsed: EventItem[] = [];

      for (const block of blocks) {
        const summaryLine = block.find((l) => l.startsWith("SUMMARY:"));
        const dtLine = block.find((l) => l.startsWith("DTSTART"));
        if (!summaryLine || !dtLine) continue;

        const rawDate = dtLine.split(":").slice(1).join(":");
        const start = parseIcsDate(rawDate);
        if (!start) continue;

        if (toYmd(start) === today) {
          parsed.push({
            start,
            summary: summaryLine.replace("SUMMARY:", "")
          });
        }
      }

      parsed.sort((a, b) => a.start.getTime() - b.start.getTime());
      setEventsToday(parsed);
    } catch (e) {
      setCalendarError(`読み込み失敗: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setLoadingCalendar(false);
    }
  };

  const todayDone = tasks.filter((t) => t.doneAt && isToday(t.doneAt)).length;
  const todayFocus = focusSessions.filter((s) => isToday(s.createdAt)).reduce((sum, s) => sum + s.minutes, 0);
  const avgCycle = useMemo(() => {
    const todayCycles = cycles.filter((c) => isToday(c.createdAt));
    if (!todayCycles.length) return 0;
    return Math.round((todayCycles.reduce((sum, c) => sum + c.minutes, 0) / todayCycles.length) * 10) / 10;
  }, [cycles]);

  const usage = useMemo(() => parseUsage(usageRaw), [usageRaw]);

  const bottlenecks = [...cycles].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  const slackSummary = useMemo(() => {
    const topOpen = tasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.priority < b.priority ? -1 : 1))
      .slice(0, 3)
      .map((t) => `- [${t.priority}] ${t.text}`)
      .join("\n");

    const topBottleneck = bottlenecks.map((b) => `- ${b.label}: ${b.minutes}分`).join("\n");

    const todayEventsText = eventsToday.length
      ? eventsToday.map((e) => `- ${formatEventTime(e.start)} ${e.summary}`).join("\n")
      : "- 予定なし";

    const usageText = usage.tokens || usage.cost
      ? `🧠 Token: *${usage.tokens ?? "-"}* / Cost: *${usage.cost ?? "-"}*`
      : "🧠 Token: 未入力";

    return `📡 *Mission Control Daily Brief*\nチャンネル: ${channelName}\n\n✅ 完了タスク: *${todayDone}件*\n⏱️ 集中時間: *${todayFocus}分*\n📉 平均サイクルタイム: *${avgCycle}分*\n${usageText}\n\n*今日の予定*\n${todayEventsText}\n\n*Next Actions*\n${topOpen || "- なし"}\n\n*Top Bottlenecks*\n${topBottleneck || "- 記録なし"}`;
  }, [channelName, todayDone, todayFocus, avgCycle, usage.tokens, usage.cost, eventsToday, tasks, bottlenecks]);

  const copySummary = async () => {
    await navigator.clipboard.writeText(slackSummary);
    alert("Slack投稿用サマリーをコピーしました");
  };

  return (
    <main className="container">
      <header>
        <h1>My Mission Control</h1>
        <p>Slack運用前提の個人ワークフロー・コックピット</p>
      </header>

      <section className="kpi-grid">
        <article className="kpi card"><h3>今日の完了</h3><strong>{todayDone}件</strong></article>
        <article className="kpi card"><h3>今日の集中</h3><strong>{todayFocus}分</strong></article>
        <article className="kpi card"><h3>平均サイクル</h3><strong>{avgCycle}分</strong></article>
      </section>

      <section className="card">
        <h2>1) Priority Inbox</h2>
        <p>P1/P2/P3で優先度管理しながら、思考を即キャプチャ。</p>
        <div className="row">
          <input value={taskInput} onChange={(e) => setTaskInput(e.target.value)} placeholder="次にやること" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as "P1" | "P2" | "P3")}>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <button onClick={addTask}>追加</button>
        </div>
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggleDone(t.id)} />
                <span className={t.done ? "done" : ""}>[{t.priority}] {t.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>2) Focus Sprint + Bottleneck Radar</h2>
        <p>集中ブロックの実行と工程時間の計測を同時に管理。</p>
        <div className="row">
          {[15, 25, 45].map((m) => (
            <button key={m} onClick={() => { setDurationMin(m); setTimeLeft(m * 60); setRunning(false); }}>{m}分</button>
          ))}
        </div>
        <div className="timer">{formatTime(timeLeft)}</div>
        <div className="row">
          <button onClick={() => setRunning(true)}>開始</button>
          <button onClick={() => setRunning(false)}>停止</button>
          <button onClick={() => { setRunning(false); setTimeLeft(durationMin * 60); }}>リセット</button>
        </div>

        <hr />

        <div className="row">
          <input value={cycleLabel} onChange={(e) => setCycleLabel(e.target.value)} placeholder="工程名 (例: レビュー待ち)" />
          <input type="number" value={cycleMinutes} onChange={(e) => setCycleMinutes(e.target.value)} placeholder="分" min={1} />
          <button onClick={addCycle}>記録</button>
        </div>
        <ol>
          {bottlenecks.map((r) => (
            <li key={r.id}>{r.label}: {r.minutes}分</li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>3) Slack Daily Brief Composer</h2>
        <p>このチャンネル用の日次サマリーを自動生成して、投稿を高速化。</p>
        <div className="row">
          <input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="#openclaw-missioncontrol" />
          <button onClick={copySummary}>サマリーをコピー</button>
        </div>
        <pre>{slackSummary}</pre>
      </section>

      <section className="card">
        <h2>追加1) AI Token 使用状況</h2>
        <p>OpenClawの`/status`出力を貼ると、トークンとコストを読み取り。</p>
        <textarea
          value={usageRaw}
          onChange={(e) => setUsageRaw(e.target.value)}
          placeholder="/status の出力をここに貼り付け"
          rows={6}
        />
        <div className="row">
          <span>Token: <b>{usage.tokens ?? "-"}</b></span>
          <span>Cost: <b>{usage.cost ?? "-"}</b></span>
          <span>Model: <b>{usage.model ?? "-"}</b></span>
        </div>
      </section>

      <section className="card">
        <h2>追加2) Googleカレンダー今日の予定</h2>
        <p>公開ICS URLを貼って「今日の予定」を抽出。</p>
        <div className="row">
          <input
            value={calendarUrl}
            onChange={(e) => setCalendarUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/.../public/basic.ics"
          />
          <button onClick={fetchTodayEvents} disabled={loadingCalendar}>{loadingCalendar ? "読込中..." : "予定を取得"}</button>
        </div>
        {calendarError ? <p className="error">{calendarError}</p> : null}
        <ul>
          {eventsToday.map((e, i) => (
            <li key={`${e.start.toISOString()}-${i}`}>{formatEventTime(e.start)} {e.summary}</li>
          ))}
          {!eventsToday.length && !calendarError ? <li>未取得 / 予定なし</li> : null}
        </ul>
      </section>
    </main>
  );
}
