import Link from "next/link";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import styles from "./teacher-context-bar.module.css";

type SectionOption = {
  sectionId: string;
  sectionName: string;
  offeringId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
};

type ScopeConfig = {
  active: "section" | "all";
  sectionLabel: string;
  sectionHref: string;
  allLabel: string;
  allHref: string;
  ariaLabel: string;
};

export function TeacherContextBar({
  sections,
  activeSectionId,
  returnTo,
  scope,
}: {
  sections: SectionOption[];
  activeSectionId: string;
  returnTo: string;
  scope?: ScopeConfig;
}) {
  const active = sections.find((section) => section.sectionId === activeSectionId);
  const courseLabel = active
    ? active.courseCode && !active.courseName.toLowerCase().includes(active.courseCode.toLowerCase())
      ? `${active.courseName} ${active.courseCode}`
      : active.courseName
    : "Current course";

  return <div className={styles.shell}>
    <div className={styles.inner}>
      <div className={styles.identity}>
        <span>Working context</span>
        <strong>{courseLabel}</strong>
        {active ? <small>{active.schoolYearLabel}</small> : null}
      </div>
      <TeacherSectionSwitcher sections={sections} activeSectionId={activeSectionId} returnTo={returnTo} compact/>
      {scope ? <div className={styles.scopeGroup}>
        <span>View scope</span>
        <nav className={styles.scopeNav} aria-label={scope.ariaLabel}>
          <Link className={scope.active === "section" ? styles.scopeActive : styles.scopeLink} href={scope.sectionHref}>{scope.sectionLabel}</Link>
          <Link className={scope.active === "all" ? styles.scopeActive : styles.scopeLink} href={scope.allHref}>{scope.allLabel}</Link>
        </nav>
      </div> : null}
    </div>
  </div>;
}
