import { requireUniversityAdmin, type SessionUser } from "@/lib/auth";

export async function getTenantAdmin(): Promise<{ session: SessionUser; universityId: string }> {
  const session = await requireUniversityAdmin();
  return { session, universityId: session.universityId! };
}

export function tenantFilter(universityId: string) {
  return { universityId };
}
