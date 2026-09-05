import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, ExternalLink } from "lucide-react";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { createClient } from "@/lib/supabase/server";
import styles from "./student-assignment.module.css";

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

function formatPercent(points: number | null, possible: number) {
  if (points === null || !possible) return "—";
  return `${((points / possible) * 100).toFixed(1)}%`;
}

export default async function StudentAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!profile) redirect("/");
  if (profile.role === "teacher" || profile.role === "admin") redirect("/student/preview");

  const { data: studentAccount } = await supabase.from("student_accounts").select("student_id").eq("profile_id", profileId).maybeSingle();
  if (!studentAccount?.student_id) redirect("/student");
  const studentId = studentAccount.student_id;

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,section_id,title,assignment_date,points_possible,allow_retakes,study_guide_id,archived")
    .eq("id", assignmentId)
    .eq("archived", false)
    .maybeSingle();
  if (!assignment) notFound();

  const { data: enrollment } = await supabase.from("enrollments").select("id").eq("student_id", studentId).eq("section_id", assignment.section_id).eq("active", true).maybeSingle();
  if (!enrollment) notFound();

  const [{ data: section }, { data: gradeRecord }] = await Promise.all([
    supabase.from("sections").select("id,name,course_id").eq("id", assignment.section_id).maybeSingle(),
    supabase.from("grade_records").select("id,missing,exempt").eq("assignment_id", assignmentId).eq("student_id", studentId).maybeSingle(),
  ]);
  if (!section) notFound();

  const { data: course } = await supabase.from("courses").select("name,code").eq("id", section.course_id).maybeSingle();
  const { data: attemptsData } = gradeRecord?.id
    ? await supabase.from("grade_attempts").select("attempt_number,points_earned,occurred_on").eq("grade_record_id", gradeRecord.id).order("attempt_number", { ascending: true })
    : { data: [] as { attempt_number: number; points_earned: number | string; occurred_on: string }[] };
  const attempts = attemptsData ?? [];
  const possible = Number(assignment.points_possible);
  const bestPoints = attempts.length ? Math.max(...attempts.map((attempt) => Number(attempt.points_earned))) : null;
  const bestPercent = gradeRecord?.missing ? 0 : bestPoints === null ? null : (bestPoints / possible) * 100;

  let guide: { id: string; title: string; description: string | null; student_visible: boolean } | null = null;
  let skills: { id: string; code: string | null; title: string; description: string | null }[] = [];
  let resourceItems: { id: string; skill_id: string | null; featured: boolean; teacher_note: string | null; resource_id: string; sort_order: number }[] = [];
  if (assignment.study_guide_id) {
    const { data: guideData } = await supabase.from("study_guides").select("id,title,description,student_visible").eq("id", assignment.study_guide_id).maybeSingle();
    guide = guideData ?? null;
    if (guide) {
      const [{ data: guideSkillRows }, { data: guideResourceRows }] = await Promise.all([
        supabase.from("study_guide_skills").select("skill_id,sort_order").eq("guide_id", guide.id).order("sort_order"),
        supabase.from("study_guide_resources").select("id,skill_id,featured,teacher_note,resource_id,sort_order").eq("guide_id", guide.id).order("sort_order"),
      ]);
      const skillIds = (guideSkillRows ?? []).map((row) => row.skill_id);
      if (skillIds.length) {
        const { data: skillRows } = await supabase.from("study_skills").select("id,code,title,description").in("id", skillIds);
        const byId = new Map((skillRows ?? []).map((skill) => [skill.id, skill]));
        skills = (guideSkillRows ?? []).flatMap((row) => {
          const skill = byId.get(row.skill_id);
          return skill ? [skill] : [];
        });
      }
      resourceItems = guideResourceRows ?? [];
    }
  }

  const resourceIds = resourceItems.map((item) => item.resource_id);
  const { data: resourcesData } = resourceIds.length
    ? await supabase.from("study_resources").select("id,provider_id,title,description,url,external_code,resource_type").in("id", resourceIds)
    : { data: [] as { id: string; provider_id: string; title: string; description: string | null; url: string | null; external_code: string | null; resource_type: string }[] };
  const providerIds = [...new Set((resourcesData ?? []).map((resource) => resource.provider_id))];
  const { data: providersData } = providerIds.length
    ? await supabase.from("resource_providers").select("id,name").in("id", providerIds)
    : { data: [] as { id: string; name: string }[] };
  const resourceById = new Map((resourcesData ?? []).map((resource) => [resource.id, resource]));
  const providerById = new Map((providersData ?? []).map((provider) => [provider.id, provider]));
  const visibleResources = resourceItems.flatMap((item) => {
    const resource = resourceById.get(item.resource_id);
    return resource ? [{ ...item, resource, provider: providerById.get(resource.provider_id)?.name ?? "Resource" }] : [];
  });

  const generalResources = visibleResources.filter((item) => !item.skill_id);
  const featuredCount = visibleResources.filter((item) => item.featured).length;
  const resourcesBySkill = new Map<string, typeof visibleResources>();
  for (const item of visibleResources) {
    if (!item.skill_id) continue;
    const list = resourcesBySkill.get(item.skill_id) ?? [];
    list.push(item);
    resourcesBySkill.set(item.skill_id, list);
  }

  const courseName = course?.code && !course.name.toLowerCase().includes(course.code.toLowerCase()) ? `${course.name} ${course.code}` : course?.name ?? "Course";
  const backHref = `/student?sectionId=${encodeURIComponent(assignment.section_id)}`;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Assessment Review</p><h1>{assignment.title}</h1><p className="subtle">{courseName} • {section.name} • {assignment.assignment_date}</p></div></header>
    <StudentPrimaryNav/>
    <section className={`content-wrap ${styles.content}`}>
      <div className={styles.backRow}><Link className="secondary-link" href={backHref}><ArrowLeft size={17}/> Back to Progress</Link><Link className="secondary-link" href={`/student/study-library?sectionId=${encodeURIComponent(assignment.section_id)}`}>Study Library</Link></div>

      <section className={styles.hero}>
        <article className={`panel ${styles.scoreCard}`}>
          <p className="eyebrow">Best result</p>
          <strong className={styles.scoreValue}>{gradeRecord?.missing ? "0.0%" : bestPercent === null ? "—" : `${bestPercent.toFixed(1)}%`}</strong>
          <p className={`subtle ${styles.scoreContext}`}>Best recorded attempt • {possible} points possible</p>
          <div className={styles.statusRow}>{gradeRecord?.missing ? <span className={`${styles.pill} ${styles.missing}`}>Missing</span> : null}{gradeRecord?.exempt ? <span className={styles.pill}>Exempt</span> : null}{assignment.allow_retakes ? <span className={`${styles.pill} ${styles.retake}`}>Retakes enabled</span> : null}<span className={styles.pill}>{attempts.length} attempt{attempts.length === 1 ? "" : "s"}</span></div>
        </article>
        <article className={`panel ${styles.attemptPanel}`}>
          <div><p className="eyebrow">Attempt history</p><h3>How your attempts compare</h3></div>
          <div className={styles.attemptList}>{attempts.length ? attempts.map((attempt) => {
            const isBest = bestPoints !== null && Number(attempt.points_earned) === bestPoints;
            return <div className={`${styles.attemptRow} ${isBest ? styles.attemptBest : ""}`} key={attempt.attempt_number}>
              <span className={styles.attemptIdentity}><strong>Attempt {attempt.attempt_number}</strong>{isBest ? <span className={styles.bestBadge}>Best</span> : null}<small className="subtle">{attempt.occurred_on}</small></span>
              <strong className={styles.attemptScore}>{Number(attempt.points_earned)}/{possible} • {formatPercent(Number(attempt.points_earned), possible)}</strong>
            </div>;
          }) : <div className={styles.empty}>No score has been entered yet.</div>}</div>
        </article>
      </section>

      <article className={`panel ${styles.studyPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Study / Retake Preparation</p><h2>{guide?.title ?? "Study resources"}</h2></div><BookOpen size={26}/></div>
        {guide ? <>
          {guide.description ? <p className={styles.guideIntro}>{guide.description}</p> : null}
          {visibleResources.length ? <div className={styles.studySummary}><div><strong>{visibleResources.length} resource{visibleResources.length === 1 ? "" : "s"} available now</strong><span>{featuredCount ? "Start with anything marked Recommended first, then work through the skill sections below." : "Work through the skill sections below in the order your teacher provided."}</span></div>{featuredCount ? <span className={styles.recommendationCount}>{featuredCount} recommended first</span> : null}</div> : null}
          {generalResources.length ? <section className={styles.generalResources}><div className={styles.skillHeading}><h3>Start here</h3><p>General resources for this assessment.</p></div><div className={styles.resourceGrid}>{generalResources.map((item) => <ResourceCard key={item.id} item={item}/>)}</div></section> : null}
          {skills.map((skill) => {
            const items = resourcesBySkill.get(skill.id) ?? [];
            return <section className={styles.skillSection} key={skill.id}>
              <div className={styles.skillHeading}><h3>{skill.code ? `${skill.code} — ` : ""}{skill.title}</h3>{skill.description ? <p>{skill.description}</p> : null}</div>
              {items.length ? <div className={styles.resourceGrid}>{items.map((item) => <ResourceCard key={item.id} item={item}/>)}</div> : <div className={styles.empty}>No released resources are available for this skill yet.</div>}
            </section>;
          })}
          {!skills.length && !generalResources.length ? <div className={styles.empty}>Your teacher has created this study guide, but no resources are available to you yet.</div> : null}
        </> : <div className={styles.empty}>No study guide has been published for this assessment yet.</div>}
      </article>
    </section>
  </main>;
}

function ResourceCard({ item }: { item: { id: string; featured: boolean; teacher_note: string | null; resource: { title: string; description: string | null; url: string | null; external_code: string | null; resource_type: string }; provider: string } }) {
  const body = <>
    <div className={styles.resourceTop}><strong>{item.resource.title}</strong>{item.resource.url ? <ExternalLink size={16}/> : null}</div>
    {item.featured ? <span className={styles.recommendedCallout}>Recommended first</span> : null}
    <div className={styles.resourceMeta}><span>{item.provider}</span><span>{resourceTypeLabels[item.resource.resource_type] ?? item.resource.resource_type}</span>{item.resource.external_code ? <span>{item.resource.external_code}</span> : null}</div>
    {item.resource.description ? <small className="subtle">{item.resource.description}</small> : null}
    {item.teacher_note ? <small className={styles.teacherNote}>{item.teacher_note}</small> : null}
  </>;
  const className = `${styles.resourceCard} ${item.featured ? styles.resourceCardFeatured : ""}`;
  return item.resource.url ? <a className={className} href={item.resource.url} target="_blank" rel="noreferrer">{body}</a> : <div className={className}>{body}</div>;
}
