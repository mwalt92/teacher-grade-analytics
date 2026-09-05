"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type StudentPrimaryNavProps = {
  preview?: boolean;
  dashboardHref?: string;
  gradesHref?: string;
  simulatorHref?: string;
  studyLibraryHref?: string;
};

export function StudentPrimaryNav({
  preview = false,
  dashboardHref,
  gradesHref,
  simulatorHref,
  studyLibraryHref,
}: StudentPrimaryNavProps = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionId = searchParams.get("sectionId");
  const period = searchParams.get("period");

  function studentHref(base: string, includePeriod = true) {
    if (preview) return base;
    const params = new URLSearchParams();
    if (sectionId) params.set("sectionId", sectionId);
    if (includePeriod && period) params.set("period", period);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  const items = [
    { key: "dashboard", label: "Dashboard", href: dashboardHref ?? (preview ? "/student/preview" : studentHref("/student")) },
    { key: "grades", label: "Grades", href: gradesHref ?? (preview ? "/student/preview/grades" : studentHref("/student/grades")) },
    { key: "simulator", label: "Grade Simulator", href: simulatorHref ?? (preview ? "/student/preview/simulator" : studentHref("/student/simulator")) },
    { key: "study", label: "Study Library", href: studyLibraryHref ?? (preview ? "/student/preview/study-library" : studentHref("/student/study-library", false)) },
  ];

  const dashboardActive = preview
    ? pathname === "/student/preview" || pathname.startsWith("/student/preview/assignments/")
    : pathname === "/student" || pathname.startsWith("/student/assignments/");
  const gradesActive = preview
    ? pathname === "/student/preview/grades" || pathname.startsWith("/student/preview/grades/")
    : pathname === "/student/grades" || pathname.startsWith("/student/grades/");
  const simulatorActive = preview
    ? pathname === "/student/preview/simulator" || pathname.startsWith("/student/preview/simulator/")
    : pathname === "/student/simulator" || pathname.startsWith("/student/simulator/");
  const studyActive = preview
    ? pathname === "/student/preview/study-library" || pathname.startsWith("/student/preview/study-library/")
    : pathname === "/student/study-library" || pathname.startsWith("/student/study-library/");

  return <nav className="main-nav student-workspace-nav" aria-label={preview ? "Previewed student navigation" : "Student navigation"}>
    {items.map((item) => {
      const active = item.key === "dashboard"
        ? dashboardActive
        : item.key === "grades"
          ? gradesActive
          : item.key === "simulator"
            ? simulatorActive
            : studyActive;
      return <Link
        key={item.key}
        href={item.href}
        className={active ? "nav-button active" : "nav-button"}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
      </Link>;
    })}
  </nav>;
}
