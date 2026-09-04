"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type StudentPrimaryNavProps = {
  preview?: boolean;
  dashboardHref?: string;
  studyLibraryHref?: string;
};

export function StudentPrimaryNav({
  preview = false,
  dashboardHref,
  studyLibraryHref,
}: StudentPrimaryNavProps = {}) {
  const pathname = usePathname();
  const items = [
    { label: "Dashboard", href: dashboardHref ?? (preview ? "/student/preview" : "/student") },
    { label: "Study Library", href: studyLibraryHref ?? (preview ? "/student/preview/study-library" : "/student/study-library") },
  ];

  const dashboardActive = preview
    ? pathname === "/student/preview" || pathname.startsWith("/student/preview/assignments/")
    : pathname === "/student" || pathname.startsWith("/student/assignments/");
  const studyActive = preview
    ? pathname === "/student/preview/study-library" || pathname.startsWith("/student/preview/study-library/")
    : pathname === "/student/study-library" || pathname.startsWith("/student/study-library/");

  return <nav className="main-nav" aria-label={preview ? "Previewed student navigation" : "Student navigation"}>
    {items.map((item) => {
      const active = item.label === "Dashboard" ? dashboardActive : studyActive;
      return <Link
        key={item.label}
        href={item.href}
        className={active ? "nav-button active" : "nav-button"}
        aria-current={active ? "page" : undefined}
      >
        {item.label}
      </Link>;
    })}
  </nav>;
}
