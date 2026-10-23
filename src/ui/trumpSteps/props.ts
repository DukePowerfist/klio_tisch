import type { Snippet } from 'svelte';
import type { BlockContext, Choices } from '../../rules/klio/blocks';

/** Was jede Schritt-Ansicht bekommt: Kontext, eine Rückmeldung mit ihrer Teil-Entscheidung und die Reihe am Ende
 *  des Dialogs (5y), aufzurufen mit dem eigenen Hauptknopf (`main`), dort, wo er stehen soll (z. B. im Formular). */
export type StepProps = { ctx: BlockContext; done: (partial: Choices) => void; end: Snippet<[main?: Snippet]> };
