import type { Metadata } from 'next';
import { CreateLotWizard } from '@/features/lots';

export const metadata: Metadata = { title: 'ساخت آگهی جدید' };

/** LOT-004 — create-lot wizard (mobile-first, five steps). */
export default function NewLotPage() {
  return <CreateLotWizard />;
}
