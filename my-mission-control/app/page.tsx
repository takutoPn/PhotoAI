"use client";

import { useEffect, useMemo, useState } from "react";

type Task = { id: string; text: string; done: boolean; createdAt: number };
type RecordItem = { id: string; label: string; minutes: number };

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

export default function Home() {
  // Tool 1: Quick Capture Inbox
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);

  // Tool 2: Focus Sprint
  const [durationMin, setDurationMin] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  // Tool 3: Bottleneck Radar
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);

  useEffect(() => {
    const rawTasks = localStorage.getItem("mmc.tasks");
    const rawRecords = localStorage.getItem("mmc.records");
    if (rawTasks) setTasks(JSON.parse(rawTasks));
    if (rawRecords) setRecords(JSON.parse(rawRecords));
  }, []);

  useEffect(() => {
    localStorage.setItem("mmc.tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("mmc.records", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const addTask = () => {
    const text = input.trim();
    if (!text) return;
    setTasks((prev) => [{ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }, ...prev]);
    setInput("");
  };

  const addRecord = () => {
    const m = Number(minutes);
    if (!label.trim() || !m || m <= 0) return;
    setRecords((prev) => [{ id: crypto.randomUUID(), label: label.trim(), minutes: m }, ...prev].slice(0, 30));
    setLabel("");
    setMinutes("");
  };

  const avg = useMemo(() => {
    if (!records.length) return 0;
    return Math.round((records.reduce((sum, r) => sum + r.minutes, 0) / records.length) * 10) / 10;
  }, [records]);

  const slowest = [...records].sort((a, b) => b.minutes - a.minutes).slice(0, 3);

  return (
    <main className="container">
      <header>
        <h1>My Mission Control</h1>
        <p>Next.jsで作る、ワークフロー改善のための3ツール</p>
      </header>

      <section className="card">
        <h2>1) Quick Capture Inbox</h2>
        <p>思いついたタスクを秒で記録。今日やることの取りこぼし防止。</p>
        <div className="row">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="例: 提案書の見積もり確認" />
          <button onClick={addTask}>追加</button>
        </div>
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              <label>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() =>
                    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
                  }
                />
                <span className={t.done ? "done" : ""}>{t.text}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>2) Focus Sprint Timer</h2>
        <p>25/45分などの集中ブロックを回して、作業の切り替えコストを削減。</p>
        <div className="row">
          {[15, 25, 45].map((m) => (
            <button
              key={m}
              onClick={() => {
                setDurationMin(m);
                setTimeLeft(m * 60);
                setRunning(false);
              }}
            >
              {m}分
            </button>
          ))}
        </div>
        <div className="timer">{formatTime(timeLeft)}</div>
        <div className="row">
          <button onClick={() => setRunning(true)}>開始</button>
          <button onClick={() => setRunning(false)}>停止</button>
          <button
            onClick={() => {
              setRunning(false);
              setTimeLeft(durationMin * 60);
            }}
          >
            リセット
          </button>
        </div>
      </section>

      <section className="card">
        <h2>3) Bottleneck Radar</h2>
        <p>各作業にかかった分数を記録して、遅い工程を可視化。</p>
        <div className="row">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="工程名 (例: レビュー待ち)" />
          <input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" placeholder="分" min={1} />
          <button onClick={addRecord}>記録</button>
        </div>
        <p>平均サイクルタイム: <b>{avg} 分</b></p>
        <ol>
          {slowest.map((r) => (
            <li key={r.id}>{r.label}: {r.minutes}分</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
