"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MailCheck } from "lucide-react";
import { reconcileRosterEmails, type EmailRosterStudent } from "@/lib/import/roster-email-reconciliation";
import { updateRosterEmails, type RosterEmailCommitState } from "./email-actions";
import styles from "./email-reconciliation.module.css";

const initialState: RosterEmailCommitState = {};

type Props = {
  sectionId: string;
  students: EmailRosterStudent[];
};

export function EmailReconciliation({ sectionId, students }: Props) {
  const [state, action, pending] = useActionState(updateRosterEmails, initialState);
  const [sourceEmails, setSourceEmails] = useState("");
  const reconciliation = useMemo(() => reconcileRosterEmails(students, sourceEmails), [students, sourceEmails]);
  const automaticSelections = useMemo(() => Object.fromEntries(
    reconciliation.matches.filter((match) => match.email).map((match) => [match.studentNumber, match.email as string]),
  ), [reconciliation.matches]);
  const [selections, setSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelections(automaticSelections);
  }, [automaticSelections]);

  const selectedEmails = students.map((student) => selections[student.studentNumber] ?? "").filter(Boolean);
  const duplicateSelections = selectedEmails.filter((email, index) => selectedEmails.indexOf(email) !== index);
  const selectedSet = new Set(selectedEmails);
  const unusedEmails = reconciliation.emails.filter((email) => !selectedSet.has(email));
  const unmappedStudents = students.filter((student) => !selections[student.studentNumber]);
  const missingIdentity = students.filter((student) => !student.studentNumber);
  const countMatches = reconciliation.emails.length === students.length;

  const ready = Boolean(sourceEmails.trim())
    && students.length > 0
    && missingIdentity.length === 0
    && reconciliation.invalidTokens.length === 0
    && reconciliation.duplicateEmails.length === 0
    && duplicateSelections.length === 0
    && unusedEmails.length === 0
    && unmappedStudents.length === 0
    && countMatches;

  const mappingJson = JSON.stringify(students
    .map((student) => ({ studentNumber: student.studentNumber, email: selections[student.studentNumber] ?? "" }))
    .filter((mapping) => mapping.studentNumber && mapping.email));

  const automaticByStudent = new Map(reconciliation.matches.map((match) => [match.studentNumber, match]));

  return <div className={styles.wrap}>
    <div className={styles.instructions}>
      <p className="eyebrow">Step 2 • Email reconciliation</p>
      <h3>Match the separate PowerSchool email list</h3>
      <p className="subtle">Paste the semicolon-delimited email line for this section. The site will suggest matches from the first-initial + last-name handle, but nothing is saved until every row is reviewed and you confirm.</p>
    </div>

    {students.length === 0 ? <div className="import-message warning"><AlertTriangle size={17}/><span>There are no active students in this section to reconcile.</span></div> : <form action={action} className={styles.form}>
      <input type="hidden" name="sectionId" value={sectionId}/>
      <input type="hidden" name="mappingJson" value={mappingJson}/>
      <label className={styles.inputLabel}>PowerSchool email list
        <textarea
          className={styles.textarea}
          name="sourceEmails"
          value={sourceEmails}
          onChange={(event) => setSourceEmails(event.target.value)}
          placeholder="student1@school.org;student2@school.org;student3@school.org"
        />
      </label>

      {sourceEmails.trim() ? <>
        <div className={styles.summary}>
          <span className={countMatches ? "status success-pill" : "status warning-pill"}>{reconciliation.emails.length} emails / {students.length} active students</span>
          <span className={reconciliation.unresolvedStudentCount === 0 ? "status success-pill" : "status warning-pill"}>{reconciliation.exactMatchCount} automatic matches</span>
          <span className={ready ? "status success-pill" : "status neutral-pill"}>{ready ? "Ready to save" : "Review needed"}</span>
        </div>

        <div className={styles.warningStack}>
          {!countMatches ? <div className="import-message warning"><AlertTriangle size={17}/><span>The email count does not match the active roster. Every active student and every pasted email must be accounted for.</span></div> : null}
          {reconciliation.invalidTokens.length > 0 ? <div className="import-message danger"><AlertTriangle size={17}/><span>{reconciliation.invalidTokens.length} pasted value{reconciliation.invalidTokens.length === 1 ? " is" : "s are"} not valid email addresses.</span></div> : null}
          {reconciliation.duplicateEmails.length > 0 ? <div className="import-message danger"><AlertTriangle size={17}/><span>Duplicate email addresses were found in the pasted list.</span></div> : null}
          {duplicateSelections.length > 0 ? <div className="import-message danger"><AlertTriangle size={17}/><span>The same email is selected for more than one student.</span></div> : null}
          {unusedEmails.length > 0 ? <div className="import-message warning"><AlertTriangle size={17}/><span>{unusedEmails.length} pasted email{unusedEmails.length === 1 ? " is" : "s are"} still unmatched.</span></div> : null}
          {missingIdentity.length > 0 ? <div className="import-message danger"><AlertTriangle size={17}/><span>At least one active student is missing a Student Number identity key and cannot be updated safely.</span></div> : null}
        </div>

        <div className={styles.reviewList}>
          {students.map((student) => {
            const automatic = automaticByStudent.get(student.studentNumber);
            const selected = selections[student.studentNumber] ?? "";
            const currentEmail = student.currentEmail?.toLowerCase() ?? null;
            let status = "Needs match";
            if (selected && currentEmail === selected) status = "Already linked";
            else if (selected && automatic?.email === selected) status = currentEmail ? "Auto match • will update" : "Auto match";
            else if (selected) status = currentEmail ? "Manual • will update" : "Manual match";
            else if (automatic?.status === "ambiguous") status = "Ambiguous";

            return <div className={styles.reviewRow} key={student.studentNumber || student.displayName}>
              <div className={styles.studentMeta}>
                <strong>{student.displayName}</strong>
                <small>{student.currentEmail ? `Current: ${student.currentEmail}` : "No email linked yet"}</small>
              </div>
              <select
                aria-label={`Email for ${student.displayName}`}
                value={selected}
                onChange={(event) => setSelections((current) => ({ ...current, [student.studentNumber]: event.target.value }))}
                disabled={!student.studentNumber}
              >
                <option value="">Choose an email…</option>
                {reconciliation.emails.map((email) => <option key={email} value={email}>{email}</option>)}
              </select>
              <span className={styles.statusText}>{status}</span>
            </div>;
          })}
        </div>
      </> : null}

      {state.error ? <div className="import-message danger"><AlertTriangle size={18}/><span>{state.error}</span></div> : null}
      {state.success && state.summary ? <div className="import-success"><CheckCircle2 size={20}/><div><strong>{state.success}</strong><span>{state.summary.updated} updated • {state.summary.unchanged} already correct</span></div></div> : null}

      <div className={styles.confirmRow}>
        <div className={styles.confirmCopy}>
          <strong>{ready ? "All active students have one reviewed email." : "Paste and reconcile the section email list."}</strong>
          <span className="subtle">Saving only updates school email fields; it does not change enrollment, Student Numbers, grades, or student UUIDs.</span>
        </div>
        <button className="primary-button" type="submit" disabled={!ready || pending}>
          <MailCheck size={17}/>{pending ? "Saving…" : "Save reviewed emails"}
        </button>
      </div>
    </form>}
  </div>;
}
