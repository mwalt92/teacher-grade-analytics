import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseBackup, History, LockKeyhole, PlugZap, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getPowerSchoolConfigStatus } from "@/lib/powerschool/client";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { PowerSchoolConnectionProbe } from "./connection-probe";
import styles from "./powerschool.module.css";

type SyncEvent = {
  id: string;
  operation_id: string;
  section_id: string | null;
  assignment_id: string | null;
  student_id: string | null;
  resource_type: string;
  operation_type: string;
  phase: string;
  external_resource_id: string | null;
  payload: Json | null;
  summary: string | null;
  source_event_id: string | null;
  created_at: string;
};

function phaseLabel(phase: string) {
  switch (phase) {
    case "before_snapshot": return "Before snapshot";
    case "proposed_change": return "Proposed change";
    case "response": return "PowerSchool response";
    case "verified_after": return "Verified after";
    case "warning": return "Warning";
    case "conflict": return "Conflict";
    case "error": return "Error";
    default: return phase.replaceAll("_", " ");
  }
}

function statusFor(events: SyncEvent[]) {
  if (events.some((event) => event.phase === "error")) return { label: "Failed", tone: "danger" as const };
  if (events.some((event) => event.phase === "conflict")) return { label: "Conflict", tone: "warning" as const };
  if (events.some((event) => event.phase === "warning")) return { label: "Warning", tone: "warning" as const };
  if (events.some((event) => event.phase === "verified_after")) return { label: "Verified", tone: "success" as const };
  if (events.some((event) => event.phase === "response")) return { label: "Response received", tone: "success" as const };
  if (events.some((event) => event.phase === "proposed_change")) return { label: "Awaiting write", tone: "neutral" as const };
  return { label: "Snapshot only", tone: "neutral" as const };
}

function jsonText(payload: Json | null) {
  if (payload == null) return "No payload stored.";
  return JSON.stringify(payload, null, 2);
}

