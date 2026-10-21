// Ob die Schatten von der Flamme weg fallen (ARCHITEKTUR.md 11.9). Gesetzt von Lamp.svelte: beim Anzünden am Anfang
// des Übergangs, beim Löschen am Ende, also jeweils, wenn die Laterne am wenigsten leuchtet. Gelesen von Board.svelte.

export const lampShadows = $state({ lit: true });
