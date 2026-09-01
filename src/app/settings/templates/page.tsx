import Link from "next/link";
import { redirect } from "next/navigation";
import { BookCopy, ClipboardPlus, Home, Trash2 } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getTeacherCourseLifecycleOfferings } from "@/lib/data/course-lifecycle";
import { getTeacherCourseTemplates } from "@/lib/data/course-templates";
import { createClient } from "@/lib/supabase/server";
import { deleteCourseTemplate, saveCourseTemplate } from "./actions";
import styles from "./templates.module.css";

type PageProps = { searchParams: Promise<{ message?: string | string[]; error?: string | string[] }> };

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function courseLabel(name: string, code: string | null) {
  return code && !name.toLowerCase().includes(code.toLowerCase()) ? `${name} ${code}` : name;
}

export default async function CourseTemplatesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) redirect("/student");

  const [params, offerings, templates] = await Promise.all([
    searchParams,
    getTeacherCourseLifecycleOfferings(),
    getTeacherCourseTemplates(),
  ]);
  const message = firstParam(params.message);
  const error = firstParam(params.error);

  return <main className="app-shell">
    <header className="topbar"><div>
      <p className="eyebrow">Teacher Grade Analytics</p>
      <h1>Reusable Course Templates</h1>
      <p className="subtle">{profile.display_name} • stable configuration snapshots for future courses and school years</p>
    </div></header>
    <TeacherPrimaryNav/>

    <section className="content-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Course templates</p>
          <h2>Save a course configuration without its classroom data</h2>
          <p className="subtle">Templates snapshot grading categories, assignment types, grading periods, and composite-period weights. Students, rosters, assignments, scores, retakes, Missing/Exempt states, and PowerSchool history are never included.</p>
        </div>
        <div className={styles.pageActions}>
          <Link className="secondary-link" href="/settings/courses"><Home size={17}/> Course Library</Link>
          <Link className="primary-button" href="/settings/course-setup"><ClipboardPlus size={17}/> Create Course</Link>
        </div>
      </div>

      {message ? <div className="import-message success"><strong>{message}</strong></div> : null}
      {error ? <div className="import-message error"><strong>{error}</strong></div> : null}

      <div className={styles.layout}>
        <article className="panel">
          <p className="eyebrow">New template</p>
          <h3>Snapshot an existing course</h3>
          <p className="subtle">Saving a template does not link it to the live course. Later course changes will not silently rewrite this snapshot.</p>
          <form action={saveCourseTemplate} className={styles.form}>
            <label>Source course
              <select name="sourceOfferingId" required defaultValue="">
                <option value="" disabled>Choose a course…</option>
                {offerings.map((offering) => <option key={offering.offeringId} value={offering.offeringId}>
                  {courseLabel(offering.courseName, offering.courseCode)} — {offering.schoolYearLabel}{offering.active ? "" : " (archived)"}
                </option>)}
              </select>
            </label>
            <label>Template name
              <input name="name" maxLength={120} required placeholder="e.g. Calculus Standard Configuration"/>
            </label>
            <label>Description <span className="optional">optional</span>
              <textarea name="description" maxLength={500} placeholder="What makes this template useful?"/>
            </label>
            <button className="primary-button" type="submit"><BookCopy size={17}/> Save Template Snapshot</button>
          </form>
        </article>

        <section>
          <div className="panel-header">
            <div><p className="eyebrow">Saved snapshots</p><h3>Your reusable templates</h3><p className="subtle">Use these from Create Course whenever you want a clean independent copy.</p></div>
            <span className="status success-pill">{templates.length} template{templates.length === 1 ? "" : "s"}</span>
          </div>
          <div className={styles.templateGrid}>
            {templates.length ? templates.map((template) => <article key={template.id} className={styles.templateCard}>
              <div className={styles.templateHeader}>
                <div><p className="eyebrow">Reusable snapshot</p><h3>{template.name}</h3><p className="subtle">Defaults to {courseLabel(template.defaultCourseName, template.defaultCourseCode)}</p></div>
                <BookCopy size={22}/>
              </div>
              {template.description ? <p>{template.description}</p> : null}
              <div className={styles.meta}>
                <span>{template.categoryCount} categories</span>
                <span>{template.assignmentTypeCount} assignment types</span>
                <span>{template.gradingPeriodCount} grading periods</span>
              </div>
              <div className={styles.templateFooter}>
                <span className="subtle">Snapshot remains independent from its source course.</span>
                <form action={deleteCourseTemplate}>
                  <input type="hidden" name="templateId" value={template.id}/>
                  <button className={styles.dangerButton} type="submit"><Trash2 size={15}/> Delete template</button>
                </form>
              </div>
            </article>) : <article className={`panel ${styles.empty}`}><BookCopy size={28}/><h3>No templates yet</h3><p className="subtle">Save one from a course you already teach, then reuse it in future years without carrying over classroom data.</p></article>}
          </div>
        </section>
      </div>
    </section>
  </main>;
}
