"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { ROOM_TYPES } from "@/lib/constants";

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
          "Who teaches what, to whom, and how often. This is what the generator turns into sessions.",
        emptyHint:
          "Map a faculty member to a subject for a section — for example, Praveen Malik teaches ECE281 to section 2403, three times a week.",
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
          { header: "Kind", cell: (r) => <Badge tone={r.kind === "LAB" ? "moss" : "lapis"}>{r.kind}</Badge> },
          {
            header: "Per week",
            cell: (r) => (
              <span className="font-mono text-micro tnum">
                {r.sessionsPerWeek} × {r.duration}h
              </span>
            ),
          },
          {
            header: "Room",
            cell: (r) => (
              <span className="font-mono text-micro text-muted">
                {r.fixedRoom ? `${r.fixedRoom.block}-${r.fixedRoom.code}` : r.requiredRoomType ?? "Any"}
              </span>
            ),
          },
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
            name: "sessionsPerWeek", label: "Sessions per week", type: "number", defaultValue: 3,
            hint: "how many times it meets",
          },
          {
            name: "requiredRoomType", label: "Required room type", type: "select",
            placeholder: "Match the session kind",
            options: ROOM_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })),
          },
          {
            name: "fixedRoom", label: "Pin to a specific room", type: "select",
            placeholder: "Let the scheduler choose", full: true,
            hint: "for hardware labs and similar",
            options: (lk.rooms ?? []).map((r: any) => ({
              value: r._id, label: `${r.block}-${r.code} · ${r.capacity} seats · ${r.type}`,
            })),
          },
          { name: "active", label: "Include when generating", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
