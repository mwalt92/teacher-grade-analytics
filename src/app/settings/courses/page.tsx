import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ClipboardPlus, Home, RotateCcw } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getTeacherCourseLifecycleOfferings } from "@/lib/data/course-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { CourseLifecycleList } from "./course-lifecycle-list";
import styles from "./course-lifecycle.module.css";

type PageProps = {
  searchParams: Promise<{ view?: string | string[]; message?: string | string[]; error?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CourseLibraryPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) redirect("/student");

  const params = await searchParams;
  const view: "active" | "archived" = firstParam(params.view) === "archived" ? "archived" : "active";
  const message = firstParam(params.message);
  const error = firstParam(params.error);
  const offerings = await getTeacherCourseLifecycleOfferings();
  const activeOfferings = offerings.filter((offering) => offering.active);
  const archivedOfferings = offerings.filter((offering) => !offering.active);
  const visibleOfferings = view === "archived" ? archivedOfferings : activeOfferings;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Course Library</h1>
        <p className="subtle">{profile.display_name} • active teaching courses and preserved historical courses</p>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className="content-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Course lifecycle</p>
          <h2>Archive without deleting history</h2>
          <p className="subtle">Archived courses leave Teacher Home and everyday course switching while keeping their sections, rosters, assignments, grades, attempts, and analytics intact.</p>
        </div>
        <div className={styles.pageActions}>
          <Link className="secondary-link" href="/"><Home size={17}/> Teacher Home</Link>
          <Link className="primary-button" href="/settings/course-setup"><ClipboardPlus size={17}/> Create Course</Link>
        </div>
      </div>

      {message ? <div className={`import-message success ${styles.message}`}><strong>{message}</strong></div> : null}
      {error ? <div className={`import-message error ${styles.message}`}><strong>{error}</strong></div> : null}

      <nav className={styles.tabs} aria-label="Course lifecycle filter">
        <Link className={view === "active" ? styles.tabActive : styles.tab} href="/settings/courses">Active Courses ({activeOfferings.length})</Link>
        <Link className={view === "archived" ? styles.tabActive : styles.tab} href="/settings/courses?view=archived">Archived Courses ({archivedOfferings.length})</Link>
      </nav>

      <article className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{view === "active" ? "Everyday teaching" : "Historical courses"}</p>
            <h3>{view === "active" ? "Active courses" : "Archived courses"}</h3>
            <p className="subtle">{view === "active" ? "These courses appear on Teacher Home and in course switching." : "Restore a course whenever you need it back in active teaching workflows."}</p>
          </div>
          <span className="status success-pill">{view === "active" ? <><RotateCcw size={14}/> Ready</> : <><Archive size={14}/> History preserved</>}</span>
        </div>
      </article>

      <CourseLifecycleList offerings={visibleOfferings} view={view}/>
    </section>
  </main>;
}
