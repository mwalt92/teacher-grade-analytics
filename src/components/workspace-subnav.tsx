import Link from "next/link";
import styles from "./workspace-subnav.module.css";

export type WorkspaceSubnavItem = {
  key: string;
  label: string;
  href?: string;
  disabled?: boolean;
};

export function WorkspaceSubnav({
  ariaLabel,
  activeKey,
  items,
}: {
  ariaLabel: string;
  activeKey: string;
  items: WorkspaceSubnavItem[];
}) {
  return <div className={styles.shell}>
    <nav className={styles.nav} aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.key === activeKey;
        if (!item.href || item.disabled) {
          return <span
            key={item.key}
            className={`${styles.item} ${styles.disabled}`}
            aria-disabled="true"
          >{item.label}</span>;
        }
        return <Link
          key={item.key}
          href={item.href}
          className={`${styles.item} ${active ? styles.active : ""}`}
          aria-current={active ? "page" : undefined}
        >{item.label}</Link>;
      })}
    </nav>
  </div>;
}
