# Kisan Alert

AI-powered crop advisory for Maharashtra smallholder farmers.

## What it does

Kisan Alert helps farmers select the right crop for their field by combining:

- **Soil type selection** — Sandy, Loamy, Clayey, or Black Cotton
- **Live 7-day weather forecast** from Open-Meteo (no API key required)
- **Gemini AI reasoning** — constrained to agronomically viable crops for the current season
- **Dry spell detection** — alerts farmers when weekly rainfall drops below 10 mm

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Auth + DB | Supabase (Postgres + RLS) |
| AI | Google Gemini 2.0 Flash |
| Weather | Open-Meteo API |

## Getting Started

1. Copy `.env.local.example` to `.env.local` and fill in your keys:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GEMINI_API_KEY=...
```

2. Apply the database schema:

```bash
# In the Supabase SQL Editor, run:
supabase/schema.sql
```

3. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to `/login`.

## Key Files

```
app/
  api/recommendations/route.ts  # POST /api/recommendations
  recommendation/page.tsx       # Main crop advisory UI
  (auth)/login/page.tsx         # Auth (sign in + sign up)
lib/
  cropLookup.ts                 # Soil x Season => viable crops
  gemini.ts                     # Gemini AI wrapper (never throws)
  supabase.ts                   # Browser client
  supabaseServer.ts             # Server client (Route Handlers)
  constants.ts                  # SOIL_TYPES shared constant
supabase/
  schema.sql                    # Full DB schema + RLS policies
```

## Recommendation Flow

```
POST /api/recommendations
  ├── Validate soil_type + district_id
  ├── Authenticate via Supabase session cookie
  ├── Look up district coordinates from DB
  ├── Fetch Open-Meteo 7-day forecast
  ├── Derive season (kharif / rabi / summer)
  ├── getViableCrops(soil, season) → candidate list
  ├── Ask Gemini to pick best crop + reasoning
  ├── Persist to recommendations table (best-effort)
  └── Return { crop_name, reasoning, confidence_score, is_dry_spell }
```

## Testing Recommendations Locally

We have provided a dedicated development-only endpoint to easily test crop recommendations without needing to sign in, provide a session cookie, or build a complex request body.

### Test Endpoint (Development Only)

Use the following PowerShell command to test recommendation generation:

```powershell
Invoke-RestMethod `
-Uri "http://localhost:3000/api/recommendations/test" `
-Method POST
```

**Why this route exists:**
- Eliminates local manual lookup of valid database UUIDs (`district_id`) or soil IDs (`soil_type`).
- Automatically falls back to the first available district in the database and the first valid soil type from `SOIL_TYPES`.
- Generates recommendations using a mock/temporary developer user ID `00000000-0000-0000-0000-000000000000` to bypass authentication barriers in local environments.

**Security & Environment Check:**
- This route is blocked in production by returning a `405 Method Not Allowed` error if `process.env.NODE_ENV !== "development"`.
- Production authentication is fully preserved on `/api/recommendations`.

## Commands

```bash
npm run dev     # development server
npm run build   # production build
npm run lint    # ESLint
npx tsc --noEmit  # TypeScript check
```
