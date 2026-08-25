# DoorMan

Events app — guestlists, tickets, promoters, and the door. React/Vite frontend
on Vercel, Supabase backend (Postgres + RLS, edge functions, Storage, Realtime,
pg_cron). Originally built on Base44.

## Quick start

```bash
npm install
./dev.sh          # Supabase stack + edge functions + app on http://localhost:5173
```

`./dev.sh reset` wipes and re-applies all migrations first; `./dev.sh test` runs
the SQL test suites. Sign in locally with the dev form: `demo@doorman.dev` /
`demopass123` (created automatically).

---

<details>
<summary>Original Base44 README (pre-migration)</summary>

**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)

</details>
