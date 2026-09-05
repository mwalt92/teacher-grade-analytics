import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Edit3, Layers3, Plus, RotateCcw, Search } from "lucide-react";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getAssignmentManagementData, type AssignmentManagementRow } from "@/lib/data/assignment-management";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { archiveAssignment, restoreAssignment } from "./management-actions";
import styles from "./assignments.module.css";

type AssignmentPageProps = {
  searchParams: Promise<{
    q?: string;
    period?: string;
    kind?: string;
    status?: string;
    notice?: string;
    error?: string;
    scope?: string;
    section?: string;
  }>;
};

type WorkspaceScope = "section" | "all";
type SectionAssignmentRow = {
  assignment: AssignmentManagementRow;
  sectionId: string;
  sectionName: string;
  periodNumber: number | null;
  sortOrder: number;
};

type AssignmentGroup = {
  key: string;
  linked: boolean;
  items: SectionAssignmentRow[];
};

const assignmentGridStyle = {
  gridTemplateColumns: "minmax(220px,1.55fr) 72px 105px 115px 105px 70px minmax(150px,.85fr) minmax(290px,1.3fr)",
  minWidth: "1160px",
};

function currentReturnPath(params: {
  q: string;
  period: string;
  kind: string;
  status: string;
  scope: WorkspaceScope;
  sectionFilter: string;
}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.period !== "all") query.set("period", params.period);
  if (params.kind !== "all") query.set("kind", params.kind);
  if (params.status !== "active") query.set("status", params.status);
  if (params.scope === "all") {
    query.set("scope", "all");
    if (params.sectionFilter !== "all") query.set("section", params.sectionFilter);
  }
  const suffix = query.toString();
  return suffix ? `/assignments?${suffix}` : "/assignments";
}

function assignmentMatches(assignment: AssignmentManagementRow, params: { q: string; period: string; kind: string; status: string }) {
  if (params.status === "active" && assignment.archived) return false;
  if (params.status === "archived" && !assignment.archived) return false;
  if (params.period !== "all" && assignment.gradingPeriod?.code !== params.period) return false;
  if (params.kind !== "all" && assignment.assignmentType?.code !== params.kind) return false;
  if (params.q && !assignment.title.toLowerCase().includes(params.q.toLowerCase())) return false;
  return true;
}

function sameMetadata(items: SectionAssignmentRow[]) {
  if (items.length <= 1) return true;
  const first = items[0].assignment;
  return items.every(({ assignment }) =>
    assignment.title === first.title
    && assignment.assignmentDate === first.assignmentDate
    && assignment.pointsPossible === first.pointsPossible
    && assignment.gradingPeriod?.id === first.gradingPeriod?.id
    && assignment.assignmentType?.id === first.assignmentType?.id
    && assignment.category?.id === first.category?.id
    && assignment.allowRetakes === first.allowRetakes
    && assignment.archived === first.archived);
}

