/**
 * HTML 轉義 + 極小的行內標記：反引號段落轉 `<code>`、`**…**` 轉 `<strong>`，
 * 不引入 Markdown 依賴。兩條規則的輸出都不含對方的分隔符，所以順序無關。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inlineMarkup(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
