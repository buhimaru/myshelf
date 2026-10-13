import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FollowRow,
  FollowStatus,
  MyConnectionsBundle,
  PendingFollowRequest,
  ShelfConnectionPerson,
} from "../../types/follow";
import { resolvePublicDisplayName } from "../shelfDisplay";

export type FollowConfirmContext = {
  targetIsPublic: boolean;
  viewerIsPublic: boolean;
};

export function followRequestConfirmMessage(ctx: FollowConfirmContext): string {
  if (ctx.targetIsPublic) {
    return "この公開棚をフォローします。公開棚はフォローなしでも閲覧できます。相手が非公開に切り替えた場合でも、このフォローだけでは非公開棚を閲覧できません。よろしいですか？";
  }

  if (ctx.viewerIsPublic) {
    return "フォローを申請します。相手の承認後、相手の非公開棚を閲覧できるようになります。あなたの公開棚は相手が別途フォローしなくても閲覧できます。よろしいですか？";
  }

  return "フォローを申請します。相手の承認後、お互いの非公開棚を閲覧できるようになります。よろしいですか？";
}

export function followAcceptConfirmMessage(opts: {
  ownerIsPublic: boolean;
  requesterIsPublic: boolean | null;
}): string {
  if (opts.ownerIsPublic) {
    return "この申請を承認します。あなたの棚は公開のため、承認後も誰でも閲覧できます。よろしいですか？";
  }

  if (opts.requesterIsPublic === true) {
    return "承認すると、相手があなたの非公開棚を閲覧できるようになります。よろしいですか？";
  }

  if (opts.requesterIsPublic === false) {
    return "承認すると、お互いの非公開棚を閲覧できるようになります。よろしいですか？";
  }

  return "このフォロー申請を承認します。よろしいですか？";
}

export function unfollowConfirmMessage(
  ctx: FollowConfirmContext & { theyFollowMe?: boolean }
): string {
  // 両者非公開: DB が双方向削除するため必ずその旨を説明
  if (!ctx.targetIsPublic && !ctx.viewerIsPublic) {
    return "フォローを解除すると、お互いの非公開棚は閲覧できなくなります。双方のフォロー関係もまとめて解消されます。よろしいですか？";
  }

  if (ctx.theyFollowMe) {
    if (!ctx.targetIsPublic && ctx.viewerIsPublic) {
      return "あなたから相手へのフォローだけを解除します。相手からのフォローは残り、相手の非公開棚は閲覧できなくなります。よろしいですか？";
    }
    return "あなたから相手へのフォローだけを解除します。相手からのフォローは残ります。よろしいですか？";
  }

  if (!ctx.targetIsPublic && ctx.viewerIsPublic) {
    return "フォローを解除すると、相手の非公開棚は閲覧できなくなります。よろしいですか？";
  }

  return "この棚のフォローを解除します。よろしいですか？";
}

export function removeFollowerConfirmMessage(opts: {
  ownerIsPublic: boolean;
  followerIsPublic: boolean | null;
  iFollowThem?: boolean;
}): string {
  // 両者非公開: DB が双方向削除するため必ずその旨を説明
  if (!opts.ownerIsPublic && opts.followerIsPublic === false) {
    return "フォロワーから解除すると、お互いの非公開棚は閲覧できなくなります。双方のフォロー関係もまとめて解消されます。よろしいですか？";
  }

  if (opts.iFollowThem) {
    if (!opts.ownerIsPublic) {
      return "相手からのフォローだけを解除します。あなたから相手へのフォローは残り、相手はあなたの非公開棚を閲覧できなくなります。よろしいですか？";
    }
    return "相手からのフォローだけを解除します。あなたから相手へのフォローは残ります。よろしいですか？";
  }

  if (!opts.ownerIsPublic) {
    return "このフォロワーを解除すると、相手はあなたの非公開棚を閲覧できなくなります。よろしいですか？";
  }

  return "このフォロワーを解除します。よろしいですか？";
}

export function connectionKindLabel(
  kind: ShelfConnectionPerson["kind"]
): string {
  if (kind === "mutual") return "相互フォロー";
  if (kind === "following") return "フォロー中";
  if (kind === "follower") return "フォロワー";
  if (kind === "outgoing_pending") return "申請中・承認待ち";
  return "届いた申請";
}

export const CANCEL_FOLLOW_REQUEST_CONFIRM =
  "このフォロー申請を取り消しますか？相手の承認前なので、棚の閲覧権限はまだありません。";

/** 申請承認・拒否・取り消し後に UI 同士を同期するためのイベント名 */
export const FOLLOWS_CHANGED_EVENT = "myshelf:follows-changed";

export function notifyFollowsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FOLLOWS_CHANGED_EVENT));
}

export function normalizeFollowStatus(status: string | null | undefined): FollowStatus {
  if (status === "pending") return "pending";
  if (status === "accepted") return "accepted";
  return "none";
}

