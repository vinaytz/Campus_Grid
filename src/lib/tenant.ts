import { requireUniversityAdmin, type SessionUser } from "@/lib/auth";
import Room from "@/models/Room";
import Faculty from "@/models/Faculty";
import Subject from "@/models/Subject";
import Section from "@/models/Section";
import Assignment from "@/models/Assignment";
import Semester from "@/models/Semester";
import Timetable from "@/models/Timetable";

export async function getTenantAdmin(): Promise<{ session: SessionUser; universityId: string }> {
  const session = await requireUniversityAdmin();
  return { session, universityId: session.universityId! };
}

export function tenantFilter(universityId: string) {
  return { universityId };
}

/**
 * Wipes a university's scheduling data so it can start over. Periods, scheduling
 * rules, the university itself and its admin logins are kept.
 */
export async function resetUniversityData(universityId: string) {
  const filter = tenantFilter(universityId);
  const [timetables, assignments, semesters, sections, subjects, faculty, rooms] = await Promise.all([
    Timetable.deleteMany(filter), Assignment.deleteMany(filter), Semester.deleteMany(filter),
    Section.deleteMany(filter), Subject.deleteMany(filter), Faculty.deleteMany(filter), Room.deleteMany(filter),
  ]);
  return {
    timetables: timetables.deletedCount, assignments: assignments.deletedCount,
    semesters: semesters.deletedCount, sections: sections.deletedCount,
    subjects: subjects.deletedCount, faculty: faculty.deletedCount, rooms: rooms.deletedCount,
  };
}
