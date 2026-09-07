/**
 * Public API (barrel) of the lots feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { CreateLotWizard, type CreateLotWizardProps } from './components/create-lot-wizard';
export { LotSummaryCard, type LotSummaryCardProps } from './components/lot-summary-card';
export { MyLotsPage } from './components/my-lots-page';
export { UnitPricePreview, type UnitPricePreviewProps } from './components/unit-price-preview';
/** Semantic status chip — reused by the chat inbox rows (CHT-005) via this barrel. */
export { LotStatusChip } from './components/lot-status-chip';
export { StepMedia } from './components/steps/step-media';
export { StepBasics } from './components/steps/step-basics';
export { StepPricing } from './components/steps/step-pricing';
export { StepClassification } from './components/steps/step-classification';
export { useCreateLot } from './hooks/use-create-lot';
export { useLot } from './hooks/use-lot';
export { useUpdateLot } from './hooks/use-update-lot';
export { useUpdateLotMedia } from './hooks/use-update-lot-media';
export {
  createLotRequest,
  lotRequest,
  updateLotRequest,
  updateLotMediaRequest,
} from './api/lots-api';
export { lotKeys } from './api/keys';
export {
  lotFormSchema,
  lotWizardMode,
  LOT_CONDITION_LABELS_FA,
  LOT_CONDITIONS,
  LOT_DESCRIPTION_MAX,
  LOT_EXACT_ADDRESS_MAX,
  LOT_LOCATION_HINT_MAX,
  LOT_MAX_TOTAL_PRICE,
  LOT_STATUS_LABELS_FA,
  LOT_TITLE_MAX,
  LOT_TITLE_MIN,
  LOT_UNIT_LABELS_FA,
  LOT_UNITS,
  LIQUIDATION_REASON_LABELS_FA,
  LIQUIDATION_REASONS,
  PRICING_TYPE_LABELS_FA,
  PRICING_TYPES,
  STEP_FIELDS,
  STEP_ORDER,
  STEP_TITLES_FA,
  type LotFormData,
  type LotStepId,
  type LotWizardMode,
} from './schemas/lot-schema';
