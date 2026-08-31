import { redirect } from "next/navigation";
import { AnalyticsWorkspace } from "@/components/analytics-workspace";
import { getOfferingAnalyticsData, getSectionAnalyticsData } from "@/lib/data/analytics";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

type AnalyticsPageProps = { searchParams: Promise<{ scope?: string; period?: string }> };

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, section, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  if (!section) redirect("/");
  const offeringSections = sections.filter((candidate) => candidate.offeringId === section.offeringId);
  const canShowAllSections = offeringSections.length > 1;
  const useAllSections = params.scope === "all" && canShowAllSections;
  const courseName = displayCourseName(section.courseName, section.courseCode);

  if (useAllSections) {
    const analytics = await getOfferingAnalyticsData(offeringSections, params.period);
    return <AnalyticsWorkspace
      scope="all"
      courseName={courseName}
      schoolYear={section.schoolYearLabel}
      sectionName={section.sectionName}
      sections={sections}
      offeringSections={offeringSections}
      activeSectionId={section.sectionId}
      analytics={analytics}
    />;
  }

  const analytics = await getSectionAnalyticsData(section.sectionId, params.period);
  return <AnalyticsWorkspace
    scope="section"
    courseName={courseName}
    schoolYear={section.schoolYearLabel}
    sectionName={section.sectionName}
    sections={sections}
    offeringSections={offeringSections}
    activeSectionId={section.sectionId}
    analytics={analytics}
  />;
}
