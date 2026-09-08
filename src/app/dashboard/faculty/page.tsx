"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";

export default function FacultyPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "faculty",
        eyebrow: "Master data",
        title: "Faculty",
        singular: "Faculty member",
        description:
          "Everyone who can be assigned a class, with the ID printed on the published timetable.",
        emptyHint: "Add teaching staff with their employee ID, e.g. Praveen Malik / 23314.",
        columns: [
          { header: "ID", cell: (r) => <span className="font-mono text-micro">{r.facultyId}</span> },
          { header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Department", cell: (r) => r.department },
          { header: "Designation", cell: (r) => <span className="text-muted">{r.designation || "—"}</span> },
          {
            header: "Load cap",
            cell: (r) => (
              <span className="font-mono text-micro tnum text-muted">
                {r.maxHoursPerDay}/day · {r.maxHoursPerWeek}/wk
              </span>
            ),
          },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        lookups: { slots: "/api/admin/slots" },
        fields: (lookups) => [
          { name: "facultyId", label: "Faculty ID", required: true, placeholder: "23314" },
          { name: "name", label: "Full name", required: true, placeholder: "Praveen Malik" },
          { name: "email", label: "Email", type: "email", placeholder: "praveen@school.edu" },
          { name: "department", label: "Department", required: true, placeholder: "Electronics" },
          { name: "designation", label: "Designation", placeholder: "Assistant Professor" },
          { name: "maxHoursPerDay", label: "Max periods per day", type: "number", defaultValue: 5 },
          { name: "maxHoursPerWeek", label: "Max periods per week", type: "number", defaultValue: 18 },
          {
            name: "unavailability", label: "Blocked periods", type: "multiselect",
            options: (lookups.slots ?? []).map((slot: any) => ({
              value: String(slot.order), label: `${slot.label} (${slot.start}-${slot.end})`,
            })),
          },
          { name: "active", label: "Available for scheduling", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
