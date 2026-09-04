import { WorkspaceSubnav } from "@/components/workspace-subnav";

export type GradebookWorkspaceKey = "overview" | "matrix" | "powerschool" | "audit";

function withPeriod(path: string, period?: string) {
  return period ? `${path}?period=${encodeURIComponent(period)}` : path;
}

export function GradebookWorkspaceNav({ active, period }: { active: GradebookWorkspaceKey; period?: string }) {
  return <WorkspaceSubnav
    ariaLabel="Gradebook workspace"
    activeKey={active}
    items={[
      { key: "overview", label: "Overview", href: withPeriod("/gradebook", period) },
      { key: "matrix", label: "Score Matrix", href: withPeriod("/gradebook/assignments", period) },
      { key: "powerschool", label: "PowerSchool", href: withPeriod("/gradebook/powerschool", period) },
      { key: "audit", label: "Grade Audit", href: withPeriod("/gradebook/audit", period) },
    ]}
  />;
}
