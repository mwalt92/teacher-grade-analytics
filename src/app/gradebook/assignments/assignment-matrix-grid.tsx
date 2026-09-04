"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveGradeEntry } from "@/app/assignments/[assignmentId]/grade-entry-actions";
import { calculateGrade } from "@/lib/grading/engine";
import type { GradeRecord, GradingRules } from "@/lib/grading/types";
import type { AssignmentMatrixAssignment, AssignmentMatrixCell, AssignmentMatrixStudent } from "@/lib/data/assignment-matrix";
import styles from "./assignment-matrix.module.css";

type RosterStudent = { studentId: string; displayName: string; email: string | null };
type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  assignments: AssignmentMatrixAssignment[];
  students: AssignmentMatrixStudent[];
  roster: RosterStudent[];
  rules: GradingRules;
  periodCode: string;
  sectionId: string;
  returnTo: string;
};

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function categoryLabel(category: AssignmentMatrixAssignment["category"], rules: GradingRules) {
  return rules.categoryLabels?.[category] ?? category;
}

function keyFor(studentId: string, assignmentId: string) {
  return `${studentId}:${assignmentId}`;
}

function recomputeStudent(student: AssignmentMatrixStudent, assignments: AssignmentMatrixAssignment[], rules: GradingRules, periodCode: string) {
  const records: GradeRecord[] = assignments.map((assignment) => {
    const cell = student.cells[assignment.id];
    return {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      assignmentDate: assignment.assignmentDate,
      gradingPeriodCode: periodCode,
      category: assignment.category,
      pointsPossible: assignment.pointsPossible,
      missing: cell?.missing ?? false,
      exempt: cell?.exempt ?? false,
      attempts: (cell?.attempts ?? []).map((attempt) => ({
        id: attempt.id,
        earned: attempt.earned,
        possible: assignment.pointsPossible,
        attemptNumber: attempt.attemptNumber,
        occurredAt: assignment.assignmentDate,
      })),
    };
  });

  const result = calculateGrade(records, rules);
  const nextCells = { ...student.cells };
  for (const line of result.audit) {
    const assignment = assignments.find((item) => item.id === line.assignmentId);
    if (!assignment) continue;
    const previous = nextCells[line.assignmentId];
    const selectedAttempt = line.countedAttemptId ? line.attempts.find((attempt) => attempt.attemptId === line.countedAttemptId) ?? null : null;
    const attemptOne = line.attempts.find((attempt) => attempt.attemptNumber === 1) ?? null;
    nextCells[line.assignmentId] = {
      assignmentId: line.assignmentId,
      status: line.status,
      missing: line.missing,
      exempt: line.exempt,
      earned: selectedAttempt?.earned ?? null,
      attemptOneEarned: attemptOne?.earned ?? null,
      possible: assignment.pointsPossible,
      percent: line.percent,
      countedAttemptNumber: line.countedAttemptNumber,
      attemptCount: line.attempts.length,
      attempts: line.attempts.map((attempt) => ({ id: attempt.attemptId, attemptNumber: attempt.attemptNumber, earned: attempt.earned })),
      ...(previous ? {} : null),
    } as AssignmentMatrixCell;
  }
  return { ...student, cells: nextCells };
}

