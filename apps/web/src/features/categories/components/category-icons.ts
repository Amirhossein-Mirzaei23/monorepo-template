import {
  Footprints,
  PackageOpen,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tags,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

/**
 * Category icon map (CAT-003) — keyed by top-level category slug as seeded in
 * CAT-001 (`apps/api/prisma/seed.ts`). The taxonomy is admin-managed, so
 * unknown slugs fall back to a neutral default instead of breaking the UI;
 * `home` / `beauty` aliases tolerate the shorter card-level spellings.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  apparel: Shirt,
  shoes: Footprints,
  'bags-accessories': ShoppingBag,
  'home-kitchen': UtensilsCrossed,
  home: UtensilsCrossed,
  'beauty-health': Sparkles,
  beauty: Sparkles,
  fmcg: PackageOpen,
};

/** Returns the lucide icon component for a top-level category slug. */
export function categoryIcon(slug: string): LucideIcon {
  return CATEGORY_ICONS[slug] ?? Tags;
}
