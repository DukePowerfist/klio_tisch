import type { BlockContext, Choices } from '../../rules/klio/blocks';

/** Was jede Schritt-Ansicht bekommt: Kontext und eine Rückmeldung mit ihrer Teil-Entscheidung. */
export type StepProps = { ctx: BlockContext; done: (partial: Choices) => void };
