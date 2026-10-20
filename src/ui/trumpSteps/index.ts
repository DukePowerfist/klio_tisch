// Ansicht je Dialogschritt aus trump-sources.yaml. Ein neuer Baustein-Schritt braucht hier einen Eintrag;
// fehlt er, meldet das die Typprüfung.

import type { Component } from 'svelte';
import type { StepName } from '../../rules/klio/trumps';
import AttributeStep from './AttributeStep.svelte';
import ImproveStep from './ImproveStep.svelte';
import WeaknessStep from './WeaknessStep.svelte';
import type { StepProps } from './props';

export const STEP_VIEWS: Record<StepName, Component<StepProps>> = {
  chooseWeaknessToRemove: WeaknessStep,
  improveStrength: ImproveStep,
  moveAttributePoint: AttributeStep,
};
