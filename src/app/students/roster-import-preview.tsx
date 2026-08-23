"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import {
  importRosterBatch,
  previewRosterImport,
  type RosterImportCommitState,
  type RosterImportPreviewState,
} from "./actions";

const initialPreviewState: RosterImportPreviewState = {};
const initialCommitState: RosterImportCommitState = {};

type SectionOption = { id: string; label: string };

export function RosterImportPreview({ sectionId, sections }: { sectionId: string; sections: SectionOption[] }) {
  const [state, previewAction, previewPending] = useActionState(previewRosterImport, initialPreviewState);
  const [commitState, commitAction, commitPending] = useActionState(importRosterBatch, initialCommitState);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [destinationByCourse, setDestinationByCourse] = useState<Record<number, string>>({});

  useEffect(() => {
    setDestinationByCourse({});
  }, [state.batchId]);

  const selectedDestinationCount = Object.values(destinationByCourse).filter(Boolean).length;
  const canConfirm = Boolean(state.hasStudentNumbers) && selectedDestinationCount > 0 && !commitPending && !commitState.success;

  return (
    <div className="import-preview">
      <form action={previewAction} className="import-form">
        <input type="hidden" name="sectionId" value={sectionId} />
        <label className={selectedFileName ? "file-drop file-selected" : "file-drop"}>
          {selectedFileName ? <CheckCircle2 size={24} /> : <FileSpreadsheet size={24} />}
          <span>
            <strong>{selectedFileName ? "Roster file ready" : "Choose PowerSchool roster"}</strong>
            <small>{selectedFileName ?? ".xlsx • up to 5 MB"}</small>
          </span>
          <input
            name="rosterFile"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)}
          />
        </label>
        <button className="primary-button" type="submit" disabled={previewPending || !selectedFileName}>
          <Upload size={17}/>{previewPending ? "Reading roster…" : "Preview import"}
        </button>
      </form>

      {selectedFileName && !previewPending ? <div className="file-ready-message"><CheckCircle2 size={16}/><span><strong>{selectedFileName}</strong> selected. Click Preview import when ready.</span></div> : null}
      {state.error ? <div className="import-message danger"><AlertTriangle size={18}/><span>{state.error}</span></div> : null}

      {state.groups && state.batchId ? <section className="preview-results">
        <div className="preview-summary">
          <div><p className="eyebrow">Import preview</p><h3>{state.totalRows} roster rows detected</h3><p className="subtle">{state.fileName}</p></div>
          <span className={state.hasStudentNumbers ? "status success-pill" : "status warning-pill"}>{state.hasStudentNumbers ? "Student numbers detected" : "Review required"}</span>
        </div>

        {state.warnings?.map((warning) => <div className="import-message warning" key={warning}><AlertTriangle size={17}/><span>{warning}</span></div>)}

        {state.hasStudentNumbers ? <div className="import-next-step">
          <strong>Next: choose a destination section.</strong>
          <p className="subtle">For the PowerSchool course you want to import, select the matching website section below. Leave unrelated courses set to “Skip this PowerSchool course.”</p>
        </div> : null}

        {sections.length === 0 ? <div className="import-message danger"><AlertTriangle size={18}/><span>No destination sections are available for your account.</span></div> : null}

        <form action={commitAction} className="mapping-form">
          <input type="hidden" name="sectionId" value={sectionId}/>
          <input type="hidden" name="batchId" value={state.batchId}/>

          <div className="course-preview-list">
            {state.groups.map((group, index) => <details className="course-preview" key={group.course} open>
              <summary>
                <div><strong>{group.course}</strong><span>{group.studentCount} students</span></div>
                <div className="preview-counts"><span>{group.existingCount} existing</span><span>{group.newCount} new</span>{group.nameOnlyCount > 0 ? <span>{group.nameOnlyCount} name-only</span> : null}</div>
              </summary>
              <div className="course-mapping">
                <label>Destination section
                  <select
                    name={`course-${index}`}
                    value={destinationByCourse[index] ?? ""}
                    disabled={!state.hasStudentNumbers}
                    onChange={(event) => setDestinationByCourse((current) => ({ ...current, [index]: event.target.value }))}
                  >
                    <option value="">Skip this PowerSchool course</option>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                  </select>
                </label>
                {!state.hasStudentNumbers ? <span className="mapping-note">Import is disabled until Student Number is included in the export.</span> : destinationByCourse[index] ? <span className="mapping-note">This course will be imported into the selected section.</span> : <span className="mapping-note">Leave as Skip if this course does not belong in the current website setup.</span>}
              </div>
              <div className="preview-students">
                {group.students.map((student, studentIndex) => <div className="preview-student" key={`${student.studentNumber ?? student.name}-${studentIndex}`}>
                  <span className="preview-icon">{student.existing ? <CheckCircle2 size={16}/> : <span className="new-dot">●</span>}</span>
                  <strong>{student.name}</strong>
                  <span>{student.studentNumber ? `#${student.studentNumber}` : "No student number"}</span>
                  <span>{student.existing ? "Match existing student" : student.studentNumber ? "Create student" : "Needs identity review"}</span>
                </div>)}
              </div>
            </details>)}
          </div>

          {commitState.error && selectedDestinationCount === 0 ? <div className="import-message danger"><AlertTriangle size={18}/><span>{commitState.error}</span></div> : null}
          {commitState.error && selectedDestinationCount > 0 ? <div className="import-message danger"><AlertTriangle size={18}/><span>{commitState.error}</span></div> : null}
          {commitState.success && commitState.summary ? <div className="import-success">
            <CheckCircle2 size={20}/><div><strong>{commitState.success}</strong><span>{commitState.summary.studentsCreated} students created • {commitState.summary.studentsMatched} matched • {commitState.summary.enrollmentsCreated} enrollments added • {commitState.summary.enrollmentsReactivated} reactivated</span></div>
          </div> : null}

          <div className="import-confirm-row">
            <div>
              <strong>{selectedDestinationCount > 0 ? `${selectedDestinationCount} course${selectedDestinationCount === 1 ? "" : "s"} mapped` : "Choose at least one destination above"}</strong>
              <p className="subtle">A student appearing in multiple mapped courses stays one student and receives multiple enrollments.</p>
            </div>
            <button className="primary-button" type="submit" disabled={!canConfirm}>
              {commitPending ? "Importing…" : commitState.success ? "Imported" : selectedDestinationCount === 0 ? "Choose a destination first" : "Confirm roster import"}
            </button>
          </div>
        </form>
      </section> : null}
    </div>
  );
}
