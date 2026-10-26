# Swami Abhyasika — Next.js edition

Your library-management app, rebuilt as a **Next.js + TypeScript** web app with **Supabase** (database and login),
**Cloudinary** (photos), **Tailwind CSS + shadcn/ui** (design), tested with **Vitest** and **Playwright**,
ready for **Vercel** and **GitHub**.

It is being rebuilt **page by page** (your decision). Pages that are not rebuilt yet still run exactly as before,
so the app is never broken half-way.

| Page | Address | Status |
|---|---|---|
| Dashboard | `/dashboard` | original screen (works, own address) |
| Students | `/students` | original screen |
| New Admission | `/students/new` | original screen |
| Basement Library | `/library/basement` | original screen |
| 2nd Floor Library | `/library/second-floor` | original screen |
| Fee Management | `/finance/fees` | original screen |
| Reminders | `/finance/reminders` | original screen |
| Settings | `/settings` | original screen, now linking to the two new pages below |
| **WhatsApp Message Templates** | `/settings/whatsapp` | **new, React + Tailwind + shadcn/ui** |
| **Backup & Restore** | `/settings/backup` | **new, React + Tailwind + shadcn/ui** |
| Statistics | `/finance/statistics` | original screen |
| Export Data | `/export` | original screen |

---

## 1. Run it on your computer

```bash
npm install
cp .env.example .env.local      # then set ADMIN_USERNAME and ADMIN_PASSWORD
npm run dev                     # open http://localhost:3000
```

Needs Node 20 or newer. With the Supabase settings left empty, the app uses a small database stored in `./data`
and a simple local login, so you can try everything without any account. **Nothing is migrated from your old app yet**
(your decision) — the app starts empty.

Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | start while you work (restarts when you change code) |
| `npm run build` then `npm start` | the real, optimised version |
| `npm test` | 153 automatic tests (unit + integration), ~15 seconds |
| `npx playwright install chromium` once, then `npm run build && npm run test:e2e` | 22 browser tests that click through the real app |
| `npm run typecheck` | checks every TypeScript type |
| `npm run seed -- <email> <password> [owner\|staff]` | add a person who may use the app / reset a password |
| `npm run backup` | write a backup file into `./backups` |
| `npm run import:legacy -- file.json` | bring data from the old app in (**not run yet**) |

> Stop `npm run dev` before running `seed`, `backup` or `import:legacy` while you use the built-in local database:
> it can only be opened by one program at a time. (This does not apply once you use Supabase.)

---

## 2. The decisions you made, and what they mean

| # | You chose | What it means in practice |
|---|---|---|
| 1 | Rebuild **page by page** | New React pages sit next to original ones. Each time a page is rebuilt, one entry in the table above changes. Old and new code live together for a while. |
| 2 | **One address per sidebar item** | Every page has its own URL you can bookmark. The groups "Library" and "Finance" are only headings in the sidebar, so they appear inside the address (`/library/basement`). Addresses are lowercase; `/Students` redirects to `/students` because web addresses are case-sensitive. |
| 3 | Backup runs **both** daily and on first open | A scheduled job runs once a day. Also, when anyone opens the app, it checks "has today's Google Drive backup happened?" and makes it if not. A day is never missed, even if the scheduled job fails. |
| 4 | **4 WhatsApp messages** editable | The four messages the app really sends. The three unused ones in the old code (overdue, welcome) were not added, so nothing new appears in the app. |
| 5 | Google Drive via **"Connect" button (OAuth)** | You sign in to Google once. The app can only see backup files it creates itself. |
| 6 | **Don't move data yet** | The old app is untouched and keeps working. The importer exists and is tested, but has not been run. |

---

## 3. How it works (the short version)

**Folders**

```
app/                 pages and API addresses (Next.js "App Router")
  (app)/settings/…   the new React pages (WhatsApp templates, Backup)
  [...legacy]/       serves the original screens at the new addresses
  api/               everything the browser asks the server to do
components/          the sidebar and the shadcn/ui building blocks
lib/                 the real logic (no web code) — easiest part to read and test
  backup/            snapshot, comparison, schedule, Google Drive, runner
legacy/ + public/    the original screen (index.html, app.js) kept as it was
db/schema.sql        every database table, written in plain SQL
tests/               unit, integration and browser tests
```

**Login.** With Supabase configured, people sign in with **email + password through Supabase Auth**.
The app keeps two private (`httpOnly`) cookies: a short-lived token and a long-lived refresh token, and renews the
short one automatically. Being able to sign in is **not enough**: the person must also be listed in the app's
own `users` table (an "allow-list"). So even if a stranger signs up on your Supabase project, they cannot get in.
The owner (`ADMIN_EMAIL`) is added automatically the first time they sign in *and Supabase has verified the email*.
Roles: **owner** can change templates and backups; **staff** can use the app and look.

**Saving data.** The original screens still keep data in the browser's memory and send changes to the server.
The server now stores them in proper tables (`students`, `payments`, `bookings`, …) and only writes what changed.
A counter per list stops an out-of-date screen from deleting what another device added, and the server refuses a
second booking of the same seat, slot and dates.

**WhatsApp templates.** Each message has built-in default wording that is character-for-character the old text
(a test proves it against copies of the original code). Your edits are saved in the database. `{name}` and similar
placeholders are filled in when a message is sent; a line with an *optional* placeholder (such as Student ID) disappears
when that value is empty. The preview in Settings uses the very same code (`public/wa-render.js`) as the real sending.

