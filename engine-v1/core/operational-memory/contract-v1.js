const CONTRACT_DATA = {
  "schema": "ai-matchlab.g6-operational-memory-architecture-contract.v14",
  "generatedAt": "2026-10-08T04:43:24.8445358Z",
  "supersedesContract": {
    "schema": "ai-matchlab.g6-operational-memory-architecture-contract.v13",
    "sha256": "84067F618A5AFB4701B79511212066EC2DC0389EBE000A2B2902CBE1C67F0214",
    "reviewSha256": "A3813B5FFE2FFA7BE1D72179205CD0611FE97272DAF6FDA9F76696FFB85D0454",
    "approvedNormativeBaseline": {
      "schema": "ai-matchlab.g6-operational-memory-architecture-contract.v13",
      "sha256": "84067F618A5AFB4701B79511212066EC2DC0389EBE000A2B2902CBE1C67F0214",
      "approvalSha256": "E906A3669088A78036166E86AB866C456A11CD6FCE462D5F1EAF38596C872AFD"
    }
  },
  "status": "PASS_G6_OPERATIONAL_MEMORY_ARCHITECTURE_CONTRACT_V14_EVENT_V4_VALIDITY_DAG_REVISION",
  "acceptedInvariants": {
    "canonicalModel": "IMMUTABLE_EVENT_PER_FILE",
    "createOnlyCanonicalHistory": true,
    "canonicalEventOverwriteAllowed": false,
    "canonicalEventDeleteAllowed": false,
    "canonicalPartition": "effectiveUtcDay",
    "jsonlCanonicalLedger": false,
    "derivedIndexesAuthoritative": false,
    "operationalMemoryHasExecutionAuthority": false,
    "executorMustRevalidateCurrentAuthority": true,
    "G7RequiresVerifiedOutcome": true,
    "G7MayRewriteCanonicalMemory": false
  },
  "temporalCanonicalization": {
    "canonicalTimestampFormat": "UTC_RFC3339_MILLISECONDS_Z",
    "exactPattern": "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "requiredOffset": "Z",
    "requiredFractionalPrecisionDigits": 3,
    "parserValidityRule": "Parsing must succeed and converting the parsed instant back with ECMAScript Date.toISOString() must equal the original string exactly.",
    "effectiveAt": {
      "required": true,
      "suppliedByProducer": true,
      "semantic": true,
      "includedInEventIdentity": true
    },
    "recordedAt": {
      "requiredInPersistedEvent": true,
      "suppliedByProducer": false,
      "assignedByCanonicalWriter": true,
      "assignedOnlyOnFirstSuccessfulCreate": true,
      "semantic": false,
      "includedInEventIdentity": false,
      "retryBehavior": "A retry never updates recordedAt on an existing event."
    },
    "effectiveUtcDayDerivation": "effectiveAt.substring(0,10)",
    "canonicalPartitionDay": "effectiveUtcDay",
    "recordedUtcDayIsCanonicalPartition": false
  },
  "canonicalization": {
    "characterEncoding": "UTF-8",
    "stringNormalization": "Unicode NFC",
    "objectKeyOrdering": "Ascending ECMAScript string ordering",
    "undefinedAllowed": false,
    "nonFiniteNumbersAllowed": false,
    "negativeZeroNormalization": "0",
    "objectUnknownFields": "REJECT_UNLESS_EXPLICITLY_ALLOWED_BY_THE_ACTIVE_SCHEMA",
    "ordinaryArrayRule": "Preserve semantic order.",
    "setLikeArrayRule": "Normalize using the field-specific ordering contract before hashing.",
    "optionalFieldPolicy": {
      "defaultAbsentRepresentation": "OMIT_FIELD",
      "explicitNullAllowedByDefault": false,
      "optionalScalarNull": "REJECT_UNLESS_THE_FIELD_SCHEMA_EXPLICITLY_DECLARES_NULLABLE",
      "optionalCollectionWhenEmpty": "OMIT_FIELD_UNLESS_THE_FIELD_SCHEMA_EXPLICITLY_DECLARES_EMPTY_MEANINGFUL",
      "falseBooleanIsAbsent": false,
      "zeroNumberIsAbsent": false,
      "emptyStringIsAbsent": false,
      "normalizationTiming": "Apply optional-field normalization before canonicalJson and all fingerprints.",
      "exceptions": [
        "relationships is a total closed object: all relationship keys are present and absent scalar relationships are explicit null",
        "FACT.value is explicit null only when FACT.valueType=NULL"
      ]
    },
    "canonicalJsonAlgorithm": {
      "name": "RFC8785_JCS_AFTER_SCHEMA_NORMALIZATION_AND_NFC",
      "normativeSerialization": "RFC 8785 JSON Canonicalization Scheme (JCS)",
      "preprocessingOrder": [
        "decode input as strict UTF-8 when starting from raw bytes",
        "tokenize/parse with duplicate-property-name preservation",
        "reject duplicate raw property names within each JSON object before object materialization",
        "normalize every property name and every JSON string value to Unicode NFC",
        "reject duplicate property names created by NFC normalization",
        "validate JSON primitive domains and active closed schema",
        "apply optional-field normalization",
        "validate resource bounds",
        "canonicalize, deduplicate and sort every schema-declared set-like array",
        "preserve order for every schema-declared ordered array",
        "perform cross-field and reference validation",
        "serialize using RFC 8785 JCS",
        "encode JCS output as UTF-8 without BOM"
      ],
      "hashInput": "exact UTF-8 bytes of JCS output",
      "trailingNewlineIncluded": false,
      "rawDuplicatePropertyNameHandling": "REJECT_BEFORE_OBJECT_MATERIALIZATION",
      "postNfcDuplicatePropertyNameHandling": "REJECT",
      "schemaValidationOccursAfterNfc": true,
      "setOrderingOccursAfterNfc": true,
      "setDeduplicationOccursAfterNfc": true
    },
    "numberSerialization": {
      "model": "IEEE754_BINARY64_AS_REQUIRED_BY_RFC8785",
      "finiteOnly": true,
      "NaNAllowed": false,
      "positiveInfinityAllowed": false,
      "negativeInfinityAllowed": false,
      "negativeZero": "canonicalize as 0",
      "integerSafeRangeRequired": true,
      "integerSafeRange": "-9007199254740991..9007199254740991",
      "serialization": "RFC 8785 / ECMAScript-compatible shortest round-trippable representation"
    },
    "stringEscaping": {
      "unicodeNormalization": "NFC before JCS serialization",
      "escaping": "RFC 8785 JCS string serialization",
      "invalidUnicode": "REJECT",
      "propertyNameSorting": "RFC 8785 lexicographic ordering over UTF-16 code units after NFC normalization"
    },
    "digestEncoding": "lowercase hexadecimal",
    "stringLengthMetric": {
      "normalization": "Unicode NFC first",
      "characterCountUnit": "UNICODE_SCALAR_VALUES",
      "definition": "Count Unicode scalar values/code points after NFC normalization. UTF-16 code units and grapheme clusters are NOT the length metric.",
      "javascriptImplementationRequirement": "Count Unicode code points, e.g. Array.from(normalizedString).length or an equivalent scalar iterator; String.length alone is forbidden.",
      "dotNetImplementationRequirement": "Count System.Text.Rune values or equivalent Unicode scalar iteration; UTF-16 char count alone is forbidden.",
      "minLengthAndMaxLengthUse": "Every schema field named minLength, maxLength, exactLength when semantically a character count uses UNICODE_SCALAR_VALUES unless the field explicitly declares bytes.",
      "byteDenominatedException": "Fields explicitly named/declared as bytes use UTF-8 byte count after NFC normalization.",
      "repositoryPathByteMetric": "UTF-8 bytes after NFC normalization",
      "uriByteMetric": "UTF-8 bytes after NFC normalization",
      "canonicalEventByteMetric": "UTF-8 bytes of final RFC8785 JCS serialization"
    },
    "regexDialect": {
      "name": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1",
      "scope": "All normative identity/schema validation patterns.",
      "matchingEncodingDomain": "Unicode scalar input after NFC, but every regex token and character class defined by this dialect is ASCII-only.",
      "completeGrammar": {
        "sequence": "one or more quantifiedAtom values concatenated with no implicit separator",
        "quantifiedAtom": "atom optionally followed by exactly one allowed quantifier",
        "atom": [
          "ASCII_LITERAL",
          "ASCII_CHARACTER_CLASS"
        ],
        "ASCII_LITERAL": "One ASCII code point U+0021..U+007E excluding regex metacharacters ^ $ [ ] { } ( ) | \\ * + ? . unless that character appears inside an ASCII_CHARACTER_CLASS where explicitly allowed.",
        "ASCII_CHARACTER_CLASS": "A non-empty bracket class composed only of explicit ASCII literals and/or the three permitted ranges A-Z, a-z, 0-9.",
        "allowedClassRanges": [
          "A-Z",
          "a-z",
          "0-9"
        ],
        "classNegationAllowed": false,
        "classIntersectionAllowed": false,
        "classSubtractionAllowed": false,
        "hyphenLiteralRule": "Hyphen is a literal only when it is the final member before ]. Else it may appear only inside the three exact permitted ranges.",
        "allowedQuantifiers": [
          "{n}",
          "{m,n}"
        ],
        "quantifierNumberGrammar": "n and m are non-negative base-10 ASCII integers with no sign and no leading zero unless the value is exactly 0.",
        "quantifierOrderingRule": "For {m,n}, m <= n.",
        "maximumQuantifierValue": 4096,
        "bareQuestionMarkAllowed": false,
        "bareStarAllowed": false,
        "barePlusAllowed": false,
        "groupingRules": {
          "capturingGroupsAllowed": false,
          "nonCapturingGroupsAllowed": false,
          "namedGroupsAllowed": false
        },
        "alternationAllowed": false,
        "escapeRules": {
          "backslashAllowed": false,
          "shorthandClassesAllowed": false,
          "unicodeEscapesAllowed": false,
          "hexadecimalEscapesAllowed": false
        },
        "wildcardDotAllowed": false,
        "lookaheadAllowed": false,
        "lookbehindAllowed": false,
        "backreferencesAllowed": false,
        "inlineFlagsAllowed": false,
        "runtimeFlagsAllowed": false,
        "anchorsRequired": {
          "beginning": "^",
          "ending": "$",
          "exactlyOnceEach": true
        },
        "topLevelSyntax": {
          "beginAnchorToken": "CARET",
          "bodyNonterminal": "sequence",
          "endAnchorToken": "DOLLAR",
          "composition": [
            "beginAnchorToken",
            "bodyNonterminal",
            "endAnchorToken"
          ],
          "normativeRegexPattern": false
        }
      },
      "interpretation": {
        "matchMode": "FULL_STRING_ONLY",
        "caseSensitivity": "CASE_SENSITIVE",
        "localeSensitive": false,
        "unicodePropertySemantics": false,
        "nativeRuntimeExtensionsAllowed": false,
        "implementationRequirement": "A normative pattern MUST first be validated against completeGrammar. A runtime regex engine may then be used only if the already-validated pattern preserves these exact ASCII semantics."
      },
      "invalidPatternHandling": "CONTRACT_OR_IMPLEMENTATION_ERROR_FAIL_CLOSED",
      "normativePatternIdentificationRule": "Only values registered in canonicalization.normativeRegexPatterns, or values in fields explicitly bound to AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1, are normative regex input. Grammar metadata is not regex input."
    },
    "normativeRegexPatterns": {
      "STABLE_ID": "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$",
      "SHA256_HEX": "^[0-9abcdef]{64}$",
      "GIT_SHA1": "^[0-9abcdef]{40}$",
      "CALENDAR_DAY": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      "CANONICAL_MATCH_ID": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$",
      "EVIDENCE_REF_ID": "^ev1_[0-9abcdef]{64}$",
      "CASE_ID": "^case2_[0-9abcdef]{64}$",
      "PRODUCER_ID": "^[a-z0-9][a-z0-9._-]{0,127}$"
    },
    "normativeRegexAuditRule": "Every normative pattern used by event.v4 MUST either equal one entry in normativeRegexPatterns or be separately declared with regexDialect=AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1 and pass completeGrammar validation."
  },
  "identity": {
    "hashAlgorithm": "SHA-256",
    "eventSchema": "ai-matchlab.operational-memory.event.v4",
    "semanticIdentityProjectionFields": [
      "schema",
      "eventType",
      "caseId",
      "effectiveAt",
      "producerFingerprint",
      "subjectFingerprint",
      "payloadFingerprint",
      "evidenceFingerprint",
      "authorityFingerprint",
      "relationshipFingerprint"
    ],
    "excludedFromSemanticIdentity": [
      "recordedAt",
      "eventHash"
    ],
    "semanticHash": "sha256(canonicalJson(semanticIdentityProjection))",
    "eventId": "om1_<semanticHash>",
    "retryRule": "Existing eventId is accepted as IDEMPOTENT_NO_OP only when the complete recomputed semantic identity projection is identical.",
    "collisionRule": "Same eventId with a different semantic identity projection is HASH_COLLISION_OR_CORRUPTION and fails closed.",
    "fullEventHash": "sha256(canonicalJson(fullPersistedEventExcludingEventHash))"
  },
  "caseIdentity": {
    "schema": "ai-matchlab.operational-memory.case-identity.v2",
    "closedSchema": true,
    "originatingEventType": "OBSERVATION",
    "requiredFields": [
      "caseType",
      "subjectFingerprint",
      "triggerClass",
      "rootEffectiveAt",
      "rootEvidenceFingerprint"
    ],
    "rootEffectiveAt": "Exact canonical effectiveAt of the originating OBSERVATION.",
    "occurrenceIdentity": {
      "projection": [
        "rootEffectiveAt",
        "rootEvidenceFingerprint"
      ],
      "fingerprint": "sha256(canonicalJson(occurrenceProjection))",
      "semanticRule": "Two otherwise identical observations at different rootEffectiveAt values are distinct occurrences. If subject, trigger, rootEffectiveAt and root evidence are all identical, they are intentionally the same occurrence."
    },
    "caseIdProjection": [
      "schema",
      "caseType",
      "subjectFingerprint",
      "triggerClass",
      "rootEffectiveAt",
      "rootEvidenceFingerprint"
    ],
    "caseId": "case2_<sha256(canonicalJson(caseIdProjection))>",
    "noEventIdDependency": true,
    "descendantRule": "Every descendant must preserve exact caseId, caseType, subjectFingerprint, triggerClass, rootEffectiveAt and rootEvidenceFingerprint.",
    "crossSubjectSameCaseAllowed": false,
    "readerMustRecomputeCaseId": true,
    "observationRootRule": "For the originating OBSERVATION, caseIdentity.rootEvidenceFingerprint MUST equal that same OBSERVATION event's recomputed evidenceFingerprint.",
    "observationRootValidation": "The canonical reader/writer must recompute the originating OBSERVATION evidenceFingerprint and reject the event if it differs from caseIdentity.rootEvidenceFingerprint.",
    "descendantRootRule": "Every descendant event must preserve byte-exact caseIdentity.rootEvidenceFingerprint from the originating OBSERVATION.",
    "eventSubjectFingerprintBinding": {
      "requiredEquality": "caseIdentity.subjectFingerprint == envelope.subjectFingerprint",
      "comparison": "byte-exact lowercase SHA256_HEX string equality",
      "validationTiming": "before caseId recomputation and before eventId acceptance",
      "mismatchHandling": "REJECT_EVENT_FAIL_CLOSED",
      "appliesTo": "ALL_EVENT_TYPES"
    },
    "rootObservationAnchorValidation": {
      "structuralRootCandidateDefinition": [
        "eventType == OBSERVATION",
        "candidate.caseId == event.caseId",
        "candidate.subjectFingerprint == event.subjectFingerprint",
        "candidate.effectiveAt == event.caseIdentity.rootEffectiveAt",
        "candidate.evidenceFingerprint == event.caseIdentity.rootEvidenceFingerprint",
        "candidate.relationships.parentEventIds is empty",
        "candidate relationship scalar fields are null"
      ],
      "directValidityParticipatesInStructuralAnchorDiscovery": false,
      "originatingObservationSelfValidation": "An OBSERVATION satisfying structuralRootCandidateDefinition may structurally anchor its own case regardless of its later direct-validity state.",
      "nonRootStructuralValidation": "Every non-root event MUST resolve at least one canonical structurally valid root OBSERVATION satisfying structuralRootCandidateDefinition. Root direct-validity state does not control structural readability.",
      "zeroStructuralRoots": "CASE_ROOT_MISSING_FAIL_CLOSED",
      "multipleStructuralRoots": "STRUCTURALLY_ALLOWED_AS_ROOT_SET",
      "arbitraryStructuralWinnerAllowed": false,
      "rootAnchorSet": "The complete set of canonical structurally valid root OBSERVATION events satisfying structuralRootCandidateDefinition.",
      "rootAggregateValidity": {
        "anyConflictedRoot": "CONFLICTED",
        "moreThanOneActiveRoot": "CONFLICTED",
        "exactlyOneActiveRootAndAllOthersInvalid": "ACTIVE",
        "zeroActiveRootsAndAllRootsInvalid": "INVALID"
      },
      "validityChangeRootRecoveryException": "VALIDITY_CHANGE remains structurally readable whenever at least one structural root exists, regardless of current rootAggregateValidity, so root conflicts and invalidity can be repaired.",
      "conflictRecovery": "Use immutable VALIDITY_CHANGE events to invalidate extra roots, resolve conflicted root validity heads or reinstate a chosen structurally existing root. Structural root history is never deleted.",
      "rootValidityAffectsStructuralReadability": false,
      "rootValidityAffectsLineageEffectiveState": true,
      "caseIdProjectionIncludesRootEventId": false,
      "caseRootAnchorIsDerivedState": true
    },
    "caseTypeType": "STABLE_ID",
    "triggerClassType": "STABLE_ID",
    "subjectFingerprintFormat": "SHA256_HEX",
    "rootEvidenceFingerprintFormat": "SHA256_HEX",
    "rootEffectiveAtType": "CANONICAL_TIMESTAMP",
    "caseIdFormat": "^case2_[0-9a-f]{64}$",
    "primitiveValidationTiming": "Before caseId projection serialization and hashing.",
    "caseIdProjectionBinding": {
      "schema": "caseIdentity.schema",
      "caseType": "caseIdentity.caseType",
      "subjectFingerprint": "caseIdentity.subjectFingerprint",
      "triggerClass": "caseIdentity.triggerClass",
      "rootEffectiveAt": "caseIdentity.rootEffectiveAt",
      "rootEvidenceFingerprint": "caseIdentity.rootEvidenceFingerprint"
    },
    "caseIdProjectionObject": {
      "schema": "caseIdentity.schema",
      "caseType": "caseIdentity.caseType",
      "subjectFingerprint": "caseIdentity.subjectFingerprint",
      "triggerClass": "caseIdentity.triggerClass",
      "rootEffectiveAt": "caseIdentity.rootEffectiveAt",
      "rootEvidenceFingerprint": "caseIdentity.rootEvidenceFingerprint"
    },
    "caseIdComputation": "case2_<sha256(canonicalJson(materialized caseIdProjectionObject))>",
    "unboundProjectionSymbolsAllowed": false,
    "caseIdProjectionObjectContract": {
      "closed": true,
      "exactKeys": [
        "schema",
        "caseType",
        "subjectFingerprint",
        "triggerClass",
        "rootEffectiveAt",
        "rootEvidenceFingerprint"
      ],
      "sourceBindingMode": "DEREFERENCE_EVENT_CASE_IDENTITY_FIELDS",
      "descriptorValuesAreNotHashInput": true,
      "materializationAlgorithm": "Construct a new six-key JSON object. For each key in exactKeys, read the bound value from the event caseIdentity object. The resulting dereferenced JSON values, not the source-binding strings, form the runtime projection object.",
      "extraKeysAllowed": false,
      "omittedKeysAllowed": false
    },
    "caseIdProjectionDereferenceRequired": true,
    "caseIdProjectionDescriptorHashingAllowed": false
  },
  "producerIdentity": {
    "schema": "ai-matchlab.operational-memory.producer.v1",
    "closedSchema": true,
    "requiredFields": [
      "producerId",
      "producerRole"
    ],
    "producerId": "Stable logical producer identifier using lowercase ASCII [a-z0-9][a-z0-9._-]{0,127}; no commit SHA, process ID, hostname or timestamp.",
    "producerRoleEnum": [
      "ENGINE",
      "JOB",
      "WORKFLOW",
      "VALIDATOR",
      "OPERATOR",
      "SYSTEM"
    ],
    "volatileRuntimeMetadataAllowed": false,
    "producerFingerprint": "sha256(canonicalJson(producer))",
    "eventIdentityUses": "producerFingerprint",
    "implementationVersionBelongsIn": "evidence/provenance rather than producer semantic identity"
  },
  "authoritySnapshotCanonicalization": {
    "schema": "ai-matchlab.operational-memory.authority-snapshot.v1",
    "closedSchema": true,
    "requiredFields": [
      "sourceWriteAuthorized",
      "dataWriteAuthorized",
      "workflowWriteAuthorized",
      "commitAuthorized",
      "pushAuthorized",
      "deployAuthorized",
      "productionMutationAuthorized",
      "productionKernelEnabled"
    ],
    "exactFieldCount": 8,
    "valueType": "BOOLEAN_ONLY",
    "nullAllowed": false,
    "omittedFieldAllowed": false,
    "extraFieldAllowed": false,
    "canonicalFieldOrder": [
      "commitAuthorized",
      "dataWriteAuthorized",
      "deployAuthorized",
      "productionKernelEnabled",
      "productionMutationAuthorized",
      "pushAuthorized",
      "sourceWriteAuthorized",
      "workflowWriteAuthorized"
    ],
    "fingerprint": "sha256(canonicalJson(authoritySnapshot))",
    "retryFreezeRule": "The authoritySnapshot is part of the semantic proposal. A retry of the same proposal must supply the same authoritySnapshot. A changed authority snapshot represents a distinct historical event.",
    "historicalOnly": true,
    "currentExecutionAuthorityDerivedFromSnapshot": false
  },
  "relationshipCanonicalization": {
    "schema": "ai-matchlab.operational-memory.relationships.v2",
    "closedSchema": true,
    "allFieldsAlwaysPresent": true,
    "fields": [
      "parentEventIds",
      "causedByEventId",
      "supersedesEventId",
      "authorizationEventId",
      "executionAttemptEventId",
      "rollbackOfExecutionAttemptEventId",
      "rollbackExecutionAttemptEventId",
      "validityTargetEventId"
    ],
    "parentEventIds": {
      "type": "ARRAY_EVENT_ID",
      "nullAllowed": false,
      "emptyAllowed": true,
      "duplicatesAllowed": false,
      "canonicalOrder": "ascending eventId"
    },
    "scalarRelationshipFields": [
      "causedByEventId",
      "supersedesEventId",
      "authorizationEventId",
      "executionAttemptEventId",
      "rollbackOfExecutionAttemptEventId",
      "rollbackExecutionAttemptEventId",
      "validityTargetEventId"
    ],
    "scalarAbsentRepresentation": "null",
    "scalarEmptyStringAllowed": false,
    "omittedRelationshipFieldAllowed": false,
    "fingerprint": "sha256(canonicalJson(completeCanonicalRelationshipsObject))",
    "perEventShape": {
      "OBSERVATION": {
        "requiredNonNull": [],
        "allowedNonNull": [
          "parentEventIds",
          "supersedesEventId"
        ]
      },
      "DIAGNOSIS": {
        "requiredNonNull": [
          "causedByEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "causedByEventId",
          "supersedesEventId"
        ]
      },
      "REPAIR_PLAN": {
        "requiredNonNull": [
          "causedByEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "causedByEventId",
          "supersedesEventId"
        ]
      },
      "AUTHORIZATION_RECORD": {
        "requiredNonNull": [
          "causedByEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "causedByEventId",
          "supersedesEventId"
        ]
      },
      "EXECUTION_ATTEMPT": {
        "requiredNonNull": [
          "causedByEventId"
        ],
        "conditionallyRequired": "authorizationEventId is non-null for REPAIR, ROLLBACK and RECOVERY; it may be null for DRY_RUN or VALIDATION.",
        "allowedNonNull": [
          "parentEventIds",
          "causedByEventId",
          "authorizationEventId",
          "supersedesEventId"
        ]
      },
      "OUTCOME_VERIFICATION": {
        "requiredNonNull": [
          "executionAttemptEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "executionAttemptEventId",
          "supersedesEventId"
        ]
      },
      "ROLLBACK_RECOVERY": {
        "requiredNonNull": [
          "rollbackOfExecutionAttemptEventId",
          "rollbackExecutionAttemptEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "rollbackOfExecutionAttemptEventId",
          "rollbackExecutionAttemptEventId",
          "supersedesEventId"
        ]
      },
      "VALIDITY_CHANGE": {
        "requiredNonNull": [
          "validityTargetEventId"
        ],
        "allowedNonNull": [
          "parentEventIds",
          "validityTargetEventId"
        ]
      }
    }
  },
  "graphIntegrity": {
    "allNonNullReferencesMustAlreadyExist": true,
    "forwardReferencesAllowed": false,
    "selfReferenceAllowed": false,
    "crossCaseLifecycleEdgesAllowed": false,
    "crossSubjectLifecycleEdgesAllowed": false,
    "cycleAllowed": false,
    "supersedesRule": "supersedesEventId must reference a pre-existing event compatible with the event-type-specific supersession rule.",
    "validityTargetRule": "VALIDITY_CHANGE.validityTargetEventId must reference a pre-existing canonical event in the same case and subject.",
    "validityChangeSupersessionRule": "VALIDITY_CHANGE succession uses an order-independent same-target parentEventIds DAG. supersedesEventId MUST remain null. Multiple structurally valid current heads are recorded conflict and yield CONFLICTED rather than corruption.",
    "parentReferenceSet": "parentEventIds is canonical sorted unique set.",
    "readerMustValidateReachabilityForCyclePrevention": true,
    "allowedTypedEdges": {
      "OBSERVATION": {
        "parentEventIds": [
          "OBSERVATION"
        ],
        "supersedesEventId": [
          "OBSERVATION"
        ]
      },
      "DIAGNOSIS": {
        "parentEventIds": [
          "OBSERVATION",
          "DIAGNOSIS"
        ],
        "causedByEventId": [
          "OBSERVATION"
        ],
        "supersedesEventId": [
          "DIAGNOSIS"
        ]
      },
      "REPAIR_PLAN": {
        "parentEventIds": [
          "DIAGNOSIS",
          "REPAIR_PLAN"
        ],
        "causedByEventId": [
          "DIAGNOSIS"
        ],
        "supersedesEventId": [
          "REPAIR_PLAN"
        ]
      },
      "AUTHORIZATION_RECORD": {
        "parentEventIds": [
          "REPAIR_PLAN",
          "AUTHORIZATION_RECORD"
        ],
        "causedByEventId": [
          "REPAIR_PLAN"
        ],
        "supersedesEventId": [
          "AUTHORIZATION_RECORD"
        ]
      },
      "EXECUTION_ATTEMPT": {
        "parentEventIds": [
          "REPAIR_PLAN",
          "AUTHORIZATION_RECORD",
          "EXECUTION_ATTEMPT"
        ],
        "causedByEventId": [
          "REPAIR_PLAN"
        ],
        "authorizationEventId": [
          "AUTHORIZATION_RECORD"
        ],
        "supersedesEventId": [
          "EXECUTION_ATTEMPT"
        ]
      },
      "OUTCOME_VERIFICATION": {
        "parentEventIds": [
          "EXECUTION_ATTEMPT",
          "OUTCOME_VERIFICATION"
        ],
        "executionAttemptEventId": [
          "EXECUTION_ATTEMPT"
        ],
        "supersedesEventId": [
          "OUTCOME_VERIFICATION"
        ]
      },
      "ROLLBACK_RECOVERY": {
        "parentEventIds": [
          "EXECUTION_ATTEMPT",
          "OUTCOME_VERIFICATION",
          "ROLLBACK_RECOVERY"
        ],
        "rollbackOfExecutionAttemptEventId": [
          "EXECUTION_ATTEMPT"
        ],
        "rollbackExecutionAttemptEventId": [
          "EXECUTION_ATTEMPT"
        ],
        "supersedesEventId": [
          "ROLLBACK_RECOVERY"
        ]
      },
      "VALIDITY_CHANGE": {
        "parentEventIds": [
          "VALIDITY_CHANGE"
        ],
        "validityTargetEventId": [
          "OBSERVATION",
          "DIAGNOSIS",
          "REPAIR_PLAN",
          "AUTHORIZATION_RECORD",
          "EXECUTION_ATTEMPT",
          "OUTCOME_VERIFICATION",
          "ROLLBACK_RECOVERY"
        ]
      }
    },
    "typedEdgeValidation": "Every non-null relationship reference must target an event type explicitly permitted by allowedTypedEdges for the referencing event type and relationship field. Any unspecified non-null edge is forbidden.",
    "supersedesCompatibility": "For non-VALIDITY_CHANGE events, supersedesEventId must target the same eventType, same caseId and same subjectFingerprint. VALIDITY_CHANGE uses parentEventIds for order-independent validity-DAG succession and must have supersedesEventId=null.",
    "effectiveTimeOrdering": {
      "comparisonDomain": "parsed canonical UTC instants",
      "generalCausalRule": "For every causal/dependency relationship, referencedEvent.effectiveAt <= referencingEvent.effectiveAt.",
      "appliesTo": [
        "parentEventIds",
        "causedByEventId",
        "authorizationEventId",
        "executionAttemptEventId",
        "rollbackOfExecutionAttemptEventId",
        "rollbackExecutionAttemptEventId",
        "supersedesEventId",
        "validityTargetEventId"
      ],
      "executionAttemptRule": "EXECUTION_ATTEMPT.effectiveAt MUST equal payload.startedAt.",
      "authorizationRule": "Referenced AUTHORIZATION_RECORD.effectiveAt <= EXECUTION_ATTEMPT.effectiveAt.",
      "outcomeRule": "Referenced EXECUTION_ATTEMPT.effectiveAt <= OUTCOME_VERIFICATION.effectiveAt.",
      "rollbackRule": "Both referenced execution attempts must have effectiveAt <= ROLLBACK_RECOVERY.effectiveAt.",
      "validityRule": "validityTargetEvent.effectiveAt and every referenced parent VALIDITY_CHANGE.effectiveAt must be <= VALIDITY_CHANGE.effectiveAt.",
      "supersessionRule": "supersededEvent.effectiveAt <= supersedingEvent.effectiveAt.",
      "caseRootRule": "caseIdentity.rootEffectiveAt <= every descendant event.effectiveAt.",
      "recordedAtOrderingRequired": false,
      "reasonRecordedAtNotUsed": "Historical/backfilled semantic events may be recorded long after effectiveAt.",
      "retrospectiveCausalExceptionAllowed": false
    }
  },
  "evidenceCanonicalization": {
    "schema": "ai-matchlab.operational-memory.evidence-ref.v2",
    "closedSchema": true,
    "requiredFields": [
      "evidenceRefId",
      "kind",
      "locatorType",
      "locator",
      "sha256"
    ],
    "optionalFields": [
      "schema",
      "gitCommit",
      "generatedAt"
    ],
    "sha256Format": "lowercase-hex-64",
    "locatorTypeEnum": [
      "REPOSITORY_PATH",
      "ABSOLUTE_URI",
      "LOGICAL_URI"
    ],
    "locatorCanonicalization": {
      "REPOSITORY_PATH": {
        "repositoryRelative": true,
        "leadingSlashAllowed": false,
        "backslashAllowed": false,
        "dotSegmentAllowed": false,
        "parentTraversalAllowed": false,
        "driveLetterAllowed": false,
        "emptySegmentAllowed": false,
        "unicodeNormalization": "NFC",
        "canonicalExample": "data/value/2026-10-06.json",
        "exactGitTreeCaseRequired": true,
        "gitCommitRequired": true,
        "gitTreePathValidation": "At the evidenceRef.gitCommit commit, locator MUST match one Git tree entry path byte-for-byte and case-for-case using Git object/tree lookup rather than host-filesystem case semantics.",
        "filesystemExistenceIsAuthority": false,
        "gitTreeEntryMustExist": true,
        "pathNormalizationAfterGitBinding": "NONE",
        "caseFoldingAllowed": false,
        "separatorNormalization": "Forward slash only before Git-tree lookup; backslashes are rejected rather than rewritten."
      },
      "ABSOLUTE_URI": {
        "parseAsAbsoluteUriRequired": true,
        "surroundingWhitespaceAllowed": false,
        "unicodeNormalization": "NFC",
        "schemeMustBeLowercase": true,
        "fragmentAllowed": false,
        "unsafeSemanticRewriting": false,
        "identityRule": "After validation and required lowercase scheme normalization, the URI string is otherwise identity-bearing exactly as supplied.",
        "userInfoAllowed": false,
        "queryAllowed": false,
        "credentialBearingUriAllowed": false
      },
      "LOGICAL_URI": {
        "parseAsNetworkUriRequired": false,
        "surroundingWhitespaceAllowed": false,
        "unicodeNormalization": "NFC",
        "identityRule": "Exact canonical NFC string; no semantic URI rewriting."
      }
    },
    "duplicateExactReferenceAllowed": false,
    "canonicalSortTuple": [
      "evidenceRefId"
    ],
    "ordering": "ascending bytewise evidenceRefId",
    "evidenceFingerprint": "sha256(canonicalJson(canonicalSortedEvidenceRefs))",
    "kindEnum": [
      "SOURCE_ARTIFACT",
      "REPORT",
      "LOG",
      "CONTRACT",
      "RESULT",
      "SNAPSHOT",
      "EXTERNAL_RECORD"
    ],
    "generatedAtCanonicalization": "When present, generatedAt MUST use the exact contract canonical timestamp form YYYY-MM-DDTHH:mm:ss.SSSZ and round-trip identically.",
    "gitCommitFormat": "When present, gitCommit MUST be the complete lowercase 40-hex Git SHA-1 object id. Abbreviated hashes are forbidden in operational-memory event.v4.",
    "schemaFieldCanonicalization": "When present, schema is a non-empty NFC string with no leading/trailing whitespace.",
    "optionalMetadataAbsence": "Optional schema, gitCommit and generatedAt fields are OMITTED when absent; explicit null is forbidden.",
    "evidenceReferenceIdentity": {
      "projectionFields": [
        "kind",
        "locatorType",
        "locator",
        "sha256",
        "schema-if-present",
        "gitCommit-if-present",
        "generatedAt-if-present"
      ],
      "evidenceRefId": "ev1_<sha256(canonicalJson(evidenceReferenceIdentityProjection))>",
      "evidenceRefIdPattern": "^ev1_[0-9a-f]{64}$",
      "includedInsideEvidenceRef": true
    },
    "payloadEvidenceReferenceNormalization": {
      "positionalIndexesAllowed": false,
      "referenceForm": "evidenceRefId",
      "eventPayloadReferenceValidation": "Every referenced evidenceRefId MUST have exactly one byte-equal evidenceRefId member in the event envelope evidenceRefs.",
      "unknownEvidenceRefId": "FAIL_CLOSED",
      "duplicateEvidenceRefId": "FAIL_CLOSED",
      "canonicalReferenceSet": "sorted unique evidenceRefId array"
    },
    "repositoryEvidenceCommitBinding": "locatorType=REPOSITORY_PATH requires exact full gitCommit and exact Git-tree locator validation."
  },
  "nestedPayloadSchemas": {
    "CANONICAL_PATH_SET": {
      "representation": "array<string>",
      "item": "repository-relative forward-slash path",
      "duplicatesAllowed": false,
      "canonicalOrder": "ascending",
      "emptyAllowed": true
    },
    "STRING_SET": {
      "representation": "array<string>",
      "unicodeNormalization": "NFC",
      "duplicatesAllowed": false,
      "canonicalOrder": "ascending"
    },
    "TARGET_SCOPE": {
      "closed": true,
      "required": [
        "scope",
        "key"
      ],
      "optional": [],
      "scopeEnum": [
        "SYSTEM",
        "DAY",
        "MATCH",
        "ARTIFACT",
        "PIPELINE",
        "REPAIR_CLASS",
        "RELEASE"
      ],
      "keyType": "non-empty NFC string with no leading/trailing whitespace",
      "canonicalIdentity": "canonicalJson({scope,key}) after exact subject keySchemaByScope validation",
      "containmentModel": "EXACT_CANONICAL_EQUALITY_ONLY",
      "implicitHierarchy": false,
      "reuseSubjectKeySchemaByScope": true,
      "keySchemaByScope": {
        "SYSTEM": {
          "type": "LITERAL",
          "value": "system"
        },
        "DAY": {
          "type": "CALENDAR_DAY"
        },
        "MATCH": {
          "type": "CANONICAL_MATCH_ID"
        },
        "ARTIFACT": {
          "type": "CANONICAL_REPOSITORY_PATH"
        },
        "PIPELINE": {
          "type": "STABLE_ID"
        },
        "REPAIR_CLASS": {
          "type": "STABLE_ID"
        },
        "RELEASE": {
          "type": "GIT_SHA1"
        }
      },
      "scopeKeyValidation": "TARGET_SCOPE.scope and TARGET_SCOPE.key MUST satisfy the byte-identical machine contract used by subjectIdentity.scope and subjectIdentity.key for the selected scope."
    },
    "FACT": {
      "closed": true,
      "required": [
        "key",
        "valueType",
        "value"
      ],
      "optional": [
        "unit"
      ],
      "keyType": "STABLE_ID",
      "unitType": "UNIT_TEXT",
      "valueTypeEnum": [
        "BOOLEAN",
        "NUMBER",
        "STRING",
        "NULL"
      ],
      "valueContract": {
        "BOOLEAN": "JSON boolean",
        "NUMBER": "FINITE_NUMBER",
        "STRING": "SHORT_TEXT",
        "NULL": "JSON null"
      },
      "discriminatorRule": "The JSON type/value of FACT.value MUST exactly satisfy the valueContract member selected by FACT.valueType.",
      "mismatchHandling": "FAIL_CLOSED"
    },
    "FACT_SET": {
      "representation": "array<FACT>",
      "uniqueBy": "key",
      "canonicalOrder": "ascending key"
    },
    "METRIC": {
      "closed": true,
      "required": [
        "key",
        "value"
      ],
      "optional": [
        "unit"
      ],
      "keyType": "STABLE_ID",
      "valueType": "FINITE_NUMBER",
      "unitType": "UNIT_TEXT",
      "uniqueBy": "key"
    },
    "METRIC_SET": {
      "representation": "array<METRIC>",
      "canonicalOrder": "ascending key"
    },
    "VERIFICATION_CHECK": {
      "closed": true,
      "required": [
        "checkId",
        "status",
        "summary"
      ],
      "optional": [
        "evidenceRefIds"
      ],
      "checkIdType": "STABLE_ID",
      "summaryType": "SHORT_TEXT",
      "statusEnum": [
        "PASS",
        "FAIL",
        "WARNING",
        "UNRESOLVED"
      ],
      "evidenceRefIds": "when present, sorted unique evidenceRefId array"
    },
    "VERIFICATION_CHECK_SET": {
      "representation": "array<VERIFICATION_CHECK>",
      "uniqueBy": "checkId",
      "canonicalOrder": "ascending checkId"
    },
    "ERROR_RECORD": {
      "closed": true,
      "required": [
        "code",
        "stage",
        "message",
        "retriable"
      ],
      "optional": [],
      "codeType": "STABLE_ID",
      "stageType": "STABLE_ID",
      "messageType": "LONG_TEXT",
      "retriableType": "BOOLEAN"
    },
    "ERROR_SET": {
      "representation": "array<ERROR_RECORD>",
      "canonicalOrder": "ascending tuple(code,stage,message,retriable)"
    },
    "AUTHORIZATION_CONSTRAINTS": {
      "closed": true,
      "required": [
        "allowedOperations",
        "targetScope",
        "allowedWritePaths"
      ],
      "optional": [
        "expiresAt"
      ],
      "allowedOperationEnum": [
        "REPAIR",
        "ROLLBACK",
        "RECOVERY",
        "DRY_RUN",
        "VALIDATION"
      ],
      "allowedOperations": "non-empty sorted unique set drawn only from allowedOperationEnum",
      "targetScopeSchema": "TARGET_SCOPE",
      "allowedWritePathsSchema": "CANONICAL_PATH_SET",
      "expiresAt": "when present, exact canonical UTC timestamp",
      "absentExpiresAtMeaning": "NO_EXPIRY_IN_HISTORICAL_RECORD"
    },
    "ORDERED_STRING_SEQUENCE": {
      "representation": "array<string>",
      "orderSemanticallyMeaningful": true,
      "duplicatesAllowed": true,
      "unicodeNormalization": "NFC"
    },
    "EVIDENCE_ASSESSMENT": {
      "closed": true,
      "required": [
        "state",
        "summary",
        "supportingEvidenceRefIds",
        "contradictingEvidenceRefIds"
      ],
      "optional": [],
      "stateEnum": [
        "SUPPORTS",
        "CONTRADICTS",
        "MIXED",
        "INSUFFICIENT"
      ],
      "summaryType": "SHORT_TEXT",
      "supportingEvidenceRefIds": "sorted unique evidenceRefId array",
      "contradictingEvidenceRefIds": "sorted unique evidenceRefId array"
    },
    "ROLLBACK_STRATEGY": {
      "closed": true,
      "required": [
        "mode",
        "orderedSteps"
      ],
      "optional": [],
      "modeEnum": [
        "NONE",
        "REVERSE_WRITE_SET",
        "RESTORE_PRESERVED_STATE",
        "CUSTOM"
      ],
      "orderedStepsSchema": "ORDERED_STRING_SEQUENCE"
    },
    "VERIFICATION_PLAN": {
      "closed": true,
      "required": [
        "method",
        "checkIds"
      ],
      "optional": [],
      "method": "non-empty NFC string",
      "checkIds": "STRING_SET",
      "methodType": "STABLE_ID"
    },
    "PRESERVATION_VERIFICATION": {
      "closed": true,
      "required": [
        "status",
        "checks"
      ],
      "optional": [],
      "statusEnum": [
        "PASS",
        "FAIL",
        "UNRESOLVED"
      ],
      "checksSchema": "VERIFICATION_CHECK_SET"
    },
    "RECOVERY_STRATEGY": {
      "closed": true,
      "required": [
        "mode",
        "orderedSteps"
      ],
      "optional": [],
      "modeEnum": [
        "ROLLBACK",
        "RESTORE",
        "REBUILD",
        "CUSTOM"
      ],
      "orderedStepsSchema": "ORDERED_STRING_SEQUENCE"
    }
  },
  "executionAuthorizationCompatibility": {
    "currentAuthorityStillMustBeRevalidated": true,
    "memoryAuthorizationNeverBecomesCurrentAuthority": true,
    "mutableOperationKinds": [
      "REPAIR",
      "ROLLBACK",
      "RECOVERY"
    ],
    "nonMutableOperationKinds": [
      "DRY_RUN",
      "VALIDATION"
    ],
    "mutableAttemptRequirements": [
      "authorizationEventId is non-null",
      "referenced eventType is AUTHORIZATION_RECORD",
      "referenced payload.decision is AUTHORIZED",
      "referenced event has same caseId",
      "referenced event has same subjectFingerprint",
      "authorization payload scope matches execution targetScope",
      "authorization constraints allow execution operationKind",
      "actualWriteSet is subset of authorization allowedWritePaths",
      "authorization expiresAt is null or is not earlier than execution startedAt"
    ],
    "deniedOrRevokedAuthorizationCompatible": false,
    "scopeMismatchCompatible": false,
    "writeSetOutsideConstraintsCompatible": false,
    "semanticMeaning": "Historical linkage validation only; independent current authority validation remains mandatory immediately before real mutation.",
    "targetScopeCompatibilityAlgorithm": "AUTHORIZATION_RECORD.payload.scope, AUTHORIZATION_RECORD.payload.constraints.targetScope and EXECUTION_ATTEMPT.payload.targetScope must be canonical-JSON byte-identical. No implicit parent/child scope containment exists in event.v4.",
    "authorizationScopeConstraintConsistency": "AUTHORIZATION_RECORD.payload.scope MUST equal payload.constraints.targetScope under canonical TARGET_SCOPE equality.",
    "operationCompatibility": "EXECUTION_ATTEMPT.payload.operationKind must be an exact member of authorization constraints.allowedOperations.",
    "writeSetSubsetAlgorithm": "actualWriteSet and allowedWritePaths are canonical sorted unique repository-path sets; every actualWriteSet member must have an exact byte-equal member in allowedWritePaths.",
    "expiryAlgorithm": "If expiresAt exists, EXECUTION_ATTEMPT.payload.startedAt must be <= expiresAt after parsing both as canonical UTC instants."
  },
  "validityControl": {
    "schema": "ai-matchlab.operational-memory.validity-control.v3",
    "eventType": "VALIDITY_CHANGE",
    "targetBytesChanged": false,
    "targetDeleted": false,
    "targetEventTypes": [
      "OBSERVATION",
      "DIAGNOSIS",
      "REPAIR_PLAN",
      "AUTHORIZATION_RECORD",
      "EXECUTION_ATTEMPT",
      "OUTCOME_VERIFICATION",
      "ROLLBACK_RECOVERY"
    ],
    "payloadSchema": {
      "closed": true,
      "required": [
        "action",
        "reasonCode",
        "reason"
      ],
      "optional": [],
      "actionEnum": [
        "INVALIDATE",
        "REINSTATE"
      ]
    },
    "successionProtocol": "PARENT_EVENT_IDS_ORDER_INDEPENDENT_DAG",
    "supersedesEventId": "MUST_BE_NULL",
    "firstChange": "A structurally valid canonical VALIDITY_CHANGE with parentEventIds empty is a validity root proposal. Multiple structurally valid root proposals for the same validityTargetEventId are permitted as competing branches and produce CONFLICTED when they remain multiple current heads.",
    "currentHeadDefinition": "For one validityTargetEventId, a structurally valid canonical VALIDITY_CHANGE is a current head iff no other structurally valid canonical VALIDITY_CHANGE for the same validityTargetEventId directly references its eventId in parentEventIds.",
    "subsequentProposal": "A non-root structurally valid canonical VALIDITY_CHANGE MAY reference one or more pre-existing structurally valid same-target VALIDITY_CHANGE events in canonical sorted unique parentEventIds. The parent set is not required to equal the current-head set at insertion time. Structural eligibility is derived only from the immutable validity DAG rules and not from arrival, replay, recordedAt or repository iteration order.",
    "concurrentFork": "PERMITTED_AS_RECORDED_CONFLICT_NOT_AS_RESOLVED_STATE",
    "zeroHeadsState": "ACTIVE",
    "oneHeadState": "head payload.action determines ACTIVE or INVALID",
    "multipleHeadsState": "CONFLICTED",
    "conflictedOperationalUse": "FAIL_CLOSED",
    "conflictedG7Eligibility": "EXCLUDED",
    "conflictResolution": "Conflict is resolved only when the finite structurally valid validity DAG for one validityTargetEventId has exactly one current head. All other structurally valid branches must be ancestors of that sole head; otherwise multiple heads remain CONFLICTED. The sole head payload.action establishes ACTIVE or INVALID.",
    "arbitraryWinnerAllowed": false,
    "dependentEventValidityPolicy": {
      "model": "FAIL_CLOSED_LINEAGE_EFFECTIVE_VALIDITY",
      "directEventStates": [
        "ACTIVE",
        "INVALID",
        "CONFLICTED"
      ],
      "requiredDependencyEdges": [
        "caseRootAggregateValidity",
        "parentEventIds",
        "causedByEventId",
        "authorizationEventId",
        "executionAttemptEventId",
        "rollbackOfExecutionAttemptEventId",
        "rollbackExecutionAttemptEventId"
      ],
      "excludedDependencyEdges": [
        "supersedesEventId",
        "validityTargetEventId"
      ],
      "effectiveStateRules": [
        "If own direct validity is CONFLICTED => LINEAGE_CONFLICTED",
        "If own direct validity is INVALID => LINEAGE_INVALID",
        "If any required dependency has effective state LINEAGE_CONFLICTED => LINEAGE_CONFLICTED",
        "If any required dependency has effective state LINEAGE_INVALID => LINEAGE_INVALID",
        "Otherwise => LINEAGE_ACTIVE"
      ],
      "invalidAncestorDeletesDescendant": false,
      "historicalQueryabilityPreserved": true,
      "G7PositiveTrainingRequires": "LINEAGE_ACTIVE plus all event-type-specific verified-outcome requirements",
      "invalidOrConflictedLineagePositiveTraining": false,
      "caseRootAggregateRule": "For non-root events, case root validity contributes only to lineage-effective validity. It MUST NOT make the immutable event structurally unreadable.",
      "rootObservationRule": "Each root OBSERVATION uses its own direct validity for its direct state; the case rootAggregateValidity is derived across the structural rootAnchorSet."
    },
    "G7Rule": "Only lineage-effective ACTIVE events may satisfy positive-training eligibility.",
    "validityChangeApplicationRule": {
      "applicationEligibility": "STRUCTURALLY_VALID_CANONICAL_VALIDITY_CHANGE",
      "requiresLineageActive": false,
      "requiresG7Eligibility": false,
      "requiresCaseRootAggregateActive": false,
      "structuralRequirements": [
        "canonical event bytes valid",
        "eventHash/eventId/fingerprints valid",
        "eventType == VALIDITY_CHANGE",
        "case/root structural anchor rules valid",
        "typed relationship rules valid",
        "effective-time ordering valid",
        "validityTargetEventId valid",
        "parentEventIds order-independent validity-DAG protocol valid",
        "security gate PASS",
        "resource bounds PASS"
      ],
      "directTargetValidityComputation": "Every structurally valid canonical VALIDITY_CHANGE satisfying the order-independent validity-DAG protocol participates in target direct-validity computation even when that VALIDITY_CHANGE event's own lineage-effective state is INVALID or CONFLICTED because of case-root aggregate validity.",
      "separationOfConcerns": "Applicability to target direct validity and lineage/G7 eligibility of the VALIDITY_CHANGE event itself are separate computations.",
      "repairLiveness": "A structurally valid VALIDITY_CHANGE may resolve the root or validity conflict that caused its own pre-resolution lineage state to be non-ACTIVE.",
      "invalidStructuralEventApplies": false,
      "arbitrarySuppressionAllowed": false,
      "headGraphMembershipRule": "Head graph membership uses exactly currentHeadEligibilityRule and the order-independent same-target validity DAG; it is independent of lineage-effective state, G7 eligibility, caseRootAggregateValidity, recordedAt and arrival/replay order.",
      "headGraphAndApplicationEligibilityIdentical": true
    },
    "currentHeadEligibilityRule": {
      "eligibilitySource": "validityChangeApplicationRule.applicationEligibility",
      "requiredEligibilityValue": "STRUCTURALLY_VALID_CANONICAL_VALIDITY_CHANGE",
      "requiresLineageActive": false,
      "requiresG7Eligibility": false,
      "requiresCaseRootAggregateActive": false,
      "requiresTargetCurrentlyActive": false,
      "graphMembershipRule": "Every structurally valid canonical VALIDITY_CHANGE participates in the order-independent validity-head DAG for its validityTargetEventId.",
      "excludedEventRule": "A VALIDITY_CHANGE that fails structural canonical validation does not participate in the head graph or target direct-validity calculation."
    },
    "orderingModel": "ORDER_INDEPENDENT_IMMUTABLE_DAG",
    "rootProposalRule": "parentEventIds empty defines a validity root proposal. Multiple root proposals are structurally permitted and become multiple heads/conflict unless later merged into one head.",
    "parentEligibility": "Every parentEventId MUST reference a pre-existing structurally valid canonical VALIDITY_CHANGE for the same validityTargetEventId, caseId and subjectFingerprint; parent.effectiveAt MUST be <= child.effectiveAt; self-reference and cycles are forbidden.",
    "parentAntichainRule": "The direct parentEventIds set MUST be an antichain under same-target validity-parent reachability: no declared parent may be an ancestor of another declared parent.",
    "siblingForkRule": "Two or more structurally valid canonical VALIDITY_CHANGE events may reference the same predecessor frontier. Every sibling remains structurally valid; multiple resulting current heads yield CONFLICTED.",
    "staleProposalRule": "When immutable event bytes cannot distinguish a stale proposal from a genuinely concurrent sibling, the reader MUST NOT invent arrival-order freshness. The proposal remains a structurally valid sibling branch if all order-independent DAG rules pass; any resulting multiple-head state is CONFLICTED and operational use fails closed.",
    "subsetMergeRule": "A child that references only a subset of live branches cannot silently resolve conflict because every unreferenced live branch remains a current head.",
    "singleHeadResolutionRule": "A target is conflict-resolved only when exactly one structurally valid current head remains and every other structurally valid branch is an ancestor of that head."
  },
  "eventPayloadContracts": {
    "OBSERVATION": {
      "closed": true,
      "required": [
        "observationClass",
        "severity",
        "summary",
        "facts"
      ],
      "optional": [
        "metrics",
        "labels"
      ],
      "factsSchema": "FACT_SET",
      "metricsSchema": "METRIC_SET",
      "labelsSchema": "STRING_SET",
      "severityEnum": [
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
        "UNKNOWN"
      ],
      "observationClassType": "STABLE_ID",
      "summaryType": "SHORT_TEXT"
    },
    "DIAGNOSIS": {
      "closed": true,
      "required": [
        "diagnosisClass",
        "status",
        "summary",
        "confidence",
        "evidenceAssessment"
      ],
      "optional": [
        "hypotheses",
        "ruledOutClasses"
      ],
      "hypothesesSchema": "STRING_SET",
      "ruledOutClassesSchema": "STRING_SET",
      "statusEnum": [
        "CONFIRMED",
        "PROBABLE",
        "HYPOTHESIS",
        "UNRESOLVED"
      ],
      "confidence": "finite number in [0,1]",
      "evidenceAssessmentSchema": "EVIDENCE_ASSESSMENT",
      "diagnosisClassType": "STABLE_ID",
      "summaryType": "SHORT_TEXT"
    },
    "REPAIR_PLAN": {
      "closed": true,
      "required": [
        "repairClass",
        "repairUnit",
        "targetScope",
        "expectedWriteSet",
        "preservationSet",
        "preconditions",
        "stopConditions"
      ],
      "optional": [
        "rollbackStrategy",
        "verificationPlan"
      ],
      "targetScopeSchema": "TARGET_SCOPE",
      "expectedWriteSetSchema": "CANONICAL_PATH_SET",
      "preservationSetSchema": "CANONICAL_PATH_SET",
      "preconditionsSchema": "VERIFICATION_CHECK_SET",
      "stopConditionsSchema": "VERIFICATION_CHECK_SET",
      "rollbackStrategySchema": "ROLLBACK_STRATEGY",
      "verificationPlanSchema": "VERIFICATION_PLAN",
      "repairClassType": "STABLE_ID",
      "repairUnitType": "STABLE_ID"
    },
    "AUTHORIZATION_RECORD": {
      "closed": true,
      "required": [
        "authoritySource",
        "decision",
        "scope",
        "constraints"
      ],
      "optional": [
        "reason"
      ],
      "scopeSchema": "TARGET_SCOPE",
      "constraintsSchema": "AUTHORIZATION_CONSTRAINTS",
      "decisionEnum": [
        "AUTHORIZED",
        "DENIED",
        "REVOKED"
      ],
      "authorityFingerprintSource": "envelope authoritySnapshot only; no duplicate payload authorityFingerprint field",
      "authoritySourceType": "STABLE_ID",
      "reasonType": "SHORT_TEXT"
    },
    "EXECUTION_ATTEMPT": {
      "closed": true,
      "required": [
        "operationKind",
        "attemptStatus",
        "targetScope",
        "startedAt",
        "completedAt",
        "executorContractId",
        "sourceCommit",
        "preExecutionFingerprint",
        "postExecutionFingerprint",
        "actualWriteSet",
        "errors"
      ],
      "optional": [
        "preservationVerification",
        "metrics"
      ],
      "targetScopeSchema": "TARGET_SCOPE",
      "actualWriteSetSchema": "CANONICAL_PATH_SET",
      "errorsSchema": "ERROR_SET",
      "metricsSchema": "METRIC_SET",
      "operationKindEnum": [
        "REPAIR",
        "ROLLBACK",
        "RECOVERY",
        "DRY_RUN",
        "VALIDATION"
      ],
      "attemptStatusEnum": [
        "SUCCEEDED",
        "FAILED",
        "NO_OP",
        "ABORTED"
      ],
      "temporalRule": "startedAt/completedAt are canonical timestamps and completedAt >= startedAt",
      "preservationVerificationSchema": "PRESERVATION_VERIFICATION",
      "executorContractIdType": "STABLE_ID",
      "sourceCommitFormat": "GIT_SHA1",
      "stateFingerprintFormat": "SHA256_HEX"
    },
    "OUTCOME_VERIFICATION": {
      "closed": true,
      "required": [
        "verificationState",
        "verificationMethod",
        "preStateFingerprint",
        "postStateFingerprint",
        "checks",
        "summary"
      ],
      "optional": [
        "metrics",
        "followUpRequired"
      ],
      "checksSchema": "VERIFICATION_CHECK_SET",
      "metricsSchema": "METRIC_SET",
      "verificationStateEnum": [
        "VERIFIED_SUCCESS",
        "VERIFIED_NO_OP",
        "VERIFIED_FAILURE",
        "UNRESOLVED"
      ],
      "exitCodeAloneSufficient": false,
      "followUpRequiredType": "boolean",
      "verificationMethodType": "STABLE_ID",
      "stateFingerprintFormat": "SHA256_HEX",
      "summaryType": "SHORT_TEXT"
    },
    "ROLLBACK_RECOVERY": {
      "closed": true,
      "required": [
        "recoveryClass",
        "reason",
        "targetScope",
        "strategy",
        "recoveryState"
      ],
      "optional": [
        "preservationSet",
        "verificationRequirements"
      ],
      "targetScopeSchema": "TARGET_SCOPE",
      "preservationSetSchema": "CANONICAL_PATH_SET",
      "verificationRequirementsSchema": "VERIFICATION_CHECK_SET",
      "recoveryStateEnum": [
        "ROLLED_BACK",
        "RECOVERED",
        "PARTIALLY_RECOVERED",
        "FAILED"
      ],
      "strategySchema": "RECOVERY_STRATEGY",
      "recoveryClassType": "STABLE_ID",
      "reasonType": "SHORT_TEXT"
    },
    "VALIDITY_CHANGE": {
      "closed": true,
      "required": [
        "action",
        "reasonCode",
        "reason"
      ],
      "optional": [],
      "actionEnum": [
        "INVALIDATE",
        "REINSTATE"
      ],
      "reasonCodeType": "STABLE_ID",
      "reasonType": "SHORT_TEXT"
    }
  },
  "eventEnvelope": {
    "schema": "ai-matchlab.operational-memory.event.v4",
    "closedSchema": true,
    "requiredFields": [
      "schema",
      "eventId",
      "eventType",
      "caseId",
      "caseIdentity",
      "effectiveAt",
      "effectiveUtcDay",
      "recordedAt",
      "producer",
      "producerFingerprint",
      "subject",
      "subjectFingerprint",
      "payloadFingerprint",
      "evidenceFingerprint",
      "authorityFingerprint",
      "relationshipFingerprint",
      "semanticHash",
      "eventHash",
      "evidenceRefs",
      "authoritySnapshot",
      "relationships",
      "payload"
    ],
    "eventTypeEnum": [
      "OBSERVATION",
      "DIAGNOSIS",
      "REPAIR_PLAN",
      "AUTHORIZATION_RECORD",
      "EXECUTION_ATTEMPT",
      "OUTCOME_VERIFICATION",
      "ROLLBACK_RECOVERY",
      "VALIDITY_CHANGE"
    ],
    "unknownFieldsAllowed": false
  },
  "authorityBoundary": {
    "operationalMemoryIsPassiveEvidence": true,
    "memoryMayGrantRepairAuthority": false,
    "memoryMayGrantProductionMutationAuthority": false,
    "memoryMayEnableProductionKernel": false,
    "memoryMayGrantCommitPushDeployAuthority": false,
    "authorizationRecordIsCurrentAuthority": false,
    "executorMustRevalidateCurrentAuthority": true,
    "currentAuthorityRevalidationTiming": "Immediately before any real mutation.",
    "staleOrMissingCurrentAuthority": "FAIL_CLOSED",
    "competingAuthoritySystemForbidden": true
  },
  "storageIntegrity": {
    "canonicalRoot": "data/operational-memory/events",
    "canonicalPath": "data/operational-memory/events/<effectiveUtcDay>/<eventId>.json",
    "readerMustRecomputeAndVerify": [
      "maximumPhysicalInputBytes before parse when raw bytes/files are read",
      "strict raw JSON duplicate-key rules",
      "safe NFC preprocessing order",
      "Unicode-scalar string length semantics",
      "deterministic security structural rules",
      "AI_MATCHLAB_OM_SECRET_SCAN_V1",
      "supported exact event schema",
      "closed event envelope",
      "structural/cardinality/string resource bounds",
      "eventType enum",
      "canonical timestamps",
      "effectiveUtcDay from effectiveAt",
      "directory partition",
      "filename eventId",
      "canonical subject scope/key schema",
      "subjectFingerprint",
      "caseIdentity primitive formats",
      "caseIdentity.subjectFingerprint equals envelope.subjectFingerprint",
      "exact caseIdProjection binding",
      "originating observation root-evidence self binding",
      "structural root OBSERVATION anchor-set existence",
      "case root aggregate validity derived separately from structural root identity",
      "caseId",
      "producerFingerprint",
      "payload closed schema",
      "primitive payload formats",
      "nested payload schemas",
      "FACT discriminator/value contract",
      "TARGET_SCOPE exact reuse of subject keySchemaByScope",
      "stable evidenceRefId values",
      "canonical evidenceRef ordering",
      "payload evidenceRefId references",
      "exact Git-tree repository evidence paths",
      "evidence locator security",
      "payloadFingerprint",
      "evidenceFingerprint",
      "complete authoritySnapshot",
      "authorityFingerprint",
      "complete relationships object",
      "typed relationship-edge matrix",
      "relationshipFingerprint",
      "temporal causal ordering",
      "validity order-independent parentEventIds DAG semantics",
      "lineage-effective validity",
      "semanticHash",
      "eventId",
      "eventHash",
      "maximumCanonicalEventBytes after final JCS serialization",
      "canonical persisted raw bytes"
    ],
    "anyFailure": "REJECT_EVENT_FAIL_CLOSED",
    "canonicalFileBytes": {
      "semanticEventHashInput": "RFC8785-JCS canonical UTF-8 bytes of the complete persisted event excluding eventHash",
      "eventHash": "lowercase SHA-256 hex over semanticEventHashInput",
      "persistedObject": "complete event including eventHash",
      "persistedSerialization": "RFC8785 JCS",
      "encoding": "UTF-8",
      "bomAllowed": false,
      "trailingNewlineAllowed": false,
      "leadingWhitespaceAllowed": false,
      "trailingWhitespaceAllowed": false,
      "readerRawByteVerification": "After validation and eventHash recomputation, reader MUST JCS-serialize the complete event including eventHash and require byte-for-byte equality with the physical file.",
      "rawByteMismatch": "REJECT_EVENT_FAIL_CLOSED"
    }
  },
  "writerContract": {
    "singleCanonicalWriterModule": true,
    "directProducerFilesystemWrites": false,
    "canonicalWriterComputesDerivedFingerprints": true,
    "canonicalWriterComputesEventId": true,
    "canonicalWriterAssignsRecordedAtForFirstCreate": true,
    "atomicExclusiveCreate": true,
    "partialFileAllowed": false,
    "existingEquivalentSemanticEvent": "IDEMPOTENT_NO_OP_RETURN_EXISTING_EVENT",
    "existingDifferentSemanticProjectionSameId": "FAIL_CLOSED_HASH_COLLISION_OR_CORRUPTION",
    "writerMayExecuteRepair": false,
    "writerMayChangeAuthority": false
  },
  "schemaEvolution": {
    "currentEventSchema": "ai-matchlab.operational-memory.event.v4",
    "immutableHistoricalSchemas": true,
    "inPlaceMigrationAllowed": false,
    "explicitSupportedSchemaAllowlist": true,
    "unknownSchema": "FAIL_CLOSED_OPERATIONALLY_AND_EXCLUDE_FROM_G7",
    "futureSchemasCoexist": true,
    "eventIdentityIncludesExactSchema": true,
    "historicalRewriteForUpgrade": false,
    "derivedIndexesDeclareSupportedSchemas": true,
    "preImplementationDraftBoundary": {
      "architectureContracts": [
        "v1",
        "v2",
        "v3",
        "v4",
        "v5",
        "v6",
        "v7",
        "v8",
        "v9",
        "v10"
      ],
      "statusBeforeArchitectureApproval": "NON_NORMATIVE_PREIMPLEMENTATION_DRAFT",
      "canonicalOperationalMemoryEventsWritten": 0,
      "canonicalNamespace": "data/operational-memory/events",
      "currentTreePathCountAtV8Revision": 0,
      "ancestryCommitCountTouchingNamespaceAtV8Revision": 0,
      "boundRemote": "19c23a061fd03a1cccae52119e676e136885cd1d",
      "sourceImplementationAuthorizedBeforeApproval": false,
      "dataSchemaApplicationAuthorizedBeforeApproval": false,
      "currentTreePathCountAtV9Revision": 0,
      "ancestryCommitCountTouchingNamespaceAtV9Revision": 0,
      "currentTreePathCountAtV10Revision": 0,
      "ancestryCommitCountTouchingNamespaceAtV10Revision": 0
    },
    "firstNormativeEventSchemaBinding": {
      "eventSchema": "ai-matchlab.operational-memory.event.v1",
      "becomesNormativeOnlyWhen": "G6_OPERATIONAL_MEMORY_ARCHITECTURE_APPROVAL status PASS",
      "architectureApprovalRequired": true,
      "implementationBeforeApprovalAllowed": false,
      "canonicalEventWriteBeforeApprovalAllowed": false,
      "interpretation": "The architecture contract that first passes the G6 Architecture Approval Gate defines the first normative semantics of operational-memory event.v1.",
      "priorDraftEventCompatibilityRequired": false,
      "reason": "No canonical operational-memory event records exist under any earlier draft semantics."
    },
    "priorCanonicalEventDetectionRule": "If any canonical operational-memory event is discovered to predate Architecture Approval, event.v1 MUST NOT be approved under the new semantics; the architecture must instead assign a new event schema version and define explicit migration/reader compatibility.",
    "approvalPrecondition": "Architecture Approval MUST independently re-check zero pre-approval canonical event history immediately before approval.",
    "supportedEventSchemas": [
      "ai-matchlab.operational-memory.event.v4"
    ],
    "eventV1Disposition": {
      "schema": "ai-matchlab.operational-memory.event.v1",
      "status": "FROZEN_HISTORICAL_NORMATIVE_DEFINITION_UNIMPLEMENTED",
      "architectureContract": "ai-matchlab.g6-operational-memory-architecture-contract.v10",
      "architectureContractSha256": "0F6FDE2F8F06A38E5C192A9619A0ECD9D7E3C8589D2CDB82F4C89C35A4E48062",
      "architectureApprovalSha256": "D2743DE5AA2FCE90AC73C8863E59323F7667D199A800D347B2857C9D371EE3C8",
      "immutable": true,
      "canonicalEventCount": 0,
      "historicalCanonicalEventCommitCount": 0,
      "I1SourceImplementationCount": 0,
      "writerSupported": false,
      "readerOperationallySupported": false,
      "G7Eligible": false,
      "migrationRequired": false,
      "reason": "event.v1 became normative at V10 architecture approval but its payloadFingerprint derivation was undefined. No canonical event or I1 implementation was created before the defect was discovered. The schema is frozen rather than redefined."
    },
    "eventV2NormativeBinding": {
      "eventSchema": "ai-matchlab.operational-memory.event.v2",
      "sourceSemantics": "V11 complete semantics plus mandatory event-schema version transition required by V11 independent review.",
      "payloadFingerprint": "sha256(canonicalJson(payload))",
      "becomesNormativeOnlyWhen": "G6_OPERATIONAL_MEMORY_ARCHITECTURE_CONTRACT_V12_APPROVAL status PASS",
      "architectureApprovalRequired": true,
      "implementationBeforeApprovalAllowed": false,
      "canonicalEventWriteBeforeApprovalAllowed": false,
      "migrationFromEventV1Required": false,
      "supportedAfterApproval": true,
      "eventIdentityIncludesExactSchema": true
    },
    "eventV2Disposition": {
      "eventSchema": "ai-matchlab.operational-memory.event.v2",
      "status": "FROZEN_HISTORICAL_NORMATIVE_DEFINITION_UNIMPLEMENTED_DUE_REGEX_CONTRADICTION",
      "boundArchitectureContractSha256": "08B7BCC5FDA90004F4D45AAF6759595AEDDFA5D20B3FDF4F30B048AE182371EC",
      "boundArchitectureApprovalSha256": "09393BE0CC93D17D9A66A24FDC53C293AD36D1F888504CDCFD7ACB47374104DE",
      "immutable": true,
      "canonicalEventCount": 0,
      "historicalCanonicalEventCommitCount": 0,
      "completedI1ImplementationCount": 0,
      "writerSupported": false,
      "readerOperationallySupported": false,
      "G7Eligible": false,
      "migrationRequired": false,
      "blockerId": "G6-I1-IMP-B02-PORTABLE-REGEX-GRAMMAR-NORMATIVE-PATTERN-CONTRADICTION",
      "inPlaceRepairAllowed": false
    },
    "eventV3NormativeBinding": {
      "eventSchema": "ai-matchlab.operational-memory.event.v3",
      "sourceArchitectureContract": "V13",
      "sourceRepairDecisionSha256": "381D6CAA7AA337F9D12796DFE8E2E4480DCA90A0F815654803153FA7E99C0736",
      "portableRegexRepair": "FOUR_LOWERCASE_HEX_CLASSES_REWRITTEN_WITH_EXPLICIT_LITERALS",
      "lowercaseHexLanguageChanged": false,
      "portableRegexDialectChanged": false,
      "payloadFingerprint": "sha256(canonicalJson(payload))",
      "eventId": "om1_<semanticHash>",
      "evidenceRefId": "ev1_<sha256(canonicalJson(evidenceReferenceIdentityProjection))>",
      "becomesNormativeOnlyWhen": "G6_OPERATIONAL_MEMORY_ARCHITECTURE_CONTRACT_V13_APPROVAL status PASS",
      "architectureApprovalRequired": true,
      "implementationBeforeApprovalAllowed": false,
      "canonicalEventWriteBeforeApprovalAllowed": false,
      "migrationRequired": false,
      "historicalRewriteRequired": false,
      "eventIdentityIncludesExactSchema": true,
      "supportedAfterApproval": true
    },
    "v13EventSchemaTransition": "NEW_EVENT_SCHEMA_NO_MIGRATION_REQUIRED",
    "eventV3Disposition": {
      "eventSchema": "ai-matchlab.operational-memory.event.v3",
      "status": "FROZEN_HISTORICAL_NORMATIVE_DEFINITION_IMPLEMENTED_NO_CANONICAL_EVENTS",
      "sourceArchitectureContract": "V13",
      "boundArchitectureContractSha256": "84067F618A5AFB4701B79511212066EC2DC0389EBE000A2B2902CBE1C67F0214",
      "boundArchitectureApprovalSha256": "E906A3669088A78036166E86AB866C456A11CD6FCE462D5F1EAF38596C872AFD",
      "immutable": true,
      "completedI1Implementation": true,
      "canonicalEventCount": 0,
      "historicalCanonicalEventCommitCount": 0,
      "writerSupportedAfterV14Approval": false,
      "readerOperationallySupportedAfterV14Approval": false,
      "G7EligibleAfterV14Approval": false,
      "inPlaceSemanticRepairAllowed": false,
      "migrationRequired": false,
      "historyRewriteRequired": false,
      "blockerId": "G6-I2-DESIGN-B01-VALIDITY-HEAD-CONCURRENCY-REPLAY-UNDERDEFINED",
      "reason": "event.v3 validity-head concurrency semantics are underdefined for reader-verifiable concurrent forks. The approved schema is frozen rather than redefined."
    },
    "eventV4NormativeBinding": {
      "eventSchema": "ai-matchlab.operational-memory.event.v4",
      "sourceArchitectureContract": "V14",
      "sourceRepairDecisionSha256": "CDF7336BB3DF513042B2C5ED4AD0A403FD16163EF27E3DAFBB8DF8913B8C4A85",
      "blockerId": "G6-I2-DESIGN-B01-VALIDITY-HEAD-CONCURRENCY-REPLAY-UNDERDEFINED",
      "selectedRepair": "ORDER_INDEPENDENT_VALIDITY_HEAD_DAG_V1",
      "validityControlSchema": "ai-matchlab.operational-memory.validity-control.v3",
      "eventId": "om1_<semanticHash>",
      "evidenceRefId": "ev1_<sha256(canonicalJson(evidenceReferenceIdentityProjection))>",
      "payloadFingerprint": "sha256(canonicalJson(payload))",
      "semanticIdentityProjectionFieldListChanged": false,
      "becomesNormativeOnlyWhen": "G6_OPERATIONAL_MEMORY_ARCHITECTURE_CONTRACT_V14_APPROVAL status PASS",
      "architectureApprovalRequired": true,
      "implementationBeforeApprovalAllowed": false,
      "canonicalEventWriteBeforeApprovalAllowed": false,
      "migrationRequired": false,
      "historicalRewriteRequired": false,
      "eventIdentityIncludesExactSchema": true,
      "supportedAfterApproval": true
    },
    "v14EventSchemaTransition": "NEW_EVENT_SCHEMA_NO_MIGRATION_REQUIRED"
  },
  "futureG7ReadContract": {
    "mayReadCanonicalEvents": true,
    "mayReadDerivedIndexes": true,
    "mayRewriteCanonicalEvents": false,
    "mayInferExecutionAuthority": false,
    "verifiedOutcomeRequiredForPositiveTraining": true,
    "invalidatedEventsEligibleForPositiveTraining": false,
    "unresolvedOutcomeEligibleForPositiveTraining": false,
    "unsupportedSchemaEligibleForTraining": false,
    "storageIntegrityFailureEligibleForTraining": false,
    "negativeExamplesRetained": true,
    "failedAttemptsRetained": true,
    "noOpAttemptsRetained": true,
    "rollbackCasesRetained": true
  },
  "blockerResolution": [
    {
      "id": "G6-CR-B09",
      "status": "RESOLVED_BY_V3",
      "resolution": "caseId now includes rootEffectiveAt, producing deterministic occurrence identity without dependency on eventId."
    },
    {
      "id": "G6-CR-B10",
      "status": "RESOLVED_BY_V3",
      "resolution": "producer now has a closed stable producerId/producerRole schema and event identity uses producerFingerprint."
    },
    {
      "id": "G6-CR-B11",
      "status": "RESOLVED_BY_V3",
      "resolution": "authoritySnapshot now requires the complete fixed boolean set, prohibits omission/null/extra fields and defines retry freeze semantics."
    },
    {
      "id": "G6-CR-B12",
      "status": "RESOLVED_BY_V3",
      "resolution": "relationships now use one complete closed object, all keys always present, null/empty rules and per-event non-null constraints."
    },
    {
      "id": "G6-CR-B13",
      "status": "RESOLVED_BY_V3",
      "resolution": "mutable execution attempts require historically compatible AUTHORIZED records with same case/subject, matching scope, operation and write constraints while current authority is still independently revalidated."
    },
    {
      "id": "G6-CR-B14",
      "status": "RESOLVED_BY_V3",
      "resolution": "VALIDITY_CHANGE is an explicit immutable eighth event type supporting INVALIDATE/REINSTATE without rewriting or deleting target events."
    },
    {
      "id": "G6-CR-B15",
      "status": "RESOLVED_BY_V3",
      "resolution": "evidence references now distinguish repository paths, absolute URIs and logical URIs with explicit canonicalization and identity rules."
    },
    {
      "id": "G6-CR-B16",
      "status": "RESOLVED_BY_V3",
      "resolution": "reusable closed nested schemas now define canonical path sets, target scopes, facts, metrics, verification checks, errors and authorization constraints."
    }
  ],
  "implementationBoundary": {
    "architectureContractApproved": false,
    "sourceImplementationAuthorized": false,
    "dataSchemaApplicationAuthorized": false,
    "producerIntegrationAuthorized": false,
    "workflowIntegrationAuthorized": false,
    "commitAuthorized": false,
    "pushAuthorized": false,
    "deployAuthorized": false,
    "implementationPathsAuthorized": []
  },
  "unresolvedImplementationSelections": [
    "Prove the exact repository canonical JSON/stable hashing utility against V3 rules.",
    "Prove atomic exclusive create semantics on the actual supported filesystem/runtime.",
    "Choose the closed-schema validator implementation.",
    "Define canonical event reader/validator before integrating any producer.",
    "Keep derived indexes out of scope until canonical event writer/reader is frozen."
  ],
  "nextGate": "G6_OPERATIONAL_MEMORY_ARCHITECTURE_CONTRACT_V14_EVENT_V4_REVIEW",
  "v4BlockerResolution": [
    {
      "id": "G6-CR-B04-R1",
      "status": "RESOLVED_BY_V4",
      "resolution": "Complete typed-edge matrix restored and extended to VALIDITY_CHANGE; unspecified non-null edge types are forbidden."
    },
    {
      "id": "G6-CR-B06-R1",
      "status": "RESOLVED_BY_V4",
      "resolution": "Originating OBSERVATION caseIdentity.rootEvidenceFingerprint is again required to equal its recomputed evidenceFingerprint."
    },
    {
      "id": "G6-CR-B17",
      "status": "RESOLVED_BY_V4",
      "resolution": "Validity concurrency now has deterministic multi-head conflict detection, fail-closed semantics and immutable merge resolution through complete parentEventIds head sets."
    },
    {
      "id": "G6-CR-B18",
      "status": "RESOLVED_BY_V4",
      "resolution": "TARGET_SCOPE uses exact canonical equality; authorization scope/constraints/operation/write-set/expiry algorithms are explicit."
    },
    {
      "id": "G6-CR-B19",
      "status": "RESOLVED_BY_V4",
      "resolution": "Global optional-field normalization now defines omission, null rejection, empty collections and explicit relationship exceptions before hashing."
    },
    {
      "id": "G6-CR-B20",
      "status": "RESOLVED_BY_V4",
      "resolution": "Previously unbound payload fields now reference exact closed nested schemas or exact primitive types."
    },
    {
      "id": "G6-CR-B21",
      "status": "RESOLVED_BY_V4",
      "resolution": "Lineage-effective validity explicitly propagates invalid/conflicted causal dependency state for operational and G7 eligibility without deleting history."
    },
    {
      "id": "G6-CR-B22",
      "status": "RESOLVED_BY_V4",
      "resolution": "Effective-time ordering is now explicit across all causal, authorization, execution, outcome, rollback, supersession and validity edges."
    },
    {
      "id": "G6-CR-B23",
      "status": "RESOLVED_BY_V4",
      "resolution": "canonicalJson is bound to RFC 8785 JCS after schema normalization and NFC preprocessing, with exact numeric/string/hash-byte rules."
    },
    {
      "id": "G6-CR-B24",
      "status": "RESOLVED_BY_V4",
      "resolution": "Evidence generatedAt, gitCommit, schema and absence representation now have exact identity-bearing canonical forms."
    }
  ],
  "subjectIdentity": {
    "schema": "ai-matchlab.operational-memory.subject.v2",
    "closedSchema": true,
    "requiredFields": [
      "scope",
      "key"
    ],
    "optionalFields": [],
    "scopeEnum": [
      "SYSTEM",
      "DAY",
      "MATCH",
      "ARTIFACT",
      "PIPELINE",
      "REPAIR_CLASS",
      "RELEASE"
    ],
    "keyType": "STRING",
    "keyNormalization": "Unicode NFC; no leading/trailing whitespace; non-empty",
    "perScopeCanonicalShape": {
      "SYSTEM": "{scope:'SYSTEM',key:'system'}",
      "DAY": "{scope:'DAY',key:'YYYY-MM-DD'}",
      "MATCH": "{scope:'MATCH',key:'<canonical-match-id>'}",
      "ARTIFACT": "{scope:'ARTIFACT',key:'<canonical-repository-path>'}",
      "PIPELINE": "{scope:'PIPELINE',key:'<stable-pipeline-id>'}",
      "REPAIR_CLASS": "{scope:'REPAIR_CLASS',key:'<stable-repair-class-id>'}",
      "RELEASE": "{scope:'RELEASE',key:'<lowercase-40-hex-git-sha>'}"
    },
    "redundantAliasFieldsAllowed": false,
    "subjectFingerprint": "sha256(canonicalJson(subject))",
    "readerMustRecomputeSubjectFingerprint": true,
    "keySchemaByScope": {
      "SYSTEM": {
        "type": "LITERAL",
        "value": "system"
      },
      "DAY": {
        "type": "CALENDAR_DAY"
      },
      "MATCH": {
        "type": "CANONICAL_MATCH_ID"
      },
      "ARTIFACT": {
        "type": "CANONICAL_REPOSITORY_PATH"
      },
      "PIPELINE": {
        "type": "STABLE_ID"
      },
      "REPAIR_CLASS": {
        "type": "STABLE_ID"
      },
      "RELEASE": {
        "type": "GIT_SHA1"
      }
    },
    "keyValidation": "The subject key MUST validate against the exact keySchemaByScope entry selected by subject.scope before subjectFingerprint calculation.",
    "subjectFingerprintFormat": "SHA256_HEX"
  },
  "primitiveTypes": {
    "STABLE_ID": {
      "jsonType": "string",
      "unicodeNormalization": "NFC",
      "minLength": 1,
      "maxLength": 128,
      "leadingTrailingWhitespaceAllowed": false,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$",
      "regexDialect": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1"
    },
    "SHORT_TEXT": {
      "jsonType": "string",
      "unicodeNormalization": "NFC",
      "minLength": 1,
      "maxLength": 2048,
      "leadingTrailingWhitespaceAllowed": false
    },
    "LONG_TEXT": {
      "jsonType": "string",
      "unicodeNormalization": "NFC",
      "minLength": 1,
      "maxLength": 8192,
      "leadingTrailingWhitespaceAllowed": false
    },
    "SHA256_HEX": {
      "jsonType": "string",
      "pattern": "^[0-9a-f]{64}$",
      "exactLength": 64,
      "regexDialect": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1"
    },
    "GIT_SHA1": {
      "jsonType": "string",
      "pattern": "^[0-9a-f]{40}$",
      "exactLength": 40,
      "regexDialect": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1"
    },
    "BOOLEAN": {
      "jsonType": "boolean"
    },
    "CALENDAR_DAY": {
      "jsonType": "string",
      "exactFormat": "YYYY-MM-DD",
      "regex": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$",
      "semanticValidation": "Must parse as an actual proleptic-Gregorian calendar date and round-trip to the identical YYYY-MM-DD value.",
      "regexDialect": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1"
    },
    "CANONICAL_MATCH_ID": {
      "jsonType": "string",
      "semanticSource": "Existing AI MatchLab canonical fixture/match identity; operational memory MUST NOT derive a competing match identity from names or scores.",
      "unicodeNormalization": "NFC",
      "minLength": 1,
      "maxLength": 256,
      "leadingTrailingWhitespaceAllowed": false,
      "regex": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$",
      "regexDialect": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1"
    },
    "CANONICAL_REPOSITORY_PATH": {
      "jsonType": "string",
      "repositoryRelative": true,
      "forwardSlashOnly": true,
      "leadingSlashAllowed": false,
      "backslashAllowed": false,
      "emptySegmentAllowed": false,
      "dotSegmentAllowed": false,
      "parentTraversalAllowed": false,
      "driveLetterAllowed": false,
      "unicodeNormalization": "NFC",
      "maximumBytesUtf8": 1024,
      "caseFoldingAllowed": false
    },
    "CANONICAL_TIMESTAMP": {
      "jsonType": "string",
      "exactFormat": "YYYY-MM-DDTHH:mm:ss.SSSZ",
      "requiredOffset": "Z",
      "fractionalDigits": 3,
      "roundTripRequired": true
    },
    "UNIT_TEXT": {
      "jsonType": "string",
      "unicodeNormalization": "NFC",
      "minLength": 1,
      "maxLength": 64,
      "leadingTrailingWhitespaceAllowed": false
    },
    "FINITE_NUMBER": {
      "jsonType": "number",
      "finiteOnly": true,
      "NaNAllowed": false,
      "positiveInfinityAllowed": false,
      "negativeInfinityAllowed": false,
      "representation": "IEEE754_BINARY64"
    },
    "stringLengthMetric": "UNICODE_SCALAR_VALUES_AFTER_NFC"
  },
  "resourceBounds": {
    "maximumCanonicalEventBytes": 262144,
    "maximumJsonNestingDepth": 20,
    "maximumObjectPropertiesPerObject": 128,
    "maximumGenericStringCodePoints": 8192,
    "maximumIdentifierCodePoints": 128,
    "maximumRepositoryPathBytesUtf8": 1024,
    "maximumUriBytesUtf8": 4096,
    "maximumEvidenceRefs": 64,
    "maximumParentEventIds": 64,
    "maximumFacts": 128,
    "maximumMetrics": 128,
    "maximumVerificationChecks": 128,
    "maximumErrors": 128,
    "maximumWriteSetPaths": 512,
    "maximumPreservationPaths": 512,
    "maximumStringSetItems": 256,
    "maximumOrderedSteps": 128,
    "enforcementTiming": "After safe parse/NFC normalization and schema-shape validation, before fingerprinting or persistence.",
    "violationHandling": "FAIL_CLOSED_NO_EVENT_WRITE",
    "maximumPhysicalInputBytes": 262144,
    "preParseReadBudgetBytes": 262144,
    "physicalInputEnforcement": "For file/byte input, reject from file metadata or bounded-read budget before JSON parsing if physical bytes exceed maximumPhysicalInputBytes.",
    "inMemoryProposalRule": "In-process object proposals without raw transport bytes are subject to nesting/property/string/cardinality limits during normalization and to maximumCanonicalEventBytes after JCS serialization.",
    "structuralBoundsStage": "After strict parse and NFC normalization, before semantic cross-reference resolution or hashing.",
    "canonicalEventByteBoundStage": "After complete persisted-event JCS serialization including eventHash, but before filesystem persistence.",
    "canonicalByteMeasurement": "Exact UTF-8 byte length of final RFC8785-JCS persisted serialization.",
    "boundedCanonicalSerialization": "JCS serialization MUST abort fail-closed once output exceeds maximumCanonicalEventBytes; an oversized complete buffer need not be retained.",
    "physicalAndCanonicalViolation": "FAIL_CLOSED_NO_EVENT_WRITE"
  },
  "v5BlockerResolution": [
    {
      "id": "G6-CR-B06-R2",
      "status": "RESOLVED_BY_V5",
      "resolution": "A closed subjectIdentity contract is restored with exactly {scope,key}, no redundant aliases, exact per-scope key semantics and recomputable subjectFingerprint."
    },
    {
      "id": "G6-CR-B25",
      "status": "RESOLVED_BY_V5",
      "resolution": "validityControl is replaced wholesale; VALIDITY_CHANGE succession now uses parentEventIds only and supersedesEventId is always null."
    },
    {
      "id": "G6-CR-B27",
      "status": "RESOLVED_BY_V5",
      "resolution": "Primitive type/format bindings are explicit for every field identified by the V4 review, including identifiers, text, Git SHA and state fingerprints."
    },
    {
      "id": "G6-CR-B28",
      "status": "RESOLVED_BY_V5",
      "resolution": "Positional evidence indexes are removed; evidenceRefId provides deterministic stable references and all payload evidence references validate against canonical envelope evidenceRefs."
    },
    {
      "id": "G6-CR-B29",
      "status": "RESOLVED_BY_V5",
      "resolution": "Canonical persisted event bytes are exact RFC8785 JCS UTF-8 without BOM or trailing newline, with mandatory raw-byte equality verification."
    },
    {
      "id": "G6-CR-B30",
      "status": "RESOLVED_BY_V5",
      "resolution": "Explicit event-byte, nesting, property, string and collection cardinality limits are enforced before hashing/persistence."
    },
    {
      "id": "G6-CR-B31",
      "status": "RESOLVED_BY_V5",
      "resolution": "REPOSITORY_PATH evidence requires a full bound Git commit and exact case-sensitive Git-tree path validation independent of host filesystem semantics."
    },
    {
      "id": "G6-CR-B32",
      "status": "RESOLVED_BY_V5",
      "resolution": "Canonical preprocessing now rejects duplicate raw keys, NFC-normalizes before schema/set processing, rejects post-NFC duplicates, then validates, normalizes, sorts and applies RFC8785 JCS."
    }
  ],
  "security": {
    "model": "FAIL_CLOSED_MINIMUM_NECESSARY_PERSISTENCE",
    "immutableRetentionRiskAcknowledged": true,
    "secretsAllowed": false,
    "credentialsAllowed": false,
    "authenticationTokensAllowed": false,
    "privateKeysAllowed": false,
    "sessionCookiesAllowed": false,
    "rawSensitiveRecordDuplicationAllowed": false,
    "evidenceReferencePreferred": true,
    "evidenceHashPreferred": true,
    "rawEvidenceEmbeddingAllowed": false,
    "forbiddenExactFieldNamesCaseInsensitive": [
      "password",
      "passwd",
      "apiKey",
      "api_key",
      "clientSecret",
      "client_secret",
      "accessToken",
      "access_token",
      "refreshToken",
      "refresh_token",
      "sessionToken",
      "session_token",
      "privateKey",
      "private_key",
      "cookie",
      "set-cookie"
    ],
    "prohibitedContentClasses": [
      "FORBIDDEN_STRUCTURAL_SECRET_FIELD",
      "FORBIDDEN_STRUCTURAL_SENSITIVE_RECORD_FIELD",
      "CREDENTIAL_BEARING_URI",
      "FREE_TEXT_SECRET_SCAN_MATCH"
    ],
    "locatorSecurity": {
      "uriUserInfoAllowed": false,
      "uriFragmentAllowed": false,
      "absoluteUriQueryAllowed": false,
      "credentialBearingUriAllowed": false
    },
    "validationTiming": "After strict parse/NFC normalization and before fingerprints, eventId computation or persistence.",
    "validationFailure": "FAIL_CLOSED_NO_EVENT_WRITE",
    "redactionTiming": "Any upstream redaction must occur before operational-memory proposal construction; canonical memory never stores the prohibited original and never mutates later to redact it.",
    "separatelyApprovedSensitiveDataException": "Requires a future explicit versioned architecture/security contract; no implicit exception exists in event.v4.",
    "canonicalRetention": "Indefinite create-only history unless a separately approved retention/erasure architecture explicitly supersedes this rule.",
    "sensitiveDataClassificationRules": {
      "fieldNameComparison": "ASCII_CASE_INSENSITIVE_AFTER_NFC",
      "recursivelyInspectEveryObjectProperty": true,
      "forbiddenSecretFieldNames": [
        "password",
        "passwd",
        "apiKey",
        "api_key",
        "clientSecret",
        "client_secret",
        "accessToken",
        "access_token",
        "refreshToken",
        "refresh_token",
        "sessionToken",
        "session_token",
        "privateKey",
        "private_key",
        "authorization",
        "proxy-authorization",
        "cookie",
        "set-cookie"
      ],
      "forbiddenSensitiveRecordFieldNames": [
        "social_security_number",
        "ssn",
        "passport_number",
        "national_id_number",
        "credit_card_number",
        "card_number",
        "cvv",
        "bank_account_number",
        "iban"
      ],
      "fieldNameMatchResult": "FAIL_CLOSED_NO_EVENT_WRITE",
      "unspecifiedSensitiveCategoryInference": "NOT_A_NORMATIVE_AUTOMATED_CLASSIFIER",
      "rule": "The normative automated privacy gate is exactly the structural field-name rules, URI rules and pinned free-text secret scanner defined by this contract. New sensitive-data categories require a future contract revision rather than producer-local inference."
    },
    "freeTextSecretScanner": {
      "scannerId": "AI_MATCHLAB_OM_SECRET_SCAN_V1",
      "version": 1,
      "inputDomain": "NFC-normalized Unicode scalar sequence for each JSON string value.",
      "comparisonAlphabet": "ASCII rules only; non-ASCII characters are preserved and never locale-case-folded.",
      "asciiCaseFold": "Map ASCII A-Z to a-z; all other Unicode scalar values unchanged.",
      "rules": [
        {
          "id": "PEM_PRIVATE_KEY",
          "algorithm": "ASCII_FOLDED_CONTAINS_ANY",
          "parameters": {
            "needles": [
              "-----begin private key-----",
              "-----begin rsa private key-----",
              "-----begin ec private key-----",
              "-----begin openssh private key-----"
            ]
          }
        },
        {
          "id": "SECRET_ASSIGNMENT",
          "algorithm": "KEYWORD_ASSIGNMENT_SECRET_RUN",
          "parameters": {
            "keywords": [
              "password",
              "passwd",
              "api_key",
              "apikey",
              "client_secret",
              "clientsecret",
              "access_token",
              "accesstoken",
              "refresh_token",
              "refreshtoken",
              "session_token",
              "sessiontoken"
            ]
          }
        },
        {
          "id": "BEARER_TOKEN",
          "algorithm": "ASCII_MARKER_TOKEN_RUN",
          "parameters": {
            "marker": "bearer "
          }
        },
        {
          "id": "GITHUB_TOKEN",
          "algorithm": "ASCII_PREFIX_TOKEN_RUN",
          "parameters": {
            "prefixes": [
              "ghp_",
              "gho_",
              "ghu_",
              "ghs_",
              "ghr_",
              "github_pat_"
            ]
          }
        },
        {
          "id": "AWS_ACCESS_KEY_ID",
          "algorithm": "ASCII_FIXED_TOKEN_WITH_BOUNDARIES",
          "parameters": {
            "prefix": "AKIA"
          }
        }
      ],
      "scannerPositiveHandling": "FAIL_CLOSED_NO_EVENT_WRITE",
      "scannerErrorHandling": "FAIL_CLOSED_NO_EVENT_WRITE",
      "unsupportedScannerVersionHandling": "FAIL_CLOSED_NO_EVENT_WRITE",
      "producerLocalExtraScanners": "MAY_REJECT_MORE_BUT_MUST_NOT_ACCEPT_AN_EVENT_REJECTED_BY_AI_MATCHLAB_OM_SECRET_SCAN_V1",
      "persistedScannerOutput": false,
      "asciiCaseFoldAlgorithm": {
        "operation": "ASCII_CASE_FOLD",
        "mapping": "For scalar U+0041..U+005A add 0x20; every other scalar is unchanged.",
        "localeSensitive": false
      },
      "machineOperations": {
        "ASCII_FOLDED_CONTAINS_ANY": {
          "inputTransform": "ASCII_CASE_FOLD",
          "scanOrder": "LEFT_TO_RIGHT_BY_UNICODE_SCALAR_INDEX",
          "needleComparison": "EXACT_SCALAR_SEQUENCE",
          "success": "ANY_NEEDLE_MATCHES_AT_ANY_START_INDEX"
        },
        "KEYWORD_ASSIGNMENT_SECRET_RUN": {
          "keywordComparison": "ASCII_CASE_FOLDED_EXACT",
          "keywordBoundaryRequired": false,
          "whitespaceBeforeDelimiterCodePoints": [
            9,
            32
          ],
          "whitespaceBeforeDelimiterMinimum": 0,
          "whitespaceBeforeDelimiterMaximum": 8,
          "delimiterCodePoints": [
            58,
            61
          ],
          "whitespaceAfterDelimiterCodePoints": [
            9,
            32
          ],
          "whitespaceAfterDelimiterMinimum": 0,
          "whitespaceAfterDelimiterMaximum": 8,
          "secretRunTerminatorCodePoints": [
            9,
            10,
            13,
            32
          ],
          "minimumSecretRunScalarCount": 8,
          "success": "A keyword occurrence followed by a permitted pre-delimiter span, one delimiter, a permitted post-delimiter span, then at least minimumSecretRunScalarCount consecutive scalars not present in secretRunTerminatorCodePoints."
        },
        "ASCII_MARKER_TOKEN_RUN": {
          "markerComparison": "ASCII_CASE_FOLDED_EXACT",
          "markerBoundaryRequired": false,
          "tokenAlphabet": "ASCII_A_Z_a_z_0_9_DOT_UNDERSCORE_TILDE_PLUS_SLASH_EQUALS_HYPHEN",
          "minimumTokenLength": 16,
          "tokenLengthMetric": "ASCII_CODE_POINTS",
          "success": "Marker followed immediately by a token run of at least minimumTokenLength using only tokenAlphabet."
        },
        "ASCII_PREFIX_TOKEN_RUN": {
          "prefixComparison": "ASCII_CASE_SENSITIVE_EXACT",
          "tokenAlphabet": "ASCII_A_Z_a_z_0_9_UNDERSCORE",
          "minimumTokenLength": 16,
          "success": "Any exact prefix followed immediately by at least minimumTokenLength tokenAlphabet characters."
        },
        "ASCII_FIXED_TOKEN_WITH_BOUNDARIES": {
          "prefixComparison": "ASCII_CASE_SENSITIVE_EXACT",
          "suffixAlphabet": "ASCII_A_Z_0_9",
          "exactSuffixLength": 16,
          "boundaryAlphabet": "ASCII_A_Z_a_z_0_9_UNDERSCORE",
          "leftBoundaryRule": "At start-of-string or previous scalar is not in boundaryAlphabet.",
          "rightBoundaryRule": "At end-of-string or following scalar is not in boundaryAlphabet.",
          "success": "Exact prefix plus exactSuffixLength suffix characters satisfying both boundary rules."
        }
      },
      "algorithmDispatch": "For each normalized string and each rule in rules array order, resolve rule.algorithm by exact key in machineOperations and execute that operation with rule.parameters. Unknown algorithms, missing required parameters or extra rule fields are scanner errors.",
      "ruleSchema": {
        "closed": true,
        "required": [
          "id",
          "algorithm",
          "parameters"
        ],
        "optional": [],
        "idType": "STABLE_ID",
        "algorithmEnum": [
          "ASCII_FOLDED_CONTAINS_ANY",
          "KEYWORD_ASSIGNMENT_SECRET_RUN",
          "ASCII_MARKER_TOKEN_RUN",
          "ASCII_PREFIX_TOKEN_RUN",
          "ASCII_FIXED_TOKEN_WITH_BOUNDARIES"
        ]
      },
      "matchingResult": "Scanner PASS only when all strings complete all rules without a match and without scanner error."
    },
    "prohibitedContentValidationAlgorithm": [
      "NFC-normalize property names and string values using canonical preprocessing rules",
      "recursively reject forbidden structural secret/sensitive field names using exact ASCII-case-insensitive comparison",
      "validate URI locators: userInfo/query/fragment/credential-bearing forms forbidden where declared",
      "run AI_MATCHLAB_OM_SECRET_SCAN_V1 over every normalized JSON string value",
      "fail closed on any structural match, scanner match, scanner error or unsupported scanner version",
      "only after PASS continue to identity fingerprints/eventId computation"
    ],
    "securityGateDeterminism": "Normative acceptance uses only exact contract rules above; heuristic producer-local DLP results cannot convert a normative FAIL into PASS."
  },
  "v6BlockerResolution": [
    {
      "id": "G6-CR-B33",
      "status": "RESOLVED_BY_V6",
      "resolution": "caseIdentity.subjectFingerprint is now required to equal envelope.subjectFingerprint byte-for-byte before caseId/eventId acceptance."
    },
    {
      "id": "G6-CR-B34",
      "status": "RESOLVED_BY_V6",
      "resolution": "Every non-root event must resolve exactly one ACTIVE canonical root OBSERVATION matching caseId, subject, rootEffectiveAt and rootEvidenceFingerprint; missing/multiple roots fail closed."
    },
    {
      "id": "G6-CR-B35",
      "status": "RESOLVED_BY_V6",
      "resolution": "Subject scope keys now have exact machine-validatable schemas, including existing canonical match identity, canonical repository path, stable IDs and full Git SHA."
    },
    {
      "id": "G6-CR-B36",
      "status": "RESOLVED_BY_V6",
      "resolution": "FACT, METRIC, ERROR_RECORD and VERIFICATION_PLAN remaining scalar fields now have exact primitive bindings; FACT.value is a discriminator-dependent closed union."
    },
    {
      "id": "G6-CR-B37",
      "status": "RESOLVED_BY_V6",
      "resolution": "Resource validation is split into pre-parse physical byte cap, normalized structural bounds and post-JCS canonical byte cap before persistence."
    },
    {
      "id": "G6-CR-B38",
      "status": "RESOLVED_BY_V6",
      "resolution": "A normative fail-closed security/privacy persistence contract now forbids credentials/tokens/private keys/raw sensitive duplication and requires validation before identity or persistence."
    },
    {
      "id": "G6-CR-B39",
      "status": "RESOLVED_BY_V6",
      "resolution": "caseType and triggerClass are bound to STABLE_ID; subject/root evidence fingerprints to SHA256_HEX; rootEffectiveAt to canonical timestamp and caseId to exact case2 SHA format."
    }
  ],
  "v7BlockerResolution": [
    {
      "id": "G6-CR-B40",
      "status": "RESOLVED_BY_V7",
      "resolution": "caseIdProjection now contains only actual bound projection members, with schema explicitly sourced from caseIdentity.schema and a closed exact projection object."
    },
    {
      "id": "G6-CR-B41",
      "status": "RESOLVED_BY_V7",
      "resolution": "Structural case-root anchoring is separated from current root validity. Non-root events remain structurally readable with an existing structural root set, while rootAggregateValidity affects lineage state and can be repaired through VALIDITY_CHANGE."
    },
    {
      "id": "G6-CR-B42",
      "status": "RESOLVED_BY_V7",
      "resolution": "TARGET_SCOPE now reuses the exact seven-scope machine-validatable subjectIdentity keySchemaByScope contract; descriptive keyRulesByScope are removed."
    },
    {
      "id": "G6-CR-B43",
      "status": "RESOLVED_BY_V7",
      "resolution": "Security validation now has deterministic recursive structural prohibitions, exact URI rules and pinned AI_MATCHLAB_OM_SECRET_SCAN_V1 semantics with fail-closed scanner handling."
    },
    {
      "id": "G6-CR-B44",
      "status": "RESOLVED_BY_V7",
      "resolution": "All character-count bounds now use Unicode scalar values after NFC across runtimes; explicitly byte-denominated limits continue to use UTF-8 bytes."
    }
  ],
  "v8BlockerResolution": [
    {
      "id": "G6-CR-B45",
      "status": "RESOLVED_BY_V8",
      "resolution": "caseIdProjectionObject is now a real closed structured six-key map; runtime hashing requires dereferenced caseIdentity field values and explicitly forbids hashing descriptor/source-binding strings."
    },
    {
      "id": "G6-CR-B46",
      "status": "RESOLVED_BY_V8",
      "resolution": "Target direct-validity computation now consumes every structurally valid canonical VALIDITY_CHANGE independently of that event's lineage/G7 state, preserving validity/root-conflict recovery liveness."
    },
    {
      "id": "G6-CR-B47",
      "status": "RESOLVED_BY_V8",
      "resolution": "V1-V8 are explicitly pre-implementation non-normative drafts until Architecture Approval; repository ancestry was verified to contain zero canonical operational-memory event records, and event.v1 becomes normative only at approval."
    },
    {
      "id": "G6-CR-B48",
      "status": "RESOLVED_BY_V8",
      "resolution": "Normative regexes are now governed by AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1; CALENDAR_DAY uses explicit ASCII digits and runtime-dependent shorthand classes are forbidden."
    }
  ],
  "v9BlockerResolution": [
    {
      "id": "G6-CR-B49",
      "status": "RESOLVED_BY_V9",
      "resolution": "AI_MATCHLAB_PORTABLE_ASCII_REGEX_V1 now has a complete restricted grammar covering atoms, ASCII classes/ranges, exact quantifiers, anchors, grouping, alternation, escaping, wildcards, flags and forbidden constructs."
    },
    {
      "id": "G6-CR-B50",
      "status": "RESOLVED_BY_V9",
      "resolution": "AI_MATCHLAB_OM_SECRET_SCAN_V1 rules are now closed machine-dispatched rule objects with exact scalar/ASCII algorithms, parameters, boundary semantics and fail-closed unknown-algorithm handling."
    },
    {
      "id": "G6-CR-B51",
      "status": "RESOLVED_BY_V9",
      "resolution": "Validity-head membership and succession are now bound exclusively to STRUCTURALLY_VALID_CANONICAL_VALIDITY_CHANGE, independent of lineage/G7/root-aggregate state."
    }
  ],
  "reviewReconciliation": {
    "diagnosticSha256": "61C3E2D6E0DDBD11286867E355CFAD74ADDB98F4C7C456E5CCAA21C7BD018AA2",
    "B52": {
      "originalFinding": "G6-CR-B52",
      "diagnosticSubcauseCount": 1,
      "exactPath": "$.canonicalization.regexDialect.completeGrammar.pattern",
      "pseudoPatternEncoding": {
        "tokenSequence": [
          "CARET",
          "SPACE",
          "sequence",
          "SPACE",
          "DOLLAR"
        ],
        "utf8Sha256": "3732fad749dbbd9b8fd7c0c2bb39da2aa151fcb286386da391bee9ecc4f4520f",
        "rawAnchoredStringPersisted": false
      },
      "disposition": "REAL_CONTRACT_DEFECT_REPAIRED_BY_V10"
    },
    "B53": {
      "originalFinding": "G6-CR-B53",
      "diagnosticSubcauseCount": 0,
      "missingOperations": 0,
      "unexpectedOperations": 0,
      "missingAlgorithmEnum": 0,
      "unexpectedAlgorithmEnum": 0,
      "ruleProblems": 0,
      "operationProblems": 0,
      "alphabetProblems": 0,
      "failClosedProblems": 0,
      "disposition": "RECONCILED_FALSE_POSITIVE_NO_CONTRACT_DEFECT",
      "scannerSemanticMutationRequired": false,
      "scannerSemanticMutationPerformed": false
    }
  },
  "v10BlockerResolution": [
    {
      "id": "G6-CR-B52",
      "status": "RESOLVED_BY_V10",
      "disposition": "REAL_DEFECT",
      "resolution": "Removed the undeclared anchored pseudo-pattern from grammar metadata and replaced it with structured non-regex top-level syntax metadata."
    },
    {
      "id": "G6-CR-B53",
      "status": "RECONCILED_BY_V10",
      "disposition": "FALSE_POSITIVE_NO_CONTRACT_DEFECT",
      "resolution": "Exact diagnostic proved zero scanner machine-contract subcauses; scanner semantics are preserved unchanged."
    }
  ],
  "payloadCanonicalization": {
    "schema": "ai-matchlab.operational-memory.payload-canonicalization.v1",
    "sourceField": "payload",
    "eventTypeSchemaSelection": "Select exactly the eventPayloadContracts entry matching envelope.eventType.",
    "inputDomain": "The complete event payload object after strict parse when applicable, Unicode NFC normalization, closed event-type payload schema validation, primitive validation, nested-schema validation, optional-field normalization, set-like array canonicalization, evidenceRefId reference normalization, structural/cardinality resource validation and the normative security/privacy gate.",
    "securityGateMustPassBeforeFingerprint": true,
    "validationMustCompleteBeforeFingerprint": true,
    "optionalFieldNormalizationMustCompleteBeforeFingerprint": true,
    "setLikeArrayCanonicalizationMustCompleteBeforeFingerprint": true,
    "payloadEvidenceReferenceNormalizationMustCompleteBeforeFingerprint": true,
    "canonicalSerialization": "RFC8785_JCS_AFTER_SCHEMA_NORMALIZATION_AND_NFC",
    "fingerprint": "sha256(canonicalJson(payload))",
    "hashAlgorithm": "SHA-256",
    "hashInput": "Exact UTF-8 bytes of RFC8785-JCS serialization of the complete normalized payload object.",
    "digestEncoding": "lowercase hexadecimal",
    "fingerprintFormat": "SHA256_HEX",
    "writerBehavior": "Canonical writer derives payloadFingerprint from the normalized validated payload; producer-supplied payloadFingerprint is not trusted as authority.",
    "readerBehavior": "Reader independently recomputes payloadFingerprint from the normalized validated persisted payload and requires byte-exact equality with envelope.payloadFingerprint.",
    "mismatchHandling": "REJECT_EVENT_FAIL_CLOSED",
    "semanticIdentityBinding": "The recomputed payloadFingerprint is the payload-derived member used by identity.semanticIdentityProjectionFields.",
    "collisionHandling": "If two byte-distinct canonical payload serializations produce the same payloadFingerprint in a context where identity equality would otherwise depend on that fingerprint, treat as HASH_COLLISION_OR_CORRUPTION and fail closed.",
    "computationOrder": [
      "validate and normalize payload under the exact eventType payload contract",
      "run all normative security/privacy persistence checks",
      "apply all field-specific canonicalization and set/reference normalization",
      "RFC8785-JCS serialize the complete normalized payload object",
      "SHA-256 hash the exact UTF-8 JCS bytes",
      "encode digest as lowercase hexadecimal",
      "bind result as envelope.payloadFingerprint",
      "only then compute semanticIdentityProjection, semanticHash and eventId"
    ],
    "filesystemAccessRequired": false,
    "clockAccessRequired": false,
    "randomnessRequired": false,
    "networkAccessRequired": false
  },
  "v11CompatibilityDisposition": {
    "classification": "PREIMPLEMENTATION_NORMATIVE_COMPLETION",
    "eventSchemaProposed": "ai-matchlab.operational-memory.event.v1",
    "eventSchemaBumpProposed": false,
    "rationale": "V10 required payloadFingerprint in the envelope, semantic identity and reader recomputation contract but supplied no derivation. V11 defines the previously missing derivation before any canonical event or I1 source implementation exists; it does not replace an existing defined payloadFingerprint algorithm.",
    "canonicalEventsBeforeV11Revision": 0,
    "sourceImplementationBeforeV11Revision": false,
    "persistedCompatibilityBurdenExists": false,
    "existingDefinedFingerprintAlgorithmChanged": false,
    "independentReviewMustConfirmClassification": true,
    "architectureReapprovalRequired": true,
    "failClosedIfAnyPreV11CanonicalEventIsDiscovered": true,
    "discoveryFailureDisposition": "STOP_AND_REVISIT_EVENT_SCHEMA_VERSION_BEFORE_IMPLEMENTATION"
  },
  "v11BlockerResolution": [
    {
      "id": "G6-I1-IMP-B01-PAYLOAD-FINGERPRINT-DERIVATION-UNDEFINED",
      "status": "RESOLVED_BY_V11_PROPOSED_PENDING_REVIEW",
      "diagnosticSha256": "1A2FF4E016B17951355CD434AE781A7D83A09ABC7ECD442D12B608523F80E303",
      "resolution": "Define payloadFingerprint as lowercase SHA-256 over the exact UTF-8 RFC8785-JCS serialization of the complete normalized, validated and security-approved event payload object.",
      "normativeFormula": "sha256(canonicalJson(payload))",
      "changesSemanticIdentityProjectionMembership": false,
      "changesEventEnvelopeFields": false,
      "changesEventTypes": false,
      "changesExistingDefinedFingerprintAlgorithms": false
    }
  ],
  "v12EventSchemaTransition": {
    "classification": "NEW_EVENT_SCHEMA_NO_MIGRATION_REQUIRED",
    "reviewBlocker": "G6-V11-R-B01-EVENT-V1-POST-APPROVAL-NORMATIVE-REDEFINITION",
    "V11ReviewSha256": "E02CA3EE8B6AFEE54914FD0E581D936AE48463B412CCCFD5A3417449ABAB9CA0",
    "priorNormativeSchema": "ai-matchlab.operational-memory.event.v1",
    "newCandidateSchema": "ai-matchlab.operational-memory.event.v2",
    "priorSchemaRedefined": false,
    "priorSchemaFrozen": true,
    "canonicalV1EventsExist": false,
    "I1V1ImplementationExists": false,
    "migrationRequired": false,
    "historyRewriteRequired": false,
    "eventIdPrefixChanged": false,
    "eventIdPrefix": "om1_",
    "schemaParticipatesInSemanticIdentity": true,
    "payloadFingerprintFormula": "sha256(canonicalJson(payload))",
    "retainedPayloadFormulaFromV11": true
  },
  "v12BlockerResolution": [
    {
      "id": "G6-V11-R-B01-EVENT-V1-POST-APPROVAL-NORMATIVE-REDEFINITION",
      "status": "RESOLVED_BY_V12_PROPOSED_PENDING_REVIEW",
      "resolution": "Freeze approved event.v1 without reinterpretation and assign the completed operational-memory semantics to new schema ai-matchlab.operational-memory.event.v2.",
      "migrationRequired": false,
      "eventV1Rewritten": false,
      "newEventSchema": "ai-matchlab.operational-memory.event.v2"
    }
  ],
  "v12V11CompatibilityProposalDisposition": {
    "V11Classification": "PREIMPLEMENTATION_NORMATIVE_COMPLETION",
    "V11EventSchemaProposal": "ai-matchlab.operational-memory.event.v1",
    "V11NoSchemaBumpProposalAccepted": false,
    "rejectionReason": "V11 independent review proved event.v1 was already normative and immutable after V10 approval.",
    "replacement": "ai-matchlab.operational-memory.event.v2"
  },
  "supersedesArchitectureContract": {
    "contract": "V13",
    "sha256": "84067F618A5AFB4701B79511212066EC2DC0389EBE000A2B2902CBE1C67F0214",
    "approvalSha256": "E906A3669088A78036166E86AB866C456A11CD6FCE462D5F1EAF38596C872AFD",
    "reason": "Approved event.v3 is immutable and its validity-head protocol cannot reader-verify explicitly permitted concurrent forks without order-dependent implementation-local state."
  },
  "repairDecisionBinding": {
    "diagnosticSha256": "9B666E967B13A0BB968F04E8612C0FC58C408C29A8748DB40F73983058A4493E",
    "decisionSha256": "CDF7336BB3DF513042B2C5ED4AD0A403FD16163EF27E3DAFBB8DF8913B8C4A85",
    "blockerId": "G6-I2-DESIGN-B01-VALIDITY-HEAD-CONCURRENCY-REPLAY-UNDERDEFINED",
    "selectedRepair": "ORDER_INDEPENDENT_VALIDITY_HEAD_DAG_V1",
    "repairOrderIndependent": true,
    "readerVerifiableFromImmutableGraph": true,
    "priorEventSchema": "ai-matchlab.operational-memory.event.v3",
    "proposedEventSchema": "ai-matchlab.operational-memory.event.v4",
    "migrationRequired": false,
    "historyRewriteRequired": false
  },
  "v13Revision": {
    "classification": "TARGETED_EVENT_V3_REGEX_CONTRADICTION_REPAIR",
    "priorNormativeSchema": "ai-matchlab.operational-memory.event.v2",
    "proposedNormativeSchema": "ai-matchlab.operational-memory.event.v3",
    "exactNormativePatternReplacementCount": 4,
    "replacedHexClass": "[0-9a-f]",
    "replacementHexClass": "[0-9abcdef]",
    "acceptedHexLanguageChanged": false,
    "portableRegexDialectChanged": false,
    "parserRelaxationAllowed": false,
    "migrationRequired": false,
    "historyRewriteRequired": false,
    "eventIdPrefixChanged": false,
    "evidenceRefIdPrefixChanged": false,
    "payloadFingerprintFormulaChanged": false
  },
  "v14Revision": {
    "classification": "TARGETED_EVENT_V4_VALIDITY_HEAD_CONCURRENCY_REPAIR",
    "blockerId": "G6-I2-DESIGN-B01-VALIDITY-HEAD-CONCURRENCY-REPLAY-UNDERDEFINED",
    "diagnosticSha256": "9B666E967B13A0BB968F04E8612C0FC58C408C29A8748DB40F73983058A4493E",
    "repairDecisionSha256": "CDF7336BB3DF513042B2C5ED4AD0A403FD16163EF27E3DAFBB8DF8913B8C4A85",
    "priorNormativeSchema": "ai-matchlab.operational-memory.event.v3",
    "proposedNormativeSchema": "ai-matchlab.operational-memory.event.v4",
    "selectedRepair": "ORDER_INDEPENDENT_VALIDITY_HEAD_DAG_V1",
    "validityControlRevision": "v2_to_v3",
    "orderIndependent": true,
    "recordedAtParticipates": false,
    "arrivalOrderParticipates": false,
    "arbitraryWinnerAllowed": false,
    "concurrentForkRecordedAsConflict": true,
    "staleIndistinguishableProposalRecordedAsConflict": true,
    "multipleHeadsState": "CONFLICTED",
    "repairLivenessPreserved": true,
    "staleGraphIntegrityValidityClauseReplaced": true,
    "eventV3Frozen": true,
    "eventV3CanonicalEventCount": 0,
    "eventV3HistoricalCanonicalEventCommitCount": 0,
    "migrationRequired": false,
    "historyRewriteRequired": false,
    "eventIdPrefixChanged": false,
    "evidenceRefIdPrefixChanged": false,
    "payloadFingerprintFormulaChanged": false,
    "semanticIdentityProjectionFieldListChanged": false,
    "architectureApprovalRequired": true,
    "I1EventV4KernelRevisionRequiredAfterApproval": true,
    "I2DesignBlockedUntilEventV4KernelSupport": true
  }
};

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

