"use client";

import { Trash2 } from "lucide-react";
import { clearAssignmentScores } from "../../management-actions";
import styles from "../../assignments.module.css";

type ClearAssignmentScoresButtonProps = {
  assignmentId: string;
  assignmentTitle: string;
  returnTo: string;
  gradeRecordCount: number;
  retakeCount: number;
};

export function ClearAssignmentScoresButton({
  assignmentId,
  assignmentTitle,
  returnTo,
  gradeRecordCount,
  retakeCount,
}: ClearAssignmentScoresButtonProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const extra = retakeCount > 0 ? ` This also removes ${retakeCount} retake attempt${retakeCount === 1 ? "" : "s"}.` : "";
    const confirmed = window.confirm(
      `Clear every student score from “${assignmentTitle}”? This permanently removes ${gradeRecordCount} grade record${gradeRecordCount === 1 ? "" : "s"}.${extra} This cannot be undone.`,
    );
    if (!confirmed) event.preventDefault();
  };

  return <form action={clearAssignmentScores} onSubmit={handleSubmit}>
    <input type="hidden" name="assignmentId" value={assignmentId}/>
    <input type="hidden" name="returnTo" value={returnTo}/>
    <button className={styles.dangerButton} type="submit"><Trash2 size={15}/> Clear All Scores</button>
  </form>;
}
