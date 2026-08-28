"use client";

import { setActiveTeacherSection } from "@/app/teacher-section-actions";

type TeacherSectionOption = {
  sectionId: string;
  sectionName: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
};

function optionLabel(section: TeacherSectionOption) {
  const course = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;
  return `${course} — ${section.sectionName}`;
}

export function TeacherSectionSwitcher({
  sections,
  activeSectionId,
  returnTo,
}: {
  sections: TeacherSectionOption[];
  activeSectionId: string;
  returnTo: string;
}) {
  if (sections.length <= 1) return null;

  return <form action={setActiveTeacherSection} style={{ display: "flex", alignItems: "center" }}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label style={{ display: "grid", gap: 3, color: "var(--muted)", fontSize: ".7rem", fontWeight: 750 }}>
      <span>Course / section</span>
      <select
        name="sectionId"
        defaultValue={activeSectionId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Select teacher course and section"
        style={{ minWidth: 245, background: "var(--surface)", color: "var(--text)" }}
      >
        {sections.map((section) => <option key={section.sectionId} value={section.sectionId}>{optionLabel(section)}</option>)}
      </select>
    </label>
  </form>;
}
