import { connectAndRegister } from "@/lib/db";
import University from "@/models/University";
import Timetable from "@/models/Timetable";
import { ok, handleError } from "@/lib/api";

export const revalidate = 60;
export const dynamic = "force-dynamic";

function publicSlug(university: { slug?: string; code: string }) {
  return university.slug ?? university.code.toLowerCase();
}

export async function GET() {
  try {
    await connectAndRegister();
    const universities = await University.find({ active: true })
      .select("name code slug")
      .sort({ name: 1 })
      .lean();
    const publishedCounts = await Timetable.aggregate([
      { $match: { status: "PUBLISHED" } },
      { $group: { _id: "$universityId", count: { $sum: 1 } } },
    ]);
    const counts = new Map(publishedCounts.map((item) => [String(item._id), item.count]));
    return ok(universities.map((university) => ({
      name: university.name,
      code: university.code,
      slug: publicSlug(university),
      publishedSemesters: counts.get(String(university._id)) ?? 0,
    })));
  } catch (error) {
    return handleError(error);
  }
}
