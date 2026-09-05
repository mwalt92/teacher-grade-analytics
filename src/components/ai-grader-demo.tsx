"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileUp, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { demoAssignments, type DemoRecommendation } from "@/lib/ai-grading/demo-data";
import { computingFoundationRubrics } from "@/lib/ai-grading/rubrics";
import { anonymizeCodeOrgRows, parseCodeOrgResponsesCsv, type CodeOrgResponsePreview } from "@/lib/import/codeorg-responses";
import styles from "./ai-grader-demo.module.css";

type ReviewFilter = "needs-review" | "all";

function cloneRows(rows: DemoRecommendation[]) {
  return rows.map((row) => ({ ...row, diagnostics: row.diagnostics.map((diagnostic) => ({ ...diagnostic })), conceptTags: [...row.conceptTags] }));
}

function confidenceLabel(row: DemoRecommendation) {
  if (row.submissionState === "missing") return "Teacher review";
  if (row.confidenceBand === "high") return "High confidence";
  if (row.confidenceBand === "medium") return "Medium confidence";
  return "Review recommended";
}

function statusLabel(row: DemoRecommendation) {
  if (row.status === "approved") return "Approved";
  if (row.status === "edited") return "Teacher edited";
  if (row.status === "rejected") return "Rejected";
  if (row.status === "missing") return "Missing / review";
  if (row.status === "exempt") return "Exempt";
  return "Pending";
}

function needsReview(row: DemoRecommendation) {
  return row.reviewRequired || row.confidenceBand === "review" || row.status === "missing";
}

