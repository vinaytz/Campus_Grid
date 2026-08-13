"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";

export default function SectionsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "sections",
        eyebrow: "Master data",
        title: "Sections",
        singular: "Section",
        description:
          "Student strength decides which rooms a section can be placed in. Keep it current.",
        emptyHint: "Add sections with their number and how many students are in each, e.g. 2403 / 58.",
        lookups: { rooms: "/api/admin/rooms" },
        columns: [
          { header: "Section", cell: (r) => <span className="font-mono text-micro font-semibold">{r.number}</span> },
          { header: "Program", cell: (r) => <span className="font-medium">{r.program}</span> },
          { header: "Semester", cell: (r) => <span className="font-mono text-micro tnum">{r.semester}</span> },
          { header: "Strength", cell: (r) => <span className="font-mono text-micro tnum">{r.strength}</span> },
          {
            header: "Home room",
            cell: (r) => (
              <span className="font-mono text-micro text-muted">
                {r.homeRoom ? `${r.homeRoom.block}-${r.homeRoom.code}` : "—"}
              </span>
            ),
          },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: (lk) => [
          { name: "number", label: "Section number", required: true, placeholder: "2403" },
          { name: "program", label: "Program", required: true, placeholder: "B.Tech CSE" },
          { name: "semester", label: "Semester", type: "number", required: true, placeholder: "4" },
          { name: "strength", label: "Students in section", type: "number", required: true, placeholder: "58" },
          {
            name: "homeRoom", label: "Preferred home room", type: "select",
            placeholder: "No preference", full: true,
            hint: "used for lectures where possible",
            options: (lk.rooms ?? []).map((r: any) => ({
              value: r._id, label: `${r.block}-${r.code} · ${r.capacity} seats`,
            })),
          },
          { name: "active", label: "Running this term", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
