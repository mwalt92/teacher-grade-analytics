"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireTeacherForSection(sectionId:string){const supabase=await createClient();const{data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")throw new Error("Not authenticated");const{data:assignment}=await supabase.from("teacher_sections").select("section_id").eq("teacher_id",userId).eq("section_id",sectionId).maybeSingle();if(!assignment)throw new Error("You do not have access to this section");return supabase;}

export async function addStudent(formData:FormData){
  const sectionId=String(formData.get("sectionId")??"");const displayName=String(formData.get("displayName")??"").trim();const studentNumber=String(formData.get("studentNumber")??"").trim();const schoolEmail=String(formData.get("schoolEmail")??"").trim().toLowerCase()||null;
  if(!sectionId||!displayName||!studentNumber)throw new Error("Name and student number are required");
  const supabase=await requireTeacherForSection(sectionId);
  const{data:existing}=await supabase.from("students").select("id,display_name,school_email").eq("external_student_key",studentNumber).maybeSingle();
  let studentId:string;
  if(existing){studentId=existing.id;const{error}=await supabase.from("students").update({display_name:displayName,school_email:schoolEmail??existing.school_email}).eq("id",studentId);if(error)throw error;}
  else{const{data:student,error}=await supabase.from("students").insert({display_name:displayName,external_student_key:studentNumber,school_email:schoolEmail}).select("id").single();if(error)throw error;studentId=student.id;}
  const{error:enrollmentError}=await supabase.from("enrollments").upsert({student_id:studentId,section_id:sectionId,enrolled_on:new Date().toISOString().slice(0,10),active:true,exited_on:null},{onConflict:"student_id,section_id"});if(enrollmentError)throw enrollmentError;
  revalidatePath("/");revalidatePath("/students");
}

export async function setEnrollmentActive(formData:FormData){const sectionId=String(formData.get("sectionId")??"");const enrollmentId=String(formData.get("enrollmentId")??"");const active=String(formData.get("active"))==="true";if(!sectionId||!enrollmentId)throw new Error("Enrollment is required");const supabase=await requireTeacherForSection(sectionId);const{error}=await supabase.from("enrollments").update({active,exited_on:active?null:new Date().toISOString().slice(0,10)}).eq("id",enrollmentId).eq("section_id",sectionId);if(error)throw error;revalidatePath("/");revalidatePath("/students");}
