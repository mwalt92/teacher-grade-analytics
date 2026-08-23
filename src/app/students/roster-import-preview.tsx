"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { previewRosterImport, type RosterImportPreviewState } from "./actions";

const initialState: RosterImportPreviewState = {};

export function RosterImportPreview({ sectionId }: { sectionId: string }) {
  const [state, formAction, pending] = useActionState(previewRosterImport, initialState);

  return (
    <div className="import-preview">
      <form action={formAction} className="import-form">
        <input type="hidden" name="sectionId" value={sectionId} />
        <label className="file-drop">
          <FileSpreadsheet size={24} />
          <span><strong>Choose PowerSchool roster</strong><small>.xlsx • up to 5 MB</small></span>
          <input name="rosterFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </label>
        <button className="primary-button" type="submit" disabled={pending}><Upload size={17}/>{pending ? "Reading roster…" : "Preview import"}</button>
      </form>

      {state.error ? <div className="import-message danger"><AlertTriangle size={18}/><span>{state.error}</span></div> : null}

      {state.groups ? <section className="preview-results">
        <div className="preview-summary">
          <div><p className="eyebrow">Import preview</p><h3>{state.totalRows} roster rows detected</h3><p className="subtle">{state.fileName}</p></div>
          <span className={state.hasStudentNumbers ? "status success-pill" : "status warning-pill"}>{state.hasStudentNumbers ? "Student numbers detected" : "Review required"}</span>
        </div>

        {state.warnings?.map((warning) => <div className="import-message warning" key={warning}><AlertTriangle size={17}/><span>{warning}</span></div>)}

        <div className="course-preview-list">
          {state.groups.map((group) => <details className="course-preview" key={group.course}>
            <summary>
              <div><strong>{group.course}</strong><span>{group.studentCount} students</span></div>
              <div className="preview-counts"><span>{group.existingCount} existing</span><span>{group.newCount} new</span>{group.nameOnlyCount > 0 ? <span>{group.nameOnlyCount} name-only</span> : null}</div>
            </summary>
            <div className="preview-students">
              {group.students.map((student, index) => <div className="preview-student" key={`${student.studentNumber ?? student.name}-${index}`}>
                <span className="preview-icon">{student.existing ? <CheckCircle2 size={16}/> : <span className="new-dot">●</span>}</span>
                <strong>{student.name}</strong>
                <span>{student.studentNumber ? `#${student.studentNumber}` : "No student number"}</span>
                <span>{student.existing ? "Match existing student" : student.studentNumber ? "Create student" : "Needs identity review"}</span>
              </div>)}
            </div>
          </details>)}
        </div>

        <div className="import-next-step">
          <strong>Preview only — nothing has been imported.</strong>
          <p className="subtle">The next step maps each detected PowerSchool course to one of your sections, then shows exactly which students and enrollments will be created or updated before you confirm.</p>
        </div>
      </section> : null}
    </div>
  );
}
