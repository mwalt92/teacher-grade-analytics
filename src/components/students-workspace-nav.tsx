import { WorkspaceSubnav } from "@/components/workspace-subnav";

export function StudentsWorkspaceNav({ active }: { active: "roster" | "import" }) {
  return <WorkspaceSubnav
    ariaLabel="Students workspace"
    activeKey={active}
    items={[
      { key: "roster", label: "Roster", href: "/students" },
      { key: "import", label: "Import Center", href: "/students/import" },
    ]}
  />;
}
