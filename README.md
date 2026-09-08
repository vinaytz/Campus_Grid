# Campus Grid — Timetable Management System

Next.js 15 (App Router) + MongoDB. A public schedule board at `/`, and an
administrator workbench at `/login` → `/dashboard`.

---

## Run it

```bash
cp .env.example .env      # set MONGODB_URI and AUTH_SECRET
npm install
npm run seed              # admin user + realistic sample data
npm run dev
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

Then: sign in → **Timetables → Generate draft** → review gaps → **Publish**.

---

## How the system thinks

Everything reduces to one sentence:

> *A **faculty member** teaches a **subject** to a **section**, N times a week,
> each session D periods long, in a **room** that fits.*

That sentence is the `Assignment` model. The generator expands each assignment
into `sessionsPerWeek` **sessions**, then finds a (day, starting period, room)
for every one of them without breaking any hard rule.

### Hard constraints — never violated
| Rule | Where enforced |
|---|---|
| A section is in one place at a time | `Ledger.free("section", …)` |
| A faculty member is in one place at a time | `Ledger.free("faculty", …)` |
| A room hosts one class at a time | `Ledger.free("room", …)` |
| Room capacity ≥ section strength | `roomFits()` |
| Labs go in lab rooms; lectures don't | `roomFits()` |
| A 2h/3h session runs in consecutive periods | `buildWindows()` |
| Nothing crosses lunch (unless allowed) | `buildWindows()` |
| Faculty blocked windows are respected | `candidates()` |
| Per-day and per-week load caps | `candidates()` |

### Soft preferences — scored, not enforced
Spread a course across the week rather than stacking it on one day; balance each
section's daily load; prefer the smallest adequate room; prefer a section's home
room for lectures; fill mornings first.

### Algorithm
Backtracking constraint search with **most-constrained-variable ordering**
(sessions with the fewest eligible rooms go first) and **least-cost value
ordering** (candidates sorted by the soft score above). Occupancy is tracked in
hash sets, so every feasibility check is O(1).

Three things keep it honest in production:

1. **Impossible sessions are pulled out first.** A lab that no room can seat is
   reported with a fix ("no LAB room seats 50 students") instead of poisoning the
   search for everything else.
2. **Partial results are salvaged.** The deepest assignment the search reached is
   kept, the remainder is filled greedily, and whatever is left over is listed on
   the draft with a reason.
3. **Seeded PRNG.** The same seed reproduces the same timetable exactly — so a
   result is reproducible, and re-rolling the seed gives a genuinely different one.

Budgets: 400k steps / 12s. Measured: ~220 sessions across 14 sections placed in
under 100ms.

---

## Structure

```
src/
├── models/          Mongoose schemas — the data contract
├── lib/
│   ├── db.ts        Cached connection (survives dev hot-reload)
│   ├── auth.ts      JWT in an httpOnly cookie, bcrypt hashing
│   ├── api.ts       ok() / fail() / handleError() — one error shape
│   ├── validators.ts Zod schemas, shared by API and forms
│   ├── resources.ts Registry driving all generic CRUD
│   └── scheduler/
│       ├── types.ts     Solver contract (no Mongoose here — it's pure)
│       ├── engine.ts    The constraint solver
│       └── index.ts     Loads Mongo → solver, and validates manual moves
├── app/
│   ├── page.tsx             Public board
│   ├── login/               Sign in
│   ├── dashboard/           Admin workbench
│   └── api/
│       ├── admin/[resource] Generic CRUD for 6 collections
│       ├── timetables/      Generate, publish, move sessions
│       └── public/          The only unauthenticated read
└── components/
    ├── ui/          Button, Field, Modal, Table, Toast, Badge
    ├── dashboard/   Sidebar, PageHeader, ResourceScreen
    └── timetable/   TimetableGrid, SplitFlap, BoardStrip
```

**Two abstractions do most of the work.** `lib/resources.ts` + the
`/api/admin/[resource]` route give every master-data collection a full CRUD API
from one registry entry. `ResourceScreen` turns a column/field config into a
complete admin screen — which is why `faculty/page.tsx` is 40 lines.

To add a collection: write the model, add a Zod schema, add one registry entry,
add one page config. Four small edits, no new API code.

---

## The Studio — how a timetable actually gets built

Generation gets you 90% of a week in a few seconds. The last 10% is judgement,
so the canvas is built for it.

**Drag anything, anywhere.** Sessions waiting to be placed sit in the left tray
with a count of how many are still owed. Drag one onto the sheet, or pick up a
session already placed and move it.

**The sheet answers before you drop.** The moment you lift a session, every cell
on the canvas is evaluated against the full constraint set and repainted: cells
that can take it stay clear, cells that cannot are drawn in engineering hatch.
Hover a blocked cell and it tells you exactly why — *"Anjali is teaching CSE201
then"*, *"Seats 30, section has 50 students"*, *"Would run through lunch"*. A
multi-period lab previews its whole span before it lands.

This is why the builder feels effortless: **an invalid arrangement is not
something you can create and then have to repair.** The Scheduling Rules are visible while
you are deciding, not enforced after the fact.

**Fill remaining.** Hand-place the awkward sessions, pin them, then let the
solver finish around them. Pinned sessions are immovable input.

**Undo and redo.** `⌘Z` / `⌘⇧Z`, fifty levels deep. Every change autosaves after
a brief pause, with a save indicator in the toolbar.

**Three lenses.** Read the same week by section, by faculty member, or by room —
the lens also drops whichever field is redundant from each block.

**Command palette.** `⌘K` jumps anywhere.

The client-side checker in `lib/scheduler/validate.ts` enforces exactly the same
hard Scheduling Rules as the server-side solver, and the layout endpoint revalidates on
save, so the instant feedback is never a lie.

---

## Design

Two surfaces, one language: **a drafting table**.

Application chrome is deep graphite — the frame of a professional tool, matching
what people expect from software they will live in for hours. The work surface
is a bone sheet with a faint drawing grid, floating on it. The public board uses
the same chrome bar, so the two halves read as one product.

Colour is scarce and always carries meaning: claret marks what you are acting
on, moss confirms, ochre warns. Session kinds are keyed by a 3px left rule —
lapis for lectures, moss for labs, ochre for tutorials — so the week can be read
by colour without a legend lookup.

The deliberate risk: **regions that cannot accept a session are drawn as
engineering hatch rather than alarm red.** Red would read as an error the admin
made; hatch reads as territory that is simply unavailable — which is the truth,
and much calmer to work inside when two-thirds of the sheet is blocked.

Type is Newsreader for headings (a text serif reads institutional without
tipping into magazine), Inter Tight for the interface, and JetBrains Mono for
every code, ID, room number and time — because those are data and should align
in a column.

Quality floor: responsive to 360px, visible keyboard focus, `prefers-reduced-
motion` respected, dnd-kit's keyboard sensor means the canvas is fully operable
without a mouse, semantic tables with `scope`, `aria-modal` dialogs, `role="alert"`
on errors.

---

## Libraries

| Package | Why |
|---|---|
| `@dnd-kit/core` | Drag and drop with real keyboard and screen-reader support |
| `framer-motion` | Layout and presence transitions |
| `cmdk` | The `⌘K` palette |
| `lucide-react` | Icon set |
| `sonner` | Toasts |
| `mongoose` `zod` `jose` `bcryptjs` | Data, validation, sessions, hashing |

---

## Security

- Passwords: bcrypt, cost 12, `select: false` so they never leave the DB by accident.
- Sessions: signed JWT (`jose`) in an httpOnly, sameSite=lax cookie, 8h expiry.
- `middleware.ts` guards `/dashboard/*` at the edge; every admin route *also*
  calls `requireAdmin()`, because middleware alone is not authorization.
- All writes validated with Zod server-side.
- Deletes are blocked when dependants exist, with a message naming the blocker.

---

## Not built yet

Deliberate Phase 2, in rough priority order:

1. **PDF / Excel export** per section, faculty and room.
2. **Faculty unavailability editor** (the model and constraint exist; there's no
   UI to set the blocked windows yet).
3. **Elective groups** — students split across parallel subjects in one period.
4. **Multi-role auth** — the `COORDINATOR` / `VIEWER` roles exist in the model
   but every route currently checks only for a valid session.
5. **Audit log** of who changed what.
