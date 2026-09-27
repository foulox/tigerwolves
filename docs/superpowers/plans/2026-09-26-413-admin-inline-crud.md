# Admin Inline CRUD for the NBR Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin add, edit, activate, and remove NBR directory entries inline on the All Runs page — no code change, no deploy.

**Architecture:** All Runs is the admin hub. Four admin-only Server Actions (`addDirectoryRun`, `editDirectoryRun`, `removeDirectoryRun`, `activateRun`) back a shared add/edit drawer plus per-card controls in `AllRunsClient`. Deep run configuration stays on the existing `/admin/runs/[runId]` screen, reached from a card. The old `createRun`/`/admin/create-run`/`/admin/runs` list paths are deleted.

**Tech Stack:** Next.js App Router (Server Actions), React client components, Tailwind, Clerk (auth + role grant), Neon Postgres via the `sql` tagged template, Vitest (unit, against the test-data branch), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-26-413-admin-inline-crud-design.md`

## Global Constraints

- Admin gate is `publicMetadata.admin === true` — a leader role alone is NOT admin. Copy the existing pattern from `createRun`: `const user = await currentUser(); if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }`.
- Every Server Action call site has its own `try/catch` with `Sentry.captureException(err)` and, on success, `updateTag('tigerwolves-data')`. `updateTag` is Server-Action-only.
- `updateTag`, not `revalidateTag` (this Next version requires a second cache-life arg on `revalidateTag`).
- No schema migration — `runs.distance` and the `unclaimed` status already shipped in #365a.
- `id = slugify(name)` for new runs. No day-prefix auto-insert, no naming-convention validation — the admin types the day-leading name.
- Category↔kind mapping uses the existing `NBR_CATEGORY_TO_KIND` / `KIND_TO_NBR_CATEGORY` maps in `lib/runProfile.ts`. The drawer shows `NBRCategory` labels; the DB stores `kind`.
- Unit tests that touch the DB run only against the test-data branch — gate with `describe.skipIf(!onTestData)` and the `TEST_DATA_HOST` check, exactly as `__tests__/createRun.test.ts` does. Auth-gate tests (which short-circuit before any DB call) run everywhere.
- `aria-label` on every icon-only control (pencil, trash) — mobile Safari + screen readers.

## Review Focus

- **Server-side auth, not just hidden UI:** a runner or plain leader who calls `addDirectoryRun`/`editDirectoryRun`/`removeDirectoryRun`/`activateRun` directly must be refused `Unauthorized`. Pinned in Tasks 1–4 (auth-gate tests).
- **Activate on a non-`unclaimed` run:** activating a run already `draft`/`live` must refuse, not re-assign or double-flip. Pinned in Task 4.
- **Remove with dependencies:** removing a run that has a leader, follower, or schedule row must refuse, not orphan data. Pinned in Task 3.
- **Slug collision on add:** a new name that slugifies to an existing id must get a `-2`/`-3` suffix, never overwrite an existing run. Pinned in Task 1.
- **Activate with an unknown email:** an email with no Clerk account must return the clear "sign in once" message and leave the run `unclaimed` (no partial activation). Pinned in Task 4.

---

### Task 1: `addDirectoryRun` action (+ repurpose the `insertRun` helper)

Insert a `status = 'unclaimed'` catalog row from the drawer's six fields, reusing the private `insertRun` helper's dup-name + slug-collision logic. Since `createRun` is deleted in Task 7, `insertRun` is repurposed: it gains a `status` argument and a `distance` field, and drops the `run_group` reconcile (an unclaimed stub has no library; a run gets its group at activation — Task 4).

**Files:**
- Modify: `app/admin/actions.ts` — change `insertRun` signature; add `addDirectoryRun`
- Test: `__tests__/addDirectoryRun.test.ts`

**Interfaces:**
- Consumes: `sql`, `slugifyRunName`, `NBR_CATEGORY_TO_KIND` (from `lib/runProfile`), `updateTag`, `currentUser`, `Sentry`.
- Produces:
  - `insertRun(data: { name: string; dayOfWeek: string; meetingTime: string; meetingLocation: string; distance: string; kind: string }, status: 'unclaimed' | 'draft'): Promise<{ error?: string; runId?: string }>` — dup-name check, slug-collision loop, INSERT with the given status and distance. No run_group reconcile.
  - `addDirectoryRun(fields: { name: string; day: string; time: string; location: string; distance: string; category: NBRCategory }): Promise<{ error?: string; runId?: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/addDirectoryRun.test.ts — mirror createRun.test.ts's mock + gate setup.
import { describe, test, expect, afterAll, vi } from 'vitest'
vi.mock('@clerk/nextjs/server', () => ({ currentUser: vi.fn(), clerkClient: vi.fn() }))
vi.mock('next/cache', async importOriginal => {
  const actual = await importOriginal<typeof import('next/cache')>()
  return { ...actual, updateTag: vi.fn() }
})
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { currentUser } from '@clerk/nextjs/server'
import { sql, getRunById } from '../lib/db'
import { addDirectoryRun } from '../app/admin/actions'

const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)
const PREFIX = 'test-add-413'
function signInAs(id: string, meta: { role?: string; admin?: boolean } = {}) {
  vi.mocked(currentUser).mockResolvedValue({ id, publicMetadata: meta } as never)
}
const base = { day: 'Saturday', time: '7:00am', location: 'McCarren Park', distance: '10–22 mi', category: 'Long Runs' as const }

