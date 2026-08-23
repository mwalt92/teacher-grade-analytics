"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  ClipboardPlus,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { demoAssignments, demoStudents } from "@/lib/demo-data";

const navItems = ["Dashboard", "Students", "Assignments", "Gradebook", "Analytics", "Settings"];

type DashboardShellProps = {
  courseName?: string;
  schoolYear?: string;
  sectionName?: string;
  studentCount?: number;
  dataMode?: string;
};

export function DashboardShell({
  courseName = "ACP Calculus I M211",
  schoolYear = "2026–2027",
  sectionName = "Semester 1",
  studentCount = demoStudents.length,
  dataMode = "Demo data only",
}: DashboardShellProps) {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [period, setPeriod] = useState("Q1");

  const classAverage = useMemo(() => {
    const grades = demoStudents.map((student) => student.currentGrade);
    return grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  }, []);

  const missingCount = demoStudents.reduce((sum, student) => sum + student.missingCount, 0);
  const retakeCount = demoAssignments.reduce((sum, assignment) => sum + assignment.retakes, 0);
  const mismatchCount = demoStudents.filter((student) => student.powerSchoolDifference !== 0).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Teacher Grade Analytics</p>
          <h1>{courseName}</h1>
          <p className="subtle">{schoolYear} • {sectionName} • {period}</p>
        </div>
        <div className="toolbar-group">
          <select aria-label="Select grading period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option>Q1</option>
            <option>Q2</option>
            <option>S1</option>
          </select>
          <button className="primary-button"><ClipboardPlus size={18} /> New Assignment</button>
        </div>
      </header>

      <nav className="main-nav" aria-label="Teacher navigation">
        {navItems.map((item) => (
          <button
            key={item}
            className={activeNav === item ? "nav-button active" : "nav-button"}
            onClick={() => setActiveNav(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="content-wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{activeNav}</p>
            <h2>What needs your attention?</h2>
          </div>
          <span className="save-indicator">● {dataMode}</span>
        </div>

        <section className="metric-grid" aria-label="Class snapshot">
          <MetricCard icon={<Users size={20} />} label="Students" value={String(studentCount)} />
          <MetricCard icon={<BookOpenCheck size={20} />} label="Class Average" value={`${classAverage.toFixed(1)}%`} />
          <MetricCard icon={<AlertTriangle size={20} />} label="Missing Work" value={String(missingCount)} />
          <MetricCard icon={<RotateCcw size={20} />} label="Retakes" value={String(retakeCount)} />
          <MetricCard icon={<ShieldCheck size={20} />} label="PS Mismatches" value={String(mismatchCount)} />
        </section>

        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Students to review</p>
                <h3>Needs attention</h3>
              </div>
              <button className="text-button">View all <ArrowRight size={16} /></button>
            </div>
            <div className="student-list">
              {demoStudents
                .filter((student) => student.missingCount > 0 || Math.abs(student.powerSchoolDifference) >= 0.1)
                .slice(0, 4)
                .map((student) => (
                  <button className="student-row" key={student.id}>
                    <div>
                      <strong>{student.name}</strong>
                      <span>{student.missingCount > 0 ? `${student.missingCount} missing` : "PowerSchool mismatch"}</span>
                    </div>
                    <strong>{student.currentGrade.toFixed(1)}%</strong>
                  </button>
                ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Grade integrity</p>
                <h3>PowerSchool comparison</h3>
              </div>
            </div>
            <div className="integrity-stack">
              <div className="integrity-item success"><span>Within tolerance</span><strong>{demoStudents.length - mismatchCount}</strong></div>
              <div className="integrity-item warning"><span>Needs review</span><strong>{mismatchCount}</strong></div>
              <button className="secondary-button">Open Grade Audit</button>
            </div>
          </article>
        </section>

        <section className="panel full-width">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Recent work</p>
              <h3>Recent assignments</h3>
            </div>
            <button className="text-button">View assignments <ArrowRight size={16} /></button>
          </div>
          <div className="assignment-table" role="table" aria-label="Recent assignments">
            <div className="assignment-row table-head" role="row">
              <span>Assignment</span><span>Type</span><span>Date</span><span>Class Avg.</span><span>Status</span>
            </div>
            {demoAssignments.map((assignment) => (
              <button className="assignment-row" role="row" key={assignment.id}>
                <strong>{assignment.title}</strong>
                <span>{assignment.type}</span>
                <span>{assignment.date}</span>
                <span>{assignment.average}%</span>
                <span className={assignment.missing > 0 ? "status warning-pill" : "status success-pill"}>
                  {assignment.missing > 0 ? `${assignment.missing} missing` : "Complete"}
                </span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <button className="metric-card">
      <span className="metric-icon">{icon}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
    </button>
  );
}
