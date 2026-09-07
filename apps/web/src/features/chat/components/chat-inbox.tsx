'use client';

import { WifiOff } from 'lucide-react';
import { useConversationsList } from '../hooks/use-conversations';
import { ConversationsList } from './conversations-list';

/**
 * CHT-005 — the /chat inbox body: header, the WS fallback badge and the list.
 * The badge («اتصال زنده قطع است — به‌روزرسانی خودکار متوقف») shows only while
 * the CHT-004 polling fallback is active (socket down > 10 s) — the query
 * itself keeps updating every 15 s in that mode, so it is a status note, not
 * an error (amber = warnings, per the palette).
 */
export function ChatInbox() {
  const list = useConversationsList();

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">گفتگوها</h1>

      {list.pollingActive ? (
        <p
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          اتصال زنده قطع است — به‌روزرسانی خودکار متوقف
        </p>
      ) : null}

      <div className="mt-4">
        <ConversationsList list={list} />
      </div>
    </section>
  );
}
