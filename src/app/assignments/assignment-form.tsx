"use client";

import { useState } from "react";
import { ClipboardCheck, FileQuestion, Plus } from "lucide-react";
import { createAssignment } from "./actions";

type Period = { id: string; code: string; name: string };
type Category = { id: string; code: string; name: string };
type AssignmentType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultCategoryId: string;
  defaultPointsPossible: number;
  defaultAllowRetakes: boolean;
};

export function AssignmentForm({
  sectionId,
  periods,
  categories,
  assignmentTypes,
  today,
}: {
  sectionId: string;
  periods: Period[];
  categories: Category[];
  assignmentTypes: AssignmentType[];
  today: string;
}) {
  const initialType = assignmentTypes[0] ?? null;
  const [assignmentTypeId, setAssignmentTypeId] = useState(initialType?.id ?? "");
  const [categoryId, setCategoryId] = useState(initialType?.defaultCategoryId ?? categories[0]?.id ?? "");
  const [pointsPossible, setPointsPossible] = useState(initialType?.defaultPointsPossible ?? 10);
  const [allowRetakes, setAllowRetakes] = useState(initialType?.defaultAllowRetakes ?? false);
  const selectedType = assignmentTypes.find((type) => type.id === assignmentTypeId) ?? initialType;
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const quarterPeriods = periods.filter((period) => period.code.startsWith("Q"));

  function chooseType(type: AssignmentType) {
    setAssignmentTypeId(type.id);
    setCategoryId(type.defaultCategoryId);
    setPointsPossible(type.defaultPointsPossible);
    setAllowRetakes(type.defaultAllowRetakes);
  }

  if (!assignmentTypes.length || !categories.length) {
    return <div className="import-message warning">Configure at least one assignment type and grading category before creating an assignment.</div>;
  }

  return <form className="assignment-create-form" action={createAssignment}>
    <input type="hidden" name="sectionId" value={sectionId}/>
    <input type="hidden" name="assignmentTypeId" value={assignmentTypeId}/>

    <div className="choice-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {assignmentTypes.map((type) => {
        const selected = type.id === assignmentTypeId;
        const Icon = type.code === "participation" ? ClipboardCheck : FileQuestion;
        return <button type="button" key={type.id} className={selected ? "choice-card selected" : "choice-card"} onClick={() => chooseType(type)}>
          <Icon size={24}/><span><strong>{type.name}</strong><small>{type.description ?? "Configured assignment workflow"}</small></span>
        </button>;
      })}
    </div>

    <div className="form-grid">
      <label className="wide-field">Assignment name<input name="title" required autoFocus placeholder={selectedType ? `e.g. ${selectedType.name} assignment` : "Assignment name"}/></label>
      <label>Date<input name="assignmentDate" type="date" required defaultValue={today}/></label>
      <label>Points possible<input name="pointsPossible" type="number" min="0.01" step="0.01" required value={pointsPossible} onChange={(event) => setPointsPossible(Number(event.target.value))}/></label>
      <label>Grading period<select name="gradingPeriodId" required defaultValue={quarterPeriods[0]?.id ?? ""}><option value="" disabled>Choose quarter</option>{quarterPeriods.map((period) => <option value={period.id} key={period.id}>{period.code} — {period.name}</option>)}</select></label>
      <label>Grading category<select name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, color: "var(--text)" }}>
        <input style={{ width: "auto", minHeight: "auto", flex: "none" }} type="checkbox" name="allowRetakes" value="true" checked={allowRetakes} onChange={(event) => setAllowRetakes(event.target.checked)}/>
        <span style={{ display: "grid", gap: 2 }}><strong>Allow future retakes</strong><small style={{ color: "var(--muted)", fontWeight: 500 }}>Independent of assignment type and grading category.</small></span>
      </label>
    </div>

    <div className="creation-summary">
      <div><strong>{selectedType?.name ?? "Assignment"} → {selectedCategory?.name ?? "Choose category"}</strong><span>{allowRetakes ? "Retakes are enabled and every attempt will remain in history." : "Single-attempt by default. Existing history is never removed by this setting."}</span></div>
      <button className="primary-button" type="submit"><Plus size={17}/> Create & enter grades</button>
    </div>
  </form>;
}