export function AssignmentMatrixGrid({ assignments, students: initialStudents, roster, rules, periodCode, sectionId, returnTo }: Props) {
  const [students, setStudents] = useState(initialStudents);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const studentsRef = useRef(students);

  useEffect(() => { studentsRef.current = students; }, [students]);
  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const rosterById = useMemo(() => new Map(roster.map((student) => [student.studentId, student])), [roster]);
  const totals = useMemo(() => {
    const next = { entered: 0, missing: 0, dropped: 0, exempt: 0, unentered: 0 };
    for (const student of students) {
      for (const assignment of assignments) {
        const cell = student.cells[assignment.id];
        if (!cell) continue;
        if (cell.missing) next.missing += 1;
        if (cell.status === "dropped") next.dropped += 1;
        if (cell.status === "exempt") next.exempt += 1;
        else if (cell.status === "unentered") next.unentered += 1;
        else if (!cell.missing) next.entered += 1;
      }
    }
    return next;
  }, [assignments, students]);

  function clearTimer(cellKey: string) {
    const timer = timers.current.get(cellKey);
    if (timer) clearTimeout(timer);
    timers.current.delete(cellKey);
  }

  function applySavedAttemptOne(studentId: string, assignmentId: string, points: number, missing: boolean) {
    setStudents((current) => {
      const next = current.map((student) => {
        if (student.studentId !== studentId) return student;
        const oldCell = student.cells[assignmentId];
        if (!oldCell) return student;
        const existingOne = oldCell.attempts.find((attempt) => attempt.attemptNumber === 1);
        const attemptOne = { id: existingOne?.id ?? `inline-${studentId}-${assignmentId}-1`, attemptNumber: 1, earned: points };
        const updated: AssignmentMatrixStudent = {
          ...student,
          cells: {
            ...student.cells,
            [assignmentId]: {
              ...oldCell,
              missing,
              exempt: false,
              attemptOneEarned: points,
              attempts: [attemptOne, ...oldCell.attempts.filter((attempt) => attempt.attemptNumber !== 1)].sort((a, b) => a.attemptNumber - b.attemptNumber),
            },
          },
        };
        return recomputeStudent(updated, assignments, rules, periodCode);
      });
      studentsRef.current = next;
      return next;
    });
  }

  async function persist(studentId: string, assignmentId: string, value: string, missing: boolean) {
    const cellKey = keyFor(studentId, assignmentId);
    const parsed = missing ? 0 : Number(value);
    if (!missing && (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0)) return false;
    clearTimer(cellKey);
    setSaveStates((current) => ({ ...current, [cellKey]: "saving" }));
    setErrors((current) => ({ ...current, [cellKey]: undefined }));
    const result = await saveGradeEntry({ assignmentId, studentId, points: parsed, missing });
    if (!result.ok) {
      setSaveStates((current) => ({ ...current, [cellKey]: "error" }));
      setErrors((current) => ({ ...current, [cellKey]: result.error }));
      return false;
    }
    applySavedAttemptOne(studentId, assignmentId, result.points, result.missing);
    setDrafts((current) => ({ ...current, [cellKey]: String(result.points) }));
    setSaveStates((current) => ({ ...current, [cellKey]: "saved" }));
    return true;
  }

  function scheduleSave(studentId: string, assignmentId: string, value: string) {
    const cellKey = keyFor(studentId, assignmentId);
    clearTimer(cellKey);
    timers.current.set(cellKey, setTimeout(() => {
      timers.current.delete(cellKey);
      void persist(studentId, assignmentId, value, false);
    }, 650));
  }

  function changeScore(studentId: string, assignmentId: string, value: string) {
    const cellKey = keyFor(studentId, assignmentId);
    setDrafts((current) => ({ ...current, [cellKey]: value }));
    setSaveStates((current) => ({ ...current, [cellKey]: value.trim() ? "saving" : "idle" }));
    setErrors((current) => ({ ...current, [cellKey]: undefined }));
    if (value.trim()) scheduleSave(studentId, assignmentId, value);
    else clearTimer(cellKey);
  }

  function moveDown(assignmentId: string, rowIndex: number) {
    const nextStudent = studentsRef.current[rowIndex + 1];
    if (!nextStudent) return;
    requestAnimationFrame(() => {
      const input = inputs.current.get(keyFor(nextStudent.studentId, assignmentId));
      input?.focus();
      input?.select();
    });
  }

  return <>
    <section className={`metric-grid ${styles.metrics}`} aria-label="Assignment matrix summary">
      <article className="metric-card"><span className="metric-label">Assignments shown</span><strong>{assignments.length}</strong></article>
      <article className="metric-card"><span className="metric-label">Entered scores</span><strong>{totals.entered}</strong></article>
      <article className="metric-card"><span className="metric-label">Missing</span><strong>{totals.missing}</strong></article>
      <article className="metric-card"><span className="metric-label">Unentered</span><strong>{totals.unentered}</strong></article>
      <article className="metric-card"><span className="metric-label">Dropped</span><strong>{totals.dropped}</strong></article>
    </section>

    <div className={styles.legend} aria-label="Gradebook status legend">
      <span><i className={styles.legendMissing}/> Missing</span>
      <span><i className={styles.legendDropped}/> Dropped</span>
      <span><i className={styles.legendBest}/> Multiple attempts / best counts</span>
      <span><i className={styles.legendExempt}/> Exempt</span>
      <span className={styles.inlineHint}>Edit Attempt 1 directly • Enter saves and moves down</span>
    </div>

    <div className={styles.matrixScroll}>
      <table className={styles.matrix}>
        <thead><tr>
          <th className={styles.studentHeader}>Student</th>
          {assignments.map((assignment) => <th key={assignment.id}>
            <Link className={styles.assignmentHeader} href={`/assignments/${assignment.id}?returnTo=${encodeURIComponent(returnTo)}`}>
              <strong>{assignment.title}</strong>
              <span>{categoryLabel(assignment.category, rules)} • {shortDate(assignment.assignmentDate)}</span>
              <span>{assignment.pointsPossible} pts{assignment.allowRetakes ? " • retakes" : ""}</span>
            </Link>
          </th>)}
        </tr></thead>
        <tbody>
          {students.map((studentRow, rowIndex) => {
            const student = rosterById.get(studentRow.studentId);
            if (!student) return null;
            const profileParams = new URLSearchParams({ sectionId, period: periodCode, returnTo });
            return <tr key={studentRow.studentId}>
              <th scope="row" className={styles.studentCell}><Link href={`/students/${student.studentId}?${profileParams.toString()}`}><strong>{student.displayName}</strong>{student.email ? <small>{student.email}</small> : null}</Link></th>
              {assignments.map((assignment) => {
                const cell = studentRow.cells[assignment.id];
                if (!cell) return <td key={assignment.id} className={styles.unenteredCell}>—</td>;
                const cellKey = keyFor(studentRow.studentId, assignment.id);
                const classNames = [styles.scoreCell];
                if (cell.missing) classNames.push(styles.missingCell);
                if (cell.status === "dropped") classNames.push(styles.droppedCell);
                if (cell.status === "exempt") classNames.push(styles.exemptCell);
                if (cell.status === "unentered") classNames.push(styles.unenteredCell);
                if (cell.attemptCount > 1) classNames.push(styles.bestCell);
                const value = drafts[cellKey] ?? (cell.attemptOneEarned == null ? "" : String(cell.attemptOneEarned));
                const state = saveStates[cellKey] ?? "idle";
                return <td key={assignment.id} className={classNames.join(" ")}>
                  <div className={styles.inlineCell}>
                    {cell.exempt ? <div className={styles.exemptInline}><strong>Exempt</strong><small>Open assignment to change</small></div> : <>
                      <div className={styles.inputRow}>
                        <input
                          ref={(node) => { if (node) inputs.current.set(cellKey, node); else inputs.current.delete(cellKey); }}
                          className={styles.scoreInput}
                          type="number"
                          min="0"
                          step="0.5"
                          value={value}
                          placeholder="—"
                          aria-label={`Attempt 1 score for ${student.displayName} on ${assignment.title}`}
                          onChange={(event) => changeScore(studentRow.studentId, assignment.id, event.target.value)}
                          onBlur={() => { if (value.trim()) void persist(studentRow.studentId, assignment.id, value, false); }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            clearTimer(cellKey);
                            void (async () => {
                              const ok = value.trim() ? await persist(studentRow.studentId, assignment.id, value, false) : true;
                              if (ok) moveDown(assignment.id, rowIndex);
                            })();
                          }}
                        />
                        <span className={styles.possible}>/ {assignment.pointsPossible}</span>
                        <button
                          type="button"
                          className={`${styles.missingButton} ${cell.missing ? styles.missingButtonActive : ""}`}
                          title={cell.missing ? "Clear Missing flag; the stored 0 remains" : "Set score to 0 and mark Missing"}
                          onClick={() => {
                            clearTimer(cellKey);
                            const nextMissing = !cell.missing;
                            setDrafts((current) => ({ ...current, [cellKey]: "0" }));
                            void persist(studentRow.studentId, assignment.id, "0", nextMissing);
                          }}
                        >M</button>
                      </div>
                      <div className={styles.cellMeta}>
                        <span>{cell.percent == null ? "—" : `${cell.percent.toFixed(1)}%`}</span>
                        {cell.status === "dropped" ? <span className={styles.droppedBadge}>Dropped</span> : null}
                        {cell.attemptCount > 1 ? <span className={styles.bestBadge}>Best A{cell.countedAttemptNumber ?? "?"} / {cell.attemptCount}</span> : null}
                        {state === "saving" ? <span className={styles.saving}>Saving…</span> : state === "saved" ? <span className={styles.saved}>Saved</span> : state === "error" ? <span className={styles.error}>Save failed</span> : null}
                      </div>
                      {errors[cellKey] ? <small className={styles.errorText}>{errors[cellKey]}</small> : null}
                    </>}
                  </div>
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </>;
}
