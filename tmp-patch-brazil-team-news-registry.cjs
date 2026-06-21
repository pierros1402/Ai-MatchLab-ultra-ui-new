const fs = require("fs");

const file = "engine-v1/ai-match-intelligence/team-news-source-registry.js";
let src = fs.readFileSync(file, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";

const marker = [
  "const LEAGUE_SOURCE_REGISTRY = {",
  ""
].join(eol);

if (!src.includes(marker)) {
  throw new Error("marker not found: const LEAGUE_SOURCE_REGISTRY");
}

if (src.includes('"bra.1": [')) {
  console.log(JSON.stringify({
    ok: true,
    changed: false,
    reason: "bra.1 registry already present"
  }, null, 2));
  process.exit(0);
}

const brazilBlock = [
  "const LEAGUE_SOURCE_REGISTRY = {",
  "",
  "  \"bra.1\": [",
  "    {",
  "      id: \"ge-globo-coritiba\",",
  "      label: \"ge.globo Coritiba team news\",",
  "      type: \"media_team_news\",",
  "      trustTier: \"media\",",
  "      teams: [\"coritiba\", \"coxa\"],",
  "      buildUrls() {",
  "        return [",
  "          \"https://ge.globo.com/pr/futebol/times/coritiba/\",",
  "          \"https://ge.globo.com/pr/futebol/times/coritiba/noticia/\"",
  "        ];",
  "      }",
  "    },",
  "    {",
  "      id: \"banda-b-coritiba\",",
  "      label: \"Banda B Coritiba news\",",
  "      type: \"media_team_news\",",
  "      trustTier: \"media\",",
  "      teams: [\"coritiba\", \"coxa\"],",
  "      buildUrls() {",
  "        return [",
  "          \"https://www.bandab.com.br/esporte/times/coritiba/\"",
  "        ];",
  "      }",
  "    },",
  "    {",
  "      id: \"ge-globo-internacional\",",
  "      label: \"ge.globo Internacional team news\",",
  "      type: \"media_team_news\",",
  "      trustTier: \"media\",",
  "      teams: [\"internacional\", \"inter\"],",
  "      buildUrls() {",
  "        return [",
  "          \"https://ge.globo.com/rs/futebol/times/internacional/\",",
  "          \"https://ge.globo.com/rs/futebol/times/internacional/noticia/\"",
  "        ];",
  "      }",
  "    },",
  "    {",
  "      id: \"lance-brasileirao\",",
  "      label: \"Lance Brasileirão news\",",
  "      type: \"media_league_news\",",
  "      trustTier: \"media\",",
  "      buildUrls(input) {",
  "        const team = encodeURIComponent(normalizeText(input?.team));",
  "        return [",
  "          `https://www.lance.com.br/busca?q=${team}`",
  "        ];",
  "      }",
  "    },",
  "    {",
  "      id: \"futebol-interior-brasileirao\",",
  "      label: \"Futebol Interior Brasileirão news\",",
  "      type: \"media_league_news\",",
  "      trustTier: \"media\",",
  "      buildUrls(input) {",
  "        const team = encodeURIComponent(normalizeText(input?.team));",
  "        return [",
  "          `https://www.futebolinterior.com.br/?s=${team}`",
  "        ];",
  "      }",
  "    }",
  "  ],",
  ""
].join(eol);

src = src.replace(marker, brazilBlock);

for (const required of [
  '"bra.1": [',
  'id: "ge-globo-coritiba"',
  'id: "banda-b-coritiba"',
  'id: "ge-globo-internacional"',
  'id: "lance-brasileirao"',
  'id: "futebol-interior-brasileirao"'
]) {
  if (!src.includes(required)) {
    throw new Error("postcheck missing: " + required);
  }
}

fs.writeFileSync(file, src, "utf8");

console.log(JSON.stringify({
  ok: true,
  file,
  changed: true,
  added: "bra.1 Brazil team-news registry sources"
}, null, 2));
