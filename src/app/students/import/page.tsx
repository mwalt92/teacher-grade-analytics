import { redirect } from "next/navigation";
import { FileSpreadsheet, MailCheck } from "lucide-react";
import { StudentsWorkspaceNav } from "@/components/students-workspace-nav";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { EmailReconciliation } from "../email-reconciliation";
import { RosterImportPreview } from "../roster-import-preview";

export default async function StudentsImportPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");

  const offeringSections = sections
    .filter((item) => item.offeringId === section.offeringId)
    .sort((a, b) =>
      (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
      || a.sortOrder - b.sortOrder
      || a.sectionName.localeCompare(b.sectionName));

  const orderedImportSections = [
    ...offeringSections,
    ...sections.filter((item) => item.offeringId !== section.offeringId),
  ];
  const sectionOptions = orderedImportSections.map((item) => ({
    id: item.sectionId,
    label: `${item.courseCode ? `${item.courseName} ${item.courseCode}` : item.courseName} — ${item.sectionName}`,
  }));

  const emailRosters = await Promise.all(offeringSections.map(async (item) => ({
    section: item,
    roster: await getSectionRoster(item.sectionId, "active"),
  })));
  const courseLabel = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;
  const returnTo = "/students/import";

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Students</p>
        <h1>Import Center</h1>
        <p className="subtle">{courseLabel} • roster imports and account-linking preparation</p>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <TeacherContextBar sections={sections} activeSectionId={section.sectionId} returnTo={returnTo}/>
    <StudentsWorkspaceNav active="import"/>

    <section className="content-wrap">
      <article className="panel full-width import-card-live">
        <div className="panel-header">
          <div>
            <p className="eyebrow">PowerSchool roster import</p>
            <h2>Upload once, review, then map sections</h2>
            <p className="subtle">Upload a multi-course .xlsx export, preview every detected course, and explicitly choose the destination website section before any enrollment changes are committed. Destination choices can include any section you teach.</p>
          </div>
          <FileSpreadsheet size={26}/>
        </div>
        <RosterImportPreview sectionId={section.sectionId} sections={sectionOptions}/>
      </article>

      <article className="panel full-width import-card-live">
        <div className="panel-header">
          <div>
            <p className="eyebrow">School account linking</p>
            <h2>Reconcile student emails by class period</h2>
            <p className="subtle">Email reconciliation below follows the course in your working context. Switch courses above when you need to prepare student accounts for another course.</p>
          </div>
          <MailCheck size={26}/>
        </div>
      </article>

      {emailRosters.map(({ section: emailSection, roster }) => <article className="panel full-width import-card-live" key={emailSection.sectionId}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Email reconciliation • {emailSection.sectionName}</p>
            <h2>{emailSection.sectionName}</h2>
            <p className="subtle">{roster.length} active {roster.length === 1 ? "student" : "students"}{emailSection.periodNumber != null ? ` • Period ${emailSection.periodNumber}` : ""}</p>
          </div>
        </div>
        <EmailReconciliation
          sectionId={emailSection.sectionId}
          students={roster.map((student) => ({
            displayName: student.displayName,
            studentNumber: student.externalStudentKey ?? "",
            currentEmail: student.email,
          }))}
        />
      </article>)}
    </section>
  </main>;
}
