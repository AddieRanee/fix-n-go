# Fix n Go Garage

Full-stack inventory + transactions tracker for a small garage shop.

## Tech

- Frontend: React (Vite)
- Backend: Node.js + Express
- Database: Supabase (PostgreSQL)
- Auth: Supabase Auth (email + password with email verification), roles stored in `public.profiles` (auto-created)

## Local Setup

### 1) Create Supabase project + schema

1. Create a Supabase project.
2. Open Supabase SQL Editor and run: `supabase/schema.sql`.
   - This creates `public.profiles` + a trigger on `auth.users` to auto-create a default profile/role for new users.
3. In Supabase Dashboard -> Authentication -> Providers -> Email:
   - Enable email confirmations (so users must verify before signing in).
   - Add your Site URL / redirect URL (e.g. `http://localhost:5173` for local).

### 2) Configure environment variables

Backend:

1. Copy `backend/.env.example` to `backend/.env`
2. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard -> Project Settings -> API)
3. Keep the Service Role key on the backend only (never in the frontend)

Frontend:

1. Copy `frontend/.env.example` to `frontend/.env`
2. Set `VITE_API_URL` (default backend is `http://localhost:4000`)
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable/anon key)

Optional (frontend -> Supabase directly):

- Required for email/password login + register (Supabase Auth).
- Use the anon/publishable key only. Never expose the service role key in the frontend.
- If you query tables directly from the frontend, enable Row Level Security (RLS) + policies in Supabase first.

### 3) Install dependencies

```powershell
npm install
```

### 4) Seed dummy data (inventory)

```powershell
npm run seed
```

Create your first account from the UI, verify your email, then (optional) promote it to Admin in Supabase SQL Editor:

```sql
update public.profiles set role = 'Admin'
where id = (select id from auth.users where email = 'you@example.com');
```

### 5) Run locally

```powershell
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Deploy to Vercel

This repo is set up for a single Vercel project that serves the React app and the API from the same domain.

1. Push the repository to GitHub.
2. Import the repo into Vercel.
3. Keep the default build command, or set it to `npm run build`.
4. Use `frontend/dist` as the output directory.
5. Add these environment variables in Vercel:
   - `JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional: `CORS_ORIGIN=*` or your exact Vercel domain

Notes:

- The frontend now calls the API on the same domain by default in production, so you do not need to set `VITE_API_URL` for Vercel.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- After deploy, update your Supabase Auth redirect URLs to include your Vercel domain.
