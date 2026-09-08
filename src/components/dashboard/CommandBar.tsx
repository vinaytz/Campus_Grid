"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
// framer-motion removed per motion policy; interactions are user-driven
import {
  Users, BookMarked, DoorOpen, Layers, Clock, Network,
  CalendarRange, SlidersHorizontal, LayoutGrid, Globe,
} from "lucide-react";

const ROUTES = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid, group: "Go to" },
  { label: "Timetables", href: "/dashboard/timetables", icon: CalendarRange, group: "Go to" },
  { label: "Teaching Assignment", href: "/dashboard/assignments", icon: Network, group: "Go to" },
  { label: "Faculty", href: "/dashboard/faculty", icon: Users, group: "Data" },
  { label: "Subjects", href: "/dashboard/subjects", icon: BookMarked, group: "Data" },
  { label: "Rooms", href: "/dashboard/rooms", icon: DoorOpen, group: "Data" },
  { label: "Sections", href: "/dashboard/sections", icon: Layers, group: "Data" },
  { label: "Periods", href: "/dashboard/slots", icon: Clock, group: "Data" },
  { label: "Scheduling schedulingRules", href: "/dashboard/settings", icon: SlidersHorizontal, group: "Data" },
  { label: "Public board", href: "/", icon: Globe, group: "Elsewhere" },
];

export function CommandBar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const groups = [...new Set(ROUTES.map((r) => r.group))];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-lg bg-surface shadow-lift">
            <Command label="Command palette" loop>
                <div className="border-b border-rule px-3">
                  <Command.Input
                    autoFocus placeholder="Search screens and actions…"
                    className="h-12 w-full bg-transparent text-[0.9rem] outline-none placeholder:text-muted/60"
                  />
                </div>
                <Command.List className="thin-scroll max-h-72 overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-8 text-center text-[0.8125rem] text-muted">
                    Nothing matches that.
                  </Command.Empty>
                  {groups.map((g) => (
                    <Command.Group key={g} heading={g}
                      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
                      {ROUTES.filter((r) => r.group === g).map((r) => {
                        const Icon = r.icon;
                        return (
                          <Command.Item
                            key={r.href} value={r.label}
                            onSelect={() => { router.push(r.href); setOpen(false); }}
                            className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-[0.8125rem] text-ink data-[selected=true]:bg-ink/[.055]"
                          >
                            <Icon className="size-4 text-muted" />
                            {r.label}
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}
                </Command.List>
              </Command>
          </div>
        </div>
      )}
    </>
  );
}
