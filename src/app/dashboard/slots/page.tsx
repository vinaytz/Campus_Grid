"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { prettyTime } from "@/lib/utils";

export default function SlotsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "slots",
        eyebrow: "Master data",
        title: "Periods",
        singular: "Period",
        searchable: false,
        description:
          "The daily bell schedule. Order sets adjacency — a 2 or 3 period session must run across consecutive orders, and never across a break.",
        emptyHint: "Add periods like 09:00–09:50, then a lunch break, then the afternoon periods.",
        columns: [
          { header: "Order", cell: (r) => <span className="font-mono text-micro tnum">{r.order}</span> },
          { header: "Label", cell: (r) => <span className="font-medium">{r.label}</span> },
          {
            header: "Time",
            cell: (r) => (
              <span className="font-mono text-micro tnum">
                {prettyTime(r.start)} – {prettyTime(r.end)}
              </span>
            ),
          },
          { header: "Kind", cell: (r) => <Badge tone={r.kind === "BREAK" ? "ochre" : "lapis"}>{r.kind}</Badge> },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: [
          { name: "order", label: "Order", type: "number", required: true, hint: "0, 1, 2…" },
          { name: "label", label: "Label", required: true, placeholder: "Period 1" },
          { name: "start", label: "Starts", type: "time", required: true },
          { name: "end", label: "Ends", type: "time", required: true },
          {
            name: "kind", label: "Kind", type: "select", defaultValue: "CLASS", full: true,
            hint: "breaks are never scheduled",
            options: [
              { value: "CLASS", label: "Teaching period" },
              { value: "BREAK", label: "Break / lunch" },
            ],
          },
          { name: "active", label: "In use", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
