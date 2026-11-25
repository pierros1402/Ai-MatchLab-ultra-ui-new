import test from "node:test";
import assert from "node:assert/strict";

import {
  strictCrossCompetitionTeamKey,
  createCrossCompetitionFormResolver
} from "./cross-competition-form-db.js";

const noAliases = () => null;

function rows(prefix, count = 6) {
  return Array.from(
    { length: count },
    (_, index) => ({
      matchId: `${prefix}-${index}`,
      date:
        `2026-08-${String(20 - index).padStart(2, "0")}T18:00:00.000Z`,
      opp: `Opponent ${index}`,
      ha:
        index % 2 === 0
          ? "H"
          : "A",
      gf:
        index % 3,
      ga:
        (index + 1) % 3,
      res:
        index % 3 === 0
          ? "W"
          : index % 3 === 1
            ? "D"
            : "L"
    })
  );
}

const coverageRows = [
  {
    slug: "eng.1",
    type: "league",
    country: "england"
  },
  {
    slug: "eng.2",
    type: "league",
    country: "england"
  },
  {
    slug: "eng.fa",
    type: "cup",
    country: "england"
  },
  {
    slug: "sco.1",
    type: "league",
    country: "scotland"
  },
  {
    slug: "sco.challenge",
    type: "cup",
    country: "scotland"
  },
  {
    slug: "and.1",
    type: "league",
    country: "andorra"
  },
  {
    slug: "par.1",
    type: "league",
    country: "paraguay"
  },
  {
    slug: "par.cup",
    type: "cup",
    country: "paraguay"
  },
  {
    slug: "bra.1",
    type: "league",
    country: "brazil"
  },
  {
    slug: "bel.1",
    type: "league",
    country: "belgium"
  },
  {
    slug: "arg.1",
    type: "league",
    country: "argentina"
  },
  {
    slug: "uefa.champions",
    type: "continental",
    country: "uefa"
  }
];

const documents = [
  {
    slug: "eng.1",
    doc: {
      teams: {
        "Crystal Palace":
          rows("palace"),
        "Arsenal":
          rows("arsenal-eng")
      }
    }
  },
  {
    slug: "eng.2",
    doc: {
      teams: {
        "Middlesbrough":
          rows("boro")
      }
    }
  },
  {
    slug: "sco.1",
    doc: {
      teams: {
        "Rangers B":
          rows("rangers-sco")
      }
    }
  },
  {
    slug: "and.1",
    doc: {
      teams: {
        "FC Rànger's B":
          rows("rangers-and")
      }
    }
  },
  {
    slug: "par.1",
    doc: {
      teams: {
        "Guaraní":
          rows("guarani-par")
      }
    }
  },
  {
    slug: "bra.1",
    doc: {
      teams: {
        "Guarani":
          rows("guarani-bra")
      }
    }
  },
  {
    slug: "bel.1",
    doc: {
      teams: {
        "Club Brugge":
          rows("brugge")
      }
    }
  },
  {
    slug: "arg.1",
    doc: {
      teams: {
        "Arsenal":
          rows("arsenal-arg")
      }
    }
  }
];

test(
  "strict cross-competition key keeps known dangerous names separate",
  () => {
    assert.notEqual(
      strictCrossCompetitionTeamKey(
        "Guaraní",
        noAliases
      ),
      strictCrossCompetitionTeamKey(
        "Guarani",
        noAliases
      )
    );

    assert.notEqual(
      strictCrossCompetitionTeamKey(
        "Rangers B",
        noAliases
      ),
      strictCrossCompetitionTeamKey(
        "FC Rànger's B",
        noAliases
      )
    );

    assert.equal(
      strictCrossCompetitionTeamKey(
        "Crystal Palace",
        noAliases
      ),
      strictCrossCompetitionTeamKey(
        "Crystal Palace",
        noAliases
      )
    );
  }
);

test(
  "domestic cup form is country bound",
  () => {
    const resolve =
      createCrossCompetitionFormResolver({
        coverageRows,
        resultDocuments: documents,
        canonicalResolver: noAliases
      });

    const palace =
      resolve(
        "eng.fa",
        "Crystal Palace",
        6
      );

    assert.equal(
      palace.ok,
      true
    );

    assert.equal(
      palace.sample,
      6
    );

    assert.equal(
      palace.sourceCountry,
      "england"
    );

    const rangers =
      resolve(
        "sco.challenge",
        "Rangers B",
        6
      );

    assert.equal(
      rangers.ok,
      true
    );

    assert.equal(
      rangers.sourceCountry,
      "scotland"
    );

    assert.deepEqual(
      rangers.sourceSlugs,
      ["sco.1"]
    );
  }
);