describe('addDirectoryRun authorization', () => {
  test('non-admin leader is refused', async () => {
    signInAs('u_leader', { role: 'leader' })
    const res = await addDirectoryRun({ name: `${PREFIX} A`, ...base })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('addDirectoryRun persistence', () => {
  afterAll(async () => { await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}` })

  test('inserts an unclaimed row with distance and mapped kind', async () => {
    signInAs('u_admin', { admin: true })
    const res = await addDirectoryRun({ name: `${PREFIX} Narwhals`, ...base })
    expect(res.error).toBeUndefined()
    const row = (await sql`SELECT status, distance, kind FROM runs WHERE id = ${res.runId!}`)[0]
    expect(row.status).toBe('unclaimed')
    expect(row.distance).toBe('10–22 mi')
    expect(row.kind).toBe('Long') // NBR_CATEGORY_TO_KIND['Long Runs']
  })

  test('slug collision on same-slug name gets a -2 suffix, does not overwrite', async () => {
    signInAs('u_admin', { admin: true })
    const first = await addDirectoryRun({ name: `${PREFIX} Dupe`, ...base })
    const second = await addDirectoryRun({ name: `${PREFIX} Dupe!`, ...base }) // slugifies the same
    expect(second.error).toBeUndefined()
    expect(second.runId).not.toBe(first.runId)
    expect(second.runId).toMatch(/-2$/)
  })

  test('exact duplicate name is rejected', async () => {
    signInAs('u_admin', { admin: true })
    await addDirectoryRun({ name: `${PREFIX} Exact`, ...base })
    const dup = await addDirectoryRun({ name: `${PREFIX} Exact`, ...base })
    expect(dup.error).toBe('A run with this name already exists')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- addDirectoryRun`
Expected: FAIL — `addDirectoryRun` is not exported.

- [ ] **Step 3: Repurpose `insertRun` and add `addDirectoryRun`**

In `app/admin/actions.ts`, replace the existing private `insertRun` with the version below (adds `status` + `distance`, drops the run_group reconcile and the kind/workoutTypes handling that only `createRun` needed), and add the new action. Add `NBR_CATEGORY_TO_KIND` and `NBRCategory` to the `lib/runProfile` import.

```typescript
async function insertRun(
  data: { name: string; dayOfWeek: string; meetingTime: string; meetingLocation: string; distance: string; kind: string },
  status: 'unclaimed' | 'draft',
): Promise<{ error?: string; runId?: string }> {
  const name = data.name.trim()
  if (!name) return { error: 'Name is required' }
  if (!(RUN_KINDS as readonly string[]).includes(data.kind)) return { error: 'Invalid run kind' }

  // Case-insensitive display-name uniqueness (distinct from slug collision below).
  const dup = await sql`SELECT 1 FROM runs WHERE LOWER(name) = LOWER(${name}) LIMIT 1`
  if (dup.length > 0) return { error: 'A run with this name already exists' }

  // Slug: base from name; probe and suffix -2, -3, … until free.
  const base = slugifyRunName(name) || 'run'
  let candidate = base
  let suffix = 2
  for (;;) {
    const existing = await sql`SELECT 1 FROM runs WHERE id = ${candidate}`
    if (existing.length === 0) break
    candidate = `${base}-${suffix}`
    suffix++
  }

  await sql`
    INSERT INTO runs (id, name, day_of_week, meeting_time, meeting_location, kind, distance, status)
    VALUES (${candidate}, ${name}, ${data.dayOfWeek}, ${data.meetingTime}, ${data.meetingLocation}, ${data.kind}, ${data.distance}, ${status})
  `
  return { runId: candidate }
}

export async function addDirectoryRun(fields: {
  name: string; day: string; time: string; location: string; distance: string; category: NBRCategory
}): Promise<{ error?: string; runId?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const kind = NBR_CATEGORY_TO_KIND[fields.category]
    if (!kind) return { error: 'Invalid category' }
    const result = await insertRun(
      { name: fields.name, dayOfWeek: fields.day, meetingTime: fields.time, meetingLocation: fields.location, distance: fields.distance, kind },
      'unclaimed',
    )
    if (result.error) return result
    updateTag('tigerwolves-data')
    return { runId: result.runId }
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to add run' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- addDirectoryRun`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add app/admin/actions.ts __tests__/addDirectoryRun.test.ts
git commit -m "feat(#413): addDirectoryRun action + repurpose insertRun with status/distance"
```

---

### Task 2: `editDirectoryRun` action

A dedicated admin action for the drawer's field set. Separate from `saveRunIdentity` (which backs the leader's `AboutRunTab` screen), so a quick edit from All Runs can never disturb that surface.

**Files:**
- Modify: `app/admin/actions.ts` — add `editDirectoryRun`
- Test: `__tests__/editDirectoryRun.test.ts`

**Interfaces:**
- Consumes: `sql`, `NBR_CATEGORY_TO_KIND`, `updateTag`, `currentUser`, `Sentry`.
- Produces: `editDirectoryRun(runId: string, fields: { name: string; day: string; time: string; location: string; distance: string; category: NBRCategory }): Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/editDirectoryRun.test.ts — same mock + gate header as Task 1.
// (copy the vi.mock block, currentUser import, TEST_DATA_HOST/onTestData, signInAs)
import { editDirectoryRun, addDirectoryRun } from '../app/admin/actions'
const PREFIX = 'test-edit-413'

describe('editDirectoryRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    const res = await editDirectoryRun('any-run', { name: 'x', day: 'Monday', time: '6am', location: 'y', distance: '1 mi', category: 'Easy Runs' })
    expect(res.error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('editDirectoryRun persistence', () => {
  afterAll(async () => { await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}` })

  test('updates all six fields and maps category to kind', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Orig`, day: 'Monday', time: '6:00am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await editDirectoryRun(runId!, { name: `${PREFIX} Renamed`, day: 'Tuesday', time: '7:00pm', location: 'B', distance: '5 mi', category: 'Workouts' })
    expect(res.error).toBeUndefined()
    const row = (await sql`SELECT name, day_of_week, meeting_time, meeting_location, distance, kind FROM runs WHERE id = ${runId!}`)[0]
    expect(row.name).toBe(`${PREFIX} Renamed`)
    expect(row.day_of_week).toBe('Tuesday')
    expect(row.meeting_time).toBe('7:00pm')
    expect(row.meeting_location).toBe('B')
    expect(row.distance).toBe('5 mi')
    expect(row.kind).toBe('Workout') // NBR_CATEGORY_TO_KIND['Workouts']
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- editDirectoryRun`
Expected: FAIL — `editDirectoryRun` not exported.

- [ ] **Step 3: Implement `editDirectoryRun`**

```typescript
export async function editDirectoryRun(runId: string, fields: {
  name: string; day: string; time: string; location: string; distance: string; category: NBRCategory
}): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const name = fields.name.trim()
    if (!name) return { error: 'Name is required' }
    const kind = NBR_CATEGORY_TO_KIND[fields.category]
    if (!kind) return { error: 'Invalid category' }
    await sql`
      UPDATE runs SET
        name = ${name}, day_of_week = ${fields.day}, meeting_time = ${fields.time},
        meeting_location = ${fields.location}, distance = ${fields.distance}, kind = ${kind}
      WHERE id = ${runId}
    `
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to save run' }
  }
}
```

Note: `editDirectoryRun` does not change `id` on rename (the slug is stable once created; renaming the display name keeps the URL). This matches how `saveRunIdentity` already behaves.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- editDirectoryRun`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/actions.ts __tests__/editDirectoryRun.test.ts
git commit -m "feat(#413): editDirectoryRun action (drawer field set, category→kind)"
```

---

### Task 3: `removeDirectoryRun` action (guarded)

Delete a catalog entry, but refuse if it has any dependency (leader, follower, or schedule row) — those belong to #363.

**Files:**
- Modify: `app/admin/actions.ts` — add `removeDirectoryRun`
- Test: `__tests__/removeDirectoryRun.test.ts`

**Interfaces:**
- Consumes: `sql`, `updateTag`, `currentUser`, `Sentry`.
- Produces: `removeDirectoryRun(runId: string): Promise<{ error?: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/removeDirectoryRun.test.ts — same mock + gate header as Task 1.
import { removeDirectoryRun, addDirectoryRun } from '../app/admin/actions'
const PREFIX = 'test-remove-413'

describe('removeDirectoryRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    expect((await removeDirectoryRun('x')).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('removeDirectoryRun', () => {
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE name LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}`
  })

  test('deletes an unclaimed stub with no dependencies', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Gone`, day: 'Sunday', time: '8am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    expect((await removeDirectoryRun(runId!)).error).toBeUndefined()
    expect((await sql`SELECT 1 FROM runs WHERE id = ${runId!}`).length).toBe(0)
  })

  test('refuses a run that has a leader', async () => {
    signInAs('u_admin', { admin: true })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Held`, day: 'Sunday', time: '8am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    await sql`INSERT INTO run_leaders (run_id, name, sort_order, active) VALUES (${runId!}, 'L', 1, true)`
    const res = await removeDirectoryRun(runId!)
    expect(res.error).toBe('This run has a leader, followers, or schedule — remove those first.')
    expect((await sql`SELECT 1 FROM runs WHERE id = ${runId!}`).length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- removeDirectoryRun`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement `removeDirectoryRun`**

```typescript
export async function removeDirectoryRun(runId: string): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    // Guard: refuse if the run has any dependency (leader / follower / schedule).
    const [leaders, followers, sched] = await Promise.all([
      sql`SELECT 1 FROM run_leaders WHERE run_id = ${runId} LIMIT 1`,
      sql`SELECT 1 FROM runner_follows WHERE run_id = ${runId} LIMIT 1`,
      sql`SELECT 1 FROM schedule WHERE run_id = ${runId} LIMIT 1`,
    ])
    if (leaders.length || followers.length || sched.length) {
      return { error: 'This run has a leader, followers, or schedule — remove those first.' }
    }
    await sql`DELETE FROM runs WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to remove run' }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- removeDirectoryRun`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/actions.ts __tests__/removeDirectoryRun.test.ts
git commit -m "feat(#413): removeDirectoryRun action, guarded against dependencies"
```

---

### Task 4: `activateRun` action (atomic leader-assign + unclaimed→draft)

One action: assign the leader by email, flip `unclaimed → draft`, and reconcile the run's `run_group` (porting the #401 invariant from the deleted `createRun`). All-or-nothing. Reuses `addRunLeaderByEmail`'s core by extracting it into a shared helper.

**Files:**
- Modify: `lib/runLeaders.ts` — extract `assignLeaderByEmail(runId, email)`
- Modify: `app/run-config/actions.ts` — refactor `addRunLeaderByEmail` to call the helper (behavior-preserving)
- Modify: `app/admin/actions.ts` — add `activateRun`; import `resolveOrCreateRunGroup`
- Test: `__tests__/activateRun.test.ts`

**Interfaces:**
- Consumes: `assignLeaderByEmail` (new), `resolveOrCreateRunGroup` (from `lib/db`), `sql`, `updateTag`, `currentUser`, `Sentry`.
- Produces:
  - `assignLeaderByEmail(runId: string, email: string): Promise<{ error?: string }>` in `lib/runLeaders.ts` — resolve Clerk user by email (reject unknown), insert/upsert the `run_leaders` row, grant the leader role. No auth gate, no `updateTag` (callers own those).
  - `activateRun(runId: string, email: string): Promise<{ error?: string }>` in `app/admin/actions.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/activateRun.test.ts — same mock header as Task 1, plus mock the Clerk
// helpers in lib/runLeaders so no real Clerk call is made.
vi.mock('../lib/runLeaders', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/runLeaders')>()
  return { ...actual, assignLeaderByEmail: vi.fn() }
})
import { assignLeaderByEmail } from '../lib/runLeaders'
import { activateRun, addDirectoryRun } from '../app/admin/actions'
const PREFIX = 'test-activate-413'

describe('activateRun authorization', () => {
  test('non-admin is refused', async () => {
    signInAs('u_runner', {})
    expect((await activateRun('x', 'a@b.com')).error).toBe('Unauthorized')
  })
})

describe.skipIf(!onTestData)('activateRun', () => {
  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id IN (SELECT id FROM runs WHERE name LIKE ${PREFIX + '%'})`
    await sql`DELETE FROM runs WHERE name LIKE ${PREFIX + '%'}`
  })

  test('unknown email leaves the run unclaimed (no partial activation)', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({ error: 'No account found for that email — they need to sign in once before they can be added.' })
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Unknown`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await activateRun(runId!, 'nobody@nowhere.com')
    expect(res.error).toMatch(/sign in once/)
    expect((await sql`SELECT status FROM runs WHERE id = ${runId!}`)[0].status).toBe('unclaimed')
  })

  test('refuses a run that is not unclaimed', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({})
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Already`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    await sql`UPDATE runs SET status = 'draft' WHERE id = ${runId!}`
    expect((await activateRun(runId!, 'a@b.com')).error).toBe('This run is not unclaimed.')
  })

  test('assigns leader and flips unclaimed → draft on success', async () => {
    signInAs('u_admin', { admin: true })
    vi.mocked(assignLeaderByEmail).mockResolvedValue({})
    const { runId } = await addDirectoryRun({ name: `${PREFIX} Go`, day: 'Monday', time: '6am', location: 'A', distance: '3 mi', category: 'Easy Runs' })
    const res = await activateRun(runId!, 'leader@nbr.com')
    expect(res.error).toBeUndefined()
    expect(vi.mocked(assignLeaderByEmail)).toHaveBeenCalledWith(runId, 'leader@nbr.com')
    expect((await sql`SELECT status FROM runs WHERE id = ${runId!}`)[0].status).toBe('draft')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- activateRun`
Expected: FAIL — `activateRun` / `assignLeaderByEmail` not exported.

- [ ] **Step 3: Extract `assignLeaderByEmail`, refactor `addRunLeaderByEmail`, add `activateRun`**

In `lib/runLeaders.ts`, add (moving the resolve/insert/grant body out of `addRunLeaderByEmail` verbatim — no behavior change):

```typescript
// Core leader-assignment: resolve the Clerk user by email, upsert the run_leaders
// row, grant the leader role. NO auth gate and NO updateTag — callers own those.
// Shared by addRunLeaderByEmail (run-config) and activateRun (#413 admin activate).
export async function assignLeaderByEmail(runId: string, email: string): Promise<{ error?: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return { error: 'Enter an email address' }
  const clerkUser = await resolveClerkUserByEmail(normalizedEmail)
  if (!clerkUser) return { error: 'No account found for that email — they need to sign in once before they can be added.' }
  const name = leaderDisplayName(clerkUser, normalizedEmail)
  const maxOrder = await sql`SELECT MAX(sort_order) AS m FROM run_leaders WHERE run_id = ${runId}`
  const nextOrder = ((maxOrder[0].m as number | null) ?? 0) + 1
  await sql`
    INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
    VALUES (${runId}, ${name}, ${normalizedEmail}, ${clerkUser.id}, ${nextOrder}, true)
    ON CONFLICT (run_id, email) WHERE email IS NOT NULL DO UPDATE SET
      clerk_user_id = ${clerkUser.id}, active = true
  `
  await grantLeaderRole(clerkUser)
  return {}
}
```

`lib/runLeaders.ts` will need `sql` imported if not already. Then in `app/run-config/actions.ts`, replace the body of `addRunLeaderByEmail` (after its auth + `assertCanManageRun` checks) with:

```typescript
    const result = await assignLeaderByEmail(runId, email)
    if (result.error) return result
    updateTag('tigerwolves-data')
    return {}
```

(Import `assignLeaderByEmail` from `@/lib/runLeaders`.) Confirm `__tests__/runConfigAuth.test.ts` still passes — this is behavior-preserving.

In `app/admin/actions.ts`, add `activateRun` (import `assignLeaderByEmail` from `@/lib/runLeaders` and `resolveOrCreateRunGroup` from `@/lib/db`):

```typescript
export async function activateRun(runId: string, email: string): Promise<{ error?: string }> {
  try {
    const user = await currentUser()
    if (!user || user.publicMetadata?.admin !== true) return { error: 'Unauthorized' }
    const rows = await sql`SELECT status, name, meeting_location FROM runs WHERE id = ${runId}`
    if (!rows[0]) return { error: 'Run not found' }
    if (rows[0].status !== 'unclaimed') return { error: 'This run is not unclaimed.' }

    // Assign the leader first; only flip status if that succeeded (atomic outcome).
    const assigned = await assignLeaderByEmail(runId, email)
    if (assigned.error) return assigned

    // Reconcile a run_group so the now-draft run owns its library (#401 invariant).
    const runGroupId = await resolveOrCreateRunGroup(rows[0].name as string, 'road', rows[0].meeting_location as string)
    await sql`UPDATE runs SET status = 'draft', run_group_id = ${runGroupId} WHERE id = ${runId}`
    updateTag('tigerwolves-data')
    return {}
  } catch (err) {
    Sentry.captureException(err)
    return { error: 'Failed to activate run' }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- activateRun runConfigAuth`
Expected: PASS (new activate suite + the unchanged run-config auth suite).

- [ ] **Step 5: Commit**

```bash
git add lib/runLeaders.ts app/run-config/actions.ts app/admin/actions.ts __tests__/activateRun.test.ts
git commit -m "feat(#413): atomic activateRun; extract shared assignLeaderByEmail"
```

---

### Task 5: `RunEditorDrawer` component (shared add/edit)

A bottom-sheet drawer for the six fields, modeled on `FeedbackDrawer`'s open/close + `useTransition` pattern. Handles both add (empty) and edit (pre-filled) via props; on submit it calls the action passed in and closes on success.

**Testing note:** this repo has **no render-test tooling** (`vitest` runs in the `node` environment, includes only `**/*.test.ts`, and `@testing-library/react`/jsdom are not installed). Follow the established pattern — do **not** add render-test infra. This component is pure presentation glue; its behavior is verified by the Task 8 e2e (fill fields → save → row appears/updates). The task gate is a clean typecheck.

**Files:**
- Create: `components/RunEditorDrawer.tsx`

**Interfaces:**
- Consumes: `addDirectoryRun`, `editDirectoryRun` (Server Actions); `DAYS_OF_WEEK` (from `lib/runIdentity`); `NBRCategory` (from `lib/runProfile`).
- Produces: default export `RunEditorDrawer`, props:
  ```typescript
  type Props = {
    open: boolean
    onClose: () => void
    onSaved: () => void
    mode: 'add' | 'edit'
    initial?: { runId: string; name: string; day: string; time: string; location: string; distance: string; category: NBRCategory }
  }
  ```
  In `edit` mode, `initial.day` is a full day name (e.g. `'Saturday'`) and `initial.time` is the raw `meeting_time` string — Task 6 seeds these from the raw `DirectoryRun`, not the display card.

- [ ] **Step 1: Implement `RunEditorDrawer`**

Build the bottom-sheet with controlled state for the six fields (seed from `initial` when `mode === 'edit'`, empty for `add`; re-seed via `useEffect` on `initial`/`open` change so reopening on a different card refreshes the fields), a scrim, a Save button that runs the matching action (`mode === 'add' ? addDirectoryRun(fields) : editDirectoryRun(initial!.runId, fields)`) inside `useTransition`, shows `result.error` inline on failure, and calls `onSaved()` + `onClose()` on success. Category is a `<select>` over the five `NBRCategory` labels; Day is a `<select>` over `DAYS_OF_WEEK`. Every field `<label>` uses `htmlFor`/`id` (so the Task 8 e2e `getByLabel` works and screen readers announce them). Reset internal state on close (mirror `FeedbackDrawer.reset`). Match the Tailwind bottom-sheet look from the mockup (`scratch/413-admin-flow.html`): `fixed inset-x-0 bottom-0 rounded-t-2xl`, scrim `bg-black/35`, `touch-manipulation` on all buttons.

- [ ] **Step 2: Verify it typechecks and the suite is unaffected**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS (no new test file; the drawer is exercised in Task 8).

- [ ] **Step 3: Commit**

```bash
git add components/RunEditorDrawer.tsx
git commit -m "feat(#413): RunEditorDrawer shared add/edit bottom-sheet"
```

---

### Task 6: Admin control gating (pure fn) + wiring in `AllRunsClient`

Add a pure `adminCardControls` function to `lib/allRuns.ts` (unit-tested in `.ts`, following the `cardAffordance` precedent — this is where admin-gating is pinned), then consume it in `AllRunsClient` to render the badge, pencil, Manage →, Activate →, Remove, and the header "+ Add run".

**Files:**
- Modify: `lib/allRuns.ts` — add `adminCardControls`
- Modify: `__tests__/allRuns.test.ts` — test it
- Modify: `components/AllRunsClient.tsx` — render controls + wire the drawer

**Interfaces:**
- Consumes: `ViewerContext`, `RunStatus` (both already in `lib/allRuns.ts`); in the client: `RunEditorDrawer`, `activateRun`, `removeDirectoryRun`, `KIND_TO_NBR_CATEGORY`, `useRouter`.
- Produces: `adminCardControls(run: { status: RunStatus }, viewer: ViewerContext): { canEdit: boolean; canManage: boolean; canActivate: boolean; canRemove: boolean; showAddRun: boolean }`.

- [ ] **Step 1: Write the failing test**

```typescript
// append to __tests__/allRuns.test.ts (uses the existing viewer() helper there)
import { adminCardControls } from '../lib/allRuns'

describe('adminCardControls', () => {
  test('non-admin gets nothing', () => {
    expect(adminCardControls({ status: 'unclaimed' }, viewer({ isAdmin: false })))
      .toMatchObject({ canEdit: false, canManage: false, canActivate: false, canRemove: false, showAddRun: false })
  })
  test('admin can edit any card and add runs', () => {
    const a = adminCardControls({ status: 'live' }, viewer({ isAdmin: true }))
    expect(a.canEdit).toBe(true)
    expect(a.showAddRun).toBe(true)
  })
  test('unclaimed: activate + remove, no manage', () => {
    expect(adminCardControls({ status: 'unclaimed' }, viewer({ isAdmin: true })))
      .toMatchObject({ canManage: false, canActivate: true, canRemove: true })
  })
  test('claimed (draft/live): manage, no activate/remove', () => {
    expect(adminCardControls({ status: 'draft' }, viewer({ isAdmin: true })))
      .toMatchObject({ canManage: true, canActivate: false, canRemove: false })
    expect(adminCardControls({ status: 'live' }, viewer({ isAdmin: true })))
      .toMatchObject({ canManage: true, canActivate: false, canRemove: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- allRuns`
Expected: FAIL — `adminCardControls` not exported.

- [ ] **Step 3: Implement `adminCardControls`**

```typescript
// lib/allRuns.ts
export function adminCardControls(
  run: { status: RunStatus },
  viewer: ViewerContext,
): { canEdit: boolean; canManage: boolean; canActivate: boolean; canRemove: boolean; showAddRun: boolean } {
  const admin = viewer.isAdmin
  const unclaimed = run.status === 'unclaimed'
  return {
    canEdit: admin,                 // every card is quick-editable by admin (incl. unclaimed)
    canManage: admin && !unclaimed,  // claimed runs have a full-settings screen
    canActivate: admin && unclaimed, // hand an unclaimed stub to a leader
    canRemove: admin && unclaimed,   // deleting a live/draft run is #363
    showAddRun: admin,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- allRuns`
Expected: PASS.

- [ ] **Step 5: Wire the controls into `AllRunsClient`**

- Import `adminCardControls`, `KIND_TO_NBR_CATEGORY`, `RunEditorDrawer`, `activateRun`, `removeDirectoryRun`, and `useRouter` (`next/navigation`).
- Build a lookup from the raw props: `const runsById = new Map(runs.map(r => [r.id, r]))` — the edit drawer must seed from the **raw `DirectoryRun`**, not the display card (the card's `day` is an abbreviation and `startTime` is reformatted).
- Add drawer state: `const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; initial?: EditorInitial } | null>(null)` and `const router = useRouter()`.
- When `adminCardControls(card, viewerCtx).showAddRun`, render a header **"+ Add run"** button (`data-testid="admin-add-run"`) → `setEditor({ mode: 'add' })`.
- On each card, compute `const admin = adminCardControls(card, viewerCtx)` and render:
  - **State badge** from `card.status` (Unclaimed / Draft / Live) — badge styling from the mockup.
  - if `admin.canEdit`: **✏️** button (`data-testid={`admin-edit-${card.id}`}`, `aria-label={`Edit ${card.name}`}`) → seed from the raw run:
    ```typescript
    const r = runsById.get(card.id)!
    setEditor({ mode: 'edit', initial: {
      runId: r.id, name: r.name, day: r.day_of_week ?? '', time: r.meeting_time ?? '',
      location: r.meeting_location ?? '', distance: r.distance ?? '',
      category: KIND_TO_NBR_CATEGORY[r.kind ?? ''] ?? 'Easy Runs',
    }})
    ```
  - if `admin.canManage`: **⚙️ Manage →** as `<Link href={`/admin/runs/${card.id}`} data-testid={`admin-manage-${card.id}`}>`.
  - if `admin.canActivate`: **👤 Activate →** (`data-testid={`admin-activate-${card.id}`}`) → reveal an accessible inline email `<input>` (label "email") + Activate button that calls `activateRun(card.id, email)` in a `useTransition`, showing any `error` inline.
  - if `admin.canRemove`: **🗑** (`data-testid={`admin-remove-${card.id}`}`, `aria-label={`Remove ${card.name}`}`) → `confirm()` then `removeDirectoryRun(card.id)` in a transition; on success `router.refresh()`.
- Render once, after the day blocks: `<RunEditorDrawer open={!!editor} mode={editor?.mode ?? 'add'} initial={editor?.initial} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); router.refresh() }} />`. The actions already `updateTag`; `router.refresh()` re-runs the server component so the new/edited row shows.

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/allRuns.ts __tests__/allRuns.test.ts components/AllRunsClient.tsx
git commit -m "feat(#413): adminCardControls gating + wire admin controls into AllRunsClient"
```

---

### Task 7: Retire the old admin create/list paths

Delete the redundant routes and the `createRun` action now that All Runs owns add/edit/manage. Do this only after Tasks 1–6 make the replacement functional.

**Files:**
- Delete: `app/admin/create-run/page.tsx`, `components/CreateRunForm.tsx`
- Delete: `app/admin/runs/page.tsx` (the list)
- Modify: `app/admin/actions.ts` — remove `createRun`
- Delete: `__tests__/createRun.test.ts`
- Modify: `components/Header.tsx` — remove the "Create a Run" and "Manage Runs" `UserButton.Link` items (and the now-unused `Plus`, `List` lucide imports)
- Keep: `app/admin/runs/[runId]/page.tsx` (deep settings — reached from a card)

- [ ] **Step 1: Verify nothing else imports the deletions**

Run: `rg -n "createRun\b|CreateRunForm|/admin/create-run|href=\"/admin/runs\"" app components __tests__`
Expected: only the files listed above. If anything else references them, stop and reconcile.

- [ ] **Step 2: Delete files and edit Header**

```bash
git rm app/admin/create-run/page.tsx components/CreateRunForm.tsx app/admin/runs/page.tsx __tests__/createRun.test.ts
```
Remove `createRun` from `app/admin/actions.ts`. In `components/Header.tsx`, delete the two `isAdmin && <UserButton.Link ... />` blocks ("Create a Run", "Manage Runs") and drop `Plus`, `List` from the lucide import.

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: PASS, no dangling references.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(#413): retire /admin/create-run, /admin/runs list, and createRun; trim Header menu"
```

---

### Task 8: End-to-end flow

One Playwright spec covering the admin lifecycle, signed in as the test leader account (which must carry `admin: true` on the test-data Clerk instance — verify in setup).

**Files:**
- Create: `e2e/admin-directory.spec.ts`

- [ ] **Step 1: Write the e2e spec**

```typescript
import { test, expect } from '@playwright/test'
// Uses the authenticated admin storage state (e2e/auth.setup.ts). Requires the
// test-leader account to have publicMetadata.admin === true on the test-data Clerk instance.
test('admin adds, edits, activates, and navigates to full settings', async ({ page }) => {
  await page.goto('/all-runs')
  // Add
  await page.getByTestId('admin-add-run').click()
  await page.getByLabel(/run name/i).fill('Sunday E2E Testers')
  await page.getByLabel(/distance/i).fill('5 mi')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Sunday E2E Testers')).toBeVisible()
  // Edit
  await page.getByTestId('admin-edit-sunday-e2e-testers').click()
  await page.getByLabel(/location/i).fill('Prospect Park')
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Prospect Park')).toBeVisible()
  // Activate → becomes draft (Manage appears)
  await page.getByTestId('admin-activate-sunday-e2e-testers').click()
  await page.getByLabel(/email/i).fill(process.env.PLAYWRIGHT_TEST_EMAIL!)
  await page.getByRole('button', { name: /activate/i }).click()
  await expect(page.getByTestId('admin-manage-sunday-e2e-testers')).toBeVisible()
  // Manage → deep settings
  await page.getByTestId('admin-manage-sunday-e2e-testers').click()
  await expect(page).toHaveURL(/\/admin\/runs\/sunday-e2e-testers/)
})
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e -- admin-directory`
Expected: PASS. (If the test account lacks `admin: true`, the controls won't render — set it on the test-data Clerk instance first.)

- [ ] **Step 3: Add teardown for the fixture run**

Extend `scripts/seed-e2e.ts` (or the spec's `afterAll`) to delete `sunday-e2e-testers` and its `run_leaders`/`run_groups` rows so re-runs start clean, consistent with the existing seed's self-heal pattern.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin-directory.spec.ts scripts/seed-e2e.ts
git commit -m "test(#413): e2e admin directory lifecycle (add/edit/activate/manage)"
```

---

## Notes for the executor

- **No migration** — do not add one; `distance` and `unclaimed` already exist on the test-data and production branches. If a unit test fails with `column "distance" does not exist`, you are pointed at a stale branch — check `DATABASE_URL`.
- **Local `next dev` does not run here** — verification is unit (test-data DB) + e2e + the PR Preview URL. Apply nothing to production/demo; there's no schema change to propagate.
- **Preview check for Lou:** on the PR Preview URL, signed in as admin — add a run, edit it, activate it, follow Manage → into settings, then remove a fresh unclaimed stub. Signed out, confirm the page looks exactly as before.
- The clickable design reference is `scratch/413-admin-flow.html` (gitignored working artifact — the approved hub model).
