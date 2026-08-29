"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveGradingCategories, type GradingCategoryActionResult } from "./category-actions";
import styles from "./settings.module.css";

type CalculationMethod = "equal_assignment_percentage" | "total_points";

type CategoryRow = {
  clientKey: string;
  id: string | null;
  code: string | null;
  name: string;
  weightPercent: number;
  dropLowest: number;
  lateDeductionPercent: number;
  calculationMethod: CalculationMethod;
  assignmentCount: number;
  defaultTypeCount: number;
};

type Notice = { kind: "success" | "error"; text: string } | null;

export function GradingCategoryManager({
  sectionId,
  categories: initialCategories,
}: {
  sectionId: string;
  categories: Omit<CategoryRow, "clientKey">[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [categories, setCategories] = useState<CategoryRow[]>(() => initialCategories.map((category) => ({ ...category, clientKey: category.id ?? crypto.randomUUID() })));

  const totalWeight = useMemo(() => categories.reduce((sum, category) => sum + (Number.isFinite(category.weightPercent) ? category.weightPercent : 0), 0), [categories]);
  const weightIsValid = Math.abs(totalWeight - 100) <= 0.005;

  function patch(clientKey: string, changes: Partial<CategoryRow>) {
    setCategories((current) => current.map((category) => category.clientKey === clientKey ? { ...category, ...changes } : category));
    setNotice(null);
  }

  function move(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= categories.length) return;
    setCategories((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setNotice(null);
  }

  function addCategory() {
    setCategories((current) => [...current, {
      clientKey: crypto.randomUUID(),
      id: null,
      code: null,
      name: "",
      weightPercent: 10,
      dropLowest: 0,
      lateDeductionPercent: 0,
      calculationMethod: "equal_assignment_percentage",
      assignmentCount: 0,
      defaultTypeCount: 0,
    }]);
    setNotice(null);
  }

  function removeUnsaved(clientKey: string) {
    setCategories((current) => current.filter((category) => category.clientKey !== clientKey));
    setNotice(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("sectionId", sectionId);
    formData.set("categoriesJson", JSON.stringify(categories.map((category) => ({
      id: category.id,
      name: category.name,
      weightPercent: Number(category.weightPercent),
      dropLowest: Number(category.dropLowest),
      lateDeductionPercent: Number(category.lateDeductionPercent),
      calculationMethod: category.calculationMethod,
    }))));
    setNotice(null);
    startTransition(async () => {
      const result: GradingCategoryActionResult = await saveGradingCategories(formData);
      if (result.error) {
        setNotice({ kind: "error", text: result.error });
        return;
      }
      setNotice({ kind: "success", text: result.success ?? "Saved." });
      router.refresh();
    });
  }

  return <form className={styles.manager} onSubmit={submit}>
    {notice ? <div className={notice.kind === "success" ? "import-message success" : "import-message danger"}>{notice.text}</div> : null}

    <div className={weightIsValid ? `${styles.weightSummary} ${styles.weightGood}` : `${styles.weightSummary} ${styles.weightWarning}`}>
      <div><strong>Category weight total</strong><span>Weights must add to 100% before saving.</span></div>
      <strong>{totalWeight.toFixed(totalWeight % 1 === 0 ? 0 : 1)}%</strong>
    </div>

    <section className={styles.typeList} aria-label="Grading categories">
      {categories.map((category, index) => <article className={styles.typeCard} key={category.clientKey}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.titleRow}>
              <span className={styles.orderBadge}>#{index + 1}</span>
              <h3>{category.name || "New category"}</h3>
            </div>
            <p className="subtle">{category.assignmentCount} assignment{category.assignmentCount === 1 ? "" : "s"} • default for {category.defaultTypeCount} assignment type{category.defaultTypeCount === 1 ? "" : "s"}</p>
          </div>
          <div className={styles.orderControls}>
            <button className="secondary-button" type="button" aria-label={`Move ${category.name || "category"} up`} title="Move up" disabled={pending || index === 0} onClick={() => move(index, "up")}><ArrowUp size={16}/></button>
            <button className="secondary-button" type="button" aria-label={`Move ${category.name || "category"} down`} title="Move down" disabled={pending || index === categories.length - 1} onClick={() => move(index, "down")}><ArrowDown size={16}/></button>
            {!category.id ? <button className="secondary-button" type="button" aria-label="Remove unsaved category" title="Remove" disabled={pending} onClick={() => removeUnsaved(category.clientKey)}><X size={16}/></button> : null}
          </div>
        </div>

        <div className={styles.categoryForm}>
          <label>Category name<input required maxLength={100} value={category.name} onChange={(event) => patch(category.clientKey, { name: event.target.value })}/></label>
          <label>Weight (%)<input required type="number" min="0.5" max="100" step="0.5" value={category.weightPercent} onChange={(event) => patch(category.clientKey, { weightPercent: Number(event.target.value) })}/></label>
          <label>Calculation<select value={category.calculationMethod} onChange={(event) => patch(category.clientKey, { calculationMethod: event.target.value as CalculationMethod })}><option value="equal_assignment_percentage">Equal assignment percentages</option><option value="total_points">Total points</option></select></label>
          <label>Drop lowest<input required type="number" min="0" max="1000" step="1" value={category.dropLowest} onChange={(event) => patch(category.clientKey, { dropLowest: Number(event.target.value) })}/></label>
          <label>Late deduction (%)<input required type="number" min="0" max="100" step="1" value={category.lateDeductionPercent} onChange={(event) => patch(category.clientKey, { lateDeductionPercent: Number(event.target.value) })}/></label>
        </div>
      </article>)}
    </section>

    <div className={styles.categoryActions}>
      <button className="secondary-button" type="button" disabled={pending} onClick={addCategory}><Plus size={16}/> Add category</button>
      <button className="primary-button" type="submit" disabled={pending || !weightIsValid || categories.length === 0}><Save size={16}/>{pending ? "Saving…" : "Save grading categories"}</button>
    </div>
  </form>;
}
