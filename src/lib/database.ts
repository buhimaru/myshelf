import type { WorkComment, WorkCommentInsert } from "@/lib/comment";
import type { Profile } from "@/lib/profile";
import type { Work, WorkWritePayload } from "@/lib/work";

type Relationships = [];

export type Database = {
  public: {
    Tables: {
      works: {
        Row: Work;
        Insert: WorkWritePayload;
        Update: Partial<WorkWritePayload>;
        Relationships: Relationships;
      };
      comments: {
        Row: WorkComment;
        Insert: WorkCommentInsert;
        Update: Partial<WorkCommentInsert>;
        Relationships: Relationships;
      };
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: Partial<Pick<Profile, "display_name" | "username" | "is_public">>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
