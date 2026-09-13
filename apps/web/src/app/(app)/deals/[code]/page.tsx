import type { Metadata } from 'next';
import { DealDetail } from '@/features/deals';

export const metadata: Metadata = { title: 'جزئیات معامله' };

/**
 * DEAL-004 — the /deals/:code route. The detail component owns the query
 * (client hooks — authenticated surface); the code arrives from the path.
 */
export default async function DealDetailRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DealDetail code={code} />;
}
