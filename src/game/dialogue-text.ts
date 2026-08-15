export function renderNativeDialogueText(target: HTMLElement, text: string): void {
  const fragment = document.createDocumentFragment();
  for (const character of text) {
    if (character === "\n") {
      fragment.append(document.createTextNode(character));
      continue;
    }
    const glyph = document.createElement("span");
    glyph.className = /[^\x00-\x7f]/u.test(character)
      ? "dialogue-glyph big5"
      : "dialogue-glyph ascii";
    glyph.textContent = character;
    fragment.append(glyph);
  }
  target.replaceChildren(fragment);
}
