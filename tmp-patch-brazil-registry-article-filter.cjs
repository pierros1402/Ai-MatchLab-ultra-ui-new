const fs = require("fs");

const file = "engine-v1/ai-match-intelligence/team-news-ai-provider.js";
let src = fs.readFileSync(file, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";

const startMarker = "function shouldKeepRegistryArticleLink(link, input) {";
const endMarker = "function scoreRegistryArticleLink(link, input) {";

const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker);

if (start < 0) {
  throw new Error("start marker not found: shouldKeepRegistryArticleLink");
}

if (end < 0 || end <= start) {
  throw new Error("end marker not found after shouldKeepRegistryArticleLink");
}

const before = src.slice(0, start);
let block = src.slice(start, end);
const after = src.slice(end);

const originalBlock = block;

/* 1) Add Brazil generic nav/category titles so we do not keep menus as articles */
const navNeedle = [
  "  if (blockedNavTitle || blockedListingUrl) {",
  "    return false;",
  "  }"
].join(eol);

const navReplacement = [
  "  const blockedBrazilNavTitle =",
  "    /^(últimas notícias|ultimas noticias|curitiba|rmc|trânsito|transito|esporte|times|futebol|brasileirão|brasileirao|tabela|classificação|classificacao|agenda|jogos)$/i.test(title);",
  "",
  "  if (blockedNavTitle || blockedListingUrl || blockedBrazilNavTitle) {",
  "    return false;",
  "  }"
].join(eol);

if (!block.includes("blockedBrazilNavTitle")) {
  if (!block.includes(navNeedle)) {
    throw new Error("marker not found: blocked nav return block");
  }
  block = block.replace(navNeedle, navReplacement);
}

/* 2) Add Portuguese/Brazil strong article signals */
const strongSignalNeedle = "    /\\bbajas\\b/i.test(haystack);";

const strongSignalReplacement = [
  "    /\\bbajas\\b/i.test(haystack) ||",
  "    /\\bdesfalques?\\b/i.test(haystack) ||",
  "    /\\blesionad[oa]s?\\b/i.test(haystack) ||",
  "    /\\bsuspens[oa]s?\\b/i.test(haystack) ||",
  "    /\\bfora\\b/i.test(haystack) ||",
  "    /\\bd[uú]vida\\b/i.test(haystack) ||",
  "    /\\brelacionados\\b/i.test(haystack) ||",
  "    /\\bprov[aá]vel escala[cç][aã]o\\b/i.test(haystack) ||",
  "    /\\bescala[cç][oõ]es\\b/i.test(haystack) ||",
  "    /\\bbrasileir[aã]o\\b/i.test(haystack) ||",
  "    /\\bcoxa\\b/i.test(haystack) ||",
  "    /\\binter\\b/i.test(haystack);"
].join(eol);

if (!block.includes("/\\bdesfalques?\\b/i.test(haystack)")) {
  if (!block.includes(strongSignalNeedle)) {
    throw new Error("marker not found: strong article signal bajas");
  }
  block = block.replace(strongSignalNeedle, strongSignalReplacement);
}

/* 3) Recognize Brazil/Portuguese news URL structures as article-like */
const articleUrlNeedle = [
  "  const looksLikeArticleUrl =",
  "    /\\/news\\/[^/?#]+/i.test(url) ||",
  "    /\\/en\\/news\\/[^/?#]+/i.test(url) ||",
  "    /\\/article\\/[^/?#]+/i.test(url) ||",
  "    /\\/sport\\/football\\//i.test(url) ||",
  "    /\\/football\\//i.test(url);"
].join(eol);

const articleUrlReplacement = [
  "  const looksLikeArticleUrl =",
  "    /\\/news\\/[^/?#]+/i.test(url) ||",
  "    /\\/en\\/news\\/[^/?#]+/i.test(url) ||",
  "    /\\/article\\/[^/?#]+/i.test(url) ||",
  "    /\\/noticia\\//i.test(url) ||",
  "    /\\/noticias\\//i.test(url) ||",
  "    /\\/esporte\\//i.test(url) ||",
  "    /\\/futebol\\//i.test(url) ||",
  "    /\\/sport\\/football\\//i.test(url) ||",
  "    /\\/football\\//i.test(url);"
].join(eol);

if (!block.includes("/\\/noticia\\//i.test(url)")) {
  if (!block.includes(articleUrlNeedle)) {
    throw new Error("marker not found: looksLikeArticleUrl block");
  }
  block = block.replace(articleUrlNeedle, articleUrlReplacement);
}

/* 4) Avoid accepting generic Brazil listing pages as articles */
const genericNeedle = [
  "  const blockedGenericArticleUrl =",
  "    /bbc\\.com\\/sport\\/football\\/(premier-league|championship|league-one|league-two)\\/?$/i.test(url) ||",
  "    /skysports\\.com\\/(premier-league|championship|league-1|league-2)\\/?$/i.test(url) ||",
  "    /\\/football\\/?$/i.test(url) ||",
  "    /\\/sport\\/football\\/?$/i.test(url);"
].join(eol);

const genericReplacement = [
  "  const blockedGenericArticleUrl =",
  "    /bbc\\.com\\/sport\\/football\\/(premier-league|championship|league-one|league-two)\\/?$/i.test(url) ||",
  "    /skysports\\.com\\/(premier-league|championship|league-1|league-2)\\/?$/i.test(url) ||",
  "    /\\/football\\/?$/i.test(url) ||",
  "    /\\/sport\\/football\\/?$/i.test(url) ||",
  "    /\\/esporte\\/?$/i.test(url) ||",
  "    /\\/futebol\\/?$/i.test(url) ||",
  "    /\\/esporte\\/times\\/[^/?#]+\\/?$/i.test(url) ||",
  "    /\\/futebol\\/times\\/[^/?#]+\\/?$/i.test(url);"
].join(eol);

if (!block.includes("/\\/esporte\\/times\\/[^/?#]+\\/?$/i.test(url)")) {
  if (!block.includes(genericNeedle)) {
    throw new Error("marker not found: blockedGenericArticleUrl block");
  }
  block = block.replace(genericNeedle, genericReplacement);
}

if (block === originalBlock) {
  throw new Error("patch produced no changes inside shouldKeepRegistryArticleLink");
}

for (const required of [
  "blockedBrazilNavTitle",
  "/\\bdesfalques?\\b/i.test(haystack)",
  "/\\/noticia\\//i.test(url)",
  "/\\/esporte\\/times\\/[^/?#]+\\/?$/i.test(url)"
]) {
  if (!block.includes(required)) {
    throw new Error("postcheck missing: " + required);
  }
}

const next = before + block + after;
fs.writeFileSync(file, next, "utf8");

console.log(JSON.stringify({
  ok: true,
  file,
  patched: "Brazil registry article link filtering"
}, null, 2));
