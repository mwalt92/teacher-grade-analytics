export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      school_years: {
        Row: { id: string; label: string; starts_on: string; ends_on: string; archived: boolean; created_at: string };
        Insert: { id?: string; label: string; starts_on: string; ends_on: string; archived?: boolean; created_at?: string };
        Update: { id?: string; label?: string; starts_on?: string; ends_on?: string; archived?: boolean; created_at?: string };
        Relationships: [];
      };
      courses: {
        Row: { id: string; code: string | null; name: string; created_at: string };
        Insert: { id?: string; code?: string | null; name: string; created_at?: string };
        Update: { id?: string; code?: string | null; name?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; email: string; display_name: string; role: string; created_at: string };
        Insert: { id: string; email: string; display_name: string; role: string; created_at?: string };
        Update: { id?: string; email?: string; display_name?: string; role?: string; created_at?: string };
        Relationships: [];
      };
      sections: {
        Row: { id: string; course_id: string; school_year_id: string; name: string; active: boolean; created_at: string };
        Insert: { id?: string; course_id: string; school_year_id: string; name: string; active?: boolean; created_at?: string };
        Update: { id?: string; course_id?: string; school_year_id?: string; name?: string; active?: boolean; created_at?: string };
        Relationships: [];
      };
      teacher_sections: {
        Row: { teacher_id: string; section_id: string };
        Insert: { teacher_id: string; section_id: string };
        Update: { teacher_id?: string; section_id?: string };
        Relationships: [];
      };
      enrollments: {
        Row: { id: string; student_id: string; section_id: string; enrolled_on: string; exited_on: string | null; active: boolean; created_at: string };
        Insert: { id?: string; student_id: string; section_id: string; enrolled_on: string; exited_on?: string | null; active?: boolean; created_at?: string };
        Update: { id?: string; student_id?: string; section_id?: string; enrolled_on?: string; exited_on?: string | null; active?: boolean; created_at?: string };
        Relationships: [];
      };
      grading_periods: {
        Row: { id: string; section_id: string; code: string; name: string; starts_on: string | null; ends_on: string | null };
        Insert: { id?: string; section_id: string; code: string; name: string; starts_on?: string | null; ends_on?: string | null };
        Update: { id?: string; section_id?: string; code?: string; name?: string; starts_on?: string | null; ends_on?: string | null };
        Relationships: [];
      };
      grading_categories: {
        Row: { id: string; section_id: string; name: string; weight: number; drop_lowest: number; late_deduction: number };
        Insert: { id?: string; section_id: string; name: string; weight: number; drop_lowest?: number; late_deduction?: number };
        Update: { id?: string; section_id?: string; name?: string; weight?: number; drop_lowest?: number; late_deduction?: number };
        Relationships: [];
      };
      assignments: {
        Row: { id: string; section_id: string; category_id: string; grading_period_id: string | null; title: string; assignment_type: string; assignment_date: string; points_possible: number; allow_retakes: boolean; late_deduction_override: number | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; section_id: string; category_id: string; grading_period_id?: string | null; title: string; assignment_type: string; assignment_date: string; points_possible: number; allow_retakes?: boolean; late_deduction_override?: number | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; section_id?: string; category_id?: string; grading_period_id?: string | null; title?: string; assignment_type?: string; assignment_date?: string; points_possible?: number; allow_retakes?: boolean; late_deduction_override?: number | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      grade_records: {
        Row: { id: string; assignment_id: string; student_id: string; missing: boolean; exempt: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; assignment_id: string; student_id: string; missing?: boolean; exempt?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; assignment_id?: string; student_id?: string; missing?: boolean; exempt?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      grade_attempts: {
        Row: { id: string; grade_record_id: string; attempt_number: number; points_earned: number; occurred_on: string; is_late: boolean; entered_by: string | null; created_at: string };
        Insert: { id?: string; grade_record_id: string; attempt_number: number; points_earned: number; occurred_on: string; is_late?: boolean; entered_by?: string | null; created_at?: string };
        Update: { id?: string; grade_record_id?: string; attempt_number?: number; points_earned?: number; occurred_on?: string; is_late?: boolean; entered_by?: string | null; created_at?: string };
        Relationships: [];
      };
      grade_changes: {
        Row: { id: string; grade_record_id: string; changed_by: string | null; changed_at: string; old_value: Json | null; new_value: Json; action: string };
        Insert: { id?: string; grade_record_id: string; changed_by?: string | null; changed_at?: string; old_value?: Json | null; new_value: Json; action: string };
        Update: { id?: string; grade_record_id?: string; changed_by?: string | null; changed_at?: string; old_value?: Json | null; new_value?: Json; action?: string };
        Relationships: [];
      };
      grade_issue_reports: {
        Row: { id: string; grade_record_id: string; student_id: string; message: string; status: string; created_at: string; resolved_at: string | null; resolved_by: string | null };
        Insert: { id?: string; grade_record_id: string; student_id: string; message: string; status?: string; created_at?: string; resolved_at?: string | null; resolved_by?: string | null };
        Update: { id?: string; grade_record_id?: string; student_id?: string; message?: string; status?: string; created_at?: string; resolved_at?: string | null; resolved_by?: string | null };
        Relationships: [];
      };
      power_school_snapshots: {
        Row: { id: string; student_id: string; section_id: string; grading_period_id: string | null; captured_at: string; powerschool_percent: number; website_percent: number; note: string | null };
        Insert: { id?: string; student_id: string; section_id: string; grading_period_id?: string | null; captured_at?: string; powerschool_percent: number; website_percent: number; note?: string | null };
        Update: { id?: string; student_id?: string; section_id?: string; grading_period_id?: string | null; captured_at?: string; powerschool_percent?: number; website_percent?: number; note?: string | null };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
