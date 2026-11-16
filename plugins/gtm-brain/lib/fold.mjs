// One way to compare words whatever letters they were typed with: "Lukasz" finds "Łukasz", "Soren" finds "Søren".
// NFD splits an accented letter into the letter and a mark, which is then dropped; the letters below do not split
// (they are letters of their own in Unicode), so they are mapped first. Lowercases. Used by the search (query and
// index side) and by name matching; nothing stored is ever rewritten with it.
const LETTERS = { ł: "l", Ł: "l", ø: "o", Ø: "o", đ: "d", Đ: "d", ð: "d", Ð: "d", þ: "th", Þ: "th", ß: "ss", æ: "ae", Æ: "ae", œ: "oe", Œ: "oe", ı: "i", ħ: "h", Ħ: "h", ŧ: "t", Ŧ: "t" };
const UNSPLIT = new RegExp(`[${Object.keys(LETTERS).join("")}]`, "g");
export const foldLatin = s => String(s ?? "").replace(UNSPLIT, c => LETTERS[c]).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
