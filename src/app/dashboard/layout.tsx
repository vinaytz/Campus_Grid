"use client";
import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { CommandBar } from "@/components/dashboard/CommandBar";
import { useResource } from "@/hooks/useApi";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [cmd, setCmd] = useState(false);
  const { data: user } = useResource<{ name: string; email: string } | null>("/api/auth/me");

  return (
    <div className="min-h-dvh bg-ground">
      <Sidebar
        user={user ?? { name: "Administrator", email: "" }}
        onCommand={() => setCmd(true)}
      />
      <CommandBar open={cmd} setOpen={setCmd} />
      <main className="lg:pl-[13.5rem]">
        <div className="mx-auto max-w-[92rem] px-4 pb-16 pt-14 sm:px-6 lg:pt-6">{children}</div>
      </main>
    </div>
  );
}
