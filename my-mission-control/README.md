# My Mission Control (Next.js)

Slack運用前提の個人ミッションコントロール。
対象チャンネル（例: `#openclaw-missioncontrol`）に投稿するための日次サマリーを、Web上で即生成できます。

## 3つのワークフローツール

1. **Priority Inbox**
   - タスクをP1/P2/P3で即記録
   - 完了チェックで進捗可視化

2. **Focus Sprint + Bottleneck Radar**
   - 15/25/45分の集中タイマー
   - 工程時間を記録し、遅い工程Top3を抽出

3. **Slack Daily Brief Composer**
   - 今日のKPI（完了件数 / 集中分数 / 平均サイクル）を自動集計
   - Slack投稿向けメッセージを生成してクリップボードにコピー

## 起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開く。

## メモ

- データは `localStorage` に保存されます。
- まずは手動投稿運用（コピー&ペースト）で高速に回し、必要なら次段でSlack API自動投稿を追加できます。
