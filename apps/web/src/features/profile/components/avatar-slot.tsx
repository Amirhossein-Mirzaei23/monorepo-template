'use client';

import { User } from 'lucide-react';

/**
 * Avatar SLOT (PROF-001) — an empty placeholder next to the profile header.
 * PROF-004 activates it: it will render the uploaded/cropped square image and
 * fall back to these initials until then. No upload UI here by design.
 */
export function AvatarSlot({ displayName }: { displayName: string }) {
  const initial = displayName.trim().charAt(0) || '؟';
  return (
    <div
      aria-label="تصویر پروفایل — به‌زودی"
      className="border-border bg-muted text-muted-foreground relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border"
    >
      <span className="text-2xl font-semibold" aria-hidden="true">
        {initial}
      </span>
      <User className="absolute bottom-1 size-3 opacity-40" aria-hidden="true" />
    </div>
  );
}