/** 自分の棚に届いた pending 申請を取得する */
export async function fetchPendingFollowRequests(
  supabase: SupabaseClient,
  ownerId: string
): Promise<{ data: PendingFollowRequest[]; error: Error | null }> {
  const { data, error } = await supabase
    .from("follows")
    .select("id, follower_id, following_id, status, created_at")
    .eq("following_id", ownerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  const rows = (data ?? []) as FollowRow[];
  if (rows.length === 0) {
    return { data: [], error: null };
  }

  const followerIds = [...new Set(rows.map((row) => row.follower_id))];
  // username は表示に使わず、display_name へのレガシーミラー検出のみに使う
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, username, is_public")
    .in("id", followerIds);

  if (profileError) {
    return {
      data: rows.map((row) => ({
        ...row,
        label: resolvePublicDisplayName({ displayName: null }),
        requesterIsPublic: null,
      })),
      error: null,
    };
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile])
  );

  return {
    data: rows.map((row) => {
      const profile = profileMap.get(row.follower_id) ?? null;
      return {
        ...row,
        label: resolvePublicDisplayName({
          displayName: profile?.display_name ?? null,
          usernameForLegacyCheck: profile?.username ?? null,
        }),
        requesterIsPublic:
          profile && typeof profile.is_public === "boolean"
            ? profile.is_public
            : null,
      };
    }),
    error: null,
  };
}

