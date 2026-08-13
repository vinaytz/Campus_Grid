"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";

export default function SubjectsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "subjects",
        eyebrow: "Master data",
        title: "Subjects",
        singular: "Subject",
        description: "Course codes and titles as they should appear on the board.",
        emptyHint: "Add courses with their codes, e.g. Introduction to IoT / ECE281.",
        columns: [
          { header: "Code", cell: (r) => <span className="font-mono text-micro font-semibold">{r.code}</span> },
          { header: "Title", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Department", cell: (r) => r.department },
          { header: "Credits", cell: (r) => <span className="font-mono text-micro tnum">{r.credits}</span> },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: [
          { name: "code", label: "Subject code", required: true, placeholder: "ECE281" },
          { name: "name", label: "Subject title", required: true, placeholder: "Introduction to IoT", full: true },
          { name: "department", label: "Department", required: true, placeholder: "Electronics" },
          { name: "credits", label: "Credits", type: "number", defaultValue: 3 },
          { name: "active", label: "Offered this term", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
