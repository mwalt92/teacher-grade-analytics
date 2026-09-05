"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { StudentPrimaryNav } from "@/components/student-primary-nav";

const items = [
  { label: "Courses", href: "/" },
  { label: "Course Dashboard", href: "/dashboard" },
  { label: "Students", href: "/students" },
  { label: "Assignments", href: "/assignments" },
  { label: "Study Library", href: "/study-library" },
  { label: "Gradebook", href: "/gradebook" },
  { label: "Analytics", href: "/analytics" },
  { label: "Settings", href: "/settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TeacherPrimaryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inStudentPreview = pathname === "/student/preview" || pathname.startsWith("/student/preview/");

  const previewBase = new URLSearchParams();
  for (const key of ["studentId", "sectionId", "anchorSectionId"]) {
    const value = searchParams.get(key);
    if (value) previewBase.set(key, value);
  }
  const dashboardParams = new URLSearchParams(previewBase);
  if (previewBase.get("sectionId")) dashboardParams.set("view", "course");
  else dashboardParams.set("view", "courses");
  const period = searchParams.get("period");
  if (period) dashboardParams.set("period", period);
  const gradesParams = new URLSearchParams(previewBase);
  if (period) gradesParams.set("period", period);
  const dashboardQuery = dashboardParams.toString();
  const gradesQuery = gradesParams.toString();
  const studyQuery = previewBase.toString();
  const dashboardHref = dashboardQuery ? `/student/preview?${dashboardQuery}` : "/student/preview";
  const gradesHref = gradesQuery ? `/student/preview/grades?${gradesQuery}` : "/student/preview/grades";
  const studyLibraryHref = studyQuery ? `/student/preview/study-library?${studyQuery}` : "/student/preview/study-library";

  return <>
    <nav className="main-nav" aria-label="Teacher navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return <Link
          key={item.href}
          href={item.href}
          className={active ? "nav-button active" : "nav-button"}
          aria-current={active ? "page" : undefined}
        >
          {item.label}
        </Link>;
      })}
    </nav>
    {inStudentPreview ? <StudentPrimaryNav preview dashboardHref={dashboardHref} gradesHref={gradesHref} studyLibraryHref={studyLibraryHref}/> : null}
  </>;
}
