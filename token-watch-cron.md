# Token Watch Cron (Slack)

- Job ID: `4793ded3-6b94-46fd-9ef7-2fcc5544add3`
- Name: `token-usage-watch-slack-allowsend`
- Schedule: every 5 minutes
- Session target: isolated
- Delivery: none (job sends Slack only when threshold exceeded)
- Slack target: `channel:C0AJA0U68BT`

## Logic
- `>=95%` -> `CRITICAL` + notify
- `>=85% and <95%` -> `WARNING` + notify
- `<85%` -> `OK` + no notification

## Useful commands
```bash
openclaw cron list
openclaw cron runs --id 4793ded3-6b94-46fd-9ef7-2fcc5544add3 --limit 20
openclaw cron run 4793ded3-6b94-46fd-9ef7-2fcc5544add3
openclaw cron disable 4793ded3-6b94-46fd-9ef7-2fcc5544add3
openclaw cron enable 4793ded3-6b94-46fd-9ef7-2fcc5544add3
openclaw cron rm 4793ded3-6b94-46fd-9ef7-2fcc5544add3
```
