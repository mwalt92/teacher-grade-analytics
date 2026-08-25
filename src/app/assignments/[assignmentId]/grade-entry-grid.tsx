"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CircleEllipsis, Plus, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { restoreGradeEntriesBulk } from "./bulk-undo-actions";
import { saveGradeEntriesBulk, saveGradeEntry } from "./grade-entry-actions";
import { addRetakeAttempt } from "./retake-actions";
import styles from "./grade-entry.module.css";

type Attempt = { attemptNumber: number; points: number; occurredOn: string };
type StudentRow = {
  studentId: string;
  displayName: string;
  externalStudentKey: string | null;
  points: number | null;
  missing: boolean;
  attempts: Attempt[];
};

type SaveState = "idle" | "saving" | "saved" | "error";
type LocalRow = StudentRow & { value: string; savedMissing: boolean; saveState: SaveState; error?: string };
type Snapshot = { studentId: string; points: number | null; missing: boolean };
type UndoAction = { label: string; rows: Snapshot[] };

export function GradeEntryGrid({ assignmentId, pointsPossible, allowRetakes, students }: { assignmentId: string; pointsPossible: number; allowRetakes: boolean; students: StudentRow[] }) {
  const [rows, setRows] = useState<LocalRow[]>(() => students.map((student) => ({ ...student, value: student.points == null ? "" : String(student.points), savedMissing: student.missing, saveState: student.points == null && !student.missing ? "idle" : "saved" })));
  const [bulkScore, setBulkScore] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [retakeDrafts, setRetakeDrafts] = useState<Record<string, string | undefined>>({});
  const [retakeBusy, setRetakeBusy] = useState<Record<string, boolean>>({});
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

  function withAttemptOne(attempts: Attempt[], points: number | null) {
    const rest = attempts.filter((attempt) => attempt.attemptNumber !== 1);
    return points == null ? rest : [{ attemptNumber: 1, points, occurredOn: attempts.find((attempt) => attempt.attemptNumber === 1)?.occurredOn ?? "" }, ...rest].sort((a, b) => a.attemptNumber - b.attemptNumber);
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
    patchRow(studentId, { value: String(result.points), points: result.points, attempts: withAttemptOne(current.attempts, result.points), missing: result.missing, savedMissing: result.missing, saveState: "saved", error: undefined });
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

  async function saveRetake(row: LocalRow) {
    const draft = retakeDrafts[row.studentId] ?? "";
    const points = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(points) || points < 0) {
      patchRow(row.studentId, { error: "Enter a valid non-negative retake score." });
      return;
    }
    setRetakeBusy((current) => ({ ...current, [row.studentId]: true }));
    patchRow(row.studentId, { error: undefined });
    const result = await addRetakeAttempt({ assignmentId, studentId: row.studentId, points });
    if (!result.ok) {
      patchRow(row.studentId, { error: result.error });
      setRetakeBusy((current) => ({ ...current, [row.studentId]: false }));
      return;
    }
    const current = rowsRef.current.find((item) => item.studentId === row.studentId);
    if (current) patchRow(row.studentId, {
      attempts: [...current.attempts, { attemptNumber: result.attemptNumber, points: result.points, occurredOn: result.savedAt.slice(0, 10) }].sort((a, b) => a.attemptNumber - b.attemptNumber),
      missing: false,
      savedMissing: false,
      error: undefined,
    });
    setRetakeDrafts((current) => ({ ...current, [row.studentId]: undefined }));
    setRetakeBusy((current) => ({ ...current, [row.studentId]: false }));
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

    const snapshots = changedTargets.map((row) => ({ studentId: row.studentId, points: row.points, missing: row.savedMissing }));
    setBulkBusy(true);
    setBulkMessage(`Saving ${changedTargets.length} grades together…`);
    changedTargets.forEach((row) => {
      clearTimer(row.studentId);
      patchRow(row.studentId, { value: String(desiredPoints), missing: desiredMissing, saveState: "saving", error: undefined });
    });

    const result = await saveGradeEntriesBulk({ assignmentId, entries: changedTargets.map((row) => ({ studentId: row.studentId, points: desiredPoints, missing: desiredMissing })) });
    if (!result.ok) {
      changedTargets.forEach((row) => patchRow(row.studentId, { saveState: "error", error: result.error }));
      setBulkBusy(false);
      setBulkMessage(`Bulk save failed: ${result.error}`);
      return;
    }

    changedTargets.forEach((row) => patchRow(row.studentId, {
      value: String(desiredPoints), points: desiredPoints, attempts: withAttemptOne(row.attempts, desiredPoints), missing: desiredMissing, savedMissing: desiredMissing, saveState: "saved", error: undefined,
    }));
    const label = kind === "full" ? "Fill all with full credit" : kind === "score" ? `Set all scores to ${numericBulk}` : "Fill remaining blanks as Missing";
    pushUndo({ label, rows: snapshots });
    setBulkBusy(false);
    setBulkMessage(`${result.count} grades updated in one bulk save.`);
  }

  async function undoLast() {
    if (bulkBusy) return;
    const action = undoStack.at(-1);
    if (!action) return;
    setBulkBusy(true);
    setBulkMessage(`Undoing ${action.rows.length} grade${action.rows.length === 1 ? "" : "s"} together…`);
    action.rows.forEach((snapshot) => { clearTimer(snapshot.studentId); patchRow(snapshot.studentId, { saveState: "saving", error: undefined }); });

    const result = await restoreGradeEntriesBulk({ assignmentId, snapshots: action.rows });
    if (!result.ok) {
      action.rows.forEach((snapshot) => patchRow(snapshot.studentId, { saveState: "error", error: result.error }));
      setBulkMessage(`Undo failed: ${result.error}`);
      setBulkBusy(false);
      return;
    }

    action.rows.forEach((snapshot) => {
      const current = rowsRef.current.find((row) => row.studentId === snapshot.studentId);
      if (snapshot.points == null && !snapshot.missing) {
        patchRow(snapshot.studentId, { value: "", points: null, attempts: current ? withAttemptOne(current.attempts, null) : [], missing: false, savedMissing: false, saveState: "idle", error: undefined });
      } else {
        const restoredPoints = snapshot.missing ? 0 : Number(snapshot.points);
        patchRow(snapshot.studentId, { value: String(restoredPoints), points: restoredPoints, attempts: current ? withAttemptOne(current.attempts, restoredPoints) : [], missing: snapshot.missing, savedMissing: snapshot.missing, saveState: "saved", error: undefined });
      }
    });

    setUndoStack((current) => current.slice(0, -1));
    setBulkMessage(`Undone: ${action.label} (${result.count} grades restored in one request).`);
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
        <div className={styles.setAllGroup}><input aria-label="Score for set all" type="number" min="0" step="0.5" placeholder="Score" value={bulkScore} onChange={(event) => setBulkScore(event.target.value)}/><button type="button" className={styles.bulkButton} disabled={bulkBusy} onClick={() => void applyBulk("score")}>Set all scores to…</button></div>
        <button type="button" className={styles.bulkButton} disabled={bulkBusy} onClick={() => void applyBulk("missing")}><TriangleAlert size={15}/> Fill remaining blanks with 0 + Missing</button>
      </div>
      <div className={styles.undoArea}>{bulkMessage ? <span className={styles.bulkMessage}>{bulkMessage}</span> : null}<button type="button" className={styles.undoButton} disabled={!lastUndo || bulkBusy} onClick={() => void undoLast()} title={lastUndo ? `Undo: ${lastUndo.label}` : "Nothing to undo"}><RotateCcw size={15}/> Undo{lastUndo ? `: ${lastUndo.label}` : ""}</button></div>
    </div>

    <div className={styles.table} role="table" aria-label="Grade entry">
      <div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Student #</span><span>Original</span><span>Status</span><span></span></div>
      {rows.map((row, rowIndex) => {
        const best = getBestAttempt(row.attempts);
        const draftOpen = retakeDrafts[row.studentId] !== undefined;
        return <div className={`${styles.row} ${row.missing ? styles.missingRow : ""}`} role="row" key={row.studentId}>
          <strong>{row.displayName}</strong>
          <span className={styles.muted}>{row.externalStudentKey ?? "—"}</span>
          <label className={styles.scoreField}><input ref={(element) => { if (element) scoreInputs.current.set(row.studentId, element); else scoreInputs.current.delete(row.studentId); }} aria-label={`Score for ${row.displayName}`} type="number" min="0" step="0.5" value={row.value} onChange={(event) => changeScore(row.studentId, event.target.value)} onKeyDown={(event) => handleScoreKeyDown(event, rowIndex, row)} onBlur={() => handleBlur(row)}/><span>/ {pointsPossible}</span></label>
          <SaveBadge state={row.saveState} missing={row.missing}/>
          <button type="button" className={`${styles.missingButton} ${row.missing ? styles.missingButtonActive : ""}`} onClick={() => markMissing(row.studentId)}><TriangleAlert size={15}/> Missing</button>
          {allowRetakes && row.attempts.length ? <div className={styles.attemptArea}>
            <div className={styles.attemptList}>{row.attempts.map((attempt) => <span key={attempt.attemptNumber} className={`${styles.attemptChip} ${best?.attemptNumber === attempt.attemptNumber ? styles.bestAttempt : ""}`}><strong>A{attempt.attemptNumber}</strong> {attempt.points}/{pointsPossible}{best?.attemptNumber === attempt.attemptNumber ? <em>Best · Counts</em> : null}</span>)}</div>
            {!draftOpen ? <button type="button" className={styles.retakeButton} disabled={row.points == null || row.savedMissing || retakeBusy[row.studentId]} onClick={() => setRetakeDrafts((current) => ({ ...current, [row.studentId]: "" }))}><Plus size={14}/> Add Retake</button> : <div className={styles.retakeEditor}><input autoFocus aria-label={`Retake score for ${row.displayName}`} type="number" min="0" step="0.5" placeholder="Retake score" value={retakeDrafts[row.studentId] ?? ""} onChange={(event) => setRetakeDrafts((current) => ({ ...current, [row.studentId]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveRetake(row); } }}/><span>/ {pointsPossible}</span><button type="button" disabled={retakeBusy[row.studentId]} onClick={() => void saveRetake(row)}>{retakeBusy[row.studentId] ? "Saving…" : "Save retake"}</button><button type="button" className={styles.iconButton} aria-label="Cancel retake" onClick={() => setRetakeDrafts((current) => ({ ...current, [row.studentId]: undefined }))}><X size={14}/></button></div>}
          </div> : null}
          {row.error ? <div className={styles.rowError}><AlertCircle size={14}/>{row.error}</div> : null}
        </div>;
      })}
    </div>
  </div>;
}

function getBestAttempt(attempts: Attempt[]) {
  if (!attempts.length) return null;
  return [...attempts].sort((a, b) => b.points - a.points || a.attemptNumber - b.attemptNumber)[0];
}

function SaveBadge({ state, missing }: { state: SaveState; missing: boolean }) {
  if (state === "saving") return <span className={`${styles.saveState} ${styles.saving}`}><CircleEllipsis size={14}/> Saving…</span>;
  if (state === "error") return <span className={`${styles.saveState} ${styles.error}`}><AlertCircle size={14}/> Error</span>;
  if (missing) return <span className={`${styles.saveState} ${styles.missing}`}><TriangleAlert size={14}/> Missing · 0</span>;
  if (state === "saved") return <span className={`${styles.saveState} ${styles.saved}`}><Check size={14}/> Saved</span>;
  return <span className={`${styles.saveState} ${styles.idle}`}>Not entered</span>;
}
