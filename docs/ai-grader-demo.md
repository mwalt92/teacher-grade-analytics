# AI Grader Demo — Pre-Deployment Foundation

This phase prepares a safe, teacher-controlled AI grading pilot without enabling live model calls or sending student data to an external AI provider.

## What is implemented in this branch

- A teacher-only `/ai-grading` workspace linked from the main teacher navigation.
- A browser-only Code.org CSV preview that expects the standard `Name, Lesson, Puzzle, Question, Response` export shape.
- On-screen anonymization for the CSV preview. The preview is not persisted and is not sent to an AI provider.
- Two approved Computing Foundations rubric templates:
  - Unit 1 Lesson 1 — Prompt Refinement.
  - Unit 1 Lesson 5 — AI Contradictions and Impact.
- Question-level diagnostics while preserving one overall gradebook score per assessment.
- Synthetic recommendation cards with confidence, feedback, concept tags, teacher approval/edit/reject controls, missing/exempt handling, and a calibration example.
- Demo pilot metrics for teacher agreement, review load, and illustrative AI cost.
- A provider boundary (`AIGradingProvider`) with live grading disabled by default.
- A staged Supabase migration that stores imported submissions, rubric versions, grading runs, recommendations, diagnostics, usage telemetry, and teacher decisions separately from official grades.

## Safety rules for this phase

1. `AI_GRADING_ENABLED` remains `false`.
2. No OpenAI or other model API key is required for the demo.
3. Uploaded CSV files are parsed in the browser only.
4. No official grade is created automatically.
5. The Supabase migration is prepared in source control but should not be applied until the branch is reviewed and the deployment path is ready.
6. Identifiable student submissions should not be sent to an external AI provider until district requirements are satisfied.

## Required production behavior when live AI is added

The architecture must preserve this sequence:

`External submission → AI recommendation → teacher decision → official grade`

The live provider must be server-side only. The provider request should use an anonymous submission identifier and the minimum student data needed for grading. Student name, email, Google ID, roster information, and unrelated grade history should not be sent to the model.

## Rubric behavior

### Lesson 1

One 4-point diagnostic measures whether the student connects changes in a prompt with meaningful changes in AI output.

### Lesson 5

One 10-point gradebook assessment retains two internal diagnostics:

- Human vs. AI contradictions: 0–2.
- Harmless vs. harmful contradictions: 0–2.

The approved proficiency conversion is:

- 4/4 → 10/10
- 3/4 → 8/10
- 2/4 → 6/10
- 1/4 → 4/10
- 0/4 → 0/10

A missing source row remains a review state, not an automatic zero. A submitted blank/nonsense/non-genuine response may receive a zero after applying the rubric.

## Live-provider activation checklist

Before enabling live AI grading:

- Confirm district/admin approval requirements for student data.
- Apply and review the AI-grading Supabase migration and RLS policies.
- Configure a server-side provider implementation and secret API key.
- Configure provider-side hard spend controls.
- Add application-level rate limits and maximum batch size.
- Add persistence for import preview/matching and rubric selection.
- Add explicit teacher confirmation before posting approved recommendations to grade records.
- Verify token/cost telemetry against actual provider usage.
- Confirm failure behavior when the provider is unavailable or the spend limit is reached.

## Pilot evidence to collect

From the first live pilot, retain enough telemetry to report:

- total submissions processed;
- total and per-submission AI cost;
- first-pass model and escalation rate;
- high/medium/review confidence distribution;
- teacher approval rate without score changes;
- teacher adjustment/rejection rate;
- average magnitude of teacher score changes;
- common concept/misconception tags;
- estimated teacher review time saved.

This evidence is intended to support a future district review with real cost, reliability, and teacher-control data rather than anecdotal claims.
