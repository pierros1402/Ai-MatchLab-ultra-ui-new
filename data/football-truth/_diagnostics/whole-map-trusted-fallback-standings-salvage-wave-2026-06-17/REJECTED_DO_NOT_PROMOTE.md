# Rejected: trusted fallback standings salvage wave

This lane must not be promoted to canonical candidates.

Reason:
- The wave produced only 7 acceptedGenericRowsCompetitionCount from 90 fetched targets.
- Accepted rows include obvious competition/url contamination, e.g. multiple unrelated slugs resolving to `footystats.org/albania/first-division`.
- The extraction accepted generic HTML tables without strict competition identity validation.
- This confirms that noisy fallback provider signals are unsafe without slug/name/country validation.

Allowed future use:
- Diagnostic evidence only.
- May be used to design a stricter validator.
- Must not be used for canonical candidate write, production write, or truth assertion.

Required next strategy:
- Stop official-route/noisy fallback as primary path.
- Pivot to provider-family bulk extraction with strict identity validation, or to a structured sports-data provider/API.
