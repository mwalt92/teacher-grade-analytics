"use client";

import { setActiveTeacherSection } from "@/app/teacher-section-actions";

type TeacherSectionOption = {
  sectionId: string;
  sectionName: string;
  offeringId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
};

function courseLabel(section: TeacherSectionOption) {
  const course = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;
  return `${course} • ${section.schoolYearLabel}`;
}

export function TeacherSectionSwitcher({
  sections,
  activeSectionId,
  returnTo,
  compact = false,
}: {
  sections: TeacherSectionOption[];
  activeSectionId: string;
  returnTo: string;
  compact?: boolean;
}) {
  if (sections.length <= 1) return null;

  const grouped = new Map<string, { label: string; sections: TeacherSectionOption[] }>();
  for (const section of sections) {
    const key = section.offeringId;
    const group = grouped.get(key) ?? { label: courseLabel(section), sections: [] };
    group.sections.push(section);
    grouped.set(key, group);
  }

  return <form action={setActiveTeacherSection} style={{ marginTop: compact ? 0 : 12, width: compact ? "min(100%, 330px)" : "min(100%, 390px)" }}>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <label style={{ display: "grid", gap: 5, color: "var(--muted)", fontSize: ".72rem", fontWeight: 750 }}>
      <span>{compact ? "Course / section" : "Viewing course / section"}</span>
      <select
        name="sectionId"
        defaultValue={activeSectionId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Select teacher course and section"
        style={{ width: "100%", minHeight: compact ? 38 : 42, background: "var(--surface)", color: "var(--text)" }}
      >
        {[...grouped.entries()].map(([offeringId, group]) => (
          <optgroup key={offeringId} label={group.label}>
            {group.sections.map((section) => <option key={section.sectionId} value={section.sectionId}>{section.sectionName}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  </form>;
}
