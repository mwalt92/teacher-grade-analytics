"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, PlugZap, TriangleAlert } from "lucide-react";
import { initialPowerSchoolProbeState, testPowerSchoolConnection } from "./actions";
import styles from "./powerschool.module.css";

type ConnectionProbeProps = {
  configured: boolean;
  host: string | null;
};

export function PowerSchoolConnectionProbe({ configured, host }: ConnectionProbeProps) {
  const [actionState, action, pending] = useActionState(testPowerSchoolConnection, initialPowerSchoolProbeState);
  const state = actionState ?? initialPowerSchoolProbeState;
  const sections = Array.isArray(state.sections) ? state.sections : [];
  const tone = state.status === "success" ? styles.probeSuccess : state.status === "error" ? styles.probeDanger : state.status === "warning" ? styles.probeWarning : styles.probeNeutral;

  return <article className={`panel ${styles.connectionPanel}`}>
    <div className={styles.connectionHeading}>
      <div>
        <p className="eyebrow">Read-only connector</p>
        <h3>Connection test</h3>
        <p className="subtle">OAuth authentication and the approved read-only discovery PowerQuery only. This test cannot change assignments, scores, or any SIS field.</p>
      </div>
      <span className={`status ${configured ? "success-pill" : "warning-pill"}`}>{configured ? "Ready to test" : "Needs credentials"}</span>
    </div>

    <div className={`${styles.probeResult} ${tone}`}>
      {state.status === "success" ? <CheckCircle2 size={19}/> : state.status === "error" || state.status === "warning" ? <TriangleAlert size={19}/> : <PlugZap size={19}/>}
      <div>
        <strong>{state.status === "idle" ? "No live test run yet" : state.status === "success" ? "Connection verified" : state.status === "warning" ? "Connection needs attention" : "Connection failed safely"}</strong>
        <p>{state.message ?? initialPowerSchoolProbeState.message}</p>
        {host ? <p className={styles.hostLine}>Configured host: {host}</p> : null}
        {state.testedAt ? <p className={styles.hostLine}>Tested {new Date(state.testedAt).toLocaleString()}</p> : null}
      </div>
    </div>

    <form action={action}>
      <button className={styles.probeButton} type="submit" disabled={pending || !configured}>
        {pending ? <><Loader2 className={styles.spinner} size={16}/> Testing read-only connection…</> : "Run read-only connection test"}
      </button>
    </form>

    {sections.length ? <div className={styles.discoveryBlock}>
      <div className={styles.discoveryHeading}>
        <div><p className="eyebrow">Teacher match</p><h4>{state.teacherName ?? "PowerSchool teacher"}</h4></div>
        <span>{sections.length} section{sections.length === 1 ? "" : "s"}</span>
      </div>
      <div className={styles.sectionList}>
        {sections.map((section) => <div className={styles.sectionRow} key={section.sectionId}>
          <div>
            <strong>{section.courseName ?? section.courseNumber ?? `Section ${section.sectionId}`}</strong>
            <p>{[section.courseNumber, section.expression, section.room ? `Room ${section.room}` : null].filter(Boolean).join(" • ") || `PowerSchool section ${section.sectionId}`}</p>
          </div>
          <span>{section.rosterCount} student{section.rosterCount === 1 ? "" : "s"}</span>
        </div>)}
      </div>
      <p className={styles.discoveryFootnote}>Only roster counts are returned to this browser view. Student Numbers used by the read-only discovery query remain server-side during this connection test.</p>
    </div> : null}
  </article>;
}
