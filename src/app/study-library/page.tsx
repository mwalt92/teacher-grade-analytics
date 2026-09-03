import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ExternalLink, Eye, EyeOff, Star } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import styles from "./study-library.module.css";

const resourceTypeLabels: Record<string, string> = {
  skill_practice: "Skill practice",
  notes: "Notes",
  practice: "Practice",
  solutions: "Solutions",
  worksheet: "Worksheet",
  video: "Video",
  reference: "Reference",
  other: "Other",
};

export default async function StudyLibraryPage() {
  const [sections, activeSection] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!sections.length || !activeSection) redirect("/");

  const supabase = await createClient();
  const [{ data: assignmentsData }, { data: guidesData }, { data: skillsData }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id,title,assignment_date,assignment_type,allow_retakes,study_guide_id,archived")
      .eq("section_id", activeSection.sectionId)
      .eq("archived", false)
      .order("assignment_date", { ascending: false })
      .order("title"),
    supabase
      .from("study_guides")
      .select("id,title,description,student_visible,updated_at")
      .eq("offering_id", activeSection.offeringId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("study_skills")
      .select("id,code,title,description,active")
      .eq("course_id", activeSection.courseId)
      .eq("active", true)
      .order("code")
      .order("title"),
  ]);

  const assignments = (assignmentsData ?? []).filter((assignment) => assignment.allow_retakes || assignment.study_guide_id);
  const guides = guidesData ?? [];
  const skills = skillsData ?? [];
  const guideIds = guides.map((guide) => guide.id);
  const skillIds = skills.map((skill) => skill.id);

  const [{ data: guideSkillRows }, { data: guideResourceRows }, { data: resourceSkillRows }] = await Promise.all([
    guideIds.length
      ? supabase.from("study_guide_skills").select("guide_id,skill_id").in("guide_id", guideIds)
      : Promise.resolve({ data: [] as { guide_id: string; skill_id: string }[] }),
    guideIds.length
      ? supabase.from("study_guide_resources").select("guide_id,resource_id,featured").in("guide_id", guideIds)
      : Promise.resolve({ data: [] as { guide_id: string; resource_id: string; featured: boolean }[] }),
    skillIds.length
      ? supabase.from("study_resource_skills").select("resource_id,skill_id").in("skill_id", skillIds)
      : Promise.resolve({ data: [] as { resource_id: string; skill_id: string }[] }),
  ]);

  const resourceIds = [...new Set([
    ...(guideResourceRows ?? []).map((row) => row.resource_id),
    ...(resourceSkillRows ?? []).map((row) => row.resource_id),
  ])];

  const { data: resourcesData } = resourceIds.length
    ? await supabase
        .from("study_resources")
        .select("id,provider_id,title,description,url,external_code,resource_type,active")
        .in("id", resourceIds)
        .eq("active", true)
        .order("title")
    : { data: [] as { id: string; provider_id: string; title: string; description: string | null; url: string | null; external_code: string | null; resource_type: string; active: boolean }[] };
  const resources = resourcesData ?? [];
  const providerIds = [...new Set(resources.map((resource) => resource.provider_id))];
  const { data: providersData } = providerIds.length
    ? await supabase.from("resource_providers").select("id,name").in("id", providerIds)
    : { data: [] as { id: string; name: string }[] };

  const providerById = new Map((providersData ?? []).map((provider) => [provider.id, provider.name]));
  const guideById = new Map(guides.map((guide) => [guide.id, guide]));
  const skillCountByGuide = new Map<string, number>();
  for (const row of guideSkillRows ?? []) skillCountByGuide.set(row.guide_id, (skillCountByGuide.get(row.guide_id) ?? 0) + 1);
  const resourceCountByGuide = new Map<string, number>();
  const recommendedCountByGuide = new Map<string, number>();
  const guideCountByResource = new Map<string, number>();
  for (const row of guideResourceRows ?? []) {
    resourceCountByGuide.set(row.guide_id, (resourceCountByGuide.get(row.guide_id) ?? 0) + 1);
    if (row.featured) recommendedCountByGuide.set(row.guide_id, (recommendedCountByGuide.get(row.guide_id) ?? 0) + 1);
    guideCountByResource.set(row.resource_id, (guideCountByResource.get(row.resource_id) ?? 0) + 1);
  }

  const publishedGuideCount = guides.filter((guide) => guide.student_visible).length;
  const courseLabel = activeSection.courseCode && !activeSection.courseName.toLowerCase().includes(activeSection.courseCode.toLowerCase())
    ? `${activeSection.courseName} ${activeSection.courseCode}`
    : activeSection.courseName;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Study Resource Library</p>
        <h1>{courseLabel}</h1>
        <p className="subtle">{activeSection.sectionName} • {activeSection.schoolYearLabel}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={activeSection.sectionId} returnTo="/study-library"/>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className={`content-wrap ${styles.content}`}>
      <section className={styles.statsGrid} aria-label="Study library overview">
        <article className={styles.statCard}><span>Assessment guides</span><strong>{guides.length}</strong><small>{publishedGuideCount} visible to students</small></article>
        <article className={styles.statCard}><span>Course skills</span><strong>{skills.length}</strong><small>Reusable across assessments</small></article>
        <article className={styles.statCard}><span>Study resources</span><strong>{resources.length}</strong><small>IXL and teacher resources for this course</small></article>
      </section>

      <article className={`panel ${styles.explainer}`}>
        <Star size={20}/>
        <div><strong>What “Recommended first” means</strong><p>It is a visual priority flag for students. A recommended resource gets a <em>Recommended first</em> badge so students know where you want them to begin. It does <strong>not</strong> change the resource order, release timing, grade calculations, or retake rules. Later, personalized recommendations can use this as the teacher-selected default priority.</p></div>
      </article>

      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">Assessment guides</p><h2>Study / Retake Preparation</h2><p className="subtle">Open any assessment to edit its skills, resources, release rules, and student visibility.</p></div></div>
        <div className={styles.guideList}>
          {assignments.length ? assignments.map((assignment) => {
            const guide = assignment.study_guide_id ? guideById.get(assignment.study_guide_id) : null;
            return <div className={styles.guideRow} key={assignment.id}>
              <div className={styles.guideIdentity}>
                <strong>{assignment.title}</strong>
                <small>{assignment.assignment_date} • {assignment.allow_retakes ? "Retakes enabled" : "Study guide attached"}</small>
              </div>
              <div className={styles.guideMeta}>
                {guide ? <>
                  <span className={`${styles.statusPill} ${guide.student_visible ? styles.live : styles.draft}`}>{guide.student_visible ? <Eye size={13}/> : <EyeOff size={13}/>} {guide.student_visible ? "Student visible" : "Teacher-only draft"}</span>
                  <span>{skillCountByGuide.get(guide.id) ?? 0} skills</span>
                  <span>{resourceCountByGuide.get(guide.id) ?? 0} resources</span>
                  {(recommendedCountByGuide.get(guide.id) ?? 0) > 0 ? <span>{recommendedCountByGuide.get(guide.id)} recommended first</span> : null}
                </> : <span className={`${styles.statusPill} ${styles.emptyStatus}`}>No guide yet</span>}
              </div>
              <Link className="secondary-link" href={`/assignments/${assignment.id}/study`}>{guide ? "Manage guide" : "Create guide"}</Link>
            </div>;
          }) : <div className={styles.empty}>No retake-ready assessments are available in this section yet.</div>}
        </div>
      </article>

      <section className={styles.twoColumn}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Course skill library</p><h2>Reusable skills</h2></div><BookOpen size={22}/></div>
          <div className={styles.skillList}>
            {skills.length ? skills.map((skill) => <div className={styles.skillCard} key={skill.id}><strong>{skill.code ? `${skill.code} — ` : ""}{skill.title}</strong>{skill.description ? <small>{skill.description}</small> : null}</div>) : <div className={styles.empty}>No reusable course skills have been cataloged yet.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Resource catalog</p><h2>Reusable study resources</h2></div><span className="subtle">Used across guides</span></div>
          <div className={styles.resourceList}>
            {resources.length ? resources.map((resource) => <div className={styles.resourceCard} key={resource.id}>
              <div><strong>{resource.title}</strong><small>{providerById.get(resource.provider_id) ?? "Resource"} • {resourceTypeLabels[resource.resource_type] ?? resource.resource_type}{resource.external_code ? ` • ${resource.external_code}` : ""}</small>{resource.description ? <p>{resource.description}</p> : null}</div>
              <div className={styles.resourceActions}><span>{guideCountByResource.get(resource.id) ?? 0} guide{(guideCountByResource.get(resource.id) ?? 0) === 1 ? "" : "s"}</span>{resource.url ? <a className={styles.iconLink} href={resource.url} target="_blank" rel="noreferrer" aria-label={`Open ${resource.title}`}><ExternalLink size={16}/></a> : null}</div>
            </div>) : <div className={styles.empty}>No resources are connected to this course yet.</div>}
          </div>
        </article>
      </section>
    </section>
  </main>;
}