"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CircleEllipsis, TriangleAlert } from "lucide-react";
import { saveGradeEntry } from "./grade-entry-actions";
import styles from "./grade-entry.module.css";

type StudentRow = {
  studentId: string;
  displayName: string;
  externalStudentKey: string | null;
  points: number | null;
  missing: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type LocalRow = StudentRow & { value: string; saveState: SaveState; error?: string };

export function GradeEntryGrid({ assignmentId, pointsPossible, students }: { assignmentId: string; pointsPossible: number; students: StudentRow[] }) {
  const [rows, setRows] = useState<LocalRow[]>(() => students.map((student) => ({ ...student, value: student.points == null ? "" : String(student.points), saveState: student.points == null && !student.missing ? "idle" : "saved" })));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scoreInputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);

  const savedCount = useMemo(() => rows.filter((row) => row.value !== "" || row.missing).length, [rows]);
  const missingCount = useMemo(() => rows.filter((row) => row.missing).length, [rows]);

  function patchRow(studentId: string, patch: Partial<LocalRow>) {
    setRows((current) => current.map((row) => row.studentId === studentId ? { ...row, ...patch } : row));
  }

  async function persist(studentId: string, value: string, missing: boolean) {
    const parsed = missing ? 0 : Number(value);
    if (!missing && (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0)) return;
    patchRow(studentId, { saveState: "saving", error: undefined });
    const result = await saveGradeEntry({ assignmentId, studentId, points: parsed, missing });
    if (!result.ok) {
      patchRow(studentId, { saveState: "error", error: result.error });
      return;
    }
    patchRow(studentId, { value: String(result.points), points: result.points, missing: result.missing, saveState: "saved", error: undefined });
  }

  function scheduleSave(studentId: string, value: string) {
    const existing = timers.current.get(studentId);
    if (existing) clearTimeout(existing);
    timers.current.set(studentId, setTimeout(() => void persist(studentId, value, false), 650));
  }

  function changeScore(studentId: string, value: string) {
    patchRow(studentId, { value, missing: false, saveState: value.trim() === "" ? "idle" : "saving", error: undefined });
    if (value.trim() !== "") scheduleSave(studentId, value);
  }

  function handleScoreKeyDown(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, row: LocalRow) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const existing = timers.current.get(row.studentId);
    if (existing) clearTimeout(existing);
    if (row.value.trim() !== "") void persist(row.studentId, row.value, false);
    const next = rows[rowIndex + 1];
    if (next) {
      requestAnimationFrame(() => {
        const input = scoreInputs.current.get(next.studentId);
        input?.focus();
        input?.select();
      });
    }
  }

  function markMissing(studentId: string) {
    const existing = timers.current.get(studentId);
    if (existing) clearTimeout(existing);
    patchRow(studentId, { value: "0", points: 0, missing: true, saveState: "saving", error: undefined });
    void persist(studentId, "0", true);
  }

  return <div className={styles.shell}>
    <div className={styles.summary}>
      <div><strong>{savedCount}/{rows.length}</strong><span>entered</span></div>
      <div><strong>{missingCount}</strong><span>missing</span></div>
      <p>Scores autosave after you stop typing. Press Enter to save and move to the next student. A real score automatically clears Missing.</p>
    </div>
    <div className={styles.table} role="table" aria-label="Grade entry">
      <div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Student #</span><span>Score</span><span>Status</span><span></span></div>
      {rows.map((row, rowIndex) => <div className={`${styles.row} ${row.missing ? styles.missingRow : ""}`} role="row" key={row.studentId}>
        <strong>{row.displayName}</strong>
        <span className={styles.muted}>{row.externalStudentKey ?? "—"}</span>
        <label className={styles.scoreField}><input ref={(element) => { if (element) scoreInputs.current.set(row.studentId, element); else scoreInputs.current.delete(row.studentId); }} aria-label={`Score for ${row.displayName}`} type="number" min="0" step="0.5" value={row.value} onChange={(event) => changeScore(row.studentId, event.target.value)} onKeyDown={(event) => handleScoreKeyDown(event, rowIndex, row)} onBlur={() => row.value.trim() !== "" && void persist(row.studentId, row.value, false)}/><span>/ {pointsPossible}</span></label>
        <SaveBadge state={row.saveState} missing={row.missing}/>
        <button type="button" className={`${styles.missingButton} ${row.missing ? styles.missingButtonActive : ""}`} onClick={() => markMissing(row.studentId)}><TriangleAlert size={15}/> Missing</button>
        {row.error ? <div className={styles.rowError}><AlertCircle size={14}/>{row.error}</div> : null}
      </div>)}
    </div>
  </div>;
}

function SaveBadge({ state, missing }: { state: SaveState; missing: boolean }) {
  if (state === "saving") return <span className={`${styles.saveState} ${styles.saving}`}><CircleEllipsis size={14}/> Saving…</span>;
  if (state === "error") return <span className={`${styles.saveState} ${styles.error}`}><AlertCircle size={14}/> Error</span>;
  if (missing) return <span className={`${styles.saveState} ${styles.missing}`}><TriangleAlert size={14}/> Missing · 0</span>;
  if (state === "saved") return <span className={`${styles.saveState} ${styles.saved}`}><Check size={14}/> Saved</span>;
  return <span className={`${styles.saveState} ${styles.idle}`}>Not entered</span>;
}