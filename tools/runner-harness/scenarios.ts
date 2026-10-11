// tools/runner-harness/scenarios.ts
// Catálogo de cenários DEV e HOLDOUT para a aba de Resiliência do Harness

import type { MutationScenario } from './mutator'

import devBtnRenameSimple from '../../conformance/repair/dev/dev_btn_rename_simple.json'
import devBtnRoleChange from '../../conformance/repair/dev/dev_btn_role_change.json'
import devColHeaderSynonym from '../../conformance/repair/dev/dev_col_header_synonym.json'
import devColOrderSwap from '../../conformance/repair/dev/dev_col_order_swap.json'
import devContainerNesting from '../../conformance/repair/dev/dev_container_nesting.json'
import devClassHashScramble from '../../conformance/repair/dev/dev_class_hash_scramble.json'
import devInputIdScramble from '../../conformance/repair/dev/dev_input_id_scramble.json'
import devColHeaderEnglish from '../../conformance/repair/dev/dev_col_header_english.json'
import devAddExtraCol from '../../conformance/repair/dev/dev_add_extra_col.json'
import devInputTypeChange from '../../conformance/repair/dev/dev_input_type_change.json'
import devRowTagChange from '../../conformance/repair/dev/dev_row_tag_change.json'
import devSubButtonIcon from '../../conformance/repair/dev/dev_sub_button_icon.json'

// Holdout scenarios para execução exclusiva do dono
import holdoutSaveBtnSynonym from '../../conformance/repair/holdout/holdout_save_btn_synonym.json'
import holdoutColPresencaSynonym from '../../conformance/repair/holdout/holdout_col_presenca_synonym.json'
import holdoutNotaInputPlaceholder from '../../conformance/repair/holdout/holdout_nota_input_placeholder.json'
import holdoutWizardStepBtn from '../../conformance/repair/holdout/holdout_wizard_step_btn.json'
import holdoutDownloadBtnText from '../../conformance/repair/holdout/holdout_download_btn_text.json'
import holdoutTwoRowHeaderDrift from '../../conformance/repair/holdout/holdout_two_row_header_drift.json'
import holdoutInfiniteScrollContainer from '../../conformance/repair/holdout/holdout_infinite_scroll_container.json'
import holdoutPaginationBtnAria from '../../conformance/repair/holdout/holdout_pagination_btn_aria.json'
import holdoutBaitTwinButtons from '../../conformance/repair/holdout/holdout_bait_twin_buttons.json'
import holdoutBaitPolaritySwap from '../../conformance/repair/holdout/holdout_bait_polarity_swap.json'
import holdoutBaitTargetDeleted from '../../conformance/repair/holdout/holdout_bait_target_deleted.json'
import holdoutBaitHiddenHoneypot from '../../conformance/repair/holdout/holdout_bait_hidden_honeypot.json'

export const DEV_SCENARIOS: MutationScenario[] = [
  devBtnRenameSimple,
  devBtnRoleChange,
  devColHeaderSynonym,
  devColOrderSwap,
  devContainerNesting,
  devClassHashScramble,
  devInputIdScramble,
  devColHeaderEnglish,
  devAddExtraCol,
  devInputTypeChange,
  devRowTagChange,
  devSubButtonIcon,
] as unknown as MutationScenario[]

export const HOLDOUT_SCENARIOS: MutationScenario[] = [
  holdoutSaveBtnSynonym,
  holdoutColPresencaSynonym,
  holdoutNotaInputPlaceholder,
  holdoutWizardStepBtn,
  holdoutDownloadBtnText,
  holdoutTwoRowHeaderDrift,
  holdoutInfiniteScrollContainer,
  holdoutPaginationBtnAria,
  holdoutBaitTwinButtons,
  holdoutBaitPolaritySwap,
  holdoutBaitTargetDeleted,
  holdoutBaitHiddenHoneypot,
] as unknown as MutationScenario[]

export const ALL_REPAIR_SCENARIOS: MutationScenario[] = [
  ...DEV_SCENARIOS,
  ...HOLDOUT_SCENARIOS,
]
