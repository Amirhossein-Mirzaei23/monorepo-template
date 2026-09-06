import type { Metadata } from 'next';
import { CreateLotWizard } from '@/features/lots';

export const metadata: Metadata = { title: 'ویرایش آگهی' };

/** LOT-004 — edit-lot wizard (owner shape; locked-status handling in the wizard). */
export default async function EditLotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreateLotWizard lotId={id} />;
}
