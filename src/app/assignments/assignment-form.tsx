"use client";

import { useState } from "react";
import { ClipboardCheck, FileQuestion, Plus } from "lucide-react";
import { createAssignment } from "./actions";

type Period = { id: string; code: string; name: string };

export function AssignmentForm({ sectionId, periods, today }: { sectionId: string; periods: Period[]; today: string }) {
  const [mode, setMode] = useState<"participation" | "assessment">("participation");
  const [assessmentType, setAssessmentType] = useState<"quiz" | "test">("quiz");
  const kind = mode === "participation" ? "participation" : assessmentType;
  const quarterPeriods = periods.filter((period) => period.code.startsWith("Q"));

  return <form className="assignment-create-form" action={createAssignment}>
    <input type="hidden" name="sectionId" value={sectionId}/>
    <input type="hidden" name="kind" value={kind}/>
    <div className="choice-grid">
      <button type="button" className={mode === "participation" ? "choice-card selected" : "choice-card"} onClick={() => setMode("participation")}>
        <ClipboardCheck size={24}/><span><strong>Participation</strong><small>Simple classwork entry • one attempt</small></span>
      </button>
      <button type="button" className={mode === "assessment" ? "choice-card selected" : "choice-card"} onClick={() => setMode("assessment")}>
        <FileQuestion size={24}/><span><strong>Assessment</strong><small>Quiz or test • retakes available</small></span>
      </button>
    </div>
    {mode === "assessment" && <div className="assessment-toggle" aria-label="Assessment type">
      <button type="button" className={assessmentType === "quiz" ? "toggle-button active" : "toggle-button"} onClick={() => setAssessmentType("quiz")}>Quiz</button>
      <button type="button" className={assessmentType === "test" ? "toggle-button active" : "toggle-button"} onClick={() => setAssessmentType("test")}>Test</button>
    </div>}
    <div className="form-grid">
      <label className="wide-field">Assignment name<input name="title" required autoFocus placeholder={kind === "participation" ? "e.g. 1.3 Practice" : kind === "quiz" ? "e.g. 1.3 Quiz" : "e.g. Unit 1 Test"}/></label>
      <label>Date<input name="assignmentDate" type="date" required defaultValue={today}/></label>
      <label>Points possible<input name="pointsPossible" type="number" min="0.01" step="0.01" required defaultValue="10"/></label>
      <label>Grading period<select name="gradingPeriodId" required defaultValue={quarterPeriods[0]?.id ?? ""}><option value="" disabled>Choose quarter</option>{quarterPeriods.map((period) => <option value={period.id} key={period.id}>{period.code} — {period.name}</option>)}</select></label>
    </div>
    <div className="creation-summary">
      <div><strong>{mode === "participation" ? "Participation assignment" : `${assessmentType === "quiz" ? "Quiz" : "Test"} assessment`}</strong><span>{mode === "participation" ? "Retakes are disabled. Grade entry stays intentionally simple." : "Retakes are enabled and every attempt will remain in the history."}</span></div>
      <button className="primary-button" type="submit"><Plus size={17}/> Create & enter grades</button>
    </div>
  </form>;
}
