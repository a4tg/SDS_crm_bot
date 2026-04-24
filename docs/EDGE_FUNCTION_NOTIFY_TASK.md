# Edge Function Contract: `notify-task`

Frontend (`crm_app/src/Tasks.jsx`) now invokes:

```js
supabase.functions.invoke("notify-task", {
  body: {
    channel: "in_app",
    type: "task_reminder",
    assignee_user_id: "<uuid>",
    message: "<text>",
    task_id: "<uuid | optional>",
  },
});
```

## Required behavior

1. Validate caller session (`authenticated`).
2. Validate payload:
   - `channel` (`in_app`)
   - `type` (`task_reminder`)
   - `assignee_user_id`
   - `message`
3. Write notification event to `task_events`.
4. Return HTTP `200` on success and a machine-readable JSON body:

```json
{ "ok": true }
```

5. Return HTTP `4xx/5xx` with JSON error payload on failure:

```json
{ "ok": false, "error": "..." }
```

## Why this change

- Removes external messenger dependency from browser and backend flow.
- Allows switching delivery channels (push/email) without frontend rewrites.
