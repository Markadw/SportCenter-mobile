// Texto literal para celdas y diagnósticos Markdown; no usar dentro de spans de código.
// GFM 6.2: las entidades no crean delimitadores Markdown al interpretarse.
// https://github.github.com/gfm/#entity-and-numeric-character-references
function escapeMarkdownCell(value) {
  return String(value).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]/g, character => '&#' + character.charCodeAt(0) + ';');
}
module.exports = { escapeMarkdownCell };
