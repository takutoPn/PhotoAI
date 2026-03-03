# PhotoAI

![PhotoAI preview](./lightroom-auto-system/img/top.png)

PhotoAI は Lightroom カタログをもとに、写真セレクトと学習データ蓄積を行うプロジェクトです。

## Features
- Lightroom Catalog (`.lrcat`) の読み込み（D&D / ファイル選択）
- 自動セレクト（★3=採用 / ★1=次点 / ★0=非採用の内部運用）
- セレクト結果の手動調整
- Catalog への書き戻し（書き出しマッピングはカスタム可能）
- 過去セレクト履歴の学習取り込み
- 学習イベントの暗号化保存（AES-256-GCM）

## Architecture
- Frontend: Electron
- Backend: FastAPI

## Security / Privacy
- RAW/JPEG など元画像データの保管・同梱を前提としない運用
- 学習イベントは `backend/learning_data/learning_events.enc` に暗号化保存
- 復号キーは環境変数 `PHOTOAI_LEARNING_KEY` で管理

## Quick Start
詳細なセットアップ手順は以下を参照:
- `lightroom-auto-system/select-mvp/README.md`
