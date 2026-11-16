# BoothBook
Cost, FIFO inventory & event P&L for pop-up vendors.

## Supabase setup
1. Create a project at supabase.com
2. SQL Editor: run `supabase/schema.sql`
3. Authentication > Providers > Email: turn OFF "Confirm email" (users sign in with username + password)
4. Open the app, paste Project URL + anon key (Project Settings > API), then sign up.
   Or build with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env.local`.
