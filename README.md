# CRM Web App (`crm_app`)

React + Vite frontend for CRM operations.

## New bot access

The "new bot" is the in-app CRM flow (not a Telegram bot).
To enter it, open the web app and sign in with Supabase email/password.

## Stack

- React 18
- Vite
- Supabase JS
- React Router
- Vitest + Testing Library

## Environment

Create `crm_app/.env.local`:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Run

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run build
npm run test -- --run
```

## Authentication and access profile

- Login uses Supabase Auth (`email + password`).
- After sign-in, the app loads access profile from `public.users` by `auth_user_id`.
- If profile is missing, the app calls RPC `crm_ensure_user_profile` to auto-link/create a profile, then retries profile load.
- If profile still cannot be resolved, user stays on login with an explicit error.

Main flow implementation:

- `src/main.jsx`
- `src/supabaseClient.js`

## Data access model

- Core entities: `tasks`, `clients`, `branches`, `users`, `task_events`, `task_files`.
- Visibility and mutation are controlled by Postgres RLS policies from `db/init`.
- `users` reads are explicitly guarded by migration `12_auth_profile_guard_and_users_rls.sql`.

## Notifications

Frontend no longer calls Telegram API directly.
Task reminders are sent via Supabase Edge Function `notify-task`:

- docs: `docs/EDGE_FUNCTION_NOTIFY_TASK.md`
- function: `../supabase/functions/notify-task/index.ts`

## Important migration note

`db/init/11_hard_reset_users_rebind_and_backfill.sql` is destructive and intended only for explicit one-time reset operations.
Do not run it as part of regular deployment.