**Backups.** A backup is one JSON file with everything (students, payments, **seat bookings**, settings, photo links).
The old backup forgot seat bookings; this one includes them. The owner PIN is never included. Every attempt is written
to a history. For each destination (this device / Google Drive) the page shows: last backup time, destination, how it was
made (manual / scheduled / catch-up), what changed in it, what has changed since, size and status.
Downloads to your device are always manual (a website cannot save files by itself) — the history records that a download
*started*, not that you kept the file.

---

## 4. Putting it online

Do these in order. Nothing here needs to be done to run it locally.

### A. GitHub
Create a **private** repository and upload this folder. `.gitignore` already keeps `.env.local` and `data/` out.

### B. Supabase (database + login)
1. Create a project (pick a region near you). Save the database password.
2. **Authentication → Providers/Sign-in settings:** switch **off** "Allow new users to sign up".
   (The allow-list protects you anyway; this is a second lock.)
3. **Authentication → Users → Add user:** your own email + password, tick auto-confirm.
4. Copy these into `.env.local` (and later into Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the "anon"/"publishable" key),
   and the database connection string as `DATABASE_URL` (use the pooled one for Vercel). Menu names in Supabase change
   over time — look under *Project Settings → API* and *Connect*.
5. Set `ADMIN_EMAIL` to the same email as step 3, run `npm run dev` once, sign in. The tables are created automatically
   and you become the owner.
6. Add staff: put `SUPABASE_SERVICE_ROLE_KEY` in **your own** `.env.local` only (never on Vercel) **and** the Supabase
   `DATABASE_URL`, then run `npm run seed -- someone@example.com <password> staff`.
   (If `DATABASE_URL` is empty, the person would be added to your *local* database instead.)

### C. Cloudinary (photos)
Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Without them photos are saved on disk,
which does **not** work on Vercel — set these before going online.

### D. Google Drive backups
1. Google Cloud console → new project → enable **Google Drive API**.
2. **OAuth consent screen:** type *External*; add your Gmail as a test user. **Then click "Publish app" (to Production).**
   While it stays in *Testing*, Google expires the saved key after **7 days**, so backups would silently stop.
3. **Credentials → Create OAuth client ID → Web application.** Authorised redirect URIs:
   `https://YOUR-APP.vercel.app/api/google/callback` (and `http://localhost:3000/api/google/callback` for trying it locally).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `APP_URL` (e.g. `https://YOUR-APP.vercel.app`).
5. In the app: Settings → Backup & Restore → **Connect Google Drive**. Google may say "not verified" once; choose
   Advanced → continue (you are the only user). Files go to a folder called "Swami Abhyasika Backups".

### E. Vercel
Import the GitHub repo and add these **Environment Variables**:

| Name | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Supabase connection string |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | from Supabase → API |
| `ADMIN_EMAIL` | yes | the owner's email |
| `AUTH_SECRET` | yes | long random text: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CRON_SECRET` | yes | another long random text. Protects the daily backup address |
| `CLOUDINARY_*` (3 values) | yes | from Cloudinary |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL` | for Drive | see D |
| `APP_TIMEZONE` | no | defaults to `Asia/Kolkata` |
| `BACKUP_ENCRYPTION_KEY` | no | optional separate key for the stored Google token |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | keep it on your own computer only |

`vercel.json` already contains the daily schedule (20:30 UTC = 02:00 AM India time). After the first night, check
**Backup history**: a row with "Scheduled" should appear. Vercel's documentation describes sending the `CRON_SECRET`
as a Bearer token to cron addresses; if the first scheduled run shows nothing, check the deployment's cron logs.

**Costs and limits to know** (checked when this was written; plans change):
* Vercel's free *Hobby* plan allows scheduled jobs **once a day**, running **anywhere inside the chosen hour**,
  in UTC. Changing the time means changing `vercel.json` and redeploying. Per-minute precision needs the paid plan.
* Vercel Hobby is for **non-commercial** use. If this app runs a library that charges fees, ask whether that counts.
* Supabase's free plan has no daily backups and pauses a project after a week without activity. Your daily backup to
  Google Drive covers the first; the daily scheduled job also touches the database, which helps with the second.

---

## 5. Tests

* **`npm test` — 153 tests, no accounts needed.** Pure logic (seat rules, text safety, WhatsApp text, change counting,
  schedule maths, encryption, navigation) and integration tests on a real in-memory PostgreSQL: saving/loading
  1,000 students, out-of-date protection, owner PIN, backups with a pretend Google Drive and a pretend Supabase Auth.
* **`npm run test:e2e` — 22 browser tests.** A real Chromium logs in, clicks every sidebar item, checks addresses,
  back/forward and bookmarks, edits and saves a WhatsApp template and proves the original screens send the new wording,
  downloads a backup and reads the file, and tries the phone-size menu.
  First run `npx playwright install chromium`, then `npm run build`.

## 6. What was **not** tested against the real service

The sandbox this was built in could not reach Supabase, Google, Cloudinary or Vercel, so those were tested against
small pretend servers written to behave like them (`tests/helpers`). Please check these on your first real run:
signing in through real Supabase, connecting Google Drive, uploading a real photo, and the first scheduled backup.
Send me the error text if anything differs.

## 7. Known limits

* The **original screens** (everything marked "original screen" above) still contain the old script. They keep the old
  look and behaviour (including its weak spots) until they are rebuilt. Text is made safe on the server meanwhile
  (`<`, `>` and `"` become look-alike characters).
* Between pages, the sidebar of a rebuilt React page and of an original screen are two separate copies.
  The "Reminders" count badge is only shown on original screens.
* If two devices save at almost the same moment, the second is told to reload and repeats its last edit.
* Restoring a backup file in the new app is not built yet (only the importer script). The old "Import Backup" button on the
  original Settings page still understands the *old* file format only.
