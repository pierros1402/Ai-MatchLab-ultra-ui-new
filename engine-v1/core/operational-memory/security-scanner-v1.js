import { SECURITY_CONTRACT } from "./contract-v1.js";
import { assertExactKeys, assertNfcString } from "./primitive-validation.js";

const asciiFold = (value) => [...value].map((ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x41 && cp <= 0x5a ? String.fromCodePoint(cp + 0x20) : ch;
}).join("");

function isTokenChar(ch, alphabet) {
  if (alphabet === "ASCII_A_Z_a_z_0_9_UNDERSCORE") return /^[A-Za-z0-9_]$/.test(ch);
  if (alphabet === "ASCII_A_Z_0_9") return /^[A-Z0-9]$/.test(ch);
  if (alphabet === "ASCII_A_Z_a-z_0_9_DOT_UNDERSCORE_TILDE_PLUS_SLASH_EQUALS_HYPHEN") return /^[A-Za-z0-9._~+/=-]$/.test(ch);
  if (alphabet === "ASCII_A_Z_a_z_0_9_DOT_UNDERSCORE_TILDE_PLUS_SLASH_EQUALS_HYPHEN") return /^[A-Za-z0-9._~+/=-]$/.test(ch);
  throw new TypeError(`UNKNOWN_SYMBOLIC_ALPHABET:${alphabet}`);
}

function validateRule(rule, operation) {
  assertExactKeys(rule, ["id", "algorithm", "parameters"], [], "scannerRule");
  const expected = {
    ASCII_FOLDED_CONTAINS_ANY: ["needles"],
    KEYWORD_ASSIGNMENT_SECRET_RUN: ["keywords"],
    ASCII_MARKER_TOKEN_RUN: ["marker"],
    ASCII_PREFIX_TOKEN_RUN: ["prefixes"],
    ASCII_FIXED_TOKEN_WITH_BOUNDARIES: ["prefix"]
  }[rule.algorithm];
  if (!expected || !operation) throw new TypeError(`UNKNOWN_SCANNER_ALGORITHM:${rule.algorithm}`);
  assertExactKeys(rule.parameters, expected, [], `scannerParameters:${rule.algorithm}`);
}

function scanRule(text, rule, operation) {
  if (rule.algorithm === "ASCII_FOLDED_CONTAINS_ANY") {
    const folded = asciiFold(text);
    return rule.parameters.needles.some((n) => folded.includes(asciiFold(n)));
  }

  if (rule.algorithm === "KEYWORD_ASSIGNMENT_SECRET_RUN") {
    const folded = asciiFold(text);
    const before = new Set(operation.whitespaceBeforeDelimiterCodePoints.map((cp) => String.fromCodePoint(cp)));
    const after = new Set(operation.whitespaceAfterDelimiterCodePoints.map((cp) => String.fromCodePoint(cp)));
    const terms = new Set(operation.secretRunTerminatorCodePoints.map((cp) => String.fromCodePoint(cp)));
    const delimiters = new Set(operation.delimiterCodePoints.map((cp) => String.fromCodePoint(cp)));

    for (const raw of rule.parameters.keywords) {
      const keyword = asciiFold(raw);
      let pos = 0;
      while ((pos = folded.indexOf(keyword, pos)) !== -1) {
        let j = pos + keyword.length, pre = 0;
        while (j < text.length && before.has(text[j]) && pre < operation.whitespaceBeforeDelimiterMaximum) { j++; pre++; }
        if (!delimiters.has(text[j])) { pos++; continue; }
        j++;
        let post = 0;
        while (j < text.length && after.has(text[j]) && post < operation.whitespaceAfterDelimiterMaximum) { j++; post++; }
        let run = 0;
        while (j + run < text.length && !terms.has(text[j + run])) run++;
        if (run >= operation.minimumSecretRunScalarCount) return true;
        pos++;
      }
    }
    return false;
  }

  if (rule.algorithm === "ASCII_MARKER_TOKEN_RUN") {
    const folded = asciiFold(text), marker = asciiFold(rule.parameters.marker);
    let pos = 0;
    while ((pos = folded.indexOf(marker, pos)) !== -1) {
      let j = pos + marker.length, run = 0;
      while (j + run < text.length && isTokenChar(text[j + run], operation.tokenAlphabet)) run++;
      if (run >= operation.minimumTokenLength) return true;
      pos++;
    }
    return false;
  }

  if (rule.algorithm === "ASCII_PREFIX_TOKEN_RUN") {
    for (const prefix of rule.parameters.prefixes) {
      let pos = 0;
      while ((pos = text.indexOf(prefix, pos)) !== -1) {
        let j = pos + prefix.length, run = 0;
        while (j + run < text.length && isTokenChar(text[j + run], operation.tokenAlphabet)) run++;
        if (run >= operation.minimumTokenLength) return true;
        pos++;
      }
    }
    return false;
  }

  if (rule.algorithm === "ASCII_FIXED_TOKEN_WITH_BOUNDARIES") {
    const prefix = rule.parameters.prefix;
    let pos = 0;
    while ((pos = text.indexOf(prefix, pos)) !== -1) {
      const left = pos === 0 ? null : text[pos - 1];
      const suffix = text.slice(pos + prefix.length, pos + prefix.length + operation.exactSuffixLength);
      const rightIndex = pos + prefix.length + operation.exactSuffixLength;
      const right = rightIndex >= text.length ? null : text[rightIndex];
      const suffixOk = suffix.length === operation.exactSuffixLength && [...suffix].every((ch) => isTokenChar(ch, operation.suffixAlphabet));
      const boundary = (ch) => ch !== null && /^[A-Za-z0-9_]$/.test(ch);
      if (suffixOk && !boundary(left) && !boundary(right)) return true;
      pos++;
    }
    return false;
  }

  throw new TypeError(`UNKNOWN_SCANNER_ALGORITHM:${rule.algorithm}`);
}

export function scanOperationalMemoryText(text, scanner = SECURITY_CONTRACT.freeTextSecretScanner) {
  assertNfcString(text, "scannerText");
  if (!scanner || scanner.scannerId !== "AI_MATCHLAB_OM_SECRET_SCAN_V1" || scanner.version !== 1) throw new TypeError("UNSUPPORTED_SCANNER_VERSION");
  if (!Array.isArray(scanner.rules) || !scanner.machineOperations) throw new TypeError("INVALID_SCANNER_CONTRACT");
  for (const rule of scanner.rules) {
    const op = scanner.machineOperations[rule.algorithm];
    validateRule(rule, op);
    if (scanRule(text, rule, op)) return Object.freeze({ ok: false, ruleId: rule.id });
  }
  return Object.freeze({ ok: true, ruleId: null });
}

export function assertOperationalMemoryTextSafe(text, scanner) {
  const result = scanOperationalMemoryText(text, scanner);
  if (!result.ok) throw new TypeError(`FORBIDDEN_SECRET_SCAN_MATCH:${result.ruleId}`);
  return text;
}
