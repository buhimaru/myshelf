export type WorkComment = {
  id: string;
  work_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  user_id?: string | null;
};

export type WorkCommentInsert = {
  work_id: string;
  author_name: string | null;
  body: string;
  user_id: string;
};
