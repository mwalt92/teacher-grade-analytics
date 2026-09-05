"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { StudentPrimaryNav } from "@/components/student-primary-nav";

type NavItem = {
  label: string;
  href: string;
  matchPath: string;
  rootLevel?: boolean;
};

const items: NavItem[] = [
  { label: "Courses", href: "/", matchPath: "/", rootLevel: true },
  { label: "Course Dashboard", href: "/dashboard", matchPath: "/dashboard" },
  { label: "Students", href: "/students", matchPath: "/students" },
  { label: "Assignments", href: "/assignments", matchPath: "/assignments" },
  { label: "Study Library", href: "/study-library", matchPath: "/study-library" },
  { label: "Gradebook", href: "/gradebook", matchPath: "/gradebook" },
  { label: "Analytics", href: "/analytics", matchPath: "/analytics" },
  { label: "Settings", href: "/settings?area=course-sections", matchPath: "/settings", rootLevel: true },
];

function isActive(pathname: string, matchPath: string) {
  if (matchPath === "/") return pathname === "/" || pathname === "/home";
  return pathname === matchPath || pathname.startsWith(`${matchPath}/`);
}

export function TeacherPrimaryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inStudentPreview = pathname === "/student/preview" || pathname.startsWith("/student/preview/");
  const inRootWorkspace = pathname === "/" || pathname === "/home" || pathname === "/settings" || pathname.startsWith("/settings/");
  const visibleItems = inRootWorkspace ? items.filter((item) => item.rootLevel) : items;

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
  const simulatorParams = new URLSearchParams(previewBase);
  if (period) simulatorParams.set("period", period);
  const dashboardQuery = dashboardParams.toString();
  const gradesQuery = gradesParams.toString();
  const simulatorQuery = simulatorParams.toString();
  const studyQuery = previewBase.toString();
  const dashboardHref = dashboardQuery ? `/student/preview?${dashboardQuery}` : "/student/preview";
  const gradesHref = gradesQuery ? `/student/preview/grades?${gradesQuery}` : "/student/preview/grades";
  const simulatorHref = simulatorQuery ? `/student/preview/simulator?${simulatorQuery}` : "/student/preview/simulator";
  const studyLibraryHref = studyQuery ? `/student/preview/study-library?${studyQuery}` : "/student/preview/study-library";

  return <>
    <nav className="main-nav" aria-label="Teacher navigation">
      {visibleItems.map((item) => {
        const active = isActive(pathname, item.matchPath);
        return <Link
          key={item.matchPath}
          href={item.href}
          className={active ? "nav-button active" : "nav-button"}
          aria-current={active ? "page" : undefined}
        >
          {item.label}
        </Link>;
      })}
    </nav>
    {inStudentPreview ? <StudentPrimaryNav preview dashboardHref={dashboardHref} gradesHref={gradesHref} simulatorHref={simulatorHref} studyLibraryHref={studyLibraryHref}/> : null}
  </>;
}
