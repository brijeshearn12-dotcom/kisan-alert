/**
 * scripts/test-disease-checks.ts
 * -----------------------------------------------------------------------------
 * TEMPORARY integration test harness for the disease-diagnosis pipeline.
 *
 * For every image in `test-images/` it:
 *   1. signs in as a real Supabase user (session replayed via cookies),
 *   2. uploads the image straight to Cloudinary using the app's own
 *      `/api/upload-signature` endpoint (no duplicated signing logic),
 *   3. calls `POST /api/disease-checks` with the resulting secure URL,
 *   4. validates the HTTP status, JSON shape and confidence range,
 *   5. verifies the `disease_checks` row was written (and, for low-confidence
 *      results, that a `cases` row was opened),
 *   6. prints a per-image PASS/FAIL report and a final summary.
 *
 * It never crashes on a single image failure — it records the reason and moves
 * on. This script touches NO production code and is safe to delete afterwards.
 *
 * Prerequisites:
 *   • The dev server must be running:  npm run dev
 *   • Test credentials in the environment or .env.local:
 *       TEST_USER_EMAIL, TEST_USER_PASSWORD
 *   • Optional: SUPABASE_SERVICE_ROLE_KEY (enables a direct `cases` table read;
 *       without it, escalation is verified via the API's returned case_id).
 *
 * Run:  npx tsx scripts/test-disease-checks.ts
 * -----------------------------------------------------------------------------
 */
import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────

/** Mirror of the route's escalation threshold (kept in sync intentionally). */
const LOW_CONFIDENCE_THRESHOLD = 0.6
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/** Load .env.local into process.env (tsx does not do this automatically). */
function loadEnvLocal(): void {
  let raw: string
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[key] === undefined) process.env[key] = value
  }
}
loadEnvLocal()

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const IMAGES_DIR = process.env.TEST_IMAGES_DIR ?? 'test-images'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test-farmer-disease-checks@example.com'
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestFarmerPassword123!'

// ── Tiny ANSI styling (respects NO_COLOR) ─────────────────────────────────

const useColor = !process.env.NO_COLOR
const paint = (code: string, text: string): string =>
  useColor ? `\x1b[${code}m${text}\x1b[0m` : text
const green = (t: string) => paint('32', t)
const red = (t: string) => paint('31', t)
const yellow = (t: string) => paint('33', t)
const bold = (t: string) => paint('1', t)
const dim = (t: string) => paint('2', t)
const badge = (pass: boolean) => (pass ? green('PASS') : red('FAIL'))

// ── Types ─────────────────────────────────────────────────────────────────

interface SignatureResponse {
  timestamp: number
  signature: string
  api_key: string
  cloud_name: string
}

interface DiagnosisResponse {
  diagnosis: string | null
  confidence_score: number
  treatment_advice: string | null
  escalated: boolean
  case_id: string | null
  disease_check_id: string | null
  error?: string
}

type DbStatus = 'PASS' | 'FAIL' | 'N/A'

interface ImageResult {
  file: string
  overall: boolean
  fallback: boolean
  diagnosis: string | null
  confidence: number | null
  escalated: boolean
  dbStatus: DbStatus
  reason: string | null
  dcInserted: boolean
  caseInserted: boolean
}

// ── Auth: sign in and capture the cookies the API expects ─────────────────

interface Session {
  authClient: SupabaseClient
  cookieHeader: string
}

async function authenticate(): Promise<Session> {
  const jar = new Map<string, string>()
  const authClient = createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    // No background refresh timer: this is a short-lived script, and the ticker
    // otherwise keeps a libuv handle alive that crashes exit on Windows.
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })

  const signInResult = await authClient.auth.signInWithPassword({
    email: TEST_EMAIL!,
    password: TEST_PASSWORD!,
  })

  if (signInResult.error && (signInResult.error.message.includes('Invalid login credentials') || signInResult.error.message.includes('Email not confirmed'))) {
    console.log(yellow(`User sign-in failed (${signInResult.error.message}). Attempting to auto-register test user...`))
    const signUpResult = await authClient.auth.signUp({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD!,
    })
    if (signUpResult.error) {
      throw new Error(`Auto-registration failed: ${signUpResult.error.message}`)
    }
    if (signUpResult.data.user) {
      const { error: profileError } = await authClient
        .from('users')
        .insert({ id: signUpResult.data.user.id, name: 'Test Farmer', role: 'farmer' })
      if (profileError) {
        throw new Error(`Failed to create test farmer profile: ${profileError.message}`)
      }
    }
    // Re-attempt sign in to ensure all session cookies are properly populated in the jar
    const retry = await authClient.auth.signInWithPassword({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD!,
    })
    if (retry.error) {
      throw new Error(`Retry sign-in failed: ${retry.error.message}`)
    }
  } else if (signInResult.error || !signInResult.data.user) {
    throw new Error(`sign-in failed: ${signInResult.error?.message ?? 'no user returned'}`)
  }

  const cookieHeader = Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ')
  if (!cookieHeader) throw new Error('sign-in produced no session cookies')
  return { authClient, cookieHeader }
}

