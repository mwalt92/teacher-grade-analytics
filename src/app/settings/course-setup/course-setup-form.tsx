"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Plus } from "lucide-react";
import { createTeacherCourse } from "./actions";
import styles from "./course-setup.module.css";

type SchoolYearOption = {
  id: string;
  label: string;
  archived: boolean;
};

type SourceCourse = {
  offeringId: string;
  label: string;
  schoolYearLabel: string;
  active: boolean;
  categoryCount: number;
  assignmentTypeCount: number;
  gradingPeriodCount: number;
};

type Basics = {
  courseName: string;
  courseCode: string;
  sectionName: string;
  periodNumber: string;
  sourceOfferingId: string;
};

export function CourseSetupForm({
  defaultSchoolYearId,
  schoolYears,
  sources,
}: {
  defaultSchoolYearId: string;
  schoolYears: SchoolYearOption[];
  sources: SourceCourse[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [schoolYearId, setSchoolYearId] = useState(defaultSchoolYearId);
  const [basics, setBasics] = useState<Basics>({ courseName: "", courseCode: "", sectionName: "", periodNumber: "", sourceOfferingId: "" });
  const [copyCategories, setCopyCategories] = useState(true);
  const [copyAssignmentTypes, setCopyAssignmentTypes] = useState(true);
  const [copyGradingPeriods, setCopyGradingPeriods] = useState(true);

  const selectedSource = useMemo(() => sources.find((source) => source.offeringId === basics.sourceOfferingId) ?? null, [sources, basics.sourceOfferingId]);
  const selectedSchoolYear = useMemo(() => schoolYears.find((year) => year.id === schoolYearId) ?? schoolYears[0] ?? null, [schoolYears, schoolYearId]);

  function update<K extends keyof Basics>(key: K, value: Basics[K]) {
    setBasics((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchoolYear || selectedSchoolYear.archived) return setError("Choose an active school year for the new course.");
    if (!basics.courseName.trim()) return setError("Enter a course name before continuing.");
    if (!basics.sectionName.trim()) return setError("Enter the first class period or section name.");
    if (basics.periodNumber) {
      const period = Number(basics.periodNumber);
      if (!Number.isInteger(period) || period < 0 || period > 99) return setError("Class period must be a whole number between 0 and 99.");
    }
    setError(null);
    setStep(2);
  }

  function chooseSource(value: string) {
    update("sourceOfferingId", value);
    if (!value) {
      setCopyCategories(false);
      setCopyAssignmentTypes(false);
      setCopyGradingPeriods(false);
    } else {
      setCopyCategories(true);
      setCopyAssignmentTypes(true);
      setCopyGradingPeriods(true);
    }
  }

  function toggleCategories(next: boolean) {
    setCopyCategories(next);
    if (!next) setCopyAssignmentTypes(false);
  }

  function toggleAssignmentTypes(next: boolean) {
    setCopyAssignmentTypes(next);
    if (next) setCopyCategories(true);
  }

  function sourceContext(source: SourceCourse) {
    if (source.schoolYearLabel !== selectedSchoolYear?.label) return `Previous year • ${source.schoolYearLabel}`;
    return `${source.active ? "Active course" : "Archived course"} • ${source.schoolYearLabel}`;
  }

  function createCourse() {
    const formData = new FormData();
    formData.set("courseName", basics.courseName);
    formData.set("courseCode", basics.courseCode);
    formData.set("schoolYearId", schoolYearId);
    formData.set("sectionName", basics.sectionName);
    formData.set("periodNumber", basics.periodNumber);
    formData.set("sourceOfferingId", basics.sourceOfferingId);
    formData.set("copyCategories", copyCategories ? "true" : "false");
    formData.set("copyAssignmentTypes", copyAssignmentTypes ? "true" : "false");
    formData.set("copyGradingPeriods", copyGradingPeriods ? "true" : "false");
    setError(null);
    startTransition(async () => {
      const result = await createTeacherCourse(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/settings?area=course-sections");
      router.refresh();
    });
  }

  return <div className={styles.wrap}>
    <div className={styles.steps} aria-label="Course setup progress">
      <span className={step === 1 ? styles.stepActive : styles.stepDone}><strong>1</strong> Course basics</span>
      <span className={step === 2 ? styles.stepActive : ""}><strong>2</strong> Review &amp; copy</span>
    </div>

    {error ? <div className="import-message danger">{error}</div> : null}

    {step === 1 ? <form className={styles.form} onSubmit={review}>
      <section className="panel">
        <p className="eyebrow">New course</p>
        <h2>Course basics</h2>
        <p className="subtle">Choose the school year for the new course, then create its first class period. You can add more sections immediately afterward.</p>
        <div className={styles.fields}>
          <label className={styles.wide}>Course name<input value={basics.courseName} onChange={(event) => update("courseName", event.target.value)} maxLength={160} required placeholder="e.g. Pre-Calculus / Trigonometry"/></label>
          <label>School year<select value={schoolYearId} onChange={(event) => { setSchoolYearId(event.target.value); setError(null); }}>{schoolYears.map((year) => <option key={year.id} value={year.id} disabled={year.archived}>{year.label}{year.archived ? " — archived" : ""}</option>)}</select></label>
          <label>Course code <span className="optional">optional</span><input value={basics.courseCode} onChange={(event) => update("courseCode", event.target.value)} maxLength={40} placeholder="e.g. MATH 136"/></label>
          <label>First section<input value={basics.sectionName} onChange={(event) => update("sectionName", event.target.value)} maxLength={100} required placeholder="e.g. 3rd Hour"/></label>
          <label>Class period <span className="optional">optional</span><input value={basics.periodNumber} onChange={(event) => update("periodNumber", event.target.value)} type="number" min="0" max="99" step="1" placeholder="3"/></label>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Starting point</p>
        <h3>Blank, existing, or previous-year course?</h3>
        <p className="subtle">Historical courses are valid configuration sources. Copying never brings over students, rosters, assignments, scores, or grade history.</p>
        <div className={styles.sourceGrid}>
          <button type="button" className={!basics.sourceOfferingId ? styles.sourceSelected : styles.sourceCard} onClick={() => chooseSource("")}>
            <Plus size={20}/><span><strong>Blank Course</strong><small>Start with no categories, assignment types, or grading periods.</small></span>
          </button>
          {sources.map((source) => <button type="button" key={source.offeringId} className={basics.sourceOfferingId === source.offeringId ? styles.sourceSelected : styles.sourceCard} onClick={() => chooseSource(source.offeringId)}>
            <Copy size={20}/><span><strong>{source.label}</strong><small>{sourceContext(source)}</small><small>{source.categoryCount} categories • {source.assignmentTypeCount} assignment types • {source.gradingPeriodCount} grading periods</small></span>
          </button>)}
        </div>
      </section>

      <div className={styles.footer}><span className="subtle">Nothing is created until you confirm the review screen.</span><button className="primary-button" type="submit">Review course <ArrowRight size={16}/></button></div>
    </form> : <div className={styles.form}>
      <section className="panel">
        <p className="eyebrow">Review</p>
        <h2>{basics.courseName}</h2>
        <div className={styles.reviewGrid}>
          <div><span>School year</span><strong>{selectedSchoolYear?.label ?? "—"}</strong></div>
          <div><span>Course code</span><strong>{basics.courseCode || "None"}</strong></div>
          <div><span>First section</span><strong>{basics.sectionName}</strong></div>
          <div><span>Class period</span><strong>{basics.periodNumber || "Not set"}</strong></div>
          <div className={styles.wide}><span>Starting point</span><strong>{selectedSource ? `${selectedSource.label} — ${sourceContext(selectedSource)}` : "Blank Course"}</strong></div>
        </div>
      </section>

      {selectedSource ? <section className="panel">
        <p className="eyebrow">Choose what to copy</p>
        <h3>Shared course configuration</h3>
        <p className="subtle">These settings become independent copies. Changing the new course later will not change {selectedSource.label}, even when the source is historical.</p>
        <div className={styles.copyList}>
          <label><input type="checkbox" checked={copyCategories} onChange={(event) => toggleCategories(event.target.checked)}/><span><strong>Grading Categories</strong><small>{selectedSource.categoryCount} categories, including weights, calculation methods, drop-lowest, and late deductions.</small></span></label>
          <label><input type="checkbox" checked={copyAssignmentTypes} onChange={(event) => toggleAssignmentTypes(event.target.checked)}/><span><strong>Assignment Types</strong><small>{selectedSource.assignmentTypeCount} hotlist types and their default category/points/retake settings. Requires categories.</small></span></label>
          <label><input type="checkbox" checked={copyGradingPeriods} onChange={(event) => setCopyGradingPeriods(event.target.checked)}/><span><strong>Grading Periods</strong><small>{selectedSource.gradingPeriodCount} direct/composite periods and their component weights.</small></span></label>
        </div>
      </section> : <section className="panel"><div className={styles.blankNotice}><CheckCircle2 size={24}/><div><strong>Blank configuration</strong><p className="subtle">The course will be created with its first section only. Configure categories, assignment types, and grading periods from Settings before creating assignments.</p></div></div></section>}

      <section className={`panel ${styles.safety}`}>
        <p className="eyebrow">Data safety</p>
        <h3>These items will not be copied</h3>
        <div className={styles.noCopy}><span>Students</span><span>Rosters</span><span>Assignments</span><span>Scores</span><span>Missing / Exempt flags</span><span>Retakes</span><span>PowerSchool history</span><span>Student analytics</span></div>
      </section>

      <div className={styles.footer}><button className="secondary-link" type="button" disabled={pending} onClick={() => setStep(1)}><ArrowLeft size={16}/> Back</button><button className="primary-button" type="button" disabled={pending} onClick={createCourse}>{pending ? "Creating course…" : "Create course"} <ArrowRight size={16}/></button></div>
    </div>}
  </div>;
}