export const APPROVED_ARCHITECTURE_CONTRACT_SHA256 = "CC08A192AF29D07EA3F5B0F1F33F8CECCEA85C2E21707B83FA85EDC1668A0786";
export const APPROVED_ARCHITECTURE_APPROVAL_SHA256 = "ED4F284F1CC48252464A286E064048888056A918EFCBB9B4FFBE2734E1300574";
export const OPERATIONAL_MEMORY_EVENT_SCHEMA = "ai-matchlab.operational-memory.event.v4";
export const OPERATIONAL_MEMORY_CASE_SCHEMA = CONTRACT_DATA.caseIdentity.schema;
export const OPERATIONAL_MEMORY_PRODUCER_SCHEMA = CONTRACT_DATA.producerIdentity.schema;
export const OPERATIONAL_MEMORY_SUBJECT_SCHEMA = CONTRACT_DATA.subjectIdentity.schema;
export const OPERATIONAL_MEMORY_RELATIONSHIPS_SCHEMA = CONTRACT_DATA.relationshipCanonicalization.schema;
export const OPERATIONAL_MEMORY_AUTHORITY_SCHEMA = CONTRACT_DATA.authoritySnapshotCanonicalization.schema;
export const EVENT_ID_PREFIX = "om1_";
export const EVIDENCE_REF_ID_PREFIX = "ev1_";
export const CASE_ID_PREFIX = "case2_";
export const PAYLOAD_FINGERPRINT_FORMULA = "sha256(canonicalJson(payload))";
export const EVENT_TYPES = deepFreeze(Object.keys(CONTRACT_DATA.eventPayloadContracts));
export const NORMATIVE_REGEX_PATTERNS = deepFreeze(CONTRACT_DATA.canonicalization.normativeRegexPatterns);
export const RESOURCE_BOUNDS = deepFreeze(CONTRACT_DATA.resourceBounds);
export const SECURITY_CONTRACT = deepFreeze(CONTRACT_DATA.security);
export const EVENT_ENVELOPE_FIELDS = deepFreeze([...CONTRACT_DATA.eventEnvelope.requiredFields]);
export const EVENT_PAYLOAD_CONTRACTS = deepFreeze(CONTRACT_DATA.eventPayloadContracts);
export const NESTED_PAYLOAD_SCHEMAS = deepFreeze(CONTRACT_DATA.nestedPayloadSchemas);
export const RELATIONSHIP_CONTRACT = deepFreeze(CONTRACT_DATA.relationshipCanonicalization);
export const AUTHORITY_SNAPSHOT_CONTRACT = deepFreeze(CONTRACT_DATA.authoritySnapshotCanonicalization);
export const PRODUCER_IDENTITY_CONTRACT = deepFreeze(CONTRACT_DATA.producerIdentity);
export const SUBJECT_IDENTITY_CONTRACT = deepFreeze(CONTRACT_DATA.subjectIdentity);
export const CASE_IDENTITY_CONTRACT = deepFreeze(CONTRACT_DATA.caseIdentity);
export const EVIDENCE_CANONICALIZATION_CONTRACT = deepFreeze(CONTRACT_DATA.evidenceCanonicalization);
export const IDENTITY_CONTRACT = deepFreeze(CONTRACT_DATA.identity);
export const TEMPORAL_CANONICALIZATION_CONTRACT = deepFreeze(CONTRACT_DATA.temporalCanonicalization);
export const PRIMITIVE_TYPES = deepFreeze(CONTRACT_DATA.primitiveTypes);
export const OPERATIONAL_MEMORY_CONTRACT = deepFreeze(CONTRACT_DATA);
