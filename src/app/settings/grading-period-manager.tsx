"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Layers3, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveGradingPeriods, type GradingPeriodActionResult } from "./period-actions";
import styles from "./settings.module.css";

type PeriodMode = "direct" | "composite";
type PeriodRole = "standard" | "exam";
type PeriodComponent = { componentClientKey: string; weightPercent: number };
type PeriodRow = {
  clientKey: string;
  id: string | null;
  code: string;
  name: string;
  calculationMode: PeriodMode;
  periodRole: PeriodRole;
  assignmentCount: number;
  components: PeriodComponent[];
};

type InitialPeriod = Omit<PeriodRow, "clientKey" | "components"> & {
  id: string;
  components: { periodId: string; weightPercent: number }[];
};
type Notice = { kind: "success" | "error"; text: string } | null;

function hydratePeriods(initialPeriods: InitialPeriod[]): PeriodRow[] {
  return initialPeriods.map((period) => ({
    ...period,
    clientKey: period.id,
    components: period.components.map((component) => ({
      componentClientKey: component.periodId,
      weightPercent: component.weightPercent,
    })),
  }));
}

export function GradingPeriodManager({
  sectionId,
  periods: initialPeriods,
}: {
  sectionId: string;
  periods: InitialPeriod[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [periods, setPeriods] = useState<PeriodRow[]>(() => hydratePeriods(initialPeriods));

  useEffect(() => {
    setPeriods(hydratePeriods(initialPeriods));
  }, [initialPeriods]);

  const directPeriods = useMemo(() => periods.filter((period) => period.calculationMode === "direct"), [periods]);

  const validation = useMemo(() => {
    if (!periods.length) return { valid: false, text: "Add at least one grading period." };
    if (!directPeriods.length) return { valid: false, text: "Keep at least one direct period for assignments." };
    if (periods.some((period) => !period.name.trim() || !period.code.trim())) return { valid: false, text: "Every period needs a code and name." };
    if (periods.some((period) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/.test(period.code.trim()))) return { valid: false, text: "Period codes can use letters, numbers, hyphens, and underscores." };
    const names = periods.map((period) => period.name.trim().toLowerCase());
    const codes = periods.map((period) => period.code.trim().toLowerCase());
    if (new Set(names).size !== names.length) return { valid: false, text: "Period names must be unique." };
    if (new Set(codes).size !== codes.length) return { valid: false, text: "Period codes must be unique." };
    for (const period of periods) {
      if (period.calculationMode !== "composite") continue;
      if (!period.components.length) return { valid: false, text: `${period.code || "Composite period"} needs at least one component.` };
      const keys = period.components.map((component) => component.componentClientKey);
      if (new Set(keys).size !== keys.length) return { valid: false, text: `${period.code} has a duplicate component.` };
      if (period.components.some((component) => !directPeriods.some((direct) => direct.clientKey === component.componentClientKey))) {
        return { valid: false, text: `${period.code} contains a component that is not a direct period.` };
      }
      if (period.components.some((component) => !Number.isFinite(component.weightPercent) || component.weightPercent <= 0 || component.weightPercent > 100)) {
        return { valid: false, text: `${period.code} component weights must be between 0% and 100%.` };
      }
      const total = period.components.reduce((sum, component) => sum + component.weightPercent, 0);
      if (Math.abs(total - 100) > 0.005) return { valid: false, text: `${period.code} components currently total ${total.toFixed(1)}%.` };
    }
    return { valid: true, text: "Period structure is ready to save." };
  }, [directPeriods, periods]);

  function patch(clientKey: string, changes: Partial<PeriodRow>) {
    setPeriods((current) => current.map((period) => period.clientKey === clientKey ? { ...period, ...changes } : period));
    setNotice(null);
  }

  function move(index: number, direction: "up" | "down") {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= periods.length) return;
    setPeriods((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setNotice(null);
  }

  function addPeriod(calculationMode: PeriodMode) {
    setPeriods((current) => [...current, {
      clientKey: crypto.randomUUID(),
      id: null,
      code: "",
      name: "",
      calculationMode,
      periodRole: "standard",
      assignmentCount: 0,
      components: [],
    }]);
    setNotice(null);
  }

  function removeUnsaved(clientKey: string) {
    setPeriods((current) => current
      .filter((period) => period.clientKey !== clientKey)
      .map((period) => ({
        ...period,
        components: period.components.filter((component) => component.componentClientKey !== clientKey),
      })));
    setNotice(null);
  }

  function toggleComponent(parentClientKey: string, componentClientKey: string, checked: boolean) {
    setPeriods((current) => current.map((period) => {
      if (period.clientKey !== parentClientKey) return period;
      if (!checked) return { ...period, components: period.components.filter((component) => component.componentClientKey !== componentClientKey) };
      if (period.components.some((component) => component.componentClientKey === componentClientKey)) return period;
      return {
        ...period,
        components: [...period.components, {
          componentClientKey,
          weightPercent: period.components.length === 0 ? 100 : 10,
        }],
      };
    }));
    setNotice(null);
  }

  function setComponentWeight(parentClientKey: string, componentClientKey: string, weightPercent: number) {
    setPeriods((current) => current.map((period) => period.clientKey !== parentClientKey ? period : {
      ...period,
      components: period.components.map((component) => component.componentClientKey === componentClientKey ? { ...component, weightPercent } : component),
    }));
    setNotice(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("sectionId", sectionId);
    formData.set("periodsJson", JSON.stringify(periods.map((period) => ({
      clientKey: period.clientKey,
      id: period.id,
      code: period.code.trim(),
      name: period.name.trim(),
      calculationMode: period.calculationMode,
      periodRole: period.calculationMode === "composite" ? "standard" : period.periodRole,
      components: period.components,
    }))));
    setNotice(null);
    startTransition(async () => {
      const result: GradingPeriodActionResult = await saveGradingPeriods(formData);
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

    <div className={validation.valid ? `${styles.weightSummary} ${styles.weightGood}` : `${styles.weightSummary} ${styles.weightWarning}`}>
      <div><strong>Period structure</strong><span>{validation.text}</span></div>
      <strong>{directPeriods.length} direct · {periods.length - directPeriods.length} composite</strong>
    </div>

    <section className={styles.typeList} aria-label="Grading periods">
      {periods.map((period, index) => {
        const componentTotal = period.components.reduce((sum, component) => sum + (Number.isFinite(component.weightPercent) ? component.weightPercent : 0), 0);
        return <article className={styles.typeCard} key={period.clientKey}>
          <div className={styles.cardHeader}>
            <div>
              <div className={styles.titleRow}>
                <span className={styles.orderBadge}>#{index + 1}</span>
                <h3>{period.name || "New grading period"}</h3>
                <span className={period.calculationMode === "direct" ? "status success-pill" : "status neutral-pill"}>{period.calculationMode === "direct" ? "Direct" : "Composite"}</span>
              </div>
              <p className="subtle">{period.id ? `${period.code} • ` : ""}{period.calculationMode === "direct" ? `${period.assignmentCount} assignment${period.assignmentCount === 1 ? "" : "s"}` : `${period.components.length} component${period.components.length === 1 ? "" : "s"}`}</p>
            </div>
            <div className={styles.orderControls}>
              <button className="secondary-button" type="button" aria-label={`Move ${period.name || "period"} up`} title="Move up" disabled={pending || index === 0} onClick={() => move(index, "up")}><ArrowUp size={16}/></button>
              <button className="secondary-button" type="button" aria-label={`Move ${period.name || "period"} down`} title="Move down" disabled={pending || index === periods.length - 1} onClick={() => move(index, "down")}><ArrowDown size={16}/></button>
              {!period.id ? <button className="secondary-button" type="button" aria-label="Remove unsaved grading period" title="Remove" disabled={pending} onClick={() => removeUnsaved(period.clientKey)}><X size={16}/></button> : null}
            </div>
          </div>

          <div className={styles.periodForm}>
            <label>Short code<input required maxLength={16} disabled={Boolean(period.id)} value={period.code} placeholder={period.calculationMode === "direct" ? "e.g. Q1" : "e.g. S1"} onChange={(event) => patch(period.clientKey, { code: event.target.value.toUpperCase() })}/></label>
            <label>Display name<input required maxLength={100} value={period.name} placeholder={period.calculationMode === "direct" ? "e.g. Quarter 1" : "e.g. Semester 1"} onChange={(event) => patch(period.clientKey, { name: event.target.value })}/></label>
            {period.calculationMode === "direct" ? <label>Role<select value={period.periodRole} onChange={(event) => patch(period.clientKey, { periodRole: event.target.value as PeriodRole })}><option value="standard">Standard</option><option value="exam">Exam</option></select></label> : <label>Role<input disabled value="Composite result"/></label>}
          </div>

          {period.calculationMode === "composite" ? <div className={styles.componentEditor}>
            <div className={styles.componentHeader}>
              <div><strong>Components</strong><span>Select direct periods and set how much each contributes.</span></div>
              <strong className={Math.abs(componentTotal - 100) <= 0.005 ? styles.componentTotalGood : styles.componentTotalWarning}>{componentTotal.toFixed(componentTotal % 1 === 0 ? 0 : 1)}%</strong>
            </div>
            <div className={styles.componentList}>
              {directPeriods.length ? directPeriods.map((direct) => {
                const component = period.components.find((item) => item.componentClientKey === direct.clientKey);
                return <div className={styles.componentRow} key={direct.clientKey}>
                  <label className={styles.componentToggle}>
                    <input type="checkbox" checked={Boolean(component)} onChange={(event) => toggleComponent(period.clientKey, direct.clientKey, event.target.checked)}/>
                    <span><strong>{direct.code || "New"}</strong><small>{direct.name || "Unnamed direct period"}</small></span>
                  </label>
                  <label className={styles.componentWeight}>Weight (%)<input type="number" min="0.5" max="100" step="0.5" disabled={!component} value={component?.weightPercent ?? ""} onChange={(event) => setComponentWeight(period.clientKey, direct.clientKey, Number(event.target.value))}/></label>
                </div>;
              }) : <p className="subtle">Add a direct grading period before configuring a composite.</p>}
            </div>
          </div> : null}
        </article>;
      })}
    </section>

    <div className={styles.categoryActions}>
      <button className="secondary-button" type="button" disabled={pending} onClick={() => addPeriod("direct")}><Plus size={16}/> Add direct period</button>
      <button className="secondary-button" type="button" disabled={pending || directPeriods.length === 0} onClick={() => addPeriod("composite")}><Layers3 size={16}/> Add composite period</button>
      <button className="primary-button" type="submit" disabled={pending || !validation.valid}><Save size={16}/>{pending ? "Saving…" : "Save grading periods"}</button>
    </div>
  </form>;
}
