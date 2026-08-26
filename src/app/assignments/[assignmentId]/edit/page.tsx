import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, ArrowLeft, RotateCcw } from "lucide-react";
import { getAssignmentManagementData } from "@/lib/data/assignment-management";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { archiveAssignment, deleteEmptyAssignment, restoreAssignment, updateAssignmentMetadata } from "../../management-actions";
import styles from "../../assignments.module.css";

type EditAssignmentProps = {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ returnTo?: string; saved?: string; error?: string }>;
};

function safeReturnPath(value: string | undefined) {
  if (!value || value.startsWith("//")) return "/assignments";
  if (value === "/assignments" || value.startsWith("/assignments?") || value.startsWith("/gradebook/assignments")) return value;
  return "/assignments";
}

export default async function EditAssignmentPage({ params, searchParams }: EditAssignmentProps) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnPath(query.returnTo);
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");

  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,section_id,title,assignment_type,assignment_date,points_possible,allow_retakes,grading_period_id,archived,archived_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) notFound();
  const section = sections.find((item) => item.sectionId === assignment.section_id);
  if (!section) notFound();

  const management = await getAssignmentManagementData(section.sectionId);
  if (!management) notFound();
  const activity = management.assignments.find((item) => item.id === assignmentId);
  if (!activity) notFound();

  const gradeHref = `/assignments/${assignmentId}?returnTo=${encodeURIComponent(returnTo)}`;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Assignment Management</p>
        <h1>Edit {assignment.title}</h1>
        <p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p>
      </div>
      <div className="grade-audit-header-actions">
        <Link className="secondary-link" href={returnTo}><ArrowLeft size={17}/> Back to Assignments</Link>
        {!assignment.archived ? <Link className="secondary-link" href={gradeHref}>Open Grade Entry</Link> : null}
      </div>
    </header>

    <section className={`content-wrap ${styles.content}`}>
      {query.saved === "1" ? <div className={styles.notice}>Assignment changes saved. Grade calculations now use the updated setup.</div> : null}
      {query.error ? <div className={styles.error}>{query.error}</div> : null}
      {assignment.archived ? <div className={styles.archivedBanner}>This assignment is archived. Its historical scores are preserved, but it is excluded from active Gradebook, audit calculations, PowerSchool comparison calculations, and student grades until restored.</div> : null}

      <div className={styles.editLayout}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Assignment setup</p><h2>Metadata and grading behavior</h2></div></div>
          {activity.gradeRecordCount > 0 ? <div className={styles.impactNote}>This assignment already has student grade data. Changing its points possible, grading period, or type can immediately change teacher and student grade calculations. Existing score and retake history will be preserved.</div> : null}
          <form action={updateAssignmentMetadata} className={styles.editForm}>
            <input type="hidden" name="assignmentId" value={assignmentId}/>
            <input type="hidden" name="returnTo" value={returnTo}/>
            <div className={styles.fieldGrid}>
              <label className={styles.wide}>Assignment title<input name="title" required defaultValue={assignment.title}/></label>
              <label>Assignment date<input type="date" name="assignmentDate" required defaultValue={assignment.assignment_date}/></label>
              <label>Points possible<input type="number" min="0.01" step="0.01" name="pointsPossible" required defaultValue={Number(assignment.points_possible)}/></label>
              <label>Grading period<select name="gradingPeriodId" required defaultValue={assignment.grading_period_id ?? ""}><option value="" disabled>Select period</option>{management.periods.map((period) => <option value={period.id} key={period.id}>{period.code} — {period.name}</option>)}</select></label>
              <label>Assignment type<select name="kind" required defaultValue={assignment.assignment_type}><option value="participation">Participation</option><option value="quiz">Quiz</option><option value="test">Test</option></select></label>
              <label className={styles.retakeField}><input type="checkbox" name="allowRetakes" value="true" defaultChecked={assignment.allow_retakes}/> Allow future retakes for assessments</label>
            </div>
            <div className={styles.saveRow}><span className="subtle">Participation always saves as single-attempt. Existing assessment retake history is never deleted.</span><button className="primary-button" type="submit">Save Assignment Changes</button></div>
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
            <form action={assignment.archived ? restoreAssignment : archiveAssignment}>
              <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="returnTo" value={returnTo}/>
              <button className={styles.archiveAction} type="submit">{assignment.archived ? <><RotateCcw size={15}/> Restore to active grades</> : <><Archive size={15}/> Archive assignment</>}</button>
            </form>
          </article>

          <article className={`panel ${styles.dangerPanel}`}>
            <p className="eyebrow">Permanent removal</p><h3>Delete accidental assignment</h3>
            {activity.gradeRecordCount === 0 ? <>
              <p className={styles.dangerText}>Because this assignment has no student grade records, it can be permanently deleted. This cannot be undone. Type the exact title below to confirm.</p>
              <form action={deleteEmptyAssignment}>
                <input type="hidden" name="assignmentId" value={assignmentId}/><input type="hidden" name="returnTo" value={returnTo}/>
                <label className="stack-form">Confirm title<input name="confirmTitle" required autoComplete="off" placeholder={assignment.title}/></label>
                <button className={styles.dangerButton} type="submit">Permanently Delete Empty Assignment</button>
              </form>
            </> : <p className={styles.dangerText}>Permanent deletion is disabled because student grade history exists. Archive this assignment instead; its records and attempts will remain available historically.</p>}
          </article>
        </aside>
      </div>
    </section>
  </main>;
}
