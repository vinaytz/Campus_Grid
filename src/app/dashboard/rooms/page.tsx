"use client";
import { ResourceScreen } from "@/components/dashboard/ResourceScreen";
import { Badge } from "@/components/ui/Badge";
import { ROOM_TYPES } from "@/lib/constants";

export default function RoomsPage() {
  return (
    <ResourceScreen<any>
      config={{
        resource: "rooms",
        eyebrow: "Master data",
        title: "Rooms",
        singular: "Room",
        description:
          "Seating capacity is a hard constraint — a section is never placed in a room too small for it.",
        emptyHint: "Add rooms with their block and how many students can sit in each.",
        columns: [
          { header: "Room", cell: (r) => <span className="font-mono text-micro font-semibold">{r.block}-{r.code}</span> },
          { header: "Block", cell: (r) => r.block },
          {
            header: "Capacity",
            cell: (r) => <span className="font-mono text-micro tnum">{r.capacity} seats</span>,
          },
          { header: "Type", cell: (r) => <Badge tone={r.type === "LAB" ? "moss" : "lapis"}>{r.type}</Badge> },
          { header: "Status", cell: (r) => <Badge tone={r.active ? "moss" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge> },
        ],
        fields: [
          { name: "code", label: "Room number", required: true, placeholder: "301" },
          { name: "block", label: "Block", required: true, placeholder: "B" },
          { name: "capacity", label: "Seating capacity", type: "number", required: true, placeholder: "60", hint: "students" },
          {
            name: "type", label: "Room type", type: "select", defaultValue: "LECTURE",
            options: ROOM_TYPES.map((t) => ({ value: t, label: t.charAt(0) + t.slice(1).toLowerCase() })),
          },
          { name: "active", label: "Bookable", type: "toggle", defaultValue: true, full: true },
        ],
      }}
    />
  );
}
