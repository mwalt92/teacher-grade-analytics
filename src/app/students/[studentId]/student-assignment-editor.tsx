"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CircleEllipsis, CircleOff, ExternalLink, Plus, TriangleAlert, X } from "lucide-react";
import { saveGradeEntry, setGradeExempt } from "../../assignments/[assignmentId]/grade-entry-actions";
import { addRetakeAttempt } from "../../assignments/[assignmentId]/retake-actions";
import { getRetakeEligibility } from "./student-profile-actions";
import styles from "./student-assignment-editor.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";

type AssignmentEditorRow = {
  assignmentId: string;
  title: string;
  assignmentDate: string | null;
  categoryLabel: string;
  gradingPeriodCode: string;
  pointsPossible: number;
  status: "counted" | "dropped" | "missing" | "unentered" | "exempt";
  attemptOnePoints: number | null;
  missing: boolean;
  exempt: boolean;
  attempts: { attemptNumber: number; earned: number; possible: number; counted: boolean }[];
};

type Props = {
  studentId: string;
  rows: AssignmentEditorRow[];
  profileHref: string;
};

export function StudentAssignmentEditor({ studentId, rows, profileHref }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((row) => [row.assignmentId, row.attemptOnePoints == null ? "" : String(row.attemptOnePoints)])));
  const [missing, setMissing] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((row) => [row.assignmentId, row.missing])));
  const [exempt, setExempt] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map((row) => [row.assignmentId, row.exempt])));
  const [saveState, setSaveState] = useState<Record<string, SaveState>>(() => Object.fromEntries(rows.map((row) => [row.assignmentId, row.attemptOnePoints == null && !row.missing && !row.exempt ? "idle" : "saved"])));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [retakeEligibility, setRetakeEligibility] = useState<Record<string, boolean>>({});
  const [retakeDrafts, setRetakeDrafts] = useState<Record<string, string | undefined>>({});
  const [retakeBusy, setRetakeBusy] = useState<Record<string, boolean>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getRetakeEligibility(rows.map((row) => row.assignmentId)).then((result) => {
      if (!cancelled) setRetakeEligibility(result);
    });
    return () => { cancelled = true; };
  }, [rows]);

  function queueRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  }

  function clearTimer(assignmentId: string) {
    const timer = timers.current.get(assignmentId);
    if (timer) clearTimeout(timer);
    timers.current.delete(assignmentId);
  }

  function setRowState(assignmentId: string, state: SaveState, error?: string) {
    setSaveState((current) => ({ ...current, [assignmentId]: state }));
    setErrors((current) => ({ ...current, [assignmentId]: error }));
  }

  async function persist(row: AssignmentEditorRow, value: string, markMissing: boolean) {
    const parsed = markMissing ? 0 : Number(value);
    if (!markMissing && (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0)) return;
    setRowState(row.assignmentId, "saving");
    const result = await saveGradeEntry({ assignmentId: row.assignmentId, studentId, points: parsed, missing: markMissing });
    if (!result.ok) {
      setRowState(row.assignmentId, "error", result.error);
      return;
    }
    setValues((current) => ({ ...current, [row.assignmentId]: String(result.points) }));
    setMissing((current) => ({ ...current, [row.assignmentId]: result.missing }));
    setExempt((current) => ({ ...current, [row.assignmentId]: false }));
    setRowState(row.assignmentId, "saved");
    queueRefresh();
  }

  function changeScore(row: AssignmentEditorRow, value: string) {
    setValues((current) => ({ ...current, [row.assignmentId]: value }));
    setMissing((current) => ({ ...current, [row.assignmentId]: false }));
    setExempt((current) => ({ ...current, [row.assignmentId]: false }));
    setRowState(row.assignmentId, value.trim() === "" ? "idle" : "saving");
    clearTimer(row.assignmentId);
    if (value.trim() !== "") {
      timers.current.set(row.assignmentId, setTimeout(() => {
        timers.current.delete(row.assignmentId);
        void persist(row, value, false);
      }, 650));
    }
  }

  function handleBlur(row: AssignmentEditorRow) {
    clearTimer(row.assignmentId);
    const value = values[row.assignmentId] ?? "";
    if (value.trim() !== "") void persist(row, value, false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, row: AssignmentEditorRow, index: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimer(row.assignmentId);
    const value = values[row.assignmentId] ?? "";
    if (value.trim() !== "") void persist(row, value, false);
    const next = rows[index + 1];
    if (next) requestAnimationFrame(() => {
      const input = inputs.current.get(next.assignmentId);
      input?.focus();
      input?.select();
    });
  }

  function markRowMissing(row: AssignmentEditorRow) {
    clearTimer(row.assignmentId);
    setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: undefined }));
    setValues((current) => ({ ...current, [row.assignmentId]: "0" }));
    setMissing((current) => ({ ...current, [row.assignmentId]: true }));
    setExempt((current) => ({ ...current, [row.assignmentId]: false }));
    void persist(row, "0", true);
  }

  async function toggleRowExempt(row: AssignmentEditorRow) {
    clearTimer(row.assignmentId);
    setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: undefined }));
    const nextExempt = !(exempt[row.assignmentId] ?? row.exempt);
    setRowState(row.assignmentId, "saving");
    const result = await setGradeExempt({ assignmentId: row.assignmentId, studentId, exempt: nextExempt });
    if (!result.ok) {
      setRowState(row.assignmentId, "error", result.error);
      return;
    }
    setMissing((current) => ({ ...current, [row.assignmentId]: false }));
    setExempt((current) => ({ ...current, [row.assignmentId]: result.exempt }));
    setRowState(row.assignmentId, "saved");
    queueRefresh();
  }

  async function saveRetake(row: AssignmentEditorRow) {
    const draft = retakeDrafts[row.assignmentId] ?? "";
    const points = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(points) || points < 0) {
      setErrors((current) => ({ ...current, [row.assignmentId]: "Enter a valid non-negative retake score." }));
      return;
    }

    clearTimer(row.assignmentId);
    setRetakeBusy((current) => ({ ...current, [row.assignmentId]: true }));
    setErrors((current) => ({ ...current, [row.assignmentId]: undefined }));
    const result = await addRetakeAttempt({ assignmentId: row.assignmentId, studentId, points });
    if (!result.ok) {
      setErrors((current) => ({ ...current, [row.assignmentId]: result.error }));
      setRetakeBusy((current) => ({ ...current, [row.assignmentId]: false }));
      return;
    }

    setMissing((current) => ({ ...current, [row.assignmentId]: false }));
    setExempt((current) => ({ ...current, [row.assignmentId]: false }));
    setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: undefined }));
    setRetakeBusy((current) => ({ ...current, [row.assignmentId]: false }));
    setRowState(row.assignmentId, "saved");
    queueRefresh();
  }

  return <div className={styles.editor}>
    <div className={styles.editorIntro}>
      <div>
        <strong>Grade this student directly</strong>
        <span>Scores and retakes use the same autosave and audit trail as assignment grade entry. Press Enter to save and move down.</span>
      </div>
      <span className="status success-pill"><Check size={14}/> Autosave on</span>
    </div>

    <div className={styles.tableScroll}>
      <div className={styles.table} role="table" aria-label="Editable student assignment scores">
        <div className={`${styles.row} ${styles.head}`} role="row">
          <span>Assignment</span><span>Score</span><span>Save</span><span>Grade decision</span><span>Actions</span><span>Attempts</span>
        </div>
        {rows.map((row, index) => {
          const rowMissing = missing[row.assignmentId] ?? row.missing;
          const rowExempt = exempt[row.assignmentId] ?? row.exempt;
          const rowState = saveState[row.assignmentId] ?? "idle";
          const retakeOpen = retakeDrafts[row.assignmentId] !== undefined;
          const canAddRetake = Boolean(retakeEligibility[row.assignmentId]);
          const hasOriginal = (values[row.assignmentId] ?? "").trim() !== "";
          const attempts = row.attempts.length
            ? row.attempts.map((attempt) => `A${attempt.attemptNumber}: ${attempt.earned}/${attempt.possible}${attempt.counted ? " ✓" : ""}`).join(" · ")
            : "No attempts";
          return <div className={`${styles.row} ${rowMissing ? styles.missingRow : ""} ${rowExempt ? styles.exemptRow : ""}`} role="row" key={row.assignmentId}>
            <span className={styles.assignment}>
              <Link href={`/assignments/${row.assignmentId}?returnTo=${encodeURIComponent(profileHref)}`}><strong>{row.title}</strong></Link>
              <small>{row.assignmentDate ?? "No date"} • {row.gradingPeriodCode} • {row.categoryLabel}</small>
            </span>
            <label className={styles.scoreField}>
              <input
                ref={(element) => { if (element) inputs.current.set(row.assignmentId, element); else inputs.current.delete(row.assignmentId); }}
                aria-label={`Score for ${row.title}`}
                type="number"
                min="0"
                step="0.5"
                value={values[row.assignmentId] ?? ""}
                onChange={(event) => changeScore(row, event.target.value)}
                onKeyDown={(event) => handleKeyDown(event, row, index)}
                onBlur={() => handleBlur(row)}
              />
              <span>/ {row.pointsPossible}</span>
            </label>
            <SaveBadge state={rowState} missing={rowMissing} exempt={rowExempt}/>
            <span className={`${styles.decision} ${styles[`decision_${row.status}`]}`}>{row.status}</span>
            <span className={styles.actions}>
              <button type="button" aria-pressed={rowMissing} className={rowMissing ? styles.actionActiveWarning : styles.actionButton} onClick={() => markRowMissing(row)}><TriangleAlert size={14}/> Missing</button>
              <button type="button" aria-pressed={rowExempt} className={rowExempt ? styles.actionActiveBrand : styles.actionButton} onClick={() => void toggleRowExempt(row)}><CircleOff size={14}/> Exempt</button>
              {canAddRetake && !retakeOpen ? <button
                type="button"
                className={styles.retakeButton}
                disabled={!hasOriginal || rowMissing || rowExempt || rowState === "saving" || retakeBusy[row.assignmentId]}
                title={!hasOriginal ? "Enter the original score before adding a retake." : undefined}
                onClick={() => setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: "" }))}
              ><Plus size={14}/> Add Retake</button> : null}
              <Link className={styles.openLink} href={`/assignments/${row.assignmentId}?returnTo=${encodeURIComponent(profileHref)}`} aria-label={`Open ${row.title}`}><ExternalLink size={14}/></Link>
              {canAddRetake && retakeOpen ? <span className={styles.retakeEditor}>
                <input
                  autoFocus
                  aria-label={`Retake score for ${row.title}`}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Retake"
                  value={retakeDrafts[row.assignmentId] ?? ""}
                  onChange={(event) => setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveRetake(row);
                    }
                  }}
                />
                <span>/ {row.pointsPossible}</span>
                <button type="button" disabled={retakeBusy[row.assignmentId]} onClick={() => void saveRetake(row)}>{retakeBusy[row.assignmentId] ? "Saving…" : "Save"}</button>
                <button type="button" className={styles.cancelRetake} aria-label={`Cancel retake for ${row.title}`} onClick={() => setRetakeDrafts((current) => ({ ...current, [row.assignmentId]: undefined }))}><X size={13}/></button>
              </span> : null}
            </span>
            <span className={styles.attempts}>{attempts}</span>
            {errors[row.assignmentId] ? <span className={styles.error}><AlertCircle size={14}/>{errors[row.assignmentId]}</span> : null}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

function SaveBadge({ state, missing, exempt }: { state: SaveState; missing: boolean; exempt: boolean }) {
  if (state === "saving") return <span className={`${styles.saveState} ${styles.saving}`}><CircleEllipsis size={14}/> Saving…</span>;
  if (state === "error") return <span className={`${styles.saveState} ${styles.errorText}`}><AlertCircle size={14}/> Error</span>;
  if (exempt) return <span className={`${styles.saveState} ${styles.exemptText}`}><CircleOff size={14}/> Exempt</span>;
  if (missing) return <span className={`${styles.saveState} ${styles.missingText}`}><TriangleAlert size={14}/> Missing · 0</span>;
  if (state === "saved") return <span className={`${styles.saveState} ${styles.saved}`}><Check size={14}/> Saved</span>;
  return <span className={`${styles.saveState} ${styles.idle}`}>Not entered</span>;
}