export function AIGraderDemo({ courseName, sectionName, schoolYear }: { courseName: string; sectionName: string; schoolYear: string }) {
  const [assignmentKey, setAssignmentKey] = useState<"lesson-1" | "lesson-5">("lesson-5");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("needs-review");
  const [recommendations, setRecommendations] = useState<Record<string, DemoRecommendation[]>>(() => Object.fromEntries(
    demoAssignments.map((assignment) => [assignment.key, cloneRows(assignment.rows)]),
  ));
  const [importPreview, setImportPreview] = useState<CodeOrgResponsePreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);

  const assignment = demoAssignments.find((candidate) => candidate.key === assignmentKey)!;
  const rubric = computingFoundationRubrics.find((candidate) => candidate.id === assignment.rubricId)!;
  const rows = recommendations[assignmentKey] ?? [];
  const filteredRows = reviewFilter === "needs-review" ? rows.filter(needsReview) : rows;

  const metrics = useMemo(() => {
    const allRows = Object.values(recommendations).flat();
    const submitted = allRows.filter((row) => row.submissionState === "submitted");
    const resolved = submitted.filter((row) => row.status === "approved" || row.status === "edited");
    const unchanged = submitted.filter((row) => row.status === "approved");
    const adjusted = submitted.filter((row) => row.status === "edited");
    const cost = allRows.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
    return {
      total: allRows.length,
      highConfidence: submitted.filter((row) => row.confidenceBand === "high").length,
      reviewCount: allRows.filter(needsReview).length,
      resolved: resolved.length,
      agreementRate: resolved.length ? Math.round((unchanged.length / resolved.length) * 100) : 0,
      adjusted: adjusted.length,
      cost,
    };
  }, [recommendations]);

  function updateRow(id: string, update: (row: DemoRecommendation) => DemoRecommendation) {
    setRecommendations((current) => ({
      ...current,
      [assignmentKey]: (current[assignmentKey] ?? []).map((row) => row.id === id ? update(row) : row),
    }));
  }

  function approve(row: DemoRecommendation) {
    updateRow(row.id, (current) => ({ ...current, status: "approved", finalPoints: current.proposedPoints, teacherNote: undefined }));
  }

  function saveEditedScore(row: DemoRecommendation, score: number) {
    updateRow(row.id, (current) => ({
      ...current,
      status: score === current.proposedPoints ? "approved" : "edited",
      finalPoints: score,
      teacherNote: score === current.proposedPoints ? undefined : `Teacher changed ${current.proposedPoints}/10 → ${score}/10 after review.`,
    }));
  }

  function resetDemo() {
    setRecommendations(Object.fromEntries(demoAssignments.map((candidate) => [candidate.key, cloneRows(candidate.rows)])));
    setReviewFilter("needs-review");
  }

  async function previewCsv(file: File | null) {
    setImportError(null);
    setImportPreview(null);
    setImportFileName(file?.name ?? null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Choose a Code.org .csv text-response export.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError("CSV files must be 5 MB or smaller for this preview.");
      return;
    }
    try {
      const text = await file.text();
      setImportPreview(parseCodeOrgResponsesCsv(text, file.name));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not parse the Code.org response export.");
    }
  }

  const anonymizedImportRows = importPreview ? anonymizeCodeOrgRows(importPreview.rows).slice(0, 6) : [];

  return <section className={`content-wrap ${styles.workspace}`}>
    <div className={styles.hero}>
      <div>
        <p className="eyebrow">AI Grading Pilot</p>
        <h2>Teacher-controlled review before any grade becomes official</h2>
        <p className="subtle">{courseName} • {sectionName} • {schoolYear}</p>
      </div>
      <div className={styles.demoBadge}><ShieldCheck size={17}/> Demo mode</div>
    </div>

    <div className={styles.safetyBanner}>
      <Sparkles size={20}/>
      <div>
        <strong>No live AI calls are running in this phase.</strong>
        <span>The recommendations below are synthetic demonstration data. Uploaded CSV previews are parsed locally in your browser and are not sent to an AI provider or written to the database.</span>
      </div>
    </div>

    <section className={styles.metricGrid} aria-label="AI grading pilot metrics">
      <Metric label="Demo submissions" value={String(metrics.total)} note="Across two rubric templates"/>
      <Metric label="High confidence" value={String(metrics.highConfidence)} note="Synthetic first-pass recommendations"/>
      <Metric label="Review recommended" value={String(metrics.reviewCount)} note="Prioritized for teacher judgment"/>
      <Metric label="Teacher resolved" value={String(metrics.resolved)} note={`${metrics.adjusted} score adjustment${metrics.adjusted === 1 ? "" : "s"}`}/>
      <Metric label="Demo AI cost" value={`$${metrics.cost.toFixed(3)}`} note="Illustrative telemetry only"/>
    </section>

    <section className={`panel ${styles.importPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <p className="eyebrow">Step 1 • Import preview</p>
          <h3>Try a real Code.org response export safely</h3>
          <p className="subtle">This stage validates the file shape and anonymizes the on-screen preview. It does not grade or persist the file.</p>
        </div>
      </div>
      <label className={styles.fileDrop}>
        <FileUp size={22}/>
        <span><strong>{importFileName ?? "Choose Code.org responses.csv"}</strong><small>Name, Lesson, Puzzle, Question, and Response columns are expected.</small></span>
        <input type="file" accept=".csv,text/csv" onChange={(event) => void previewCsv(event.target.files?.[0] ?? null)}/>
      </label>
      {importError ? <div className={styles.errorMessage}><AlertTriangle size={17}/>{importError}</div> : null}
      {importPreview ? <div className={styles.previewBlock}>
        <div className={styles.previewSummary}>
          <strong>{importPreview.rows.length} response row{importPreview.rows.length === 1 ? "" : "s"}</strong>
          <span>{importPreview.studentCount} students • {importPreview.activities.length} question/activity group{importPreview.activities.length === 1 ? "" : "s"}</span>
        </div>
        {importPreview.warnings.map((warning) => <div className={styles.warningMessage} key={warning}><AlertTriangle size={16}/>{warning}</div>)}
        <div className={styles.activityList}>
          {importPreview.activities.slice(0, 4).map((activity) => <article key={activity.key} className={styles.activityCard}>
            <strong>{activity.lesson} • Level {activity.puzzle || "—"}</strong>
            <span>{activity.studentCount} students • {activity.responseCount} rows</span>
            <small>{activity.question.replace(/\s+/g, " ").slice(0, 150)}{activity.question.length > 150 ? "…" : ""}</small>
          </article>)}
        </div>
        <div className={styles.previewRows}>
          {anonymizedImportRows.map((row) => <div className={styles.previewRow} key={`${row.rowNumber}-${row.studentName}`}>
            <strong>{row.studentName}</strong><span>{row.lesson} • Level {row.puzzle || "—"}</span><small>{row.response || "(blank submitted response)"}</small>
          </div>)}
        </div>
      </div> : null}
    </section>

    <section className={`panel ${styles.reviewPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <p className="eyebrow">Step 2 • Teacher review</p>
          <h3>Rubric-based recommendation queue</h3>
          <p className="subtle">Question diagnostics remain separate even when the gradebook receives one overall assessment score.</p>
        </div>
        <button type="button" className={styles.resetButton} onClick={resetDemo}><RotateCcw size={16}/> Reset demo</button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.segmented} aria-label="Choose demo assignment">
          {demoAssignments.map((candidate) => <button key={candidate.key} type="button" className={assignmentKey === candidate.key ? styles.segmentActive : styles.segmentButton} onClick={() => setAssignmentKey(candidate.key)}>{candidate.shortLabel}</button>)}
        </div>
        <div className={styles.segmented} aria-label="Filter review queue">
          <button type="button" className={reviewFilter === "needs-review" ? styles.segmentActive : styles.segmentButton} onClick={() => setReviewFilter("needs-review")}>Needs review</button>
          <button type="button" className={reviewFilter === "all" ? styles.segmentActive : styles.segmentButton} onClick={() => setReviewFilter("all")}>All submissions</button>
        </div>
      </div>

      <div className={styles.rubricSummary}>
        <div><strong>{rubric.title} • Rubric v{rubric.version}</strong><span>{rubric.lessonLabel} • {rubric.assignmentLabel}</span></div>
        <span>{rubric.proficiencyPointsPossible}-point proficiency → {rubric.gradebookPointsPossible}-point gradebook score</span>
      </div>

      <div className={styles.queue}>
        {filteredRows.length ? filteredRows.map((row) => <ReviewCard key={row.id} row={row} onApprove={() => approve(row)} onScore={(score) => saveEditedScore(row, score)} onReject={() => updateRow(row.id, (current) => ({ ...current, status: "rejected", finalPoints: null }))} onExempt={() => updateRow(row.id, (current) => ({ ...current, status: "exempt", finalPoints: null }))}/>) : <div className={styles.emptyState}><Check size={28}/><strong>No submissions currently need review.</strong><span>Switch to All submissions or reset the demo to see the full queue.</span></div>}
      </div>
    </section>

    <section className={`panel ${styles.analyticsPanel}`}>
      <div className={styles.panelHeader}>
        <div>
          <p className="eyebrow">Step 3 • Pilot evidence</p>
          <h3>Metrics we will collect once live grading is approved</h3>
        </div>
      </div>
      <div className={styles.evidenceGrid}>
        <div><strong>{metrics.agreementRate}%</strong><span>Teacher agreement among resolved demo recommendations</span></div>
        <div><strong>{metrics.adjusted}</strong><span>Teacher score adjustments preserved for calibration</span></div>
        <div><strong>0</strong><span>Official grades created automatically by AI</span></div>
        <div><strong>100%</strong><span>Recommendations require a teacher decision before posting</span></div>
      </div>
      <p className={styles.analyticsNote}>The integrated pilot will additionally log provider/model, token usage, cost per submission, latency, escalation rate, teacher overrides, and common concept tags. These metrics are intended to make a future district review evidence-based rather than anecdotal.</p>
    </section>
  </section>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function ReviewCard({ row, onApprove, onScore, onReject, onExempt }: { row: DemoRecommendation; onApprove: () => void; onScore: (score: number) => void; onReject: () => void; onExempt: () => void }) {
  const [score, setScore] = useState(row.finalPoints ?? row.proposedPoints);
  const confidenceClass = row.confidenceBand === "high" ? styles.high : row.confidenceBand === "medium" ? styles.medium : styles.review;
  const statusClass = row.status === "approved" ? styles.statusApproved : row.status === "edited" ? styles.statusEdited : row.status === "rejected" ? styles.statusRejected : row.status === "exempt" ? styles.statusNeutral : row.status === "missing" ? styles.statusReview : styles.statusPending;

  return <article className={styles.reviewCard}>
    <div className={styles.reviewHeader}>
      <div><strong>{row.studentAlias}</strong><span className={`${styles.confidence} ${confidenceClass}`}>{confidenceLabel(row)} • {Math.round(row.confidence * 100)}%</span></div>
      <div className={styles.scoreBlock}><span>AI recommendation</span><strong>{row.proposedPoints}/{row.pointsPossible}</strong><small>{row.proposedProficiency}/{row.proficiencyPossible} proficiency</small></div>
    </div>

    <div className={styles.responseBox}><span>Student response</span><p>{row.response || "No submission found in the source export."}</p></div>

    {row.diagnostics.length ? <div className={styles.diagnostics}>
      {row.diagnostics.map((diagnostic) => <div className={styles.diagnostic} key={diagnostic.criterionKey}>
        <div><strong>{diagnostic.label}</strong><span>{diagnostic.earned}/{diagnostic.possible}</span></div>
        <p>{diagnostic.evidenceSummary}</p>
      </div>)}
    </div> : null}

    <div className={styles.feedbackBox}><span>Suggested feedback</span><p>{row.feedback}</p></div>
    <div className={styles.tags}>{row.conceptTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    {row.teacherNote ? <div className={styles.teacherNote}><strong>Calibration example</strong><span>{row.teacherNote}</span></div> : null}

    <div className={styles.reviewFooter}>
      <span className={`${styles.statusPill} ${statusClass}`}>{statusLabel(row)}</span>
      <div className={styles.actions}>
        {row.submissionState === "submitted" ? <>
          <button type="button" className={styles.approveButton} onClick={onApprove}><Check size={16}/> Approve</button>
          <label className={styles.scoreEditor}><span>Teacher score</span><select value={score} onChange={(event) => setScore(Number(event.target.value))}>{[0, 4, 6, 8, 10].map((value) => <option key={value} value={value}>{value}/10</option>)}</select></label>
          <button type="button" className={styles.secondaryAction} onClick={() => onScore(score)}>Save score</button>
          <button type="button" className={styles.rejectButton} onClick={onReject}><X size={16}/> Reject</button>
        </> : <>
          <button type="button" className={styles.secondaryAction} onClick={onExempt}>Mark exempt</button>
        </>}
      </div>
    </div>
  </article>;
}