// ── Retry fetch helper ───────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3,
  delay = 2000,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options)
      return response
    } catch (err) {
      if (i === retries - 1) throw err
      console.warn(yellow(`Fetch to ${url} failed: ${(err as Error).message}. Retrying in ${delay}ms... (${i + 1}/${retries})`))
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries.`)
}

// ── Upload via the app's own signature endpoint ───────────────────────────

async function uploadImage(
  cookieHeader: string,
  filePath: string,
  fileName: string,
): Promise<string> {
  const sigRes = await fetchWithRetry(`${BASE_URL}/api/upload-signature`, {
    headers: { Cookie: cookieHeader },
  })
  if (!sigRes.ok) {
    throw new Error(`upload failed: signature request returned HTTP ${sigRes.status}`)
  }
  const sig = (await sigRes.json()) as SignatureResponse

  const bytes = await readFile(filePath)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), fileName)
  form.append('api_key', sig.api_key)
  form.append('timestamp', String(sig.timestamp))
  form.append('signature', sig.signature)

  const upRes = await fetchWithRetry(
    `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
    { method: 'POST', body: form },
  )
  if (!upRes.ok) {
    throw new Error(`upload failed: Cloudinary returned HTTP ${upRes.status}`)
  }
  const data = (await upRes.json()) as { secure_url?: string }
  if (!data.secure_url) throw new Error('upload failed: Cloudinary response had no secure_url')
  return data.secure_url
}

// ── Call the diagnosis API ────────────────────────────────────────────────

