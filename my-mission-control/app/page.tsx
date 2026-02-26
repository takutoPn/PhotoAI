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

const isToday = (ts: number) => {
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const formatTime = (sec: number) => {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
};

export default function Home() {
  // Tool 1: Priority Inbox
  const [taskInput, setTaskInput] = useState("");
  const [priority, setPriority] = useState<"P1" | "P2" | "P3">("P2");
  const [tasks, setTasks] = useState<Task[]>([]);

  // Tool 2: Focus Sprint + Cycle log
  const [durationMin, setDurationMin] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [cycleLabel, setCycleLabel] = useState("");
  const [cycleMinutes, setCycleMinutes] = useState("");
  const [cycles, setCycles] = useState<Cycle[]>([]);

  // Tool 3: Slack Brief Composer
  const [channelName, setChannelName] = useState("#openclaw-missioncontrol");

  useEffect(() => {
    const t = localStorage.getItem("mmc.tasks.v2");
    const fs = localStorage.getItem("mmc.focus.v2");
    const c = localStorage.getItem("mmc.cycles.v2");
    const ch = localStorage.getItem("mmc.channel.v2");
    if (t) setTasks(JSON.parse(t));
    if (fs) setFocusSessions(JSON.parse(fs));
    if (c) setCycles(JSON.parse(c));
    if (ch) setChannelName(ch);
  }, []);

  useEffect(() => localStorage.setItem("mmc.tasks.v2", JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem("mmc.focus.v2", JSON.stringify(focusSessions)), [focusSessions]);
  useEffect(() => localStorage.setItem("mmc.cycles.v2", JSON.stringify(cycles)), [cycles]);
  useEffect(() => localStorage.setItem("mmc.channel.v2", channelName), [channelName]);

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

  const todayDone = tasks.filter((t) => t.doneAt && isToday(t.doneAt)).length;
  const todayFocus = focusSessions.filter((s) => isToday(s.createdAt)).reduce((sum, s) => sum + s.minutes, 0);
  const avgCycle = useMemo(() => {
    const todayCycles = cycles.filter((c) => isToday(c.createdAt));
    if (!todayCycles.length) return 0;
    return Math.round((todayCycles.reduce((sum, c) => sum + c.minutes, 0) / todayCycles.length) * 10) / 10;
  }, [cycles]);

  const bottlenecks = [...cycles].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  const slackSummary = useMemo(() => {
    const topOpen = tasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.priority < b.priority ? -1 : 1))
      .slice(0, 3)
      .map((t) => `- [${t.priority}] ${t.text}`)
      .join("\n");

    const topBottleneck = bottlenecks.map((b) => `- ${b.label}: ${b.minutes}分`).join("\n");

    return `📡 *Mission Control Daily Brief*\nチャンネル: ${channelName}\n\n✅ 完了タスク: *${todayDone}件*\n⏱️ 集中時間: *${todayFocus}分*\n📉 平均サイクルタイム: *${avgCycle}分*\n\n*Next Actions*\n${topOpen || "- なし"}\n\n*Top Bottlenecks*\n${topBottleneck || "- 記録なし"}`;
  }, [channelName, todayDone, todayFocus, avgCycle, tasks, bottlenecks]);

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
    </main>
  );
}
