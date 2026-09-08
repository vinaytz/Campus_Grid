import PublicUniversity from "@/components/public/PublicUniversity";

export default async function UniversityPublicPage({ params }: { params: Promise<{ universitySlug: string }> }) {
  const { universitySlug } = await params;
  return <PublicUniversity slug={decodeURIComponent(universitySlug)} />;
}
