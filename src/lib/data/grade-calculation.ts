import { calculateGrade, calculateSemesterGrade } from "@/lib/grading/engine";
import type { GradeRecord, GradeResult, GradingCategory, GradingRules, SemesterGradeResult } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";

export type GradingPeriodSummary = { id: string; code: string; name: string };
export type StudentGradeCalculation = { studentId: string; sectionId: string; gradingPeriod: GradingPeriodSummary; rules: GradingRules; result: GradeResult };
export type StudentSemesterCalculation = {
  studentId: string;
  sectionId: string;
  semesterCode: "S1" | "S2";
  semesterName: string;
  quarterCalculations: StudentGradeCalculation[];
  examCalculation: StudentGradeCalculation | null;
  result: SemesterGradeResult;
};
export type SectionGradebookRow = {
  studentId: string;
  overallPercent: number | null;
  categoryPercents: Partial<Record<GradingCategory, number>>;
  componentPercents: Record<string, number | null>;
  missingCount: number;
  unenteredCount: number;
  assignmentCount: number;
};
export type SectionGradebookCalculation = {
  sectionId: string;
  gradingPeriod: GradingPeriodSummary;
  mode: "quarter" | "semester";
  rules: GradingRules;
  rows: SectionGradebookRow[];
};

export function gradingCategoryFromName(name: string): GradingCategory {
  const normalized = name.trim().toLowerCase();
  if (normalized === "participation") return "participation";
  if (normalized === "quiz" || normalized === "quizzes") return "quiz";
  if (normalized === "test" || normalized === "tests") return "test";
  throw new Error(`Unsupported grading category: ${name}`);
}

function buildRules(categories: { id: string; name: string; weight: number | string; drop_lowest: number | string }[]) {
  const categoryById = new Map<string,{category:GradingCategory;weight:number;dropLowest:number}>();
  const rules: GradingRules = { categoryWeights:{participation:0,quiz:0,test:0}, dropLowest:{}, retakePolicy:"highest" };
  for (const row of categories) {
    const category=gradingCategoryFromName(row.name), weight=Number(row.weight), dropLowest=Number(row.drop_lowest);
    categoryById.set(row.id,{category,weight,dropLowest});
    rules.categoryWeights[category]=weight;
    if(dropLowest>0) rules.dropLowest[category]=dropLowest;
  }
  return { categoryById, rules };
}

export async function getSectionGradingPeriods(sectionId: string): Promise<GradingPeriodSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("grading_periods").select("id,code,name").eq("section_id", sectionId);
  if (error || !data) return [];
  const order = new Map([["Q1",1],["Q2",2],["S1",3],["Q3",4],["Q4",5],["S2",6]]);
  return data.sort((a,b)=>(order.get(a.code)??99)-(order.get(b.code)??99));
}

export async function getStudentGradeCalculation(sectionId: string, studentId: string, gradingPeriodCode: string): Promise<StudentGradeCalculation | null> {
  const supabase = await createClient();
  const [{ data: period, error: periodError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("grading_periods").select("id,code,name").eq("section_id",sectionId).eq("code",gradingPeriodCode).maybeSingle(),
    supabase.from("grading_categories").select("id,name,weight,drop_lowest").eq("section_id",sectionId),
  ]);
  if (periodError || categoriesError || !period || !categories?.length) return null;

  const { categoryById, rules } = buildRules(categories);
  const { data: assignments, error: assignmentsError } = await supabase.from("assignments")
    .select("id,category_id,title,assignment_date,points_possible").eq("section_id",sectionId).eq("grading_period_id",period.id)
    .order("assignment_date",{ascending:true}).order("created_at",{ascending:true});
  if(assignmentsError||!assignments) return null;
  if(assignments.length===0) return {studentId,sectionId,gradingPeriod:period,rules,result:calculateGrade([],rules)};

  const assignmentIds=assignments.map(a=>a.id);
  const { data: gradeRows, error: gradeRowsError }=await supabase.from("grade_records").select("id,assignment_id,missing,exempt").eq("student_id",studentId).in("assignment_id",assignmentIds);
  if(gradeRowsError||!gradeRows) return null;
  const gradeRowByAssignmentId=new Map(gradeRows.map(r=>[r.assignment_id,r]));
  const gradeRecordIds=gradeRows.map(r=>r.id);
  const attemptsByGradeRecordId=new Map<string,{id:string;points_earned:number;attempt_number:number;occurred_on:string}[]>();
  if(gradeRecordIds.length>0){
    const {data:attempts,error:attemptsError}=await supabase.from("grade_attempts").select("id,grade_record_id,points_earned,attempt_number,occurred_on").in("grade_record_id",gradeRecordIds).order("attempt_number",{ascending:true});
    if(attemptsError||!attempts)return null;
    for(const attempt of attempts){const list=attemptsByGradeRecordId.get(attempt.grade_record_id)??[];list.push(attempt);attemptsByGradeRecordId.set(attempt.grade_record_id,list);}
  }
  const records:GradeRecord[]=assignments.map(assignment=>{
    const config=categoryById.get(assignment.category_id); if(!config) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
    const row=gradeRowByAssignmentId.get(assignment.id), attempts=row?attemptsByGradeRecordId.get(row.id)??[]:[], possible=Number(assignment.points_possible);
    return {assignmentId:assignment.id,assignmentTitle:assignment.title,assignmentDate:assignment.assignment_date,gradingPeriodCode:period.code,category:config.category,missing:row?.missing??false,exempt:row?.exempt??false,attempts:attempts.map(a=>({id:a.id,earned:Number(a.points_earned),possible,attemptNumber:a.attempt_number,occurredAt:a.occurred_on}))};
  });
  return {studentId,sectionId,gradingPeriod:period,rules,result:calculateGrade(records,rules)};
}

