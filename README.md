<div align="center">

# 🌱 naozi

**Spaced repetition vocabulary learning where you own the courses.**

Build your own courses, import your old decks, and let a scheduler decide exactly when each word needs another look.

[Live beta](https://YOUR_DOMAIN.vercel.app) · [Report a bug](https://github.com/YOUR_GITHUB_USERNAME/naozi/issues)

<br />

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

## Why I built this

Almost a decade ago, my favorite flashcard app shut down the version I loved. It wasn't just a study tool to me: it's how I learned three more languages. Anyone could build a course, share it with friends, and the app handled the hard part of deciding which words to review and when. When it disappeared, so did the courses, the community, and a way of learning that actually worked for me.

The apps that replaced it lock learners into pre-made content. You can't add the words you actually need, fix a bad translation, or build a course for a language nobody has made one for.

**naozi is my attempt to rebuild that technology from a learner's point of view.** It's shaped by years of daily use, so other language learners can curate and control their own vocabulary and study it efficiently, without depending on a company to decide what they're allowed to learn.

---

## What it does

- **Your own courses:** create courses in about 100 languages, organized into levels, with alternate accepted answers, readings (furigana, pinyin, romanization) and notes.
- **Bulk import:** bring in CSV or tab-separated exports from spreadsheets, Anki or older flashcard apps. Columns are detected automatically, duplicates are skipped, and you get a preview before anything is saved.
- **Learning sessions:** each new word gets an intro card, then three multiple choice rounds, then three typing rounds, with a seed → sprout → flower growth meter.
- **Reviews on a schedule:** an SM-2 scheduler brings each word back just before you'd forget it. Missed words come back later in the same session.
- **Answer checking for real languages:**
  - Unicode normalization, so composed and decomposed accents match
  - typo tolerance that scales with word length
  - strict or lenient accent checking per course
  - scripts like Japanese kana and Devanagari are handled correctly
  - IME-safe input for Chinese, Japanese and Korean keyboards
  - an on-screen accent bar for each language
- **Mobile friendly** throughout, with 44px tap targets, safe-area support and a keyboard-aware session layout.
- **Accounts:** email and password sign-in with usernames, password reset, and courses private to their owner.

---

## Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | One codebase serves the React UI and the API routes. Server-rendered pages, file-based routing, and it runs on Vercel with no configuration. |
| **Language** | TypeScript (strict) | The scheduler, answer checker and API contracts share types end to end, so a mismatch between client and server is a compile error, not a production bug. |
| **UI** | React + Tailwind CSS v4 | Fast iteration with a small design system (color tokens, touch-target rules) defined in one CSS file. |
| **Database** | Supabase Postgres | Relational data (courses → levels → words, per-user card state, an append-only review log) fits Postgres naturally. SQL functions handle dashboard counts and new-word selection in one round trip. |
| **Auth** | Supabase Auth + `@supabase/ssr` | Cookie-based sessions that work in server routes and middleware, JWT verification with asymmetric keys, and bearer-token support ready for a mobile app. |
| **Validation** | Zod | Every API body is validated at runtime, and TypeScript types are inferred from the same schemas, so there's one source of truth. |
| **Dates** | `@date-fns/tz` | "Due today" follows each user's timezone and a daily rollover hour, not UTC midnight. |
| **CSV** | PapaParse | Handles quoted cells, mixed delimiters, and the byte order marks spreadsheet exports add. |
| **Testing** | Vitest | Fast, TypeScript-native tests for the pure scheduling and answer-checking logic. |
| **Hosting** | Vercel | Deploys on every push, preview URLs for every branch, and instant rollbacks. |

---

## Architecture

### Overview

naozi is a **modular monolith**: a single Next.js app with clear internal boundaries. The browser talks only to naozi's own API routes, and those routes are the only code that talks to the database.

```
Browser (React)
   │  fetch /api/*  (session cookie)
   ▼
Next.js API routes        ← validate input (Zod), resolve the signed-in user
   │
   ▼
Services                  ← course editing, sessions, reviews, dashboard
   │            │
   ▼            ▼
SRS engine    Supabase Postgres
(pure logic)  (courses, levels, items, card state, review log)
```

A `proxy.ts` layer runs before every request. It refreshes the auth session and redirects signed-out visitors to sign in.

### The SRS engine (`lib/srs`)

The heart of the app is a **pure TypeScript package** with no database, network or framework imports:

- **`scheduler.ts`:** SM-2 scheduling across four card states (new → learning → review → relearning), with ease-factor updates, float-safe interval math, and configurable learning steps.
- **`answer.ts`:** normalization, script-aware accent stripping, grapheme-based Levenshtein distance, and verdicts (`exact`, `accents`, `typo`, `wrong`).
- **`session.ts`:** plans learn and review sessions and picks multiple choice distractors, preferring the same level and similar length.
- **`time.ts`:** timezone-aware day boundaries and due dates.

The current time is always passed in, never read inside the engine. That makes every function deterministic, fully unit-testable, and portable: the same package will run inside a future mobile app for offline reviews.

### Data model

| Table | Purpose |
|---|---|
| `users` | Profile, username, timezone and daily rollover hour, linked to the auth account |
| `courses` | Title, language pair, visibility, accent strictness, daily limits |
| `levels` | Ordered sections within a course |
| `items` | Prompt, answer, alternates, reading, notes |
| `user_item_state` | Each user's scheduling state per word (ease, interval, repetitions, lapses, due date) |
| `review_log` | **Append-only** record of every answer: verdict, grade, response time, and state before and after |

The review log is the source of truth; card state can be rebuilt by replaying it. That design makes idempotent submissions, offline sync, algorithm migrations and machine learning possible without schema changes. Each review has a client-generated ID, so a double-tapped answer is only ever recorded once.

### Project structure

```
app/
├── api/                  API routes (courses, levels, items, sessions, reviews, dashboard, auth)
├── auth/callback/        Password-reset link handler
├── courses/[id]/         Course page, learn and review sessions, editor
├── sign-in, sign-up, forgot-password, reset-password
components/
├── session/              Session runner, question types, feedback, growth meter
├── editor/               Course editor, word rows, CSV import dialog
├── dashboard/, course/, auth/, ui/
lib/
├── srs/                  Pure spaced repetition engine and tests
├── services/             Database logic for courses and study
├── auth/                 Supabase auth clients and session proxy
├── client/               Browser API client, types, CSV and editor helpers
├── api.ts                Route helpers: auth, validation, errors
└── validation.ts         Zod schemas for every request
supabase/
├── migrations/           Versioned schema changes
└── seed.sql              Local test data
proxy.ts                  Session refresh and route protection
```

---

## Benefits of this architecture

- **Correctness where it matters:** the scheduler and answer checker are pure functions with property-style tests, so bugs that would corrupt a learner's review history are caught before deploying.
- **Security by default:**
  - row-level security is enabled on every table, with no public policies
  - the secret key never leaves the server
  - every mutation checks ownership
  - input is validated at the API boundary
- **One codebase, one deploy:** UI and API ship together, so there's no version skew between them.
- **Ready for mobile:** the API accepts bearer tokens, and the SRS engine is framework-free. An Expo app can reuse both.
- **Ready for data science:** every answer is logged with timing and state transitions, which is exactly the data modern scheduling models train on.
- **Cheap to run:** a serverless frontend plus managed Postgres costs nothing during the beta and scales with usage.

---

## Getting started

### Requirements
- Node.js 22+
- A Supabase project (or the Supabase CLI with Docker for a local database)

### Setup

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/naozi.git
cd naozi
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Apply the migrations in `supabase/migrations/` in filename order, then:

```bash
npm run dev
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run test` | Run the SRS engine test suite |
| `npm run typecheck` | Type-check the whole project |
| `npm run check` | Typecheck and tests (run before every push) |
| `npm run build` | Production build |

---

## Roadmap

### Product
- [ ] **Sharing:** unlisted and public course links, enrolling in others' courses, and copying a course to your account
- [ ] **Onboarding:** native languages, learning goals, and an opt-in for anonymized research data
- [ ] **Course discovery:** a browsable catalog of public courses by language
- [ ] **Richer items:** audio, images, a notes column in the editor, and level reordering
- [ ] **Google sign-in**, and email confirmation with a custom sender domain
- [ ] **Statistics:** streaks, retention over time, and hardest words

### Mobile
- [ ] **Expo (React Native) app** sharing the TypeScript SRS engine
- [ ] **Offline reviews:** queue answers locally and sync by replaying the review log
- [ ] **Review reminders** through push notifications

### Engineering and DevOps
- [ ] **Separate environments:** local, staging and production Supabase projects
- [ ] **CI/CD:** GitHub Actions for lint, typecheck, tests and build on every pull request, plus automated migrations after merge
- [ ] **Branch workflow:** `main` / `dev` / feature branches with a branch-policy check
- [ ] **Git hooks:** Lefthook with commitlint and Conventional Commits
- [ ] **Error monitoring** with Sentry
- [ ] **Database backups** and additive-only migration practices

### Data, ML and MLOps
- [ ] **Richer event logging:** session starts, ends and abandonment, plus platform and device class on each review
- [ ] **FSRS scheduler:** migrate from SM-2 to the Free Spaced Repetition Scheduler. It models stability, difficulty and retrievability and outperforms SM-2 in public benchmarks. The migration is a replay of `review_log` through the new model.
- [ ] **Per-user parameters:** fit individual scheduler weights once a learner has enough history
- [ ] **Item difficulty modeling:** estimate how hard each word is across all learners, including interference from the learner's native language
- [ ] **Smarter distractors:** mine typed wrong answers for real confusion pairs, and use them as multiple choice options
- [ ] **Training pipeline:** export review logs to feature tables, schedule training jobs, and evaluate with log loss, calibration and RMSE of predicted recall
- [ ] **Model registry and rollout:** version scheduler parameters, deploy behind feature flags, and A/B test against the current scheduler
- [ ] **Monitoring:** track predicted vs. actual recall in production to catch model drift

---

## Author

**Grace** · Full-stack software engineer

---

