"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid, Users, BookMarked, DoorOpen, Layers, Clock,
  Network, CalendarRange, CalendarDays, SlidersHorizontal, Upload,
  LogOut, Menu, X, Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/hooks/useApi";

/** Ordered to match the real workflow: data → load → calendar → schedulingRules → build. */
const NAV = [
  {
    group: null,
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutGrid }],
  },
  {
    group: "Data",
    items: [
      { href: "/dashboard/faculty", label: "Faculty", icon: Users },
      { href: "/dashboard/subjects", label: "Subjects", icon: BookMarked },
      { href: "/dashboard/rooms", label: "Rooms", icon: DoorOpen },
      { href: "/dashboard/sections", label: "Sections", icon: Layers },
      { href: "/dashboard/slots", label: "Periods", icon: Clock },
      { href: "/dashboard/import", label: "Bulk import", icon: Upload },
    ],
  },
  {
    group: "Scheduling",
    items: [
      { href: "/dashboard/assignments", label: "Teaching Assignment", icon: Network },
      { href: "/dashboard/semester", label: "Semester", icon: CalendarDays },
      { href: "/dashboard/settings", label: "schedulingRules", icon: SlidersHorizontal },
    ],
  },
  {
    group: "Build",
    items: [
      { href: "/dashboard/timetables", label: "Timetables", icon: CalendarRange },
    ],
  },
];

export function Sidebar({
  user, onCommand,
}: { user: { name: string; email: string }; onCommand: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation"
        className="fixed left-3 top-3 z-50 rounded border border-line/70 bg-surface/10 p-2 lg:hidden"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open && <div className="fixed inset-0 z-30 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        "chrome fixed inset-y-0 left-0 z-40 flex w-[15rem] flex-col text-white transition-transform duration-200 ease-physical lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-4 pb-4 pt-4">
          <Link href="/" className="group flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-white/10 font-sans text-lg text-white">C</span>
            <span>
              <span className="block font-sans text-[1.02rem] tracking-[-0.02em] text-white">Campus Grid</span>
              <span className="block font-mono text-[0.55rem] uppercase tracking-[0.16em] text-white/35">Timetable OS</span>
            </span>
          </Link>
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={onCommand}
            className="flex w-full items-center gap-2 rounded-md border border-white/[.1] bg-black/10 px-2.5 py-2 text-left text-[0.8125rem] text-white/45 shadow-inset transition-all hover:border-white/20 hover:bg-white/[.07] hover:text-white/80"
          >
            <Command className="size-3.5" />
            <span className="flex-1">Search</span>
            <kbd className="rounded-xs border border-white/10 px-1 font-mono text-[0.6rem] text-white/35">⌘K</kbd>
          </button>
        </div>

        <nav className="dark-scroll flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((section, gi) => (
            <div key={gi} className="mb-4">
              {section.group && (
                <p className="px-2 pb-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-white/25">
                  {section.group}
                </p>
              )}
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const active = item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href} onClick={() => setOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded px-2 py-1.5 text-[0.8125rem] transition-colors duration-150",
                          active ? "bg-white/[.07] text-white" : "text-white/50 hover:bg-white/[.04] hover:text-white/85"
                        )}
                      >
                        {active && (
                                                  <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" />
                        )}
                        <Icon className={cn("size-[15px] shrink-0", active ? "text-white" : "text-white/40 group-hover:text-white/70")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[.07] px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-white/[.08] font-mono text-[0.65rem] text-white/70">
              {user.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] leading-tight text-white/85">{user.name}</p>
              <p className="truncate font-mono text-[0.62rem] text-white/30">{user.email}</p>
            </div>
            <button onClick={signOut} aria-label="Sign out"
              className="rounded p-1 text-white/30 transition-colors hover:bg-white/5 hover:text-white/80">
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