export async function getStudentSemesterCalculation(sectionId:string,studentId:string,semesterCode:"S1"|"S2"):Promise<StudentSemesterCalculation>{
  const quarterCodes=semesterCode==="S1"?["Q1","Q2"]:["Q3","Q4"];
  const [firstQuarter,secondQuarter,examCalculation]=await Promise.all([
    getStudentGradeCalculation(sectionId,studentId,quarterCodes[0]),
    getStudentGradeCalculation(sectionId,studentId,quarterCodes[1]),
    getStudentGradeCalculation(sectionId,studentId,semesterCode),
  ]);
  const quarterCalculations=[firstQuarter,secondQuarter].filter((value):value is StudentGradeCalculation=>value!==null);
  const result=calculateSemesterGrade([
    {code:quarterCodes[0],label:`${quarterCodes[0]} grade`,weight:0.4,percent:firstQuarter?.result.overallPercent??null},
    {code:quarterCodes[1],label:`${quarterCodes[1]} grade`,weight:0.4,percent:secondQuarter?.result.overallPercent??null},
    {code:"EXAM",label:"Semester Exam",weight:0.2,percent:examCalculation?.result.overallPercent??null},
  ]);
  return {studentId,sectionId,semesterCode,semesterName:semesterCode==="S1"?"Semester 1":"Semester 2",quarterCalculations,examCalculation,result};
}

