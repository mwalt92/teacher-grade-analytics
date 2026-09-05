import { notFound, redirect } from "next/navigation";
import { ArrowDown, ArrowUp, BookOpen, ExternalLink, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { AssignmentWorkspaceNav } from "@/components/assignment-workspace-nav";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import {
  attachExistingResource,
  attachExistingSkill,
  createStudyGuide,
  createStudyResource,
  createStudySkill,
  moveGuideResource,
  removeGuideResource,
  removeStudySkill,
  updateGuideResource,
  updateStudyGuideDetails,
} from "./actions";
import styles from "./study.module.css";

type StudyPageProps = {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ notice?: string; error?: string; returnTo?: string }>;
};

type SkillRow = { id: string; code: string | null; title: string; description: string | null; active: boolean };
type ResourceRow = {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  url: string | null;
  external_code: string | null;
  resource_type: string;
  active: boolean;
};
type GuideResourceRow = {
  id: string;
  guide_id: string;
  resource_id: string;
  skill_id: string | null;
  sort_order: number;
  teacher_note: string | null;
  availability_rule: string;
  featured: boolean;
};

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

const availabilityLabels: Record<string, string> = {
  always: "Always available",
  after_first_attempt: "After first attempt",
  retake_preparation: "Retake preparation",
  teacher_only: "Teacher only",
};

function safeReturnPath(value: string | undefined) {
  if (!value || value.startsWith("//")) return "/assignments";
  if (value === "/assignments" || value.startsWith("/assignments?") || value.startsWith("/gradebook/assignments")) return value;
  return "/assignments";
}

