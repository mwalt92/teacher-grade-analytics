"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CircleEllipsis, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { clearGradeEntry, saveGradeEntry } from "./grade-entry-actions";
import styles from "./grade-entry.module.css";

type StudentRow = {
  studentId: string;
  displayName: string;
  externalStudentKey: string | null;
  points: number | null;
  missing: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type LocalRow = StudentRow & { value: string; savedMissing: boolean; saveState: SaveState; error?: string };
type Snapshot = { studentId: string; points: number | null; missing: boolean };
type UndoAction = { label: string; rows: Snapshot[] };

export function GradeEntryGrid({ assignmentId, pointsPossible, students }: { assignmentId: string; pointsPossible: number; students: StudentRow[] }) {
  const [rows, setRows] = useState<LocalRow[]>(() => students.map((student) => ({ ...student, value: student.points == null ? "" : String(student.points), savedMissing: student.missing, saveState: student.points == null && !student.missing ? "idle" : "saved" })));
  const [bulkScore, setBulkScore] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const rowsRef = useRef(rows);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scoreInputs = useRef(new Map<string, HTMLInputElement>());
  const inFlight = useRef(new Map<string, string>());

  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => () => timers.current.forEach((timer) => clearTimeout(timer)), []);
  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return;
      if (!undoStack.length || bulkBusy) return;
      event.preventDefault();
      void undoLast();
    }
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoStack, bulkBusy]);

  const savedCount = useMemo(() => rows.filter((row) => row.points != null || row.savedMissing).length, [rows]);
  const missingCount = useMemo(() => rows.filter((row) => row.savedMissing).length, [rows]);
  const lastUndo = undoStack.at(-1);

  function patchRow(studentId: string, patch: Partial<LocalRow>) {
    setRows((current) => {
      const next = current.map((row) => row.studentId === studentId ? { ...row, ...patch } : row);
      rowsRef.current = next;
      return next;
    });
  }

  function pushUndo(action: UndoAction) {
    if (!action.rows.length) return;
    setUndoStack((current) => [...current.slice(-19), action]);
  }

  function clearTimer(studentId: string) {
    const existing = timers.current.get(studentId);
    if (existing) clearTimeout(existing);
    timers.current.delete(studentId);
  }

  async function persist(studentId: string, value: string, missing: boolean, recordUndo = true) {
    const parsed = missing ? 0 : Number(value);
    if (!missing && (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0)) return false;
    const current = rowsRef.current.find((row) => row.studentId === studentId);
    if (!current) return false;
    const previous: Snapshot = { studentId, points: current.points, missing: current.savedMissing };
    if (previous.points === parsed && previous.missing === missing) {
      patchRow(studentId, { value: String(parsed), missing, savedMissing: missing, saveState: "saved", error: undefined });
      return true;
    }

    const signature = `${parsed}|${missing}`;
    if (inFlight.current.get(studentId) === signature) return true;
    inFlight.current.set(studentId, signature);
    patchRow(studentId, { saveState: "saving", error: undefined });
    const result = await saveGradeEntry({ assignmentId, studentId, points: parsed, missing });
    if (inFlight.current.get(studentId) === signature) inFlight.current.delete(studentId);
    if (!result.ok) {
      patchRow(studentId, { saveState: "error", error: result.error });
      return false;
    }
    patchRow(studentId, { value: String(result.points), points: result.points, missing: result.missing, savedMissing: result.missing, saveState: "saved", error: undefined });
    if (recordUndo) pushUndo({ label: `Edit ${current.displayName}`, rows: [previous] });
    return true;
  }

  function scheduleSave(studentId: string, value: string) {
    clearTimer(studentId);
    timers.current.set(studentId, setTimeout(() => {
      timers.current.delete(studentId);
      void persist(studentId, value, false);
    }, 650));
  }

  function changeScore(studentId: string, value: string) {
    patchRow(studentId, { value, missing: false, saveState: value.trim() === "" ? "idle" : "saving", error: undefined });
    if (value.trim() !== "") scheduleSave(studentId, value);
    else clearTimer(studentId);
  }

  function handleBlur(row: LocalRow) {
    clearTimer(row.studentId);
    if (row.value.trim() !== "") void persist(row.studentId, row.value, false);
  }

  function handleScoreKeyDown(event: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, row: LocalRow) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimer(row.studentId);
    if (row.value.trim() !== "") void persist(row.studentId, row.value, false);
    const next = rowsRef.current[rowIndex + 1];
    if (next) requestAnimationFrame(() => {
      const input = scoreInputs.current.get(next.studentId);
      input?.focus();
      input?.select();
    });
  }

  function markMissing(studentId: string) {
    clearTimer(studentId);
    patchRow(studentId, { value: "0", missing: true, saveState: "saving", error: undefined });
    void persist(studentId, "0", true);
  }

  async function applyBulk(kind: "full" | "score" | "missing") {
    if (bulkBusy) return;
    const numericBulk = Number(bulkScore);
    if (kind === "score" && (bulkScore.trim() === "" || !Number.isFinite(numericBulk) || numericBulk < 0)) {
      setBulkMessage("Enter a valid non-negative score first.");
      return;
    }

    const currentRows = rowsRef.current;
    const targets = kind === "missing"
      ? currentRows.filter((row) => row.value.trim() === "" && row.points == null && !row.savedMissing)
      : currentRows;
    if (!targets.length) {
      setBulkMessage(kind === "missing" ? "There are no remaining blanks." : "No students to update.");
      return;
    }

    const desiredPoints = kind === "full" ? pointsPossible : kind === "score" ? numericBulk : 0;
    const desiredMissing = kind === "missing";
    const changedTargets = targets.filter((row) => row.points !== desiredPoints || row.savedMissing !== desiredMissing);
    if (!changedTargets.length) {
      setBulkMessage("Those grades already match this bulk action.");
      return;
    }

    const snapshots = new Map(changedTargets.map((row) => [row.studentId, { studentId: row.studentId, points: row.points, missing: row.savedMissing }]));
    setBulkBusy(true);
    setBulkMessage(null);
    changedTargets.forEach((row) => {
      clearTimer(row.studentId);
      patchRow(row.studentId, { value: String(desiredPoints), missing: desiredMissing, saveState: "saving", error: undefined });
    });

    const results = await Promise.all(changedTargets.map(async (row) => ({ studentId: row.studentId, ok: await persist(row.studentId, String(desiredPoints), desiredMissing, false) })));
    const successfulSnapshots = results.filter((item) => item.ok).map((item) => snapshots.get(item.studentId)!).filter(Boolean);
    const failed = results.length - successfulSnapshots.length;
    if (successfulSnapshots.length) {
      const label = kind === "full" ? "Fill all with full credit" : kind === "score" ? `Set all scores to ${numericBulk}` : "Fill remaining blanks as Missing";
      pushUndo({ label, rows: successfulSnapshots });
    }
    setBulkBusy(false);
    setBulkMessage(failed ? `${successfulSnapshots.length} saved; ${failed} need attention.` : `${successfulSnapshots.length} grades updated.`);
  }

  async function undoLast() {
    if (bulkBusy) return;
    const action = undoStack.at(-1);
    if (!action) return;
    setBulkBusy(true);
    setBulkMessage(`Undoing: ${action.label}…`);
    action.rows.forEach((snapshot) => patchRow(snapshot.studentId, { saveState: "saving", error: undefined }));

    const results = await Promise.all(action.rows.map(async (snapshot) => {
      if (snapshot.points == null && !snapshot.missing) {
        const result = await clearGradeEntry({ assignmentId, studentId: snapshot.studentId });
        if (result.ok) patchRow(snapshot.studentId, { value: "", points: null, missing: false, savedMissing: false, saveState: "idle", error: undefined });
        else patchRow(snapshot.studentId, { saveState: "error", error: result.error });
        return result.ok;
      }
      const result = await saveGradeEntry({ assignmentId, studentId: snapshot.studentId, points: snapshot.points ?? 0, missing: snapshot.missing });
      if (result.ok) patchRow(snapshot.studentId, { value: String(result.points), points: result.points, missing: result.missing, savedMissing: result.missing, saveState: "saved", error: undefined });
      else patchRow(snapshot.studentId, { saveState: "error", error: result.error });
      return result.ok;
    }));

    if (results.every(Boolean)) {
      setUndoStack((current) => current.slice(0, -1));
      setBulkMessage(`Undone: ${action.label}`);
    } else {
      setBulkMessage("Undo was only partially completed. Review rows marked Error.");
    }
    setBulkBusy(false);
  }

  return <div className={styles.shell}>
    <div className={styles.summary}>
      <div><strong>{savedCount}/{rows.length}</strong><span>entered</span></div>
      <div><strong>{missingCount}</strong><span>missing</span></div>
      <p>Scores autosave after you stop typing. Press Enter to save and move to the next student. A real score automatically clears Missing.</p>
    </div>

    <div className={styles.bulkBar}>
      <div className={styles.bulkActions}>
        <button type="button" className={styles.bulkButton} disabled={bulkBusy} onClick={() => void applyBulk("full")}><Sparkles size={15}/> Fill all with full credit</button>
        <div className={styles.setAllGroup}>
          <input aria-label="Score for set all" type="number" min="0" step="0.5" placeholder="Score" value={bulkScore} onChange={(event) => setBulkScore(event.target.value)}/>
          <button type="button" className={styles.bulkButton} disabled={bulkBusy} onClick={() => void applyBulk("score")}>Set all scores to…</button>
        </div>
        <button type="button" className={styles.bulkButton} disabled={bulkBusy} onClick={() => void applyBulk("missing")}><TriangleAlert size={15}/> Fill remaining blanks with 0 + Missing</button>
      </div>
      <div className={styles.undoArea}>
        {bulkMessage ? <span className={styles.bulkMessage}>{bulkMessage}</span> : null}
        <button type="button" className={styles.undoButton} disabled={!lastUndo || bulkBusy} onClick={() => void undoLast()} title={lastUndo ? `Undo: ${lastUndo.label}` : "Nothing to undo"}><RotateCcw size={15}/> Undo{lastUndo ? `: ${lastUndo.label}` : ""}</button>
      </div>
    </div>

    <div className={styles.table} role="table" aria-label="Grade entry">
      <div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Student #</span><span>Score</span><span>Status</span><span></span></div>
      {rows.map((row, rowIndex) => <div className={`${styles.row} ${row.missing ? styles.missingRow : ""}`} role="row" key={row.studentId}>
        <strong>{row.displayName}</strong>
        <span className={styles.muted}>{row.externalStudentKey ?? "—"}</span>
        <label className={styles.scoreField}><input ref={(element) => { if (element) scoreInputs.current.set(row.studentId, element); else scoreInputs.current.delete(row.studentId); }} aria-label={`Score for ${row.displayName}`} type="number" min="0" step="0.5" value={row.value} onChange={(event) => changeScore(row.studentId, event.target.value)} onKeyDown={(event) => handleScoreKeyDown(event, rowIndex, row)} onBlur={() => handleBlur(row)}/><span>/ {pointsPossible}</span></label>
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