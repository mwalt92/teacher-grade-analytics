import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, ArrowLeft, BookOpen, Link2, RotateCcw } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getAssignmentManagementData } from "@/lib/data/assignment-management";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { archiveAssignment, deleteEmptyAssignment, restoreAssignment, updateAssignmentMetadata } from "../../management-actions";
import { ClearAssignmentScoresButton } from "./clear-assignment-scores-button";
import styles from "../../assignments.module.css";

type EditAssignmentProps = {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ returnTo?: string; saved?: string; count?: string; cleared?: string; error?: string }>;
};

function safeReturnPath(value: string | undefined) {
  if (!value || value.startsWith("//")) return "/assignments";
  if (value === "/assignments" || value.startsWith("/assignments?") || value.startsWith("/gradebook/assignments")) return value;
  return "/assignments";
}

function ScopeChoice({ linkedCount, currentSectionName, defaultScope = "linked" }: { linkedCount: number; currentSectionName: string; defaultScope?: "current" | "linked" }) {
  if (linkedCount <= 1) return <input type="hidden" name="scope" value="current"/>;
  return <fieldset className={styles.scopeBox}>
    <legend>Apply this action to</legend>
    <div className={styles.scopeOptions}>
      <label className={styles.scopeOption}><input type="radio" name="scope" value="current" defaultChecked={defaultScope === "current"}/><span><strong>This section only</strong><small>{currentSectionName}</small></span></label>
      <label className={styles.scopeOption}><input type="radio" name="scope" value="linked" defaultChecked={defaultScope === "linked"}/><span><strong>All linked sections</strong><small>{linkedCount} section assignments</small></span></label>
    </div>
  </fieldset>;
}

