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

  return <form className="teacher-section-switcher" action={setActiveTeacherSection}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label>
      <span>Course / section</span>
      <select
        name="sectionId"
        value={activeSectionId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Select teacher course and section"
      >
        {sections.map((section) => <option key={section.sectionId} value={section.sectionId}>{optionLabel(section)}</option>)}
      </select>
    </label>
  </form>;
}
