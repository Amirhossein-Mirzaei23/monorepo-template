import type { Metadata } from 'next';
import { ChatInbox } from '@/features/chat';

export const metadata: Metadata = { title: 'گفتگوها' };

/**
 * CHT-005 — the conversations inbox route. Authenticated client data
 * (react-query through the BFF; see doc/CONVENTIONS.md decision table), so the
 * route stays a thin composition over the feature.
 */
export default function ChatRoute() {
  return <ChatInbox />;
}
