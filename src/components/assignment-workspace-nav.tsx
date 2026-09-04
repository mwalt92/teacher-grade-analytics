import { WorkspaceSubnav } from "@/components/workspace-subnav";

export type AssignmentWorkspaceKey = "grade" | "study" | "edit";

export function AssignmentWorkspaceNav({
  assignmentId,
  active,
  returnTo = "/assignments",
  archived = false,
}: {
  assignmentId: string;
  active: AssignmentWorkspaceKey;
  returnTo?: string;
  archived?: boolean;
}) {
  const encodedReturnTo = encodeURIComponent(returnTo);
  return <WorkspaceSubnav
    ariaLabel="Assignment workspace"
    activeKey={active}
    items={[
      {
        key: "grade",
        label: "Grade Entry",
        href: archived ? undefined : `/assignments/${assignmentId}?returnTo=${encodedReturnTo}`,
        disabled: archived,
      },
      { key: "study", label: "Study Resources", href: `/assignments/${assignmentId}/study?returnTo=${encodedReturnTo}` },
      { key: "edit", label: "Edit Assignment", href: `/assignments/${assignmentId}/edit?returnTo=${encodedReturnTo}` },
    ]}
  />;
}
