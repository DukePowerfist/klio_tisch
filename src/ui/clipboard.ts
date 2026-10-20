/** Text in die Zwischenablage; false, wenn der Browser es nicht erlaubt. */
export const copyText = (text: string): Promise<boolean> => navigator.clipboard.writeText(text).then(() => true, () => false);
