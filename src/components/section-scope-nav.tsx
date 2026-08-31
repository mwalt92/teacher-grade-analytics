import Link from "next/link";
import styles from "./section-scope-nav.module.css";

export function SectionScopeNav({
  sectionLabel,
  sectionHref,
  allLabel,
  allHref,
  activeScope,
  ariaLabel,
}: {
  sectionLabel: string;
  sectionHref: string;
  allLabel: string;
  allHref: string;
  activeScope: "section" | "all";
  ariaLabel: string;
}) {
  return <nav className={styles.scopeNav} aria-label={ariaLabel}>
    <Link className={`nav-button${activeScope === "section" ? " active" : ""}`} href={sectionHref}>{sectionLabel}</Link>
    <Link className={`nav-button${activeScope === "all" ? " active" : ""}`} href={allHref}>{allLabel}</Link>
  </nav>;
}