export default async function EditAssignmentPage({ params, searchParams }: EditAssignmentProps) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnPath(query.returnTo);
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,section_id,link_group_id,title,assignment_type,assignment_type_id,category_id,assignment_date,points_possible,allow_retakes,grading_period_id,archived,archived_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();
  const section = sections.find((item) => item.sectionId === assignment.section_id);
  if (!section) notFound();

  const [management, linkedAssignmentsResult] = await Promise.all([
    getAssignmentManagementData(section.sectionId),
    assignment.link_group_id
      ? supabase.from("assignments").select("id,section_id,title,archived").eq("link_group_id", assignment.link_group_id).order("created_at")
      : Promise.resolve({ data: [] as { id: string; section_id: string; title: string; archived: boolean }[] }),
  ]);
  if (!management) notFound();
  const activity = management.assignments.find((item) => item.id === assignmentId);
  if (!activity) notFound();

  const gradeHref = `/assignments/${assignmentId}?returnTo=${encodeURIComponent(returnTo)}`;
  const studyHref = `/assignments/${assignmentId}/study`;
  const clearedCount = query.cleared == null ? null : Number(query.cleared);
  const savedCount = query.count == null ? null : Number(query.count);
  const currentType = management.assignmentTypes.find((type) => type.id === assignment.assignment_type_id);
  const linkedAssignments = linkedAssignmentsResult.data ?? [];
  const linkedCount = linkedAssignments.length;
  const linkedSectionNames = linkedAssignments
    .map((item) => sections.find((candidate) => candidate.sectionId === item.section_id)?.sectionName)
    .filter((value): value is string => Boolean(value));

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Assignment Management</p>
        <h1>Edit {assignment.title}</h1>
        <p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/assignments"/>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className={`content-wrap ${styles.content}`}>
      <div className="section-heading">
        <div><p className="eyebrow">Assignment setup</p><h2>Edit grading behavior and metadata</h2></div>
        <div className="grade-audit-header-actions"><Link className="secondary-link" href={returnTo}><ArrowLeft size={17}/> Back to Assignments</Link>{!assignment.archived ? <Link className="secondary-link" href={gradeHref}>Open Grade Entry</Link> : null}<Link className="secondary-link" href={studyHref}><BookOpen size={16}/> Study Resources</Link></div>
      </div>
      {query.saved ? <div className={styles.notice}>{query.saved === "linked" ? `Assignment changes saved across ${savedCount ?? linkedCount} linked sections.` : `Assignment changes saved for ${section.sectionName}.`} Grade calculations now use the updated setup.</div> : null}
      {clearedCount != null && Number.isFinite(clearedCount) ? <div className={styles.notice}>Cleared {clearedCount} student grade record{clearedCount === 1 ? "" : "s"} from {section.sectionName}. This assignment is now empty in this section and ready for permanent deletion if that is what you intended.</div> : null}
      {query.error ? <div className={styles.error}>{query.error}</div> : null}
      {linkedCount > 1 ? <div className={styles.linkedSummary}><Link2 size={17}/><div><strong>Linked across {linkedCount} sections</strong><span>{linkedSectionNames.join(" • ") || `${linkedCount} linked section assignments`}</span><small>Metadata, archive, restore, and empty-assignment deletion can now target this section or the whole linked group. Student scores and retakes always remain section-specific.</small></div></div> : null}
      {assignment.archived ? <div className={styles.archivedBanner}>This assignment is archived. Its historical scores are preserved, but it is excluded from active Gradebook, audit calculations, PowerSchool comparison calculations, and student grades until restored.</div> : null}

      <div className={styles.editLayout}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Assignment setup</p><h2>Metadata and grading behavior</h2></div></div>
          {activity.gradeRecordCount > 0 ? <div className={styles.impactNote}>This section already has student grade data. Changing its points possible, grading period, category, or type can immediately change teacher and student grade calculations. Existing score and retake history will be preserved.</div> : null}
          <form action={updateAssignmentMetadata} className={styles.editForm}>
            <input type="hidden" name="assignmentId" value={assignmentId}/>
            <input type="hidden" name="returnTo" value={returnTo}/>
            <div className={styles.fieldGrid}>
              <label className={styles.wide}>Assignment title<input name="title" required defaultValue={assignment.title}/></label>
              <label>Assignment date<input type="date" name="assignmentDate" required defaultValue={assignment.assignment_date}/></label>
              <label>Points possible<input type="number" min="0.01" step="0.01" name="pointsPossible" required defaultValue={Number(assignment.points_possible)}/></label>
              <label>Grading period<select name="gradingPeriodId" required defaultValue={assignment.grading_period_id ?? ""}><option value="" disabled>Select period</option>{management.periods.map((period) => <option value={period.id} key={period.id}>{period.code} — {period.name}</option>)}</select></label>
              <label>Assignment type<select name="assignmentTypeId" required defaultValue={assignment.assignment_type_id ?? ""}>{management.assignmentTypes.map((type) => <option value={type.id} key={type.id}>{type.name}{type.active ? "" : " (Inactive)"}</option>)}</select></label>
              <label>Grading category<select name="categoryId" required defaultValue={assignment.category_id}>{management.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
              <label className={styles.retakeField}><input type="checkbox" name="allowRetakes" value="true" defaultChecked={assignment.allow_retakes}/> Allow future retakes</label>
            </div>
            <ScopeChoice linkedCount={linkedCount} currentSectionName={section.sectionName}/>
            <div className={styles.saveRow}><span className="subtle">Type, category, and future-retake eligibility are independent. Changing any of them never deletes existing attempt history.{currentType ? ` Current type: ${currentType.name}.` : ""}</span><button className="primary-button" type="submit">Save Assignment Changes</button></div>
          </form>
        </article>

        <aside className={styles.sideStack}>
          <article className="panel">
            <p className="eyebrow">Grade activity</p><h3>Existing history</h3>
            <div className={styles.detailList}>
              <div className={styles.detailItem}><span>Grade records</span><strong>{activity.gradeRecordCount}</strong></div>
              <div className={styles.detailItem}><span>Students scored</span><strong>{activity.scoredCount}</strong></div>
              <div className={styles.detailItem}><span>Marked missing</span><strong>{activity.missingCount}</strong></div>
              <div className={styles.detailItem}><span>Retake attempts</span><strong>{activity.retakeCount}</strong></div>
              <div className={styles.detailItem}><span>Status</span><strong>{assignment.archived ? "Archived" : "Active"}</strong></div>
            </div>
            <form action={assignment.archived ? restoreAssignment : archiveAssignment} className={styles.scopeActionForm}>
              <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="returnTo" value={returnTo}/>
              <ScopeChoice linkedCount={linkedCount} currentSectionName={section.sectionName}/>
              <button className={styles.archiveAction} type="submit">{assignment.archived ? <><RotateCcw size={15}/> Restore selected scope</> : <><Archive size={15}/> Archive selected scope</>}</button>
            </form>
          </article>

          <article className={`panel ${styles.dangerPanel}`}>
            <p className="eyebrow">Permanent removal</p><h3>Delete accidental assignment</h3>
            {activity.gradeRecordCount > 0 ? <>
              <p className={styles.dangerText}>Step 1: clear this section&apos;s student scores. This permanently removes its {activity.gradeRecordCount} grade record{activity.gradeRecordCount === 1 ? "" : "s"}, all attempts, retakes, and grade-history rows tied to them. Score clearing intentionally remains section-specific.</p>
              <ClearAssignmentScoresButton
                assignmentId={assignmentId}
                assignmentTitle={assignment.title}
                returnTo={returnTo}
                gradeRecordCount={activity.gradeRecordCount}
                retakeCount={activity.retakeCount}
              />
              <p className={styles.dangerText}>To delete an entire linked assignment group, every linked section must be empty first. Clear any scores section by section, then return here.</p>
            </> : <>
              <p className={styles.dangerText}>Step 2: this assignment has no student grade records in {section.sectionName}. Choose whether to delete only this section assignment or, if every linked section is empty, the whole linked group. This cannot be undone.</p>
              <form action={deleteEmptyAssignment} className={styles.scopeActionForm}>
                <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="returnTo" value={returnTo}/>
                <ScopeChoice linkedCount={linkedCount} currentSectionName={section.sectionName} defaultScope="current"/>
                <label className="stack-form">Confirm title<input name="confirmTitle" required autoComplete="off" placeholder={assignment.title}/></label>
                <button className={styles.dangerButton} type="submit">Permanently Delete Selected Scope</button>
              </form>
            </>}
          </article>
        </aside>
      </div>
    </section>
  </main>;
}