test(
  "accent-preserving identity does not cross-bind Paraguay and Brazil",
  () => {
    const resolve =
      createCrossCompetitionFormResolver({
        coverageRows,
        resultDocuments: documents,
        canonicalResolver: noAliases
      });

    const paraguay =
      resolve(
        "par.cup",
        "Guaraní",
        6
      );

    assert.equal(
      paraguay.ok,
      true
    );

    assert.equal(
      paraguay.sourceCountry,
      "paraguay"
    );

    assert.deepEqual(
      paraguay.sourceSlugs,
      ["par.1"]
    );
  }
);

test(
  "continental identity accepts one source country and rejects cross-country collision",
  () => {
    const resolve =
      createCrossCompetitionFormResolver({
        coverageRows,
        resultDocuments: documents,
        canonicalResolver: noAliases
      });

    const brugge =
      resolve(
        "uefa.champions",
        "Club Brugge",
        6
      );

    assert.equal(
      brugge.ok,
      true
    );

    assert.equal(
      brugge.sourceCountry,
      "belgium"
    );

    const arsenal =
      resolve(
        "uefa.champions",
        "Arsenal",
        6
      );

    assert.equal(
      arsenal.ok,
      false
    );

    assert.equal(
      arsenal.reason,
      "cross_country_identity_ambiguous"
    );

    assert.deepEqual(
      arsenal.sourceCountries,
      [
        "argentina",
        "england"
      ]
    );
  }
);

test("regional club form excludes other confederation names but keeps domestic collisions fail closed", () => {
  const coverageRows = [
    {slug:"eng.1",type:"league",country:"england",region:"europe"},
    {slug:"uru.1",type:"league",country:"uruguay",region:"americas"},
    {slug:"ksa.1",type:"league",country:"saudi_arabia",region:"asia"},
    {slug:"uae.2",type:"league",country:"uae",region:"asia"},
    {slug:"uefa.champions",type:"continental",country:"uefa",region:"europe"},
    {slug:"afc.cup",type:"continental",country:"afc",region:"asia"},
    {slug:"fifa.club_world",type:"continental",country:"fifa",region:"world"}
  ];
  const resultDocuments = [
    {slug:"eng.1",doc:{teams:{Liverpool:rows("eng-liverpool")}}},
    {slug:"uru.1",doc:{teams:{Liverpool:rows("uru-liverpool"),"Only Uruguay":rows("only-uru")}}},
    {slug:"ksa.1",doc:{teams:{"Al Taawoun":rows("ksa-taawoun")}}},
    {slug:"uae.2",doc:{teams:{"AL Taawoun":rows("uae-taawoun")}}}
  ];
  const resolve = createCrossCompetitionFormResolver({coverageRows,resultDocuments,canonicalResolver:noAliases});
  const liverpool = resolve("uefa.champions","Liverpool",6);
  assert.equal(liverpool.ok,true);
  assert.equal(liverpool.sample,6);
  assert.equal(liverpool.sourceCountry,"england");
  assert.deepEqual(liverpool.sourceSlugs,["eng.1"]);
  assert.equal(resolve("afc.cup","Al Taawoun",6).reason,"cross_country_identity_ambiguous");
  assert.equal(resolve("fifa.club_world","Liverpool",6).reason,"cross_country_identity_ambiguous");
  assert.equal(resolve("uefa.champions","Only Uruguay",6).reason,"no_same_region_source");
  const unknown = createCrossCompetitionFormResolver({
    coverageRows:coverageRows.map(row=>row.slug==="uru.1"?{...row,region:null}:row),
    resultDocuments,canonicalResolver:noAliases
  });
  assert.equal(unknown("uefa.champions","Liverpool",6).reason,"cross_country_identity_ambiguous");
  const conflicting = createCrossCompetitionFormResolver({
    coverageRows,canonicalResolver:noAliases,
    resultDocuments:resultDocuments.map(doc=>doc.slug!=="eng.1"?doc:{
      slug:doc.slug,doc:{teams:{Liverpool:rows("conflict").map((row,i)=>({
        ...row,[row.ha==="H"?"homeGlobalClubId":"awayGlobalClubId"]:i===0?"gcid_one":"gcid_two"
      }))}}
    })
  });
  assert.equal(conflicting("uefa.champions","Liverpool",6).reason,"global_club_id_conflict");
});

