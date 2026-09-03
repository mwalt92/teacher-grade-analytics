"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Dashboard", href: "/student" },
  { label: "Study Library", href: "/student/study-library" },
];

function isActive(pathname: string, href: string) {
  if (href === "/student") {
    return pathname === "/student" || pathname.startsWith("/student/assignments/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudentPrimaryNav() {
  const pathname = usePathname();

  return <nav className="main-nav" aria-label="Student navigation">
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
  </nav>;
}
