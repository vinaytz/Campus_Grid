"use client";
import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { CommandBar } from "@/components/dashboard/CommandBar";
import { useResource } from "@/hooks/useApi";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [cmd, setCmd] = useState(false);
  const router = useRouter();
  const { data: user } = useResource<{ name: string; email: string } | null>("/api/auth/me");
  useEffect(() => {
    if ((user as { role?: string } | null)?.role === "PLATFORM_ADMIN") {
      router.replace("/adminDashboard");
    }
  }, [router, user]);

  return (
    <div className="min-h-dvh bg-ground">
      <Sidebar
        user={user ?? { name: "Administrator", email: "" }}
        onCommand={() => setCmd(true)}
      />
      <CommandBar open={cmd} setOpen={setCmd} />
      <main className="lg:pl-[15rem]">
        <div className="mx-auto max-w-[96rem] px-4 pb-16 pt-14 sm:px-8 lg:pt-8">{children}</div>
      </main>
    </div>
  );
}
