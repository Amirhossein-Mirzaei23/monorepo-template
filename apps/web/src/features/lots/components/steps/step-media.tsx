'use client';

import { MediaUploader, type MediaItem } from '@/features/media';

export interface StepMediaProps {
  /**
   * Controlled tile list (index 0 = cover). New lots keep these ids as a
   * *pending* list — they can only attach to a lot after the first save
   * (choreography lives in create-lot-wizard.tsx).
   */
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  disabled?: boolean;
}

/**
 * Wizard step 1 — photos + video via the shared MediaUploader (MEDIA-004,
 * reused through the media feature barrel without modification: the CAT-003
 * acceptance pattern). 15 images / 3 videos per lot (the uploader defaults).
 */
export function StepMedia({ value, onChange, disabled = false }: StepMediaProps) {
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        اولین رسانه، کاور اصلی می‌شود. حداکثر ۱۵ تصویر و ۳ ویدیو (هر ویدیو حداکثر ۶۰ ثانیه).
      </p>
      <MediaUploader value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
