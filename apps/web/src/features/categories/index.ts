/**
 * Public API (barrel) of the categories feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). Reused by onboarding
 * (future adoption), create-lot (LOT-004), filters (MKT-008) and home sections
 * without modification (CAT-003 acceptance).
 */
export {
  CategoryTreePicker,
  type CategoryPickerValue,
  type CategoryTreePickerProps,
} from './components/category-tree-picker';
export { CategoryChips, type CategoryChipsProps } from './components/category-chips';
export { categoryIcon } from './components/category-icons';
export { useCategories } from './hooks/use-categories';
export { categoriesRequest } from './api/categories-api';
export { categoryKeys } from './api/keys';