export async function getSectionGradebook(sectionId:string,studentIds:string[],gradingPeriodCode:string):Promise<SectionGradebookCalculation|null>{
  const supabase=await createClient();
  const [{data:periods,error:periodsError},{data:categories,error:categoriesError}]=await Promise.all([
    supabase.from("grading_periods").select("id,code,name").eq("section_id",sectionId),
    supabase.from("grading_categories").select("id,name,weight,drop_lowest").eq("section_id",sectionId),
  ]);
  if(periodsError||categoriesError||!periods||!categories?.length)return null;
  const selectedPeriod=periods.find(period=>period.code===gradingPeriodCode); if(!selectedPeriod)return null;
  const {categoryById,rules}=buildRules(categories);
  const isSemester=gradingPeriodCode==="S1"||gradingPeriodCode==="S2";
  const quarterCodes=gradingPeriodCode==="S1"?["Q1","Q2"]:gradingPeriodCode==="S2"?["Q3","Q4"]:[];
  const requiredCodes=isSemester?[...quarterCodes,gradingPeriodCode]:[gradingPeriodCode];
  const periodByCode=new Map(periods.map(period=>[period.code,period]));
  const requiredPeriodIds=requiredCodes.map(code=>periodByCode.get(code)?.id).filter((id):id is string=>typeof id==="string");
  if(requiredPeriodIds.length===0)return {sectionId,gradingPeriod:selectedPeriod,mode:isSemester?"semester":"quarter",rules,rows:studentIds.map(studentId=>({studentId,overallPercent:null,categoryPercents:{},componentPercents:{},missingCount:0,unenteredCount:0,assignmentCount:0}))};

  const {data:assignments,error:assignmentsError}=await supabase.from("assignments")
    .select("id,category_id,grading_period_id,title,assignment_date,points_possible,created_at")
    .eq("section_id",sectionId).in("grading_period_id",requiredPeriodIds)
    .order("assignment_date",{ascending:true}).order("created_at",{ascending:true});
  if(assignmentsError||!assignments)return null;
  const assignmentIds=assignments.map(assignment=>assignment.id);
  let gradeRows:{id:string;assignment_id:string;student_id:string;missing:boolean;exempt:boolean}[]=[];
  if(studentIds.length>0&&assignmentIds.length>0){
    const {data,error}=await supabase.from("grade_records").select("id,assignment_id,student_id,missing,exempt").in("student_id",studentIds).in("assignment_id",assignmentIds);
    if(error||!data)return null; gradeRows=data;
  }
  const gradeRecordIds=gradeRows.map(row=>row.id);
  let attempts:{id:string;grade_record_id:string;points_earned:number;attempt_number:number;occurred_on:string}[]=[];
  if(gradeRecordIds.length>0){
    const {data,error}=await supabase.from("grade_attempts").select("id,grade_record_id,points_earned,attempt_number,occurred_on").in("grade_record_id",gradeRecordIds).order("attempt_number",{ascending:true});
    if(error||!data)return null; attempts=data;
  }

  const assignmentsByPeriodId=new Map<string,typeof assignments>();
  for(const assignment of assignments){if(!assignment.grading_period_id)continue;const periodId=assignment.grading_period_id;const list=assignmentsByPeriodId.get(periodId)??[];list.push(assignment);assignmentsByPeriodId.set(periodId,list);}
  const gradeRowByStudentAssignment=new Map<string,(typeof gradeRows)[number]>();
  for(const row of gradeRows)gradeRowByStudentAssignment.set(`${row.student_id}:${row.assignment_id}`,row);
  const attemptsByGradeRecordId=new Map<string,typeof attempts>();
  for(const attempt of attempts){const list=attemptsByGradeRecordId.get(attempt.grade_record_id)??[];list.push(attempt);attemptsByGradeRecordId.set(attempt.grade_record_id,list);}

  function calculateStudentPeriod(studentId:string,code:string){
    const period=periodByCode.get(code); if(!period)return {result:calculateGrade([],rules),assignmentCount:0};
    const periodAssignments=assignmentsByPeriodId.get(period.id)??[];
    const records:GradeRecord[]=periodAssignments.map(assignment=>{
      const config=categoryById.get(assignment.category_id); if(!config)throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
      const row=gradeRowByStudentAssignment.get(`${studentId}:${assignment.id}`), rowAttempts=row?attemptsByGradeRecordId.get(row.id)??[]:[], possible=Number(assignment.points_possible);
      return {assignmentId:assignment.id,assignmentTitle:assignment.title,assignmentDate:assignment.assignment_date,gradingPeriodCode:code,category:config.category,missing:row?.missing??false,exempt:row?.exempt??false,attempts:rowAttempts.map(attempt=>({id:attempt.id,earned:Number(attempt.points_earned),possible,attemptNumber:attempt.attempt_number,occurredAt:attempt.occurred_on}))};
    });
    return {result:calculateGrade(records,rules),assignmentCount:periodAssignments.length};
  }

  const rows=studentIds.map(studentId=>{
    if(!isSemester){
      const calculation=calculateStudentPeriod(studentId,gradingPeriodCode);
      return {studentId,overallPercent:calculation.result.overallPercent,categoryPercents:calculation.result.categoryPercents,componentPercents:{},missingCount:calculation.result.audit.filter(line=>line.status==="missing").length,unenteredCount:calculation.result.audit.filter(line=>line.status==="unentered").length,assignmentCount:calculation.assignmentCount};
    }
    const first=calculateStudentPeriod(studentId,quarterCodes[0]), second=calculateStudentPeriod(studentId,quarterCodes[1]), exam=calculateStudentPeriod(studentId,gradingPeriodCode);
    const semester=calculateSemesterGrade([
      {code:quarterCodes[0],label:`${quarterCodes[0]} grade`,weight:0.4,percent:first.result.overallPercent},
      {code:quarterCodes[1],label:`${quarterCodes[1]} grade`,weight:0.4,percent:second.result.overallPercent},
      {code:"EXAM",label:"Semester Exam",weight:0.2,percent:exam.result.overallPercent},
    ]);
    const audit=[...first.result.audit,...second.result.audit,...exam.result.audit];
    return {studentId,overallPercent:semester.overallPercent,categoryPercents:{},componentPercents:{[quarterCodes[0]]:first.result.overallPercent,[quarterCodes[1]]:second.result.overallPercent,EXAM:exam.result.overallPercent},missingCount:audit.filter(line=>line.status==="missing").length,unenteredCount:audit.filter(line=>line.status==="unentered").length,assignmentCount:first.assignmentCount+second.assignmentCount+exam.assignmentCount};
  });
  return {sectionId,gradingPeriod:selectedPeriod,mode:isSemester?"semester":"quarter",rules,rows};
}
