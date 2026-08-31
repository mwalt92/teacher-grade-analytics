"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, FileQuestion, Plus } from "lucide-react";
import { createAssignment } from "./actions";

type Period = { id: string; code: string; name: string };
type Category = { id: string; code: string; name: string };
type TargetSection = { id: string; name: string; periodNumber: number | null };
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
  targetSections,
  periods,
  categories,
  assignmentTypes,
  today,
}: {
  sectionId: string;
  targetSections: TargetSection[];
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
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([sectionId]);
  const selectedType = assignmentTypes.find((type) => type.id === assignmentTypeId) ?? initialType;
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const selectedSectionNames = useMemo(
    () => targetSections.filter((section) => selectedSectionIds.includes(section.id)).map((section) => section.name),
    [selectedSectionIds, targetSections],
  );

  function chooseType(type: AssignmentType) {
    setAssignmentTypeId(type.id);
    setCategoryId(type.defaultCategoryId);
    setPointsPossible(type.defaultPointsPossible);
    setAllowRetakes(type.defaultAllowRetakes);
  }

  function toggleSection(targetSectionId: string) {
    setSelectedSectionIds((current) => current.includes(targetSectionId)
      ? current.filter((id) => id !== targetSectionId)
      : [...current, targetSectionId]);
  }

  if (!assignmentTypes.length || !categories.length || !periods.length) {
    return <div className="import-message warning">Configure at least one assignment type, grading category, and direct grading period before creating an assignment.</div>;
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

    <fieldset style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><legend style={{ fontWeight: 800, padding: 0 }}>Publish to sections</legend><p className="subtle" style={{ margin: "4px 0 0" }}>Choose one or more class periods. The assignment will be linked across those sections, but grades remain separate.</p></div>
        {targetSections.length > 1 ? <div className="toolbar-group">
          <button className="text-button" type="button" onClick={() => setSelectedSectionIds(targetSections.map((section) => section.id))}>Select all</button>
          <button className="text-button" type="button" onClick={() => setSelectedSectionIds([sectionId])}>Current only</button>
        </div> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {targetSections.map((targetSection) => {
          const checked = selectedSectionIds.includes(targetSection.id);
          return <label key={targetSection.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${checked ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: "11px 12px", background: checked ? "var(--brand-soft)" : "var(--surface)" }}>
            <input type="checkbox" name="sectionIds" value={targetSection.id} checked={checked} onChange={() => toggleSection(targetSection.id)} style={{ width: "auto", minHeight: "auto", flex: "none" }}/>
            <span style={{ display: "grid", gap: 2 }}><strong>{targetSection.name}</strong>{targetSection.periodNumber ? <small className="subtle">Period {targetSection.periodNumber}</small> : null}</span>
          </label>;
        })}
      </div>
      {selectedSectionIds.length === 0 ? <div className="import-message warning">Choose at least one section before creating the assignment.</div> : null}
    </fieldset>

    <div className="form-grid">
      <label className="wide-field">Assignment name<input name="title" required autoFocus placeholder={selectedType ? `e.g. ${selectedType.name} assignment` : "Assignment name"}/></label>
      <label>Date<input name="assignmentDate" type="date" required defaultValue={today}/></label>
      <label>Points possible<input name="pointsPossible" type="number" min="0.5" step="0.5" required value={pointsPossible} onChange={(event) => setPointsPossible(Number(event.target.value))}/></label>
      <label>Grading period<select name="gradingPeriodId" required defaultValue={periods[0]?.id ?? ""}><option value="" disabled>Choose period</option>{periods.map((period) => <option value={period.id} key={period.id}>{period.code} — {period.name}</option>)}</select></label>
      <label>Grading category<select name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, color: "var(--text)" }}>
        <input style={{ width: "auto", minHeight: "auto", flex: "none" }} type="checkbox" name="allowRetakes" value="true" checked={allowRetakes} onChange={(event) => setAllowRetakes(event.target.checked)}/>
        <span style={{ display: "grid", gap: 2 }}><strong>Allow future retakes</strong><small style={{ color: "var(--muted)", fontWeight: 500 }}>Independent of assignment type and grading category.</small></span>
      </label>
    </div>

    <div className="creation-summary">
      <div><strong>{selectedType?.name ?? "Assignment"} → {selectedCategory?.name ?? "Choose category"}</strong><span>{selectedSectionIds.length ? `Publishing to ${selectedSectionIds.length} section${selectedSectionIds.length === 1 ? "" : "s"}: ${selectedSectionNames.join(", ")}. ` : "Choose a section. "}{allowRetakes ? "Retakes are enabled and every attempt will remain in history." : "Single-attempt by default. Existing history is never removed by this setting."}</span></div>
      <button className="primary-button" type="submit" disabled={selectedSectionIds.length === 0}><Plus size={17}/> Create & enter grades</button>
    </div>
  </form>;
}