export default async function StudyResourcePage({ params, searchParams }: StudyPageProps) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnPath(query.returnTo);
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,section_id,link_group_id,title,assignment_type,allow_retakes,study_guide_id,archived")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();
  const teacherSection = sections.find((item) => item.sectionId === assignment.section_id);
  if (!teacherSection) notFound();

  const { data: section } = await supabase.from("sections").select("id,course_id,offering_id").eq("id", assignment.section_id).maybeSingle();
  if (!section?.course_id || !section.offering_id) notFound();

  const linkedResult = assignment.link_group_id
    ? await supabase.from("assignments").select("id,section_id,study_guide_id").eq("link_group_id", assignment.link_group_id)
    : { data: [{ id: assignment.id, section_id: assignment.section_id, study_guide_id: assignment.study_guide_id }] };
  const linkedAssignments = linkedResult.data ?? [];

  const { data: providersData } = await supabase.from("resource_providers").select("id,slug,name,active").eq("active", true).order("name");
  const providers = providersData ?? [];
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  const { data: allSkillsData } = await supabase
    .from("study_skills")
    .select("id,code,title,description,active")
    .eq("course_id", section.course_id)
    .eq("active", true)
    .order("title");
  const allSkills = (allSkillsData ?? []) as SkillRow[];

  if (!assignment.study_guide_id) {
    return <main className="app-shell">
      <header className="topbar"><div><p className="eyebrow">Study Resource Library</p><h1>{assignment.title}</h1><p className="subtle">{teacherSection.courseName} • {teacherSection.sectionName}</p></div></header>
      <TeacherPrimaryNav/>
      <TeacherContextBar sections={sections} activeSectionId={teacherSection.sectionId} returnTo={`/assignments/${assignmentId}/study`}/>
      <AssignmentWorkspaceNav assignmentId={assignmentId} active="study" returnTo={returnTo} archived={assignment.archived}/>
      <section className={`content-wrap ${styles.content}`}>
        {query.error ? <div className={styles.error}>{query.error}</div> : null}
        <article className={`panel ${styles.createCard}`}>
          <div className="panel-header"><div><p className="eyebrow">Study / Retake Preparation</p><h2>Create a shared study guide</h2></div><BookOpen size={26}/></div>
          <p className="subtle">This guide will hold course skills, IXL links, notes, practice, solutions, videos, and future resource providers. It does not change grades or retake calculations.</p>
          {linkedAssignments.length > 1 ? <p className="subtle"><strong>Linked assignment:</strong> the same guide will be attached to all {linkedAssignments.length} linked section copies automatically.</p> : null}
          <form action={createStudyGuide} className={styles.actionRow}><input type="hidden" name="assignmentId" value={assignmentId}/><button className="primary-button" type="submit"><Plus size={17}/> Create Study Guide</button></form>
        </article>
      </section>
    </main>;
  }

  const guideId = assignment.study_guide_id;
  const [{ data: guide }, { data: guideSkillRowsData }, { data: guideResourceRowsData }, { data: libraryResourcesData }] = await Promise.all([
    supabase.from("study_guides").select("id,title,description,student_visible,offering_id").eq("id", guideId).maybeSingle(),
    supabase.from("study_guide_skills").select("skill_id,sort_order").eq("guide_id", guideId).order("sort_order"),
    supabase.from("study_guide_resources").select("id,guide_id,resource_id,skill_id,sort_order,teacher_note,availability_rule,featured").eq("guide_id", guideId).order("sort_order"),
    supabase.from("study_resources").select("id,provider_id,title,description,url,external_code,resource_type,active").eq("active", true).order("title"),
  ]);
  if (!guide || guide.offering_id !== section.offering_id) notFound();

  const guideSkillRows = guideSkillRowsData ?? [];
  const guideSkillIds = guideSkillRows.map((row) => row.skill_id);
  const guideSkillsById = new Map(allSkills.map((skill) => [skill.id, skill]));
  const guideSkills = guideSkillRows.flatMap((row) => {
    const skill = guideSkillsById.get(row.skill_id);
    return skill ? [{ ...skill, sortOrder: row.sort_order }] : [];
  });
  const availableSkills = allSkills.filter((skill) => !guideSkillIds.includes(skill.id));

  const guideResourceRows = (guideResourceRowsData ?? []) as GuideResourceRow[];
  const libraryResources = (libraryResourcesData ?? []) as ResourceRow[];
  const resourceById = new Map(libraryResources.map((resource) => [resource.id, resource]));
  const guideResources = guideResourceRows.flatMap((item) => {
    const resource = resourceById.get(item.resource_id);
    return resource ? [{ ...item, resource }] : [];
  });
  const attachedResourceIds = new Set(guideResourceRows.map((item) => item.resource_id));
  const reusableResources = libraryResources.filter((resource) => !attachedResourceIds.has(resource.id));

  const sharedAcrossLinked = linkedAssignments.filter((item) => item.study_guide_id === guideId).length;

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Study Resource Library</p><h1>{assignment.title}</h1><p className="subtle">{teacherSection.courseName} • {teacherSection.sectionName}</p></div></header>
    <TeacherPrimaryNav/>
    <TeacherContextBar sections={sections} activeSectionId={teacherSection.sectionId} returnTo={`/assignments/${assignmentId}/study`}/>
    <AssignmentWorkspaceNav assignmentId={assignmentId} active="study" returnTo={returnTo} archived={assignment.archived}/>
    <section className={`content-wrap ${styles.content}`}>
      {query.notice ? <div className={styles.notice}>{query.notice}</div> : null}
      {query.error ? <div className={styles.error}>{query.error}</div> : null}

      <section className={styles.heroGrid}>
        <article className={`panel ${styles.guideSummary}`}>
          <div className="panel-header"><div><p className="eyebrow">Study / Retake Preparation</p><h2>{guide.title}</h2></div>{guide.student_visible ? <Eye size={24}/> : <EyeOff size={24}/>}</div>
          <p className="subtle">{guide.description || "Build the ordered set of skills and resources students should use before a retake."}</p>
          <div className={styles.summaryStats}>
            <span className={`${styles.pill} ${guide.student_visible ? styles.pillLive : styles.pillDraft}`}>{guide.student_visible ? "Visible to students" : "Teacher-only draft"}</span>
            <span className={styles.pill}>{guideSkills.length} skill{guideSkills.length === 1 ? "" : "s"}</span>
            <span className={styles.pill}>{guideResources.length} resource{guideResources.length === 1 ? "" : "s"}</span>
            {sharedAcrossLinked > 1 ? <span className={styles.pill}>Shared across {sharedAcrossLinked} linked sections</span> : null}
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">Release controls</p><h3>Guide settings</h3>
          <form action={updateStudyGuideDetails} className={styles.stack}>
            <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/>
            <label>Student-facing title<input name="title" required defaultValue={guide.title}/></label>
            <label>Description<textarea name="description" defaultValue={guide.description ?? ""}/></label>
            <label className={styles.checkbox}><input type="checkbox" name="studentVisible" value="true" defaultChecked={guide.student_visible}/> Visible to students</label>
            <button className="primary-button" type="submit">Save Guide Settings</button>
          </form>
        </article>
      </section>

      <section className={styles.twoColumn}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Assessment skills</p><h3>What students need to know</h3></div></div>
          <div className={styles.skillList}>
            {guideSkills.length ? guideSkills.map((skill) => <div className={styles.skillCard} key={skill.id}>
              <div className={styles.skillText}><strong>{skill.code ? `${skill.code} — ` : ""}{skill.title}</strong>{skill.description ? <small>{skill.description}</small> : null}</div>
              <form action={removeStudySkill}><input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/><input type="hidden" name="skillId" value={skill.id}/><button className={styles.dangerButton} type="submit" aria-label={`Remove ${skill.title}`}><Trash2 size={14}/></button></form>
            </div>) : <div className={styles.empty}>No skills attached yet. Start with a reusable course skill below.</div>}
          </div>
          <div className={styles.divider}/>
          <form action={attachExistingSkill} className={styles.stack}>
            <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/>
            <label>Reuse a course skill<select name="skillId" required defaultValue=""><option value="" disabled>{availableSkills.length ? "Choose existing skill" : "No unused skills yet"}</option>{availableSkills.map((skill) => <option value={skill.id} key={skill.id}>{skill.code ? `${skill.code} — ` : ""}{skill.title}</option>)}</select></label>
            <button className="secondary-link" type="submit" disabled={!availableSkills.length}><Plus size={15}/> Add Existing Skill</button>
          </form>
          <div className={styles.divider}/>
          <form action={createStudySkill} className={styles.formGrid}>
            <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/>
            <label>Skill code <span className={styles.muted}>(optional)</span><input name="code" placeholder="1.6"/></label>
            <label>Skill title<input name="title" required placeholder="Algebraic manipulation of limits"/></label>
            <label className={styles.wide}>Student-friendly description<textarea name="description" placeholder="Use factoring, rationalization, or other algebraic techniques to evaluate indeterminate limits."/></label>
            <div className={`${styles.actionRow} ${styles.wide}`}><button className="primary-button" type="submit"><Plus size={15}/> Create Skill</button></div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Resource library</p><h3>Reuse something already cataloged</h3></div></div>
          <p className="subtle">IXL skills and teacher materials only need to be entered once. Reuse them across Mastery Check forms, tests, and future offerings.</p>
          <form action={attachExistingResource} className={styles.stack}>
            <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/>
            <label>Library resource<select name="resourceId" required defaultValue=""><option value="" disabled>{reusableResources.length ? "Choose resource" : "No unused library resources yet"}</option>{reusableResources.map((resource) => <option value={resource.id} key={resource.id}>{providerById.get(resource.provider_id)?.name ?? "Resource"} — {resource.title}</option>)}</select></label>
            <div className={styles.librarySelect}>
              <label>Skill association<select name="skillId" defaultValue=""><option value="">General guide resource</option>{guideSkills.map((skill) => <option value={skill.id} key={skill.id}>{skill.code ? `${skill.code} — ` : ""}{skill.title}</option>)}</select></label>
              <label>Release rule<select name="availabilityRule" defaultValue="always"><option value="always">Always available</option><option value="after_first_attempt">After first attempt</option><option value="retake_preparation">Retake preparation</option><option value="teacher_only">Teacher only</option></select></label>
            </div>
            <button className="secondary-link" type="submit" disabled={!reusableResources.length}><Plus size={15}/> Add Existing Resource</button>
          </form>
        </article>
      </section>

      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">Recommended resources</p><h3>Student study sequence</h3></div><span className="subtle">Use arrows to reorder</span></div>
        <div className={styles.resourceList}>
          {guideResources.length ? guideResources.map((item, index) => {
            const provider = providerById.get(item.resource.provider_id);
            const skill = item.skill_id ? guideSkillsById.get(item.skill_id) : null;
            return <div className={styles.resourceCard} key={item.id}>
              <div className={styles.resourceTop}>
                <div className={styles.resourceTitle}>
                  <strong>{item.resource.title}</strong>
                  <div className={styles.resourceMeta}><span>{provider?.name ?? "Resource"}</span><span>{resourceTypeLabels[item.resource.resource_type] ?? item.resource.resource_type}</span><span>{availabilityLabels[item.availability_rule] ?? item.availability_rule}</span>{skill ? <span>{skill.code ? `${skill.code} — ` : ""}{skill.title}</span> : null}{item.featured ? <span className={styles.featured}>Recommended first</span> : null}</div>
                  {item.resource.description ? <small className={styles.muted}>{item.resource.description}</small> : null}
                  {item.resource.external_code ? <small className={styles.muted}>Code: {item.resource.external_code}</small> : null}
                  {item.resource.url ? <a className={styles.link} href={item.resource.url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Open resource</a> : null}
                </div>
                <div className={styles.resourceActions}>
                  <form action={moveGuideResource}><input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/><input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="direction" value="up"/><button className={styles.miniButton} type="submit" disabled={index === 0} aria-label="Move up"><ArrowUp size={14}/></button></form>
                  <form action={moveGuideResource}><input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/><input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="direction" value="down"/><button className={styles.miniButton} type="submit" disabled={index === guideResources.length - 1} aria-label="Move down"><ArrowDown size={14}/></button></form>
                  <form action={removeGuideResource}><input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/><input type="hidden" name="itemId" value={item.id}/><button className={styles.dangerButton} type="submit" aria-label="Remove resource"><Trash2 size={14}/></button></form>
                </div>
              </div>
              <form action={updateGuideResource} className={styles.resourceSettings}>
                <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/><input type="hidden" name="itemId" value={item.id}/>
                <label>Release<select name="availabilityRule" defaultValue={item.availability_rule}><option value="always">Always available</option><option value="after_first_attempt">After first attempt</option><option value="retake_preparation">Retake preparation</option><option value="teacher_only">Teacher only</option></select></label>
                <label>Teacher note<input name="teacherNote" defaultValue={item.teacher_note ?? ""} placeholder="Optional guidance shown with this resource"/></label>
                <label className={styles.checkbox} title="Adds a Recommended first badge for students. It does not change order or release timing."><input type="checkbox" name="featured" value="true" defaultChecked={item.featured}/> Recommended first</label>
                <button className={styles.miniButton} type="submit">Save</button>
              </form>
            </div>;
          }) : <div className={styles.empty}>No resources attached yet. Create the first resource below.</div>}
        </div>
      </article>

      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">New library resource</p><h3>Catalog once, reuse later</h3></div></div>
        <form action={createStudyResource} className={styles.formGrid}>
          <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="guideId" value={guideId}/>
          <label>Provider<select name="providerId" required defaultValue={providers.find((provider) => provider.slug === "ixl")?.id ?? providers[0]?.id ?? ""}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
          <label>Resource type<select name="resourceType" defaultValue="skill_practice"><option value="skill_practice">Skill practice</option><option value="notes">Notes</option><option value="practice">Practice</option><option value="solutions">Solutions</option><option value="worksheet">Worksheet</option><option value="video">Video</option><option value="reference">Reference</option><option value="other">Other</option></select></label>
          <label className={styles.wide}>Title<input name="title" required placeholder="Find limits involving factorization and rationalization"/></label>
          <label>URL<input name="url" type="url" placeholder="https://..."/></label>
          <label>Provider code <span className={styles.muted}>(optional)</span><input name="externalCode" placeholder="GXB"/></label>
          <label>Skill association<select name="skillId" defaultValue=""><option value="">General guide resource</option>{guideSkills.map((skill) => <option value={skill.id} key={skill.id}>{skill.code ? `${skill.code} — ` : ""}{skill.title}</option>)}</select></label>
          <label>Alignment<select name="alignmentKind" defaultValue="direct"><option value="direct">Direct match</option><option value="supporting">Supporting practice</option><option value="prerequisite">Prerequisite skill</option></select></label>
          <label>Release rule<select name="availabilityRule" defaultValue={assignment.allow_retakes ? "retake_preparation" : "always"}><option value="always">Always available</option><option value="after_first_attempt">After first attempt</option><option value="retake_preparation">Retake preparation</option><option value="teacher_only">Teacher only</option></select></label>
          <label className={styles.checkbox} title="Adds a Recommended first badge for students. It does not change order or release timing."><input type="checkbox" name="featured" value="true"/> Recommend this first</label>
          <label className={styles.wide}>Description<textarea name="description" placeholder="What this resource helps the student practice."/></label>
          <label className={styles.wide}>Teacher note<textarea name="teacherNote" placeholder="Optional instructions such as: Start here before attempting the next retake."/></label>
          <div className={`${styles.actionRow} ${styles.wide}`}><span className={styles.providerHint}>Teacher-only resources remain protected by database access rules, not just hidden in the interface.</span><button className="primary-button" type="submit"><Plus size={15}/> Add Resource</button></div>
        </form>
      </article>
    </section>
  </main>;
}