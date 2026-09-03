"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Home", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
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

  return <nav className="main-nav" aria-label="Teacher navigation">
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