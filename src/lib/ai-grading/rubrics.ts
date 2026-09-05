import type { RubricTemplate } from "./types";

const TEN_POINT_PROFICIENCY_MAP: Record<number, number> = {
  0: 0,
  1: 4,
  2: 6,
  3: 8,
  4: 10,
};

export const computingFoundationRubrics: RubricTemplate[] = [
  {
    id: "computing-u1-l1-prompt-refinement",
    version: 1,
    title: "Prompt Refinement",
    source: "Code.org Computing Foundations for a Digital Age",
    lessonLabel: "Unit 1 • Lesson 1: Talking to Machines",
    assignmentLabel: "Level 6 • Check Your Understanding",
    gradebookPointsPossible: 10,
    proficiencyPointsPossible: 4,
    scoreMap: TEN_POINT_PROFICIENCY_MAP,
    criteria: [
      {
        key: "prompt-output-connection",
        label: "Connect prompt changes to output changes",
        maxPoints: 4,
        description: "Evaluate whether the response explains how refining a prompt changed the AI-generated output.",
        fullCreditEvidence: "Clearly connects a prompt refinement to a meaningful change in specificity, relevance, usefulness, format, context, or another concrete output feature, usually with an explanation or example.",
        partialCreditEvidence: "Identifies that the output changed or names a useful prompting strategy, but the cause-and-effect relationship or explanation is incomplete or vague.",
      },
    ],
  },
  {
    id: "computing-u1-l5-contradictions",
    version: 1,
    title: "AI Contradictions and Impact",
    source: "Code.org Computing Foundations for a Digital Age",
    lessonLabel: "Unit 1 • Lesson 5: Uncovering Contradictions",
    assignmentLabel: "Levels 7–8 • Formative Assessment",
    gradebookPointsPossible: 10,
    proficiencyPointsPossible: 4,
    scoreMap: TEN_POINT_PROFICIENCY_MAP,
    criteria: [
      {
        key: "human-vs-ai-contradictions",
        label: "Human vs. AI contradictions",
        maxPoints: 2,
        description: "Compare human contradictions with AI contradictions and explain a reasonable similarity or difference.",
        fullCreditEvidence: "Directly compares humans and AI and gives a reasonable explanation of why contradictions may happen similarly or differently.",
        partialCreditEvidence: "Gives a relevant idea about contradiction but the comparison or explanation is incomplete, vague, or only addresses one side.",
      },
      {
        key: "harmless-vs-harmful",
        label: "Harmless vs. harmful contradictions",
        maxPoints: 2,
        description: "Distinguish low-stakes contradictions from high-stakes contradictions and identify a plausible consequence.",
        fullCreditEvidence: "Distinguishes a harmless or low-stakes case from a harmful or high-stakes case using a valid example or consequence.",
        partialCreditEvidence: "Shows awareness that some contradictions are riskier than others but addresses only one side, gives a vague consequence, or does not clearly distinguish the stakes.",
      },
    ],
  },
];

export function getRubricById(id: string) {
  return computingFoundationRubrics.find((rubric) => rubric.id === id) ?? null;
}

export function proficiencyToGradebookScore(rubric: RubricTemplate, proficiencyEarned: number) {
  if (!Number.isInteger(proficiencyEarned) || proficiencyEarned < 0 || proficiencyEarned > rubric.proficiencyPointsPossible) {
    throw new Error(`Invalid proficiency score ${proficiencyEarned}/${rubric.proficiencyPointsPossible}.`);
  }
  const mapped = rubric.scoreMap[proficiencyEarned];
  if (!Number.isFinite(mapped)) throw new Error(`No gradebook mapping exists for proficiency ${proficiencyEarned}.`);
  return mapped;
}
