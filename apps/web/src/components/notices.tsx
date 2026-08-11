import { useSyncExternalStore } from "react";

import { dismissNotice, subscribeToNotices, type Notice } from "../lib/notify";

let snapshot: Notice[] = [];

const subscribe = (callback: () => void): (() => void) =>
  subscribeToNotices((notices) => {
    snapshot = notices;
    callback();
  });

const getSnapshot = (): Notice[] => snapshot;

export const Notices = () => {
  const notices = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (notices.length === 0) return null;

  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice notice--${notice.kind}`}>
          <span style={{ flex: 1 }}>{notice.message}</span>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => dismissNotice(notice.id)}
            aria-label="Chiudi avviso"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
