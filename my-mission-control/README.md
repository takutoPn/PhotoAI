# My Mission Control (Next.js)

Slack運用前提の個人ミッションコントロール。

## 主要機能

1. **Priority Inbox**
2. **Focus Sprint + Bottleneck Radar**
3. **Slack Daily Brief Composer**
4. **AI Token使用状況パネル**（`/status`貼り付け解析）
5. **Google Calendar OAuth連携**（`calendar.readonly`、DB不要）

## セットアップ

```bash
npm install
copy .env.example .env.local
npm run dev
```

`http://localhost:3000` を開く。

## Google OAuth設定（無料でOK）

1. Google Cloud Consoleでプロジェクト作成
2. **Google Calendar API** を有効化
3. OAuth同意画面を作成（Externalで可）
4. OAuth Client ID（Web application）を作成
5. Authorized redirect URI に以下を追加:
   - `http://localhost:3000/api/auth/callback/google`
6. 発行されたID/Secretを `.env.local` に設定:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
7. `AUTH_SECRET` も設定（ランダム文字列）

## メモ

- 小規模の個人用途なら通常は無料運用で問題ありません。
- スコープは最小限: `https://www.googleapis.com/auth/calendar.readonly`
