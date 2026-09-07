"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { ROOM_TYPES, ROOM_CAPABILITIES } from "@/lib/constants";

/**
 * The teaching-load screen. This is the most important domain object in the
 * system: faculty + subject + section + exact session count + room rules.
 *
 * `requiredSessions` is the number that matters — it is the exact total the
 * published semester timetable must contain. "Sessions per week" is only a hint
 * for shaping the recurring pattern and can never override it.
 */
export default function AssignmentsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "assignments",
        eyebrow: "Scheduling",
        title: "Teaching load",
        singular: "Assignment",
        searchable: false,
        description:
          "Who teaches what, to whom, and exactly how many times this semester. This is what the generator turns into dated sessions.",
        emptyHint:
          "Map a faculty member to a subject for a section — for example, Praveen Malik teaches ECE281 to section 2403, 40 sessions this semester.",
        lookups: {
          sections: "/api/admin/sections",
          subjects: "/api/admin/subjects",
          faculty: "/api/admin/faculty",
          rooms: "/api/admin/rooms",
        },
        columns: [
          { header: "Section", cell: (r) => <span className="font-mono text-micro font-semibold">{r.section?.number}</span> },
          {
            header: "Subject",
            cell: (r) => (
              <span>
                <span className="font-mono text-micro font-semibold">{r.subject?.code}</span>
                <span className="ml-2 text-muted">{r.subject?.name}</span>
              </span>
            ),
          },
          { header: "Faculty", cell: (r) => r.faculty?.name },
          { header: "Kind", cell: (r) => <Badge tone={r.kind === "LAB" ? "moss" : r.kind === "TUTORIAL" ? "ochre" : "lapis"}>{r.kind}</Badge> },
          {
            header: "Sessions",
            cell: (r) => (
              <span className="font-mono text-micro tnum">
                <span className="font-semibold">{r.requiredSessions}</span>
                <span className="text-muted"> × {r.duration}p</span>
                {r.targetWeeklyFrequency ? <span className="ml-1.5 text-muted">(~{r.targetWeeklyFrequency}/wk)</span> : null}
              </span>
            ),
          },
          {
            header: "Room",
            cell: (r) => {
              const mode = r.roomSelection ?? "AUTO";
              const detail =
                mode === "FIXED"
                  ? r.fixedRoom ? `${r.fixedRoom.block}-${r.fixedRoom.code}` : "—"
                  : mode === "ALLOWED_ROOMS"
                  ? `${r.allowedRooms?.length ?? 0} allowed`
                  : r.requiredRoomType ?? "Any";
              return (
                <span className="font-mono text-micro text-muted">
                  {detail}
                  {r.requiredCapabilities?.length ? ` · ${r.requiredCapabilities.join("+")}` : ""}
                </span>
              );
            },
          },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: (lk) => [
          {
            name: "section", label: "Section", type: "select", required: true,
            options: (lk.sections ?? []).map((s: any) => ({
              value: s._id, label: `${s.number} · ${s.program} · ${s.strength} students`,
            })),
          },
          {
            name: "subject", label: "Subject", type: "select", required: true,
            options: (lk.subjects ?? []).map((s: any) => ({ value: s._id, label: `${s.code} — ${s.name}` })),
          },
          {
            name: "faculty", label: "Faculty", type: "select", required: true, full: true,
            options: (lk.faculty ?? []).map((f: any) => ({ value: f._id, label: `${f.name} (${f.facultyId})` })),
          },
          {
            name: "kind", label: "Session kind", type: "select", defaultValue: "LECTURE",
            options: [
              { value: "LECTURE", label: "Lecture" },
              { value: "LAB", label: "Lab" },
              { value: "TUTORIAL", label: "Tutorial" },
            ],
          },
          {
            name: "duration", label: "Length of one session", type: "select", defaultValue: 1,
            options: [
              { value: "1", label: "1 period" },
              { value: "2", label: "2 periods (back to back)" },
              { value: "3", label: "3 periods (back to back)" },
            ],
          },
          {
            name: "requiredSessions", label: "Sessions this semester", type: "number",
            defaultValue: 40, required: true,
            hint: "exact total — not per week",
          },
          {
            name: "targetWeeklyFrequency", label: "Roughly per week", type: "number",
            placeholder: "leave blank to derive",
            hint: "a hint only; never overrides the total",
          },
          {
            name: "roomSelection", label: "How to choose a room", type: "select",
            defaultValue: "AUTO", full: true,
            options: [
              { value: "AUTO", label: "Automatic — any compatible free room" },
              { value: "FIXED", label: "Fixed — always this one room" },
              { value: "ALLOWED_ROOMS", label: "Restricted — only from a list" },
            ],
          },
          {
            name: "fixedRoom", label: "Pinned room", type: "select",
            placeholder: "Choose the room", full: true,
            showIf: (v) => v.roomSelection === "FIXED",
            options: (lk.rooms ?? []).map((r: any) => ({
              value: r._id, label: `${r.block}-${r.code} · ${r.capacity} seats · ${r.type}`,
            })),
          },
          {
            name: "allowedRooms", label: "Permitted rooms", type: "multiselect", full: true,
            placeholder: "Add rooms on the Rooms screen first.",
            showIf: (v) => v.roomSelection === "ALLOWED_ROOMS",
            defaultValue: [],
            options: (lk.rooms ?? []).map((r: any) => ({
              value: r._id, label: `${r.block}-${r.code} · ${r.capacity} seats · ${r.type}`,
            })),
          },
          {
            name: "requiredRoomType", label: "Required room type", type: "select",
            placeholder: "Match the session kind",
            options: ROOM_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })),
          },
          {
            name: "requiredCapabilities", label: "Required capabilities", type: "tags",
            suggestions: ROOM_CAPABILITIES, defaultValue: [],
            hint: "the room must have all of these",
            placeholder: "e.g. BYOD",
          },
          { name: "active", label: "Include when generating", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
