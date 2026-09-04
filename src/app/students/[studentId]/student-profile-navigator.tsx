"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./student-profile.module.css";

type StudentNavigatorItem = {
  studentId: string;
  displayName: string;
  href: string;
};

type StudentProfileNavigatorProps = {
  students: StudentNavigatorItem[];
  currentStudentId: string;
  previousHref: string | null;
  nextHref: string | null;
};

export function StudentProfileNavigator({ students, currentStudentId, previousHref, nextHref }: StudentProfileNavigatorProps) {
  const router = useRouter();
  const current = students.find((student) => student.studentId === currentStudentId);

  return <nav className={styles.navigator} aria-label="Student profile navigation">
    {previousHref ? <Link className={styles.stepButton} href={previousHref}><ChevronLeft size={17}/> Previous student</Link> : <span className={`${styles.stepButton} ${styles.disabled}`} aria-hidden="true"><ChevronLeft size={17}/> Previous student</span>}
    <label className={styles.studentSelect}>
      <span>Student</span>
      <select aria-label="Switch student profile" value={current?.href ?? ""} onChange={(event) => router.push(event.target.value)}>
        {students.map((student) => <option key={student.studentId} value={student.href}>{student.displayName}</option>)}
      </select>
    </label>
    {nextHref ? <Link className={styles.stepButton} href={nextHref}>Next student <ChevronRight size={17}/></Link> : <span className={`${styles.stepButton} ${styles.disabled}`} aria-hidden="true">Next student <ChevronRight size={17}/></span>}
  </nav>;
}