/** pending → accepted（ペアロック付き RPC） */
export async function acceptFollowRequest(
  supabase: SupabaseClient,
  followId: string,
  _ownerId?: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("accept_follow_request", {
    request_id: followId,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/** pending 申請を削除（ペアロック付き RPC） */
export async function rejectFollowRequest(
  supabase: SupabaseClient,
  followId: string,
  _ownerId?: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("reject_follow_request", {
    request_id: followId,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * 自分→相手のフォロー状態（ボタン表示用）。
 * 逆向きだけの accepted は「フォロー中」にしない。
 */
export async function fetchFollowStatus(
  supabase: SupabaseClient,
  myUserId: string,
  otherUserId: string
): Promise<{ status: FollowStatus; error: Error | null }> {
  const { data, error } = await supabase
    .from("follows")
    .select("id, follower_id, following_id, status, created_at")
    .eq("follower_id", myUserId)
    .eq("following_id", otherUserId)
    .maybeSingle();

  if (error) {
    return { status: "none", error: new Error(error.message) };
  }

  if (!data) {
    return { status: "none", error: null };
  }

  return { status: normalizeFollowStatus(data.status), error: null };
}

/** RLS と同じ can_view_user_items で空棚の閲覧可否を判定 */
export async function canViewUserItems(
  supabase: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_view_user_items", {
    owner_id: ownerId,
  });

  if (error) return false;
  return data === true;
}

export async function followShelf(
  supabase: SupabaseClient,
  targetUserId: string
): Promise<{ status: FollowStatus; error: Error | null }> {
  const { data, error } = await supabase.rpc("follow_shelf", {
    target_user_id: targetUserId,
  });

  if (error) {
    return { status: "none", error: new Error(error.message) };
  }

  if (typeof data === "string") {
    return { status: normalizeFollowStatus(data), error: null };
  }

  if (data && typeof data === "object" && "status" in data) {
    return {
      status: normalizeFollowStatus(String((data as { status: string }).status)),
      error: null,
    };
  }

  return { status: "none", error: null };
}

/** フォロー解除（自分→相手）。DB 側で公開状態を見て削除範囲を決定 */
export async function unfollowShelf(
  supabase: SupabaseClient,
  targetUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("unfollow_shelf", {
    target_user_id: targetUserId,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/** フォロワー解除（相手→自分） */
export async function removeFollower(
  supabase: SupabaseClient,
  followerUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("remove_follower", {
    follower_user_id: followerUserId,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * 自分が送った pending 申請の取り消し。
 * cancel_follow_request RPC（outgoing pending のみ削除）を使う。
 * unfollow_shelf は使わない（両者非公開時に双方向削除されるため）。
 */
export async function cancelOutgoingFollowRequest(
  supabase: SupabaseClient,
  targetUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("cancel_follow_request", {
    target_user_id: targetUserId,
  });

  if (error) {
    const message = error.message ?? "";
    if (
      /could not find|does not exist|PGRST202|42883/i.test(message) ||
      error.code === "PGRST202"
    ) {
      return {
        error: new Error(
          "申請取り消し用のRPCが未適用です。sql/stage4_cancel_outgoing_follow.sql を本番に適用してください。"
        ),
      };
    }
    return { error: new Error(message) };
  }

  return { error: null };
}

function sortConnections(people: ShelfConnectionPerson[]): ShelfConnectionPerson[] {
  return [...people].sort((a, b) => {
    const aAt = a.latestAt ?? "";
    const bAt = b.latestAt ?? "";
    if (aAt !== bAt) return aAt < bAt ? 1 : -1;
    return a.label.localeCompare(b.label, "ja");
  });
}

function profileLabel(
  profile:
    | {
        display_name?: string | null;
        username?: string | null;
        is_public?: boolean;
      }
    | null
    | undefined
): { label: string; isPublic: boolean | null } {
  return {
    label: resolvePublicDisplayName({
      displayName: profile?.display_name ?? null,
      usernameForLegacyCheck: profile?.username ?? null,
    }),
    isPublic:
      profile && typeof profile.is_public === "boolean"
        ? profile.is_public
        : null,
  };
}

/** つながり: accepted + 自分から送った pending。届いた申請は含めない */
export async function fetchMyConnections(
  supabase: SupabaseClient,
  myUserId: string
): Promise<{ data: MyConnectionsBundle; error: Error | null }> {
  const empty: MyConnectionsBundle = {
    accepted: [],
    outgoingPending: [],
  };

  const [followingResult, followerResult, outgoingPendingResult] =
    await Promise.all([
      supabase
        .from("follows")
        .select("id, follower_id, following_id, status, created_at")
        .eq("follower_id", myUserId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false }),
      supabase
        .from("follows")
        .select("id, follower_id, following_id, status, created_at")
        .eq("following_id", myUserId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false }),
      supabase
        .from("follows")
        .select("id, follower_id, following_id, status, created_at")
        .eq("follower_id", myUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  if (followingResult.error) {
    return { data: empty, error: new Error(followingResult.error.message) };
  }
  if (followerResult.error) {
    return { data: empty, error: new Error(followerResult.error.message) };
  }
  if (outgoingPendingResult.error) {
    return {
      data: empty,
      error: new Error(outgoingPendingResult.error.message),
    };
  }

  const followingRows = (followingResult.data ?? []) as FollowRow[];
  const followerRows = (followerResult.data ?? []) as FollowRow[];
  const outgoingPendingRows = (outgoingPendingResult.data ?? []) as FollowRow[];

  const otherIds = [
    ...new Set([
      ...followingRows.map((row) => row.following_id),
      ...followerRows.map((row) => row.follower_id),
      ...outgoingPendingRows.map((row) => row.following_id),
    ]),
  ];

  let profileMap = new Map<
    string,
    {
      display_name?: string | null;
      username?: string | null;
      is_public?: boolean;
    }
  >();

  if (otherIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, username, is_public")
      .in("id", otherIds);

    if (!profileError && profiles) {
      profileMap = new Map(
        profiles.map((profile) => [profile.id as string, profile])
      );
    }
  }

  type Acc = {
    userId: string;
    iFollowThem: boolean;
    theyFollowMe: boolean;
    latestAt?: string;
  };

  const byUser = new Map<string, Acc>();

  const bumpLatest = (current: string | undefined, next?: string) => {
    if (!next) return current;
    if (!current) return next;
    return next > current ? next : current;
  };

  for (const row of followingRows) {
    const existing = byUser.get(row.following_id);
    if (existing) {
      existing.iFollowThem = true;
      existing.latestAt = bumpLatest(existing.latestAt, row.created_at);
    } else {
      byUser.set(row.following_id, {
        userId: row.following_id,
        iFollowThem: true,
        theyFollowMe: false,
        latestAt: row.created_at,
      });
    }
  }

  for (const row of followerRows) {
    const existing = byUser.get(row.follower_id);
    if (existing) {
      existing.theyFollowMe = true;
      existing.latestAt = bumpLatest(existing.latestAt, row.created_at);
    } else {
      byUser.set(row.follower_id, {
        userId: row.follower_id,
        iFollowThem: false,
        theyFollowMe: true,
        latestAt: row.created_at,
      });
    }
  }

  const accepted: ShelfConnectionPerson[] = [...byUser.values()].map(
    (entry) => {
      const profile = profileMap.get(entry.userId) ?? null;
      const { label, isPublic } = profileLabel(profile);
      const kind =
        entry.iFollowThem && entry.theyFollowMe
          ? "mutual"
          : entry.iFollowThem
            ? "following"
            : "follower";

      return {
        userId: entry.userId,
        label,
        isPublic,
        kind,
        iFollowThem: entry.iFollowThem,
        theyFollowMe: entry.theyFollowMe,
        latestAt: entry.latestAt,
      };
    }
  );

  const outgoingPending: ShelfConnectionPerson[] = outgoingPendingRows.map(
    (row) => {
      const profile = profileMap.get(row.following_id) ?? null;
      const { label, isPublic } = profileLabel(profile);
      return {
        userId: row.following_id,
        label,
        isPublic,
        kind: "outgoing_pending",
        iFollowThem: false,
        theyFollowMe: false,
        followId: row.id,
        latestAt: row.created_at,
      };
    }
  );

  return {
    data: {
      accepted: sortConnections(accepted),
      outgoingPending: sortConnections(outgoingPending),
    },
    error: null,
  };
}
