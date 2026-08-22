export type DemoStudent = {
  id: string;
  name: string;
  currentGrade: number;
  missingCount: number;
  powerSchoolDifference: number;
};

export type DemoAssignment = {
  id: string;
  title: string;
  type: "Participation" | "Quiz" | "Test";
  date: string;
  average: number;
  missing: number;
  retakes: number;
};

export const demoStudents: DemoStudent[] = [
  { id: "s1", name: "Alex Morgan", currentGrade: 91.2, missingCount: 0, powerSchoolDifference: 0 },
  { id: "s2", name: "Bailey Rivera", currentGrade: 84.7, missingCount: 1, powerSchoolDifference: 0.02 },
  { id: "s3", name: "Chris Taylor", currentGrade: 72.4, missingCount: 3, powerSchoolDifference: 0.28 },
  { id: "s4", name: "Dana Singh", currentGrade: 94.8, missingCount: 0, powerSchoolDifference: 0 },
  { id: "s5", name: "Evan Brooks", currentGrade: 79.6, missingCount: 2, powerSchoolDifference: 0.14 },
  { id: "s6", name: "Jordan Kim", currentGrade: 88.5, missingCount: 0, powerSchoolDifference: 0 },
];

export const demoAssignments: DemoAssignment[] = [
  { id: "a1", title: "1.4 Quiz", type: "Quiz", date: "Aug 21", average: 81.3, missing: 0, retakes: 2 },
  { id: "a2", title: "1.3 Quiz", type: "Quiz", date: "Aug 19", average: 76.8, missing: 2, retakes: 4 },
  { id: "a3", title: "Participation 8/18", type: "Participation", date: "Aug 18", average: 94.1, missing: 1, retakes: 0 },
  { id: "a4", title: "Unit 1 Test", type: "Test", date: "Aug 16", average: 79.4, missing: 0, retakes: 3 },
];
