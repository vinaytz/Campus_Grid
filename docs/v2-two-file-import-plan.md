# Two-file import (Infra + Load) for Campus Grid

## Context
Today an admin fills master data through 5 separate CSV imports (rooms, faculty, subjects, sections, teaching assignments). The client wants to upload just **two files**:
- an **Infra** file (rooms)
- a **Load** file (who teaches what to whom)

Everything else should be created automatically. They also want **email** (faculty) and **credits** (subjects) removed, since they don't help build a timetable.

What's already settled:
- The client's files are nearly enough. The Load file is missing **one column**, Total Sessions.
- The files are `.xlsx`, so upload must accept both Excel and CSV.
- The client's **Group** column (splitting a section into groups for a subject) is the only part that touches the scheduler.

Scheduler, Studio, publish checks and data model otherwise stay as they are.

---

## LOCKED FILE FORMATS

### File 1 — Infra (the client's file as-is, no changes)
| Column | Required | Values | Maps to |
|---|---|---|---|
| School | no | text | ignored |
| Block | yes | e.g. `36` | Room.block |
| Room | yes | e.g. `301` | Room.code |
| Strength (also accepts the typo `Strenght`) | yes | number | Room.capacity |
| Type | yes | `Class room` / `Classroom` / `Lab` / `Seminar` / `Auditorium` | Room.type |
| BYOD | no | `Yes` / `No` (blank = No) | Room.capabilities = `["BYOD"]` |

One row per room. Re-uploading updates rooms, matched by Block + Room.

### File 2 — Load (the client's file + ONE new column)
| Column | Required | Values | Maps to |
|---|---|---|---|
| Name of faculty | yes | text | Faculty.name |
| Faculty UID | yes | e.g. `23314` | Faculty.facultyId |
| Subject Name | yes | text | Subject.name |
| Subject Code | yes | e.g. `ECE181` | Subject.code |
| Section | yes | e.g. `2401` | Section.number |
| Strength (also `Strenght`) | yes | **students per group** | Section / group strength |
| Type | yes | `Class` / `Lab` / `Tutorial` | Assignment.kind (LECTURE/LAB/TUTORIAL); Subject.type (THEORY/LAB/TUTORIAL) |
| BYOD | no | `Yes` / `No` | Assignment.requiredCapabilities `["BYOD"]` |
| No of Hrs/Duration | yes | `1`, `2` or `3` (periods per class) | Assignment.duration, Subject.defaultDuration |
| Group | no | `1`, `2`, … (blank = 1) | how many groups the section splits into for this row |
| **Total Sessions** ← NEW | yes | 1–200 | Assignment.requiredSessions, **per group** |

Rules shown to the client:
- **One row per section + subject + type.**
- Group 1 = the whole section attends, and Strength = the section's size.
- Group N > 1 = the section splits into N groups of `Strength` students each. Each group gets `Total Sessions` classes.
- If a section never appears with Group 1, its full size is Strength × Group.
- The same Faculty UID must always have the same name, and the same Subject Code the same name. A section's Group 1 strength must match across rows. Conflicts are reported in the preview.

### Not in either file (set once in the dashboard, unchanged)
Time slots/periods, semester calendar, scheduling settings. Faculty daily/weekly hour caps use today's defaults (5/day, 18/week) and can be edited on the Faculty page.

---

## Implementation

### A. Remove email & credits; make unused fields optional
- `src/models/Faculty.ts`, `src/models/Subject.ts`: remove `email` and `credits`. Old documents keep the values harmlessly, because Mongoose ignores fields that aren't in the schema.
- `src/lib/validators.ts`:
  - drop `email` from `facultySchema` and `credits` from `subjectSchema`
  - `subjectSchema.department` → optional, default `""`
  - `sectionSchema.program` → optional, default `""`
  - `sectionSchema.semester` → optional
  - add optional `parentSection` (objectId) and `group` (int) to `sectionSchema`
- `src/models/Section.ts`: `program`/`semester` not required; add `parentSection` (ref Section, optional) and `group` (Number, optional).
- `src/models/Subject.ts`: `department` not required.
- Pages:
  - `src/app/dashboard/faculty/page.tsx`: remove the email field; department no longer required
  - `src/app/dashboard/subjects/page.tsx`: remove the credits column and field; department optional
  - `src/app/dashboard/sections/page.tsx`: program and semester optional; show "Group N of 2404" for group sections
- Labels that join with `·` must skip blank parts: `src/components/public/PublicUniversity.tsx:36-38`, `src/app/dashboard/assignments/page.tsx:80`.
- `scripts/seed-university.ts`: drop `credits`.

### B. Excel + CSV reading
- Add dependency **`read-excel-file`**. It's small and reads `.xlsx` from a Buffer via `read-excel-file/node`; confirm the API at install time.
- `src/lib/csv.ts`: split `parseRows(text, aliases)` into `parseTable(table: string[][], aliases)` and keep `parseRows` as a thin wrapper. The CSV and Excel paths then share header aliasing.
- New helper `readSpreadsheet(file: File): Promise<string[][]>` in `src/lib/import-request.ts`. It picks Excel or CSV by extension or MIME type, turns every cell into a string, and trims.
- `src/app/api/import/route.ts` POST: use `readSpreadsheet` instead of `file.text()`; raise the error text to ".csv or .xlsx".

