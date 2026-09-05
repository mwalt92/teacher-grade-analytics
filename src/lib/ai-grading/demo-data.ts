import type { AIConfidenceBand, AIReviewStatus, QuestionDiagnostic } from "./types";

export type DemoRecommendation = {
  id: string;
  assignmentKey: "lesson-1" | "lesson-5";
  studentAlias: string;
  response: string;
  submissionState: "submitted" | "missing";
  proposedProficiency: number;
  proficiencyPossible: number;
  proposedPoints: number;
  pointsPossible: number;
  confidence: number;
  confidenceBand: AIConfidenceBand;
  reviewRequired: boolean;
  feedback: string;
  conceptTags: string[];
  diagnostics: QuestionDiagnostic[];
  status: AIReviewStatus;
  finalPoints: number | null;
  teacherNote?: string;
  estimatedCostUsd: number;
};

export type DemoAssignment = {
  key: "lesson-1" | "lesson-5";
  label: string;
  shortLabel: string;
  rubricId: string;
  rows: DemoRecommendation[];
};

export const demoAssignments: DemoAssignment[] = [
  {
    key: "lesson-1",
    label: "Unit 1 • Lesson 1: Talking to Machines",
    shortLabel: "Lesson 1 • Prompt Refinement",
    rubricId: "computing-u1-l1-prompt-refinement",
    rows: [
      {
        id: "l1-001", assignmentKey: "lesson-1", studentAlias: "Student 001",
        response: "When I added the person's age, hobbies, and what they already owned, the ideas became much more specific instead of generic gifts.", submissionState: "submitted",
        proposedProficiency: 4, proficiencyPossible: 4, proposedPoints: 10, pointsPossible: 10,
        confidence: 0.97, confidenceBand: "high", reviewRequired: false,
        feedback: "Strong connection between the details you added and the more specific AI output.", conceptTags: ["prompt specificity", "cause and effect"],
        diagnostics: [{ criterionKey: "prompt-output-connection", label: "Prompt changes → output changes", earned: 4, possible: 4, confidence: 0.97, evidenceSummary: "Directly links added context to more specific recommendations." }],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0018,
      },
      {
        id: "l1-002", assignmentKey: "lesson-1", studentAlias: "Student 002",
        response: "It got way more specific after I changed the prompt.", submissionState: "submitted",
        proposedProficiency: 3, proficiencyPossible: 4, proposedPoints: 8, pointsPossible: 10,
        confidence: 0.90, confidenceBand: "high", reviewRequired: false,
        feedback: "You correctly noticed that the response became more specific. Add one example of what became more specific.", conceptTags: ["prompt specificity"],
        diagnostics: [{ criterionKey: "prompt-output-connection", label: "Prompt changes → output changes", earned: 3, possible: 4, confidence: 0.90, evidenceSummary: "Correct effect identified, but the response does not explain the change with a specific example." }],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0015,
      },
      {
        id: "l1-003", assignmentKey: "lesson-1", studentAlias: "Student 003",
        response: "It mostly stayed the same even when I changed my prompt, so I kept adding details until it finally focused on what I wanted.", submissionState: "submitted",
        proposedProficiency: 3, proficiencyPossible: 4, proposedPoints: 8, pointsPossible: 10,
        confidence: 0.70, confidenceBand: "review", reviewRequired: true,
        feedback: "Good observation that repeated refinement eventually changed the output. Explain which added detail made the biggest difference.", conceptTags: ["iteration", "ambiguous outcome"],
        diagnostics: [{ criterionKey: "prompt-output-connection", label: "Prompt changes → output changes", earned: 3, possible: 4, confidence: 0.70, evidenceSummary: "Demonstrates iterative prompting, but the exact cause-and-effect relationship is ambiguous." }],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0026,
      },
      {
        id: "l1-004", assignmentKey: "lesson-1", studentAlias: "Student 004", response: "", submissionState: "missing",
        proposedProficiency: 0, proficiencyPossible: 4, proposedPoints: 0, pointsPossible: 10,
        confidence: 1, confidenceBand: "review", reviewRequired: true,
        feedback: "No submission was found. Teacher review is required before assigning Missing, Exempt, or another status.", conceptTags: ["no submission"], diagnostics: [],
        status: "missing", finalPoints: null, estimatedCostUsd: 0,
      },
    ],
  },
  {
    key: "lesson-5",
    label: "Unit 1 • Lesson 5: Uncovering Contradictions",
    shortLabel: "Lesson 5 • Contradictions",
    rubricId: "computing-u1-l5-contradictions",
    rows: [
      {
        id: "l5-001", assignmentKey: "lesson-5", studentAlias: "Student 005",
        response: "People can change their answer after learning new information, while AI can give conflicting answers because its output depends on patterns and context. A wrong sports fact is low-stakes, but conflicting medical advice could cause someone to take the wrong medicine.", submissionState: "submitted",
        proposedProficiency: 4, proficiencyPossible: 4, proposedPoints: 10, pointsPossible: 10,
        confidence: 0.98, confidenceBand: "high", reviewRequired: false,
        feedback: "Strong comparison of why humans and AI can contradict, plus a clear explanation of when those contradictions become harmful.", conceptTags: ["contradiction", "context", "high-stakes risk"],
        diagnostics: [
          { criterionKey: "human-vs-ai-contradictions", label: "Human vs. AI contradictions", earned: 2, possible: 2, confidence: 0.98, evidenceSummary: "Direct comparison with a reasonable explanation of different causes." },
          { criterionKey: "harmless-vs-harmful", label: "Harmless vs. harmful contradictions", earned: 2, possible: 2, confidence: 0.99, evidenceSummary: "Clearly contrasts a low-stakes sports example with consequential medical advice." },
        ],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0022,
      },
      {
        id: "l5-002", assignmentKey: "lesson-5", studentAlias: "Student 006",
        response: "Humans can contradict themselves too, but they may realize they were wrong. AI could be harmless if it gets a game fact wrong, but harmful if it gives wrong health information.", submissionState: "submitted",
        proposedProficiency: 3, proficiencyPossible: 4, proposedPoints: 8, pointsPossible: 10,
        confidence: 0.86, confidenceBand: "high", reviewRequired: false,
        feedback: "Good low-stakes versus high-stakes comparison. Add more detail about why AI contradictions happen differently from human contradictions.", conceptTags: ["contradiction", "risk"],
        diagnostics: [
          { criterionKey: "human-vs-ai-contradictions", label: "Human vs. AI contradictions", earned: 1, possible: 2, confidence: 0.82, evidenceSummary: "Relevant comparison, but the explanation of AI behavior is limited." },
          { criterionKey: "harmless-vs-harmful", label: "Harmless vs. harmful contradictions", earned: 2, possible: 2, confidence: 0.94, evidenceSummary: "Clear contrast between a minor factual error and harmful health information." },
        ],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0021,
      },
      {
        id: "l5-003", assignmentKey: "lesson-5", studentAlias: "Student 007",
        response: "AI contradictions are harmless for medical questions but dangerous when the question does not really matter. People contradict themselves because they change their minds.", submissionState: "submitted",
        proposedProficiency: 2, proficiencyPossible: 4, proposedPoints: 6, pointsPossible: 10,
        confidence: 0.61, confidenceBand: "review", reviewRequired: true,
        feedback: "Your human comparison shows some understanding. Recheck which situations are low-stakes versus high-stakes, because the examples appear reversed.", conceptTags: ["possible term reversal", "teacher judgment"],
        diagnostics: [
          { criterionKey: "human-vs-ai-contradictions", label: "Human vs. AI contradictions", earned: 1, possible: 2, confidence: 0.74, evidenceSummary: "Shows partial understanding of human contradiction." },
          { criterionKey: "harmless-vs-harmful", label: "Harmless vs. harmful contradictions", earned: 1, possible: 2, confidence: 0.48, evidenceSummary: "The wording appears to reverse harmless and harmful contexts, so teacher review is warranted." },
        ],
        status: "edited", finalPoints: 8,
        teacherNote: "Teacher increased 6/10 → 8/10 because the surrounding explanation suggested an accidental reversal of terms rather than a conceptual failure.", estimatedCostUsd: 0.0031,
      },
      {
        id: "l5-004", assignmentKey: "lesson-5", studentAlias: "Student 008", response: "asdfasdf", submissionState: "submitted",
        proposedProficiency: 0, proficiencyPossible: 4, proposedPoints: 0, pointsPossible: 10,
        confidence: 0.99, confidenceBand: "high", reviewRequired: false,
        feedback: "This response does not provide meaningful evidence of understanding. Complete both assessment questions using ideas from the lesson.", conceptTags: ["non-genuine response"],
        diagnostics: [
          { criterionKey: "human-vs-ai-contradictions", label: "Human vs. AI contradictions", earned: 0, possible: 2, confidence: 0.99, evidenceSummary: "No meaningful response to the criterion." },
          { criterionKey: "harmless-vs-harmful", label: "Harmless vs. harmful contradictions", earned: 0, possible: 2, confidence: 0.99, evidenceSummary: "No meaningful response to the criterion." },
        ],
        status: "pending", finalPoints: null, estimatedCostUsd: 0.0013,
      },
    ],
  },
];
