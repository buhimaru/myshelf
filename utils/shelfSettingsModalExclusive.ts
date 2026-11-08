export type ShelfSettingsModalId =
  | "visibility"
  | "connections"
  | "follow-requests"
  | "share";

const EVENT_NAME = "myshelf:settings-modal";

type Detail = { id: ShelfSettingsModalId | null };

/** 他の設定モーダルへ「今このIDが開いた」ことを通知する */
export function announceShelfSettingsModal(id: ShelfSettingsModalId | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Detail>(EVENT_NAME, { detail: { id } })
  );
}

/** 自分以外の設定モーダルが開いたら閉じる */
export function subscribeShelfSettingsModalExclusive(
  selfId: ShelfSettingsModalId,
  onOtherOpened: () => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<Detail>).detail;
    if (!detail) return;
    if (detail.id !== null && detail.id !== selfId) {
      onOtherOpened();
    }
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
