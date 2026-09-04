"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./assignment-navigator.module.css";

type AssignmentNavigatorItem = {
  key: string;
  label: string;
  href: string;
};

type AssignmentNavigatorProps = {
  items: AssignmentNavigatorItem[];
  currentKey: string;
  previousHref: string | null;
  nextHref: string | null;
};

export function AssignmentNavigator({ items, currentKey, previousHref, nextHref }: AssignmentNavigatorProps) {
  const router = useRouter();
  const current = items.find((item) => item.key === currentKey);

  return <nav className={styles.navigator} aria-label="Assignment navigation">
    {previousHref ? <Link className={styles.stepButton} href={previousHref} aria-label="Open previous assignment"><ChevronLeft size={17}/> Previous</Link> : <span className={`${styles.stepButton} ${styles.disabled}`} aria-hidden="true"><ChevronLeft size={17}/> Previous</span>}
    <label className={styles.assignmentSelect}>
      <span>Assignment</span>
      <select
        aria-label="Switch assignment"
        value={current?.href ?? ""}
        onChange={(event) => router.push(event.target.value)}
      >
        {items.map((item) => <option key={item.key} value={item.href}>{item.label}</option>)}
      </select>
    </label>
    {nextHref ? <Link className={styles.stepButton} href={nextHref} aria-label="Open next assignment">Next <ChevronRight size={17}/></Link> : <span className={`${styles.stepButton} ${styles.disabled}`} aria-hidden="true">Next <ChevronRight size={17}/></span>}
  </nav>;
}
