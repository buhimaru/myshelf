export type FollowStatus = "none" | "pending" | "accepted";

export type FollowRow = {
  id: string;
  follower_id: string;
  following_id: string;
  status: string;
  created_at?: string;
};

export type PendingFollowRequest = FollowRow & {
  label: string;
  requesterIsPublic: boolean | null;
};

/** つながり一覧用 */
export type ConnectionKind =
  | "mutual"
  | "following"
  | "follower"
  | "outgoing_pending"
  | "incoming_pending";

export type ShelfConnectionPerson = {
  userId: string;
  label: string;
  isPublic: boolean | null;
  kind: ConnectionKind;
  /** accepted の自分→相手 */
  iFollowThem: boolean;
  /** accepted の相手→自分 */
  theyFollowMe: boolean;
  /** pending / 操作対象の follows.id */
  followId?: string;
  /** 並び用（新しい関係を上に） */
  latestAt?: string;
};

export type MyConnectionsBundle = {
  accepted: ShelfConnectionPerson[];
  outgoingPending: ShelfConnectionPerson[];
};
