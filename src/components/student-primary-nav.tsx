"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type StudentPrimaryNavProps = {
  preview?: boolean;
  dashboardHref?: string;
  gradesHref?: string;
  studyLibraryHref?: string;
};

export function StudentPrimaryNav({
  preview = false,
  dashboardHref,
  gradesHref,
  studyLibraryHref,
}: StudentPrimaryNavProps = {}) {
  const pathname = usePathname();
  const items = [
    { key: "dashboard", label: "Dashboard", href: dashboardHref ?? (preview ? "/student/preview" : "/student") },
    { key: "grades", label: "Grades", href: gradesHref ?? (preview ? "/student/preview/grades" : "/student/grades") },
    { key: "study", label: "Study Library", href: studyLibraryHref ?? (preview ? "/student/preview/study-library" : "/student/study-library") },
  ];

  const dashboardActive = preview
    ? pathname === "/student/preview" || pathname.startsWith("/student/preview/assignments/")
    : pathname === "/student" || pathname.startsWith("/student/assignments/");
  const gradesActive = preview
    ? pathname === "/student/preview/grades" || pathname.startsWith("/student/preview/grades/")
    : pathname === "/student/grades" || pathname.startsWith("/student/grades/");
  const studyActive = preview
    ? pathname === "/student/preview/study-library" || pathname.startsWith("/student/preview/study-library/")
    : pathname === "/student/study-library" || pathname.startsWith("/student/study-library/");

  return <nav className="main-nav" aria-label={preview ? "Previewed student navigation" : "Student navigation"}>
    {items.map((item) => {
      const active = item.key === "dashboard" ? dashboardActive : item.key === "grades" ? gradesActive : studyActive;
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
