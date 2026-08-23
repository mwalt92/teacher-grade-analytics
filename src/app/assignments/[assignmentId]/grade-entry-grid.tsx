"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CircleEllipsis, TriangleAlert } from "lucide-react";
import { saveGradeEntry } from "./grade-entry-actions";

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

  function markMissing(studentId: string) {
    const existing = timers.current.get(studentId);
    if (existing) clearTimeout(existing);
    patchRow(studentId, { value: "0", points: 0, missing: true, saveState: "saving", error: undefined });
    void persist(studentId, "0", true);
  }

  return <div className="grade-entry-shell">
    <div className="grade-entry-summary">
      <div><strong>{savedCount}/{rows.length}</strong><span>entered</span></div>
      <div><strong>{missingCount}</strong><span>missing</span></div>
      <p>Scores autosave after you stop typing. A real score automatically clears Missing.</p>
    </div>
    <div className="grade-entry-table" role="table" aria-label="Grade entry">
      <div className="grade-entry-row grade-entry-head" role="row"><span>Student</span><span>Student #</span><span>Score</span><span>Status</span><span></span></div>
      {rows.map((row) => <div className={row.missing ? "grade-entry-row is-missing" : "grade-entry-row"} role="row" key={row.studentId}>
        <strong>{row.displayName}</strong>
        <span className="subtle-inline">{row.externalStudentKey ?? "—"}</span>
        <label className="score-field"><input aria-label={`Score for ${row.displayName}`} type="number" min="0" step="0.01" value={row.value} onChange={(event) => changeScore(row.studentId, event.target.value)} onBlur={() => row.value.trim() !== "" && void persist(row.studentId, row.value, false)}/><span>/ {pointsPossible}</span></label>
        <SaveBadge state={row.saveState} missing={row.missing}/>
        <button type="button" className={row.missing ? "missing-button active" : "missing-button"} onClick={() => markMissing(row.studentId)}><TriangleAlert size={15}/> Missing</button>
        {row.error ? <div className="row-save-error"><AlertCircle size={14}/>{row.error}</div> : null}
      </div>)}
    </div>
  </div>;
}

function SaveBadge({ state, missing }: { state: SaveState; missing: boolean }) {
  if (state === "saving") return <span className="row-save-state saving"><CircleEllipsis size={14}/> Saving…</span>;
  if (state === "error") return <span className="row-save-state error"><AlertCircle size={14}/> Error</span>;
  if (missing) return <span className="row-save-state missing"><TriangleAlert size={14}/> Missing · 0</span>;
  if (state === "saved") return <span className="row-save-state saved"><Check size={14}/> Saved</span>;
  return <span className="row-save-state idle">Not entered</span>;
}