export default async function AssignmentsPage({ searchParams }: AssignmentPageProps) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") redirect("/login");

  const [sections, section, params] = await Promise.all([getTeacherSections(), getActiveTeacherSection(), searchParams]);
  if (!section) redirect("/");

  const offeringSections = sections
    .filter((item) => item.offeringId === section.offeringId)
    .sort((a, b) =>
      (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
      || a.sortOrder - b.sortOrder
      || a.sectionName.localeCompare(b.sectionName));
  const canShowAllSections = offeringSections.length > 1;
  const scope: WorkspaceScope = params.scope === "all" && canShowAllSections ? "all" : "section";
  const requestedSectionFilter = params.section ?? "all";
  const sectionFilter = scope === "all" && requestedSectionFilter !== "all" && offeringSections.some((item) => item.sectionId === requestedSectionFilter)
    ? requestedSectionFilter
    : "all";
  const visibleOfferingSections = scope === "all" && sectionFilter !== "all"
    ? offeringSections.filter((item) => item.sectionId === sectionFilter)
    : offeringSections;

  const data = await getAssignmentManagementData(section.sectionId);
  if (!data) {
    return <main className="content-wrap"><article className="panel"><h1>Assignments</h1><p className="subtle">The assignment workspace could not be loaded.</p></article></main>;
  }

  const q = (params.q ?? "").trim();
  const status = params.status === "archived" || params.status === "all" ? params.status : "active";
  const validPeriodCodes = new Set(data.periods.map((item) => item.code));
  const period = params.period && validPeriodCodes.has(params.period) ? params.period : "all";
  const validTypeCodes = new Set(data.assignmentTypes.map((type) => type.code));
  const kind = validTypeCodes.has(params.kind ?? "") ? params.kind! : "all";
  const filterParams = { q, period, kind, status };

  const sectionAssignments = scope === "all"
    ? (await Promise.all(visibleOfferingSections.map(async (item) => ({ item, data: await getAssignmentManagementData(item.sectionId) }))))
      .flatMap(({ item, data: sectionData }) => (sectionData?.assignments ?? []).map((assignment) => ({
        assignment,
        sectionId: item.sectionId,
        sectionName: item.sectionName,
        periodNumber: item.periodNumber,
        sortOrder: item.sortOrder,
      } satisfies SectionAssignmentRow)))
    : [];

  const groupMap = new Map<string, SectionAssignmentRow[]>();
  for (const row of sectionAssignments) {
    const key = row.assignment.linkGroupId ? `linked:${row.assignment.linkGroupId}` : `single:${row.assignment.id}`;
    const items = groupMap.get(key) ?? [];
    items.push(row);
    groupMap.set(key, items);
  }
  const groups: AssignmentGroup[] = [...groupMap.entries()].map(([key, items]) => ({
    key,
    linked: key.startsWith("linked:"),
    items: items.sort((a, b) =>
      (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
      || a.sortOrder - b.sortOrder
      || a.sectionName.localeCompare(b.sectionName)),
  })).sort((a, b) => {
    const aDate = a.items.reduce((latest, item) => item.assignment.assignmentDate > latest ? item.assignment.assignmentDate : latest, "");
    const bDate = b.items.reduce((latest, item) => item.assignment.assignmentDate > latest ? item.assignment.assignmentDate : latest, "");
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return a.items[0].assignment.title.localeCompare(b.items[0].assignment.title);
  });

  const visibleGroups = groups.filter((group) => group.items.some(({ assignment }) => assignmentMatches(assignment, filterParams)));
  const visibleAssignments = data.assignments.filter((assignment) => assignmentMatches(assignment, filterParams));
  const activeCount = scope === "all"
    ? groups.filter((group) => group.items.some(({ assignment }) => !assignment.archived)).length
    : data.assignments.filter((assignment) => !assignment.archived).length;
  const archivedCount = scope === "all"
    ? groups.filter((group) => group.items.every(({ assignment }) => assignment.archived)).length
    : data.assignments.length - activeCount;
  const showingCount = scope === "all" ? visibleGroups.length : visibleAssignments.length;

  const returnTo = currentReturnPath({ q, period, kind, status, scope, sectionFilter });
  const sectionHref = currentReturnPath({ q, period, kind, status, scope: "section", sectionFilter: "all" });
  const allHref = currentReturnPath({ q, period, kind, status, scope: "all", sectionFilter: "all" });
  const clearHref = currentReturnPath({ q: "", period: "all", kind: "all", status: "active", scope, sectionFilter });
  const filterKey = `${q}|${period}|${kind}|${status}|${scope}|${sectionFilter}`;
  const notice = params.notice === "archived"
    ? "Assignment archived. It no longer counts in active grade calculations."
    : params.notice === "restored"
      ? "Assignment restored to active grade calculations."
      : params.notice === "deleted"
        ? "Empty assignment permanently deleted."
        : null;
  const courseLabel = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Assignments</h1>
        <p className="subtle">{courseLabel} • {scope === "all" ? "All Sections" : section.sectionName}</p>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <TeacherContextBar
      sections={sections}
      activeSectionId={section.sectionId}
      returnTo={returnTo}
      scope={canShowAllSections ? {
        active: scope,
        sectionLabel: section.sectionName,
        sectionHref,
        allLabel: `All Sections (${offeringSections.length})`,
        allHref,
        ariaLabel: "Assignment section scope",
      } : undefined}
    />

    <section className={`content-wrap ${styles.content}`}>
      {scope === "all" ? <div className={styles.sectionFilterBar}>
        <div><Layers3 size={18}/><span><strong>All Sections assignments</strong><small>Linked assignments are grouped as one instructional item while grade entry stays section-specific.</small></span></div>
        <nav aria-label="Filter assignments by section">
          <Link className={sectionFilter === "all" ? styles.sectionFilterActive : styles.sectionFilterLink} href={currentReturnPath({ q, period, kind, status, scope: "all", sectionFilter: "all" })}>All</Link>
          {offeringSections.map((item) => <Link className={sectionFilter === item.sectionId ? styles.sectionFilterActive : styles.sectionFilterLink} href={currentReturnPath({ q, period, kind, status, scope: "all", sectionFilter: item.sectionId })} key={item.sectionId}>{item.sectionName}</Link>)}
        </nav>
      </div> : null}

      <div className="section-heading">
        <div><p className="eyebrow">Assignment workspace</p><h2>{scope === "all" ? "Manage course-wide instructional items" : "Manage course assignments"}</h2></div>
        <div className="grade-audit-header-actions">
          <Link className="secondary-link" href="/gradebook/assignments">{scope === "all" ? `${section.sectionName} Gradebook` : "Assignment Gradebook"}</Link>
          <Link className="primary-button" href="/assignments/new"><Plus size={17}/> New Assignment</Link>
        </div>
      </div>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.summaryGrid} aria-label="Assignment summary">
        <article className={styles.summaryCard}><span>{scope === "all" ? "Active items" : "Active assignments"}</span><strong>{activeCount}</strong></article>
        <article className={styles.summaryCard}><span>{scope === "all" ? "Fully archived" : "Archived"}</span><strong>{archivedCount}</strong></article>
        <article className={styles.summaryCard}><span>Showing now</span><strong>{showingCount}</strong></article>
      </section>

      <article className={`panel ${styles.filtersPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Find assignments</p><h2>Filter the workspace</h2></div></div>
        <form key={filterKey} method="get" action="/assignments" className={styles.filterForm}>
          {scope === "all" ? <><input type="hidden" name="scope" value="all"/>{sectionFilter !== "all" ? <input type="hidden" name="section" value={sectionFilter}/> : null}</> : null}
          <label className={styles.searchField}><span>Search title</span><div className={styles.searchInput}><Search size={16}/><input name="q" defaultValue={q} placeholder="e.g. Unit 2 Quiz"/></div></label>
          <label><span>Grading period</span><select name="period" defaultValue={period}><option value="all">All periods</option>{data.periods.map((item) => <option value={item.code} key={item.id}>{item.code} — {item.name}</option>)}</select></label>
          <label><span>Type</span><select name="kind" defaultValue={kind}><option value="all">All types</option>{data.assignmentTypes.map((type) => <option value={type.code} key={type.id}>{type.name}</option>)}</select></label>
          <label><span>Status</span><select name="status" defaultValue={status}><option value="active">Active</option><option value="archived">Archived</option><option value="all">Active + archived</option></select></label>
          <button className="primary-button" type="submit">Apply</button>
          <Link className="secondary-link" href={clearHref}>Clear</Link>
        </form>
      </article>

      {scope === "all" ? <article className={`panel full-width ${styles.aggregateWorkspace}`}>
        <div className="panel-header"><div><p className="eyebrow">Course-wide assignment management</p><h2>{visibleGroups.length} {visibleGroups.length === 1 ? "instructional item" : "instructional items"}</h2><p className="subtle">One linked item can contain separate class-period assignment records, rosters, and grades.</p></div></div>
        {visibleGroups.length === 0 ? <div className={styles.empty}><h3>No assignments match these filters.</h3><p>Try clearing a filter or create a new assignment.</p></div> : <div className={styles.groupList}>
          {visibleGroups.map((group) => {
            const first = group.items[0].assignment;
            const metadataAligned = sameMetadata(group.items);
            const activeItems = group.items.filter(({ assignment }) => !assignment.archived).length;
            const allArchived = activeItems === 0;
            const mixedStatus = activeItems > 0 && activeItems < group.items.length;
            const totalScored = group.items.reduce((sum, item) => sum + item.assignment.scoredCount, 0);
            const totalMissing = group.items.reduce((sum, item) => sum + item.assignment.missingCount, 0);
            const titleVariants = new Set(group.items.map((item) => item.assignment.title)).size;
            return <section className={`${styles.assignmentGroup} ${allArchived ? styles.archivedGroup : ""}`} key={group.key}>
              <div className={styles.groupHeader}>
                <div className={styles.groupTitle}>
                  <div><strong>{first.title}</strong>{group.linked ? <span className="status success-pill">Linked • {group.items.length} sections</span> : <span className="status neutral-pill">{group.items[0].sectionName} only</span>}</div>
                  <small>{metadataAligned ? `${first.gradingPeriod?.code ?? "—"} • ${first.assignmentType?.name ?? "—"} • ${first.category?.name ?? "—"} • ${first.assignmentDate} • ${first.pointsPossible} pts` : `${titleVariants > 1 ? `${titleVariants} title variants • ` : ""}Section-specific metadata differs`}</small>
                </div>
                <div className={styles.groupStats}><span>{totalScored} scored</span>{totalMissing > 0 ? <span className={styles.missing}>{totalMissing} missing</span> : null}<span>{mixedStatus ? "Mixed active/archive status" : allArchived ? "Archived in all sections" : "Active"}</span></div>
              </div>
              <div className={styles.groupSections}>
                {group.items.map(({ assignment, sectionName }) => {
                  const editHref = `/assignments/${assignment.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
                  const gradeHref = `/assignments/${assignment.id}?returnTo=${encodeURIComponent(returnTo)}`;
                  return <div className={`${styles.groupSectionRow} ${assignment.archived ? styles.archivedGroupSection : ""}`} key={assignment.id}>
                    <span className={styles.groupSectionName}><strong>{sectionName}</strong><small>{assignment.title !== first.title ? assignment.title : assignment.archived ? "Archived" : assignment.allowRetakes ? "Retakes allowed" : "Single attempt"}</small></span>
                    <span className={styles.groupSectionMeta}>{assignment.gradingPeriod?.code ?? "—"} • {assignment.assignmentDate} • {assignment.pointsPossible} pts</span>
                    <span className={styles.groupSectionActivity}><strong>{assignment.scoredCount} scored</strong><small>{assignment.missingCount ? `${assignment.missingCount} missing` : `${assignment.gradeRecordCount} grade records`}</small></span>
                    <span className={styles.actions}>{!assignment.archived ? <Link className="secondary-link" href={gradeHref}>Grade entry</Link> : null}<Link className="secondary-link" href={editHref}><Edit3 size={15}/> Manage</Link></span>
                  </div>;
                })}
              </div>
            </section>;
          })}
        </div>}
      </article> : <article className={`panel full-width ${styles.workspace}`}>
        <div className="panel-header"><div><p className="eyebrow">Assignment management</p><h2>{visibleAssignments.length} {visibleAssignments.length === 1 ? "assignment" : "assignments"}</h2><p className="subtle">Assignment type describes the workflow; grading category determines how the grade is calculated.</p></div></div>
        {visibleAssignments.length === 0 ? <div className={styles.empty}><h3>No assignments match these filters.</h3><p>Try clearing a filter or create a new assignment.</p></div> : <div className={styles.table} role="table" aria-label="Assignments">
          <div className={`${styles.row} ${styles.head}`} role="row" style={assignmentGridStyle}><span>Assignment</span><span>Period</span><span>Type</span><span>Category</span><span>Date</span><span>Points</span><span>Grade activity</span><span>Actions</span></div>
          {visibleAssignments.map((assignment) => {
            const editHref = `/assignments/${assignment.id}/edit?returnTo=${encodeURIComponent(returnTo)}`;
            const gradeHref = `/assignments/${assignment.id}?returnTo=${encodeURIComponent(returnTo)}`;
            return <div className={`${styles.row} ${assignment.archived ? styles.archivedRow : ""}`} role="row" key={assignment.id} style={assignmentGridStyle}>
              <span className={styles.assignmentName}><strong>{assignment.title}</strong><small>{assignment.archived ? "Archived" : assignment.allowRetakes ? "Retakes allowed" : "Single attempt"}</small></span>
              <span>{assignment.gradingPeriod?.code ?? "—"}</span>
              <span>{assignment.assignmentType?.name ?? "—"}</span>
              <span>{assignment.category?.name ?? "—"}</span>
              <span>{assignment.assignmentDate}</span>
              <span>{assignment.pointsPossible}</span>
              <span className={styles.activity}><strong>{assignment.scoredCount} scored</strong>{assignment.missingCount ? <small className={styles.missing}>{assignment.missingCount} missing</small> : <small>{assignment.gradeRecordCount} grade records</small>}{assignment.retakeCount ? <small>{assignment.retakeCount} retake attempt{assignment.retakeCount === 1 ? "" : "s"}</small> : null}</span>
              <span className={styles.actions}>
                {!assignment.archived ? <Link className="secondary-link" href={gradeHref}>Grade entry</Link> : null}
                <Link className="secondary-link" href={editHref}><Edit3 size={15}/> Edit</Link>
                <form action={assignment.archived ? restoreAssignment : archiveAssignment}>
                  <input type="hidden" name="assignmentId" value={assignment.id}/>
                  <input type="hidden" name="returnTo" value={returnTo}/>
                  <button className={styles.archiveButton} type="submit">{assignment.archived ? <><RotateCcw size={15}/> Restore</> : <><Archive size={15}/> Archive</>}</button>
                </form>
              </span>
            </div>;
          })}
        </div>}
      </article>}
    </section>
  </main>;
}