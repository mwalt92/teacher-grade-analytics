"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Save } from "lucide-react";
import {
  createAssignmentType,
  moveAssignmentType,
  setAssignmentTypeActive,
  updateAssignmentType,
  type AssignmentTypeActionResult,
} from "./actions";
import styles from "./settings.module.css";

type CategoryOption = { id: string; name: string };
type AssignmentTypeRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultCategoryId: string;
  defaultPointsPossible: number;
  defaultAllowRetakes: boolean;
  active: boolean;
  sortOrder: number;
  assignmentCount: number;
};

type Notice = { kind: "success" | "error"; text: string } | null;

export function AssignmentTypeManager({
  sectionId,
  categories,
  assignmentTypes,
}: {
  sectionId: string;
  categories: CategoryOption[];
  assignmentTypes: AssignmentTypeRow[];
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);

  function finish(result: AssignmentTypeActionResult, resetCreate = false) {
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setNotice({ kind: "success", text: result.success ?? "Saved." });
    if (resetCreate) createFormRef.current?.reset();
    router.refresh();
  }

  function submitForm(event: FormEvent<HTMLFormElement>, action: (formData: FormData) => Promise<AssignmentTypeActionResult>, resetCreate = false) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setNotice(null);
    startTransition(async () => finish(await action(formData), resetCreate));
  }

  function runQuickAction(action: (formData: FormData) => Promise<AssignmentTypeActionResult>, values: Record<string, string>) {
    const formData = new FormData();
    formData.set("sectionId", sectionId);
    Object.entries(values).forEach(([key, value]) => formData.set(key, value));
    setNotice(null);
    startTransition(async () => finish(await action(formData)));
  }

  return <div className={styles.manager}>
    {notice ? <div className={notice.kind === "success" ? "import-message success" : "import-message danger"}>{notice.text}</div> : null}

    <section className={styles.typeList} aria-label="Assignment type hotlist">
      {assignmentTypes.map((type, index) => <article className={type.active ? styles.typeCard : `${styles.typeCard} ${styles.inactiveCard}`} key={type.id}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.titleRow}>
              <span className={styles.orderBadge}>#{index + 1}</span>
              <h3>{type.name}</h3>
              <span className={type.active ? "status success-pill" : "status neutral-pill"}>{type.active ? "On hotlist" : "Inactive"}</span>
            </div>
            <p className="subtle">Internal code: <code>{type.code}</code> • {type.assignmentCount} existing assignment{type.assignmentCount === 1 ? "" : "s"}</p>
          </div>
          <div className={styles.orderControls}>
            <button className="secondary-button" type="button" aria-label={`Move ${type.name} up`} title="Move up" disabled={pending || index === 0} onClick={() => runQuickAction(moveAssignmentType, { assignmentTypeId: type.id, direction: "up" })}><ArrowUp size={16}/></button>
            <button className="secondary-button" type="button" aria-label={`Move ${type.name} down`} title="Move down" disabled={pending || index === assignmentTypes.length - 1} onClick={() => runQuickAction(moveAssignmentType, { assignmentTypeId: type.id, direction: "down" })}><ArrowDown size={16}/></button>
          </div>
        </div>

        <form className={styles.typeForm} onSubmit={(event) => submitForm(event, updateAssignmentType)}>
          <input type="hidden" name="sectionId" value={sectionId}/>
          <input type="hidden" name="assignmentTypeId" value={type.id}/>
          <label>Display name<input name="name" required maxLength={100} defaultValue={type.name}/></label>
          <label>Default category<select name="defaultCategoryId" required defaultValue={type.defaultCategoryId}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Default points<input name="defaultPointsPossible" type="number" min="0.5" max="100000" step="0.5" required defaultValue={type.defaultPointsPossible}/></label>
          <label className={styles.descriptionField}>Description <span className="optional">optional</span><input name="description" maxLength={240} defaultValue={type.description ?? ""} placeholder="Short note shown on the New Assignment card"/></label>
          <label className={styles.checkboxField}><input type="checkbox" name="defaultAllowRetakes" value="true" defaultChecked={type.defaultAllowRetakes}/><span><strong>Retakes on by default</strong><small>Teachers can still override this on an individual assignment.</small></span></label>
          <div className={styles.cardActions}>
            <button className="primary-button" type="submit" disabled={pending}><Save size={16}/>{pending ? "Saving…" : "Save defaults"}</button>
            <button className="text-button" type="button" disabled={pending} onClick={() => runQuickAction(setAssignmentTypeActive, { assignmentTypeId: type.id, active: type.active ? "false" : "true" })}>{type.active ? "Deactivate" : "Reactivate"}</button>
          </div>
        </form>
      </article>)}
    </section>

    <article className={`panel ${styles.addCard}`}>
      <div>
        <p className="eyebrow">Add to hotlist</p>
        <h3>Create assignment type</h3>
        <p className="subtle">The internal code is generated once and stays stable even if you rename the visible label later.</p>
      </div>
      <form ref={createFormRef} className={styles.typeForm} onSubmit={(event) => submitForm(event, createAssignmentType, true)}>
        <input type="hidden" name="sectionId" value={sectionId}/>
        <label>Display name<input name="name" required maxLength={100} placeholder="e.g. Exit Ticket"/></label>
        <label>Default category<select name="defaultCategoryId" required defaultValue={categories[0]?.id ?? ""}><option value="" disabled>Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Default points<input name="defaultPointsPossible" type="number" min="0.5" max="100000" step="0.5" required defaultValue="10"/></label>
        <label className={styles.descriptionField}>Description <span className="optional">optional</span><input name="description" maxLength={240} placeholder="Short note shown on the New Assignment card"/></label>
        <label className={styles.checkboxField}><input type="checkbox" name="defaultAllowRetakes" value="true"/><span><strong>Retakes on by default</strong><small>This only sets the starting value for new assignments.</small></span></label>
        <div className={styles.cardActions}><button className="primary-button" type="submit" disabled={pending || categories.length === 0}><Plus size={16}/>{pending ? "Adding…" : "Add assignment type"}</button></div>
      </form>
    </article>
  </div>;
}
