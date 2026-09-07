"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { ROOM_TYPES, ROOM_CAPABILITIES } from "@/lib/constants";

export default function RoomsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "rooms",
        eyebrow: "Master data",
        title: "Rooms",
        singular: "Room",
        description:
          "Capacity, type and capability tags are all hard constraints — a class is only ever placed in a room that satisfies every one of them.",
        emptyHint: "Add rooms with their block, seating capacity and what each one is equipped with.",
        columns: [
          { header: "Room", cell: (r) => <span className="font-mono text-micro font-semibold">{r.block}-{r.code}</span> },
          {
            header: "Capacity",
            cell: (r) => <span className="font-mono text-micro tnum">{r.capacity} seats</span>,
          },
          { header: "Type", cell: (r) => <Badge tone={r.type === "LAB" ? "moss" : "lapis"}>{r.type}</Badge> },
          {
            header: "Capabilities",
            cell: (r) => (r.capabilities?.length ? (
              <span className="flex flex-wrap gap-1">
                {r.capabilities.map((c: string) => (
                  <span key={c} className="rounded-xs bg-ink/[.06] px-1.5 py-0.5 font-mono text-[0.62rem]">{c}</span>
                ))}
              </span>
            ) : <span className="text-micro text-muted">—</span>),
          },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: [
          { name: "code", label: "Room number", required: true, placeholder: "301" },
          { name: "block", label: "Block", required: true, placeholder: "B" },
          { name: "capacity", label: "Seating capacity", type: "number", required: true, placeholder: "60", hint: "students" },
          {
            name: "type", label: "Room type", type: "select", defaultValue: "CLASSROOM",
            options: ROOM_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })),
          },
          {
            name: "capabilities", label: "Capabilities", type: "tags", full: true,
            suggestions: ROOM_CAPABILITIES,
            hint: "what this room is equipped with",
            placeholder: "e.g. BYOD — type and press Enter",
            defaultValue: [],
          },
          { name: "active", label: "Bookable", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