### C. The two import kinds (replace the 5 old ones)
In `src/lib/import.ts`:
- **`infra`**: reuse `SPECS.rooms` (`roomSchema`, `keyOf`, bulk upsert in `commitImport`).
  - Add aliases: `strenght`→capacity, `byod`, `school` (ignored).
  - Add a `prepare(row)` step: normalise Type text (`class room`/`classroom`/`class`→CLASSROOM, `lab`→LAB, …) and turn BYOD yes into `capabilities: "BYOD"`.
- **`load`**: new `buildLoad(rows)`, a pure function that is easy to unit-test. It returns `{ faculty[], subjects[], sections[], groups[], assignments[], issues[] }`:
  - collects distinct faculty by UID, subjects by code and sections by number
  - flags name/strength conflicts
  - for Group > 1, creates group sections `2404-G1…GN` with `parentSection` = 2404 and strength = row strength; the parent's strength comes from a Group 1 row, or row strength × N
  - assignments point at section/subject/faculty by natural key (number/code/UID), not ObjectId, so preview works before anything exists in the database
  - validates each piece with the existing `facultySchema`, `subjectSchema` and `sectionSchema`, plus assignment field checks (kind, duration 1–3, requiredSessions 1–200)
- **Preview** returns the flattened Load rows plus counts ("9 faculty, 9 subjects, 11 sections incl. 4 groups, 11 assignments") and issues.
- **Commit** re-runs `buildLoad` on the rows server-side, never trusting the client, then upserts in order with the existing `bulkWrite` upsert pattern: faculty → subjects → parent sections → group sections (after resolving parent ids) → assignments (after resolving ids by natural key; key is section + subject + kind, matching the unique index).
  - Upserts make re-uploading the same file safe.
  - There's no cross-collection transaction, because standalone Mongo has no replica set. A failure mid-way can be fixed by re-uploading.
- Remove the old `rooms/faculty/subjects/sections/assignments` import kinds from `SPECS` exposure, the route's `RESOURCES`, and `importCommitSchema` (enum → `["infra","load"]`).
- `templateFor("infra"|"load")` returns the locked headers + 2 sample rows.
- `src/app/dashboard/import/page.tsx`:
  - resource picker shows only **Infra file** and **Load file**
  - `accept=".csv,.xlsx"`
  - update the hint text and the preview description for Load (counts per record type)

### D. Groups in the scheduler (only scheduler change)
Idea: a section is a set of **student cohorts**, and two classes clash only if their cohort sets overlap.
- Group section `2404-G1` → `{2404-G1}`
- Section 2404 that has groups → `{2404-G1, 2404-G2}`
- Section with no groups → `{itself}`

Room capacity already uses the group's own strength, since each group is a real Section. So rooms need no change.

1. `src/lib/scheduler/types.ts`: `SectionRef.parentId?: string`.
2. New `src/lib/scheduler/cohorts.ts`, pure and client-safe:
   - `buildCohorts(sections: {id, parentId?}[]): Map<string, string[]>`
   - `cohortsOf(map, sectionId)` (falls back to `[sectionId]`)
3. `src/lib/scheduler/index.ts` `loadUniverse`: map `parentSection` → `parentId`.
4. Replace the single section key with a loop over cohorts at each section-occupancy spot. Per-day section load is also counted per cohort, and the cap is checked against the busiest one.
   - `engine.ts`: `Ledger.occupy/release/free/freeWithin` and `sectionDayLoad` (ledger built with the cohort map)
   - `expand.ts`: `DatedLedger.add/isFree/sectionLoad/freeWithin/gapCount`
   - `audit.ts`: `claims.section` and `secDayPeriods` (clash message names the cohort's section number)
   - `moves.ts`: `validateMove` (the `other.sectionId === req.sectionId` check and `sectionPeriods`) and `validatePattern` (`claimed.section`, `sectionDay`)
   - `validate.ts`: the `Occupancy` constructor takes an optional cohort map, and `dropMap` gets an optional `cohorts` param. `src/components/studio/Studio.tsx` builds it from the assignments' populated sections (populate `parentSection` wherever those assignments are loaded).
   - `score.ts` is soft-only and stays unchanged.
5. Views: filtering by a section shows every class whose cohorts overlap it. A group sees its parent's lectures plus its own labs; the parent sees everything.
   - `src/app/api/public/route.ts:99-102` (populate `parentSection` on section refs)
   - `src/components/timetable/SemesterView.tsx:213-215`
   - the `visible` filter in `Studio.tsx`
   - the public directory lists groups as "2404 · Group 1"

---

## Verification
1. `npx tsc --noEmit` and `npx vitest run`. All 147 existing tests must still pass, since sections without groups behave exactly as before.
2. New tests:
   - `tests/load-import.test.ts`: `buildLoad` on the client's 9 sample rows plus a Total Sessions column; group expansion (2404 → 2404-G1/G2, parent strength 72); conflicting UID name → issue; `Strenght` header accepted; Type/BYOD normalisation
   - `tests/hard-constraints.test.ts`: a section with 2 groups. Its lecture never overlaps either group's lab; G1 and G2 labs with different faculty *may* overlap; `auditTimetable` flags a lecture/group-lab overlap as SECTION_CLASH
   - Excel reading: a small `.xlsx` fixture parses to the same table as its CSV twin
3. End to end:
   - `npm run dev`, sign in as a university admin
   - upload `clientCSV/Infra (2).xlsx` as-is, then a copy of `Load (1).xlsx` with **Total Sessions** added (made in the scratchpad)
   - check the preview counts, then commit
   - create periods and a semester, then generate
   - confirm in Studio/SemesterView that no group lab overlaps its section's lectures
   - publish, then open `/u/<slug>` and check the "2404 · Group 1" view shows the lectures plus only G1's labs
