"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { SUBJECT_TYPES } from "@/lib/constants";

export default function SubjectsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "subjects",
        eyebrow: "Master data",
        title: "Subjects",
        singular: "Subject",
        description:
          "The catalogue of courses. Type and default length seed a new teaching assignment, which can then override them.",
        emptyHint: "Add the courses being taught this term, with their codes.",
        columns: [
          { header: "Code", cell: (r) => <span className="font-mono text-micro font-semibold">{r.code}</span> },
          { header: "Name", cell: (r) => r.name },
          { header: "Department", cell: (r) => <span className="text-muted">{r.department}</span> },
          {
            header: "Type",
            cell: (r) => <Badge tone={r.type === "LAB" ? "moss" : r.type === "TUTORIAL" ? "ochre" : "lapis"}>{r.type ?? "THEORY"}</Badge>,
          },
          {
            header: "Length",
            cell: (r) => <span className="font-mono text-micro tnum">{r.defaultDuration ?? 1}p</span>,
          },
          { header: "Credits", cell: (r) => <span className="font-mono text-micro tnum">{r.credits}</span> },
        ],
        fields: [
          { name: "code", label: "Subject code", required: true, placeholder: "ECE281" },
          { name: "name", label: "Subject name", required: true, placeholder: "Introduction to IoT" },
          { name: "department", label: "Department", required: true, placeholder: "Electronics" },
          {
            name: "type", label: "Type", type: "select", defaultValue: "THEORY",
            options: SUBJECT_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })),
          },
          {
            name: "defaultDuration", label: "Default session length", type: "select", defaultValue: 1,
            hint: "assignments may override",
            options: [
              { value: "1", label: "1 period" },
              { value: "2", label: "2 periods" },
              { value: "3", label: "3 periods" },
            ],
          },
          { name: "credits", label: "Credits", type: "number", defaultValue: 3 },
          { name: "active", label: "Offered this term", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