test("explicit identity selects the correct regional homonym with row-level evidence only", () => {
  const id = "gcid_test_saudi";
  const bind = (row, value) => ({...row, [row.ha === "H" ? "homeGlobalClubId" : "awayGlobalClubId"]:value});
  const coverageRows = [
    {slug:"ksa.1",type:"league",country:"saudi_arabia",region:"asia"},
    {slug:"uae.2",type:"league",country:"uae",region:"asia"},
    {slug:"afc.cup",type:"continental",country:"afc",region:"asia"},
    {slug:"ksa.cup",type:"cup",country:"saudi_arabia"}
  ];
  const cutoff = Date.parse("2026-08-21T00:00:00Z");
  const options = {expectedGlobalClubId:id,beforeMs:cutoff};
  const make = (saudi, uae = rows("uae").map(row=>bind(row,"gcid_test_uae"))) =>
    createCrossCompetitionFormResolver({coverageRows,canonicalResolver:noAliases,resultDocuments:[
      {slug:"ksa.1",doc:{teams:{"Al Taawoun":saudi}}},
      {slug:"uae.2",doc:{teams:{"Al Taawoun":uae}}}
    ]});
  const verified = rows("ksa").map(row=>bind(row,id));
  const resolve = make(verified);
  const result = resolve("afc.cup","Al Taawoun",6,options);
  assert.equal(result.ok,true);
  assert.equal(result.sample,6);
  assert.equal(result.globalClubId,id);
  assert.equal(result.sourceCountry,"saudi_arabia");
  assert.deepEqual(result.sourceSlugs,["ksa.1"]);
  assert.equal(resolve("afc.cup","Al Taawoun",6,{beforeMs:cutoff}).ok,false);
  assert.equal(resolve("afc.cup","Al Taawoun",6,{...options,expectedGlobalClubId:"gcid_missing"}).ok,false);
  assert.equal(make(rows("unbound"))("afc.cup","Al Taawoun",6,options).ok,false);
  assert.equal(make([...verified.slice(0,5),rows("unbound")[5]])("afc.cup","Al Taawoun",6,options).sample,5);
  const conflict = {...verified[0],productionIdentityBinding:{homeGlobalClubId:"gcid_conflict"}};
  assert.equal(make([conflict,...verified.slice(1)])("afc.cup","Al Taawoun",6,options).ok,false);
  assert.equal(make([conflict,...verified.slice(1)])("ksa.cup","Al Taawoun",6,options).reason,"global_club_id_conflict");
  const futureConflict = {...conflict,date:"2026-08-22T00:00:00Z",matchId:"future"};
  assert.deepEqual(make([...verified,futureConflict])("afc.cup","Al Taawoun",6,options),result);
  const atCutoff = {...verified[0],date:new Date(cutoff).toISOString()};
  assert.equal(make([atCutoff,...verified.slice(1)])("afc.cup","Al Taawoun",6,options).sample,5);
  assert.equal(make(rows("past"),[...rows("uae"),{...verified[0],date:"2026-08-22T00:00:00Z"}])("afc.cup","Al Taawoun",6,options).ok,false);
  const nestedOnly = rows("nested").map(row=>({...row,productionIdentityBinding:{[row.ha==="H"?"homeGlobalClubId":"awayGlobalClubId"]:id}}));
  assert.equal(make(nestedOnly)("afc.cup","Al Taawoun",6,options).sample,6);
});

test("reviewed domestic scope can supply historical form only for an explicitly bound fixture side", () => {
  const id = "gcid_test_saudi";
  const coverageRows = [
    {slug:"ksa.1",type:"league",country:"saudi_arabia",region:"asia"},
    {slug:"uae.2",type:"league",country:"uae",region:"asia"},
    {slug:"afc.cup",type:"continental",country:"afc",region:"asia"}
  ];
  const scopedIdentityResolver = ({alias,leagueSlug}) =>
    alias==="Al Taawoun" && leagueSlug==="ksa.1" ? {leagueSlug,globalClubId:id} : null;
  const make = (saudi, scope=scopedIdentityResolver) => createCrossCompetitionFormResolver({
    coverageRows, canonicalResolver:noAliases, scopedIdentityResolver:scope,
    resultDocuments:[{slug:"ksa.1",doc:{teams:{"Al Taawoun":saudi}}},
      {slug:"uae.2",doc:{teams:{"Al Taawoun":rows("uae")}}}]
  });
  const saudi=rows("ksa");
  const original=JSON.stringify(saudi);
  const options={expectedGlobalClubId:id,beforeMs:Date.parse("2026-08-21T00:00:00Z")};
  const resolve=make(saudi);
  const result=resolve("afc.cup","Al Taawoun",6,options);
  assert.equal(result.sample,6);
  assert.equal(result.sourceCountry,"saudi_arabia");
  assert.equal(result.globalClubId,id);
  assert.deepEqual(result.scopedIdentityEvidence,[{leagueSlug:"ksa.1",teamName:"Al Taawoun",globalClubId:id}]);
  assert.equal(JSON.stringify(saudi),original);
  assert.equal(resolve("afc.cup","Al Taawoun").ok,false);
  assert.equal(resolve("afc.cup","Al Taawoun",6,{...options,expectedGlobalClubId:"wrong"}).ok,false);
  assert.equal(make(saudi,({leagueSlug})=>leagueSlug==="ksa.1"?{leagueSlug:"uae.2",globalClubId:id}:null)("afc.cup","Al Taawoun",6,options).ok,false);
  assert.equal(make([{...saudi[0],homeGlobalClubId:"conflict"},...saudi.slice(1)])("afc.cup","Al Taawoun",6,options).ok,false);
});