export default async function PowerSchoolSettingsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) redirect("/student");

  const { data: eventRows, error: eventError } = await supabase
    .from("powerschool_sync_events")
    .select("id,operation_id,section_id,assignment_id,student_id,resource_type,operation_type,phase,external_resource_id,payload,summary,source_event_id,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (eventError) throw eventError;
  const events = (eventRows ?? []) as SyncEvent[];

  const sectionIds = [...new Set(events.flatMap((event) => event.section_id ? [event.section_id] : []))];
  const assignmentIds = [...new Set(events.flatMap((event) => event.assignment_id ? [event.assignment_id] : []))];
  const studentIds = [...new Set(events.flatMap((event) => event.student_id ? [event.student_id] : []))];
  const [sectionsResult, assignmentsResult, studentsResult] = await Promise.all([
    sectionIds.length ? supabase.from("sections").select("id,name,period_number").in("id", sectionIds) : Promise.resolve({ data: [], error: null }),
    assignmentIds.length ? supabase.from("assignments").select("id,title").in("id", assignmentIds) : Promise.resolve({ data: [], error: null }),
    studentIds.length ? supabase.from("students").select("id,display_name").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (sectionsResult.error) throw sectionsResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (studentsResult.error) throw studentsResult.error;

  const sectionById = new Map((sectionsResult.data ?? []).map((section) => [section.id, section]));
  const assignmentById = new Map((assignmentsResult.data ?? []).map((assignment) => [assignment.id, assignment]));
  const studentById = new Map((studentsResult.data ?? []).map((student) => [student.id, student]));

  const grouped = new Map<string, SyncEvent[]>();
  for (const event of events) {
    const current = grouped.get(event.operation_id) ?? [];
    current.push(event);
    grouped.set(event.operation_id, current);
  }
  const operations = [...grouped.entries()].map(([operationId, operationEvents]) => ({
    operationId,
    events: [...operationEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    newestAt: operationEvents.reduce((latest, event) => event.created_at > latest ? event.created_at : latest, operationEvents[0]?.created_at ?? ""),
  })).sort((a, b) => b.newestAt.localeCompare(a.newestAt));

  const connectionStatus = getPowerSchoolConfigStatus();

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>PowerSchool Sync</h1>
        <p className="subtle">{profile.display_name} • safety-first integration and recovery history</p>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className="content-wrap">
      <div className={styles.headingRow}>
        <div>
          <p className="eyebrow">Integration safety</p>
          <h2>Sync History &amp; Recovery</h2>
          <p className="subtle">Every future PowerSchool write must preserve the value that existed before it, the proposed change, PowerSchool&apos;s response, and the verified result.</p>
        </div>
        <Link className="secondary-link" href="/settings">Course Settings</Link>
      </div>

      <div className={styles.statusGrid}>
        <article className="panel">
          <div className={styles.statusHeader}><PlugZap size={19}/><strong>PowerSchool connection</strong></div>
          <span className={`status ${connectionStatus.configured ? "success-pill" : "warning-pill"}`}>{connectionStatus.configured ? "Configured" : "Not configured"}</span>
          <p className="subtle">{connectionStatus.configured ? "Server-side credentials are present. The read-only test below can authenticate and run only the approved discovery PowerQuery; writes remain disabled." : "No PowerSchool OAuth credentials are exposed to this app yet. This page cannot contact or change PowerSchool."}</p>
        </article>
        <article className="panel">
          <div className={styles.statusHeader}><ShieldCheck size={19}/><strong>Write safety gate</strong></div>
          <span className="status success-pill">Required</span>
          <p className="subtle">Preview → snapshot current PowerSchool state → confirm → write → verify. No autosync bypasses this flow during development.</p>
        </article>
        <article className="panel">
          <div className={styles.statusHeader}><LockKeyhole size={19}/><strong>History access</strong></div>
          <span className="status success-pill">Teacher only</span>
          <p className="subtle">The ledger is protected by teacher-scoped RLS and is append-only through normal authenticated access.</p>
        </article>
      </div>

      <PowerSchoolConnectionProbe configured={connectionStatus.configured} host={connectionStatus.host}/>

      <article className={`panel ${styles.recoveryCallout}`}>
        <DatabaseBackup size={22}/>
        <div><strong>Restore operations remain reversible.</strong><p className="subtle">Before restoring an older snapshot, the connector will first snapshot whatever is currently in PowerSchool. Restoring never deletes the intervening history.</p></div>
      </article>

      <div className={styles.historyHeading}>
        <div><p className="eyebrow">Audit ledger</p><h3>PowerSchool operations</h3></div>
        <span className={styles.count}>{operations.length} operation{operations.length === 1 ? "" : "s"}</span>
      </div>

      {!operations.length ? <article className={`panel ${styles.emptyState}`}>
        <History size={28}/>
        <div><h3>No PowerSchool operations recorded yet</h3><p className="subtle">That is expected until the first read-only connection test runs. Successful and failed connection probes are recorded without storing OAuth credentials or access tokens.</p></div>
      </article> : <div className={styles.operationList}>{operations.map((operation) => {
        const first = operation.events[0];
        const status = statusFor(operation.events);
        const section = first.section_id ? sectionById.get(first.section_id) : null;
        const assignment = first.assignment_id ? assignmentById.get(first.assignment_id) : null;
        const student = first.student_id ? studentById.get(first.student_id) : null;
        const context = [section?.name, assignment?.title, student?.display_name].filter(Boolean).join(" • ") || "Integration-level operation";
        return <article className="panel" key={operation.operationId}>
          <div className={styles.operationHeader}>
            <div><p className="eyebrow">{first.operation_type} {first.resource_type}</p><h3>{context}</h3><p className="subtle">{new Date(operation.newestAt).toLocaleString()} • operation {operation.operationId.slice(0, 8)}</p></div>
            <span className={`${styles.operationStatus} ${styles[status.tone]}`}>{status.label}</span>
          </div>
          <div className={styles.timeline}>{operation.events.map((event) => <div className={styles.event} key={event.id}>
            <div className={styles.eventMarker}>{event.phase === "error" || event.phase === "conflict" ? <TriangleAlert size={15}/> : event.operation_type === "restore" ? <RotateCcw size={15}/> : <History size={15}/>}</div>
            <div className={styles.eventBody}>
              <div className={styles.eventTitle}><strong>{phaseLabel(event.phase)}</strong><span>{new Date(event.created_at).toLocaleString()}</span></div>
              {event.summary ? <p>{event.summary}</p> : null}
              {event.external_resource_id ? <p className="subtle">PowerSchool ID: {event.external_resource_id}</p> : null}
              <details><summary>View stored snapshot / payload</summary><pre>{jsonText(event.payload)}</pre></details>
            </div>
          </div>)}</div>
          <div className={styles.restoreNote}><RotateCcw size={15}/><span>Automatic restore will appear here only after the matching PowerSchool resource has a verified safe write-back path.</span></div>
        </article>;
      })}</div>}
    </section>
  </main>;
}