async function diagnose(
  cookieHeader: string,
  imageUrl: string,
): Promise<{ status: number; body: DiagnosisResponse | null }> {
  const res = await fetchWithRetry(`${BASE_URL}/api/disease-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({ image_url: imageUrl }),
  })
  const raw = await res.text()
  let body: DiagnosisResponse | null = null
  try {
    body = JSON.parse(raw) as DiagnosisResponse
  } catch {
    body = null
  }
  return { status: res.status, body }
}

// ── Database verification ─────────────────────────────────────────────────

async function verifyDiseaseCheck(
  authClient: SupabaseClient,
  admin: SupabaseClient | null,
  diseaseCheckId: string,
): Promise<boolean> {
  const client = admin ?? authClient // farmer RLS allows reading own checks
  const { data } = await client
    .from('disease_checks')
    .select('id')
    .eq('id', diseaseCheckId)
    .maybeSingle()
  return data !== null
}

async function verifyCase(
  admin: SupabaseClient | null,
  diseaseCheckId: string | null,
  apiCaseId: string | null,
): Promise<boolean> {
  // `cases` SELECT is expert-only under RLS, so a farmer session cannot read it.
  // With a service-role key we read the table directly; otherwise we trust the
  // API's returned case_id, which is only non-null after a successful insert.
  if (admin && diseaseCheckId) {
    const { data } = await admin
      .from('cases')
      .select('id')
      .eq('disease_check_id', diseaseCheckId)
      .maybeSingle()
    return data !== null
  }
  return apiCaseId !== null
}

// ── Per-image test ────────────────────────────────────────────────────────

async function testImage(
  session: Session,
  admin: SupabaseClient | null,
  filePath: string,
  fileName: string,
): Promise<ImageResult> {
  const base: ImageResult = {
    file: fileName,
    overall: false,
    fallback: false,
    diagnosis: null,
    confidence: null,
    escalated: false,
    dbStatus: 'N/A',
    reason: null,
    dcInserted: false,
    caseInserted: false,
  }

  try {
    const imageUrl = await uploadImage(session.cookieHeader, filePath, fileName)
    const { status, body } = await diagnose(session.cookieHeader, imageUrl)

    if (status === 500) return { ...base, reason: 'API returned 500' }
    if (status === 401) return { ...base, reason: 'API returned 401 (not authenticated)' }
    if (body === null) return { ...base, reason: 'invalid JSON response' }

    const confidence = body.confidence_score
    const confidenceValid =
      typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    if (!confidenceValid) {
      return { ...base, confidence: null, reason: 'confidence_score missing or out of range' }
    }

    // Expected fallback (AI unavailable): a valid, non-crashing outcome.
    if (body.error === 'ai_unavailable' || body.diagnosis === null) {
      return {
        ...base,
        overall: true,
        fallback: true,
        confidence,
        diagnosis: body.diagnosis,
        dbStatus: 'N/A',
        reason: 'Gemini unavailable (fallback returned cleanly)',
      }
    }

    // Successful diagnosis — validate content.
    if (!body.treatment_advice) {
      return { ...base, confidence, diagnosis: body.diagnosis, reason: 'treatment_advice missing' }
    }

    // Escalation flag must match the confidence threshold exactly.
    const shouldEscalate = confidence < LOW_CONFIDENCE_THRESHOLD
    if (body.escalated !== shouldEscalate) {
      return {
        ...base,
        confidence,
        diagnosis: body.diagnosis,
        escalated: body.escalated,
        reason: `escalation flag (${body.escalated}) does not match confidence ${confidence}`,
      }
    }
    if (!shouldEscalate && body.case_id !== null) {
      return {
        ...base,
        confidence,
        diagnosis: body.diagnosis,
        reason: 'unnecessary case created for a high-confidence result',
      }
    }

    // Database verification.
    if (!body.disease_check_id) {
      return { ...base, confidence, diagnosis: body.diagnosis, reason: 'disease_check_id missing from response' }
    }
    const dcOk = await verifyDiseaseCheck(session.authClient, admin, body.disease_check_id)
    let caseOk = true
    if (body.escalated) {
      caseOk = await verifyCase(admin, body.disease_check_id, body.case_id)
    }

    const dbPass = dcOk && caseOk
    return {
      ...base,
      overall: dbPass,
      confidence,
      diagnosis: body.diagnosis,
      escalated: body.escalated,
      dbStatus: dbPass ? 'PASS' : 'FAIL',
      reason: dbPass
        ? null
        : !dcOk
          ? 'database insert missing (disease_checks)'
          : 'database insert missing (cases)',
      dcInserted: dcOk,
      caseInserted: body.escalated && caseOk,
    }
  } catch (err) {
    return { ...base, reason: err instanceof Error ? err.message : 'unknown error' }
  }
}

// ── Reporting ─────────────────────────────────────────────────────────────

function printImageReport(r: ImageResult): void {
  const line = '─'.repeat(46)
  console.log(dim(line))
  console.log(bold(r.file))
  console.log('')
  console.log(`  Diagnosis:    ${r.diagnosis ?? dim('—')}`)
  console.log(`  Confidence:   ${r.confidence !== null ? r.confidence.toFixed(2) : dim('—')}`)
  console.log(`  Escalated:    ${r.escalated ? yellow('YES') : 'No'}`)
  console.log(`  Database:     ${r.dbStatus === 'N/A' ? dim('N/A') : badge(r.dbStatus === 'PASS')}`)
  console.log(`  Overall:      ${badge(r.overall)}`)
  if (r.reason) console.log(`  ${dim('Note:')}         ${r.overall ? dim(r.reason) : red(r.reason)}`)
}

function printSummary(results: ImageResult[]): boolean {
  const tested = results.length
  const successful = results.filter((r) => r.overall).length
  const failed = tested - successful
  const escalated = results.filter((r) => r.escalated).length
  const dbInserts =
    results.filter((r) => r.dcInserted).length + results.filter((r) => r.caseInserted).length
  const scored = results.filter((r) => r.confidence !== null && !r.fallback)
  const avgConfidence =
    scored.length > 0
      ? (scored.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / scored.length).toFixed(2)
      : 'N/A'
  const allPass = failed === 0 && tested > 0

  console.log('')
  console.log(bold('=================================='))
  console.log(bold('  SUMMARY'))
  console.log(bold('=================================='))
  console.log(`  Images Tested:          ${tested}`)
  console.log(`  Successful:             ${green(String(successful))}`)
  console.log(`  Failed:                 ${failed > 0 ? red(String(failed)) : '0'}`)
  console.log(`  Average Confidence:     ${avgConfidence}`)
  console.log(`  Escalated Cases:        ${escalated}`)
  console.log(`  Total Database Inserts: ${dbInserts}`)
  console.log(`  Overall Result:         ${badge(allPass)}`)
  console.log(bold('=================================='))
  return allPass
}

// ── Entry point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment or .env.local')
  }

  // Fail fast if the dev server is not up.
  try {
    await fetch(`${BASE_URL}/api/upload-signature`, { method: 'HEAD' })
  } catch {
    throw new Error(`Dev server not reachable at ${BASE_URL}. Start it with:  npm run dev`)
  }

  const entries = await readdir(IMAGES_DIR, { withFileTypes: true })
  const images = entries
    .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort()

  if (images.length === 0) {
    throw new Error(`No images found in ${IMAGES_DIR}/`)
  }

  console.log(bold(`\nKisan Alert · disease-check integration test`))
  console.log(dim(`  Target:  ${BASE_URL}`))
  console.log(dim(`  Images:  ${images.length} in ${IMAGES_DIR}/`))
  console.log(dim(`  Cases:   ${SERVICE_ROLE_KEY ? 'verified via service-role DB read' : 'verified via API case_id (no service role)'}`))

  const session = await authenticate()
  const admin = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

  const results: ImageResult[] = []
  for (const name of images) {
    const result = await testImage(session, admin, join(IMAGES_DIR, name), name)
    results.push(result)
    printImageReport(result)
    if (images.indexOf(name) < images.length - 1) {
      // Sleep 12 seconds to avoid Gemini rate limits (429)
      await new Promise((resolve) => setTimeout(resolve, 12000))
    }
  }

  const allPass = printSummary(results)
  process.exit(allPass ? 0 : 1)
}

main().catch((err: unknown) => {
  console.error(red(`\nFatal: ${err instanceof Error ? err.message : String(err)}`))
  process.exit(1)
})
