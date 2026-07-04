const DEFAULT_ACRONYMS = new Set([
  "PIX", "CPF", "CNPJ", "FIFA", "API", "PDF", "APK", "TV", "PDV", "HQ", "USB", "GPS", "URL",
]);

const PROTECTED_PATTERNS = [
  /https?:\/\/[^\s,;]+/gi,
  /www\.[^\s,;]+/gi,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  /\b[\w.-]+\/[\w./-]+\b/g,
  /\b[A-Z]{2,}-[A-Z0-9-]+\b/g,
  /\b\d{2,3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  /\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g,
  /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/gi,
  /\b\d+[.,]\d+\s?%?\b/g,
  /\b\d+%/g,
  /\b\d+(?:-\d+)+\b/g,
  /\b\d+[A-Z]+\d*\b/gi,
];

const WORD_FIXES = new Map([
  ["vc", "você"],
  ["voce", "você"],
  ["pra", "para"],
  ["tambem", "também"],
  ["nao", "não"],
]);

function protectTokens(text) {
  const tokens = [];
  let protectedText = text;
  for (const pattern of PROTECTED_PATTERNS) {
    protectedText = protectedText.replace(pattern, match => {
      const token = `§${tokens.length}§`;
      tokens.push(match);
      return token;
    });
  }
  return { protectedText, tokens };
}

function restoreTokens(text, tokens) {
  return tokens.reduce((acc, token, index) => acc.replaceAll(`§${index}§`, token), text);
}

function normalizeQuotes(text) {
  return text
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/\u00A0/g, " ");
}

function normalizeSpacing(text) {
  return text
    .replace(/[ \t\r\n]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=\S)/g, "$1 ")
    .replace(/([.!?])(?=\p{L})/gu, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isAllCapsSentence(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 4) return false;
  const lower = letters.filter(ch => ch === ch.toLocaleLowerCase("pt-BR"));
  const words = text.split(/\s+/).filter(Boolean);
  return lower.length === 0 && words.length > 1;
}

function smartLowerAllCaps(text) {
  return text.split(/(\s+)/).map(part => {
    if (!/\p{L}/u.test(part)) return part;
    const clean = part.replace(/[^\p{L}]/gu, "");
    if (DEFAULT_ACRONYMS.has(clean)) return part;
    return part.toLocaleLowerCase("pt-BR");
  }).join("");
}

function capitalizeSentences(text) {
  let next = true;
  return Array.from(text).map((ch, index, chars) => {
    if (next && /\p{L}/u.test(ch)) {
      const rest = chars.slice(index, index + 24).join("").match(/^[\p{L}\p{N}_-]+/u)?.[0] || ch;
      if (/[a-zá-úç][A-ZÁ-ÚÇ]/.test(rest)) {
        next = false;
        return ch;
      }
      next = false;
      return ch.toLocaleUpperCase("pt-BR");
    }
    if (ch === "§") next = false;
    if (/[.!?]/.test(ch) && chars[index + 1] !== "." && chars[index - 1] !== ".") next = true;
    return ch;
  }).join("");
}

function fixHighConfidenceWords(text) {
  return text.replace(/\b[\p{L}]{2,}\b/gu, word => {
    if (word !== word.toLocaleLowerCase("pt-BR")) return word;
    return WORD_FIXES.get(word) || word;
  });
}

export function normalizeText(value, options = {}) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;

  const mode = options.mode || "sentence";
  let text = normalizeQuotes(value.normalize("NFC"));
  const { protectedText, tokens } = protectTokens(text);
  text = normalizeSpacing(protectedText);

  if (mode !== "preserveCase") {
    if (isAllCapsSentence(text)) text = smartLowerAllCaps(text);
    text = fixHighConfidenceWords(text);
    text = capitalizeSentences(text);
  }

  return restoreTokens(text, tokens);
}

export function normalizeTitle(value) {
  return normalizeText(value, { mode: "sentence" });
}

export function normalizeFreeText(value) {
  return normalizeText(value, { mode: "sentence" });
}
