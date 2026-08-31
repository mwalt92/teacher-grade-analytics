"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import {
  createCourseSection,
  setCourseSectionActive,
  updateCourseSection,
  type CourseSectionActionResult,
} from "./course-section-actions";
import styles from "./settings.module.css";

type SectionRow = {
  id: string;
  name: string;
  periodNumber: number | null;
  active: boolean;
  enrollmentCount: number;
  assignmentCount: number;
};

type Notice = { kind: "success" | "error"; text: string } | null;

export function CourseSectionManager({
  offeringId,
  sections,
}: {
  offeringId: string;
  sections: SectionRow[];
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);

  function finish(result: CourseSectionActionResult, resetCreate = false) {
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setNotice({ kind: "success", text: result.success ?? "Saved." });
    if (resetCreate) createFormRef.current?.reset();
    router.refresh();
  }

  function submitForm(event: FormEvent<HTMLFormElement>, action: (formData: FormData) => Promise<CourseSectionActionResult>, resetCreate = false) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setNotice(null);
    startTransition(async () => finish(await action(formData), resetCreate));
  }

  function toggle(sectionId: string, active: boolean) {
    const formData = new FormData();
    formData.set("offeringId", offeringId);
    formData.set("sectionId", sectionId);
    formData.set("active", active ? "true" : "false");
    setNotice(null);
    startTransition(async () => finish(await setCourseSectionActive(formData)));
  }

  return <div className={styles.manager}>
    {notice ? <div className={notice.kind === "success" ? "import-message success" : "import-message danger"}>{notice.text}</div> : null}

    <section className={styles.typeList} aria-label="Course sections">
      {sections.map((section) => <article className={section.active ? styles.typeCard : `${styles.typeCard} ${styles.inactiveCard}`} key={section.id}>
        <div className={styles.cardHeader}>
          <div>
            <div className={styles.titleRow}>
              <h3>{section.name}</h3>
              <span className={section.active ? "status success-pill" : "status neutral-pill"}>{section.active ? "Active" : "Inactive"}</span>
            </div>
            <p className="subtle">{section.enrollmentCount} enrollment{section.enrollmentCount === 1 ? "" : "s"} • {section.assignmentCount} assignment{section.assignmentCount === 1 ? "" : "s"}</p>
          </div>
        </div>

        <form className={styles.typeForm} onSubmit={(event) => submitForm(event, updateCourseSection)}>
          <input type="hidden" name="offeringId" value={offeringId}/>
          <input type="hidden" name="sectionId" value={section.id}/>
          <label>Section name<input name="name" required maxLength={100} defaultValue={section.name} placeholder="e.g. 2nd Hour"/></label>
          <label>Class period <span className="optional">optional</span><input name="periodNumber" type="number" min="0" max="99" step="1" defaultValue={section.periodNumber ?? ""} placeholder="2"/></label>
          <div className={styles.cardActions}>
            <button className="primary-button" type="submit" disabled={pending}><Save size={16}/>{pending ? "Saving…" : "Save section"}</button>
            <button className="text-button" type="button" disabled={pending} onClick={() => toggle(section.id, !section.active)}>{section.active ? "Deactivate" : "Reactivate"}</button>
          </div>
        </form>
      </article>)}
    </section>

    <article className={`panel ${styles.addCard}`}>
      <div>
        <p className="eyebrow">Add class period</p>
        <h3>Create another section</h3>
        <p className="subtle">The new section gets its own roster and grades while automatically using this course&apos;s shared categories, grading periods, and assignment types.</p>
      </div>
      <form ref={createFormRef} className={styles.typeForm} onSubmit={(event) => submitForm(event, createCourseSection, true)}>
        <input type="hidden" name="offeringId" value={offeringId}/>
        <label>Section name<input name="name" required maxLength={100} placeholder="e.g. 6th Hour"/></label>
        <label>Class period <span className="optional">optional</span><input name="periodNumber" type="number" min="0" max="99" step="1" placeholder="6"/></label>
        <div className={styles.cardActions}><button className="primary-button" type="submit" disabled={pending}><Plus size={16}/>{pending ? "Adding…" : "Add section"}</button></div>
      </form>
    </article>
  </div>;
}
