import type { Metadata } from 'next';
import { ChatThread } from '@/features/chat';

export const metadata: Metadata = { title: 'گفتگو' };

interface ChatThreadRouteProps {
  params: Promise<{ id: string }>;
}

/**
 * CHT-006 — the chat thread route (replaces the CHT-005 placeholder).
 * Authenticated realtime data (react-query + socket through the hooks the
 * feature owns; see doc/CONVENTIONS.md decision table), so the route stays a
 * thin composition over the feature. The conversation id is unguessable and
 * every endpoint is participant-guarded server-side — a foreign id just
 * renders the thread's error/empty states behind a 403.
 */
export default async function ChatThreadRoute({ params }: ChatThreadRouteProps) {
  const { id } = await params;
  return <ChatThread conversationId={id} />;
}
