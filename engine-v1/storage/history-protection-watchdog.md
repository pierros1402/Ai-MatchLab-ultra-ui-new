# Automatic history protection check

The existing Publication rollover watchdog runs the history check in a separate
job on its existing half-hour cadence. Publication failure cannot skip the check.
No new schedule, provider requests, forecast execution or Render service is added.
The controller's synthetic safety tests run before every scheduled check; their
failure prevents its automatic action. They do not access providers or execute models.

The check reads an immutable archive commit, validates its small checkpoint
locator and checks that the referenced manifest is available. This is a metadata
availability check, **not** a new full payload verification. A successful run of
`history-preservation-canary.yml` supplies the separate full restoration proof.
That existing workflow captures current bytes, checks all content hashes, restores
to a new temporary directory and never runs a prediction model or publishes a day.

Expected limits:

- Latest archive capture: at most three hours old.
- Successful full restore drill: started within the last 24 hours.
- Failed/recent drill: six-hour cooldown before another request.
- Active drill: no duplicate request; after 45 minutes report a blocked check.
- Incomplete API listing, malformed identity or future clock: fail closed.

When a drill is overdue, or the archive is stale/missing, the only automatic
write is a dispatch of the existing canary on main for Athens today. A successful
dispatch is reported as `RESTORE_REQUESTED`, never `HEALTHY`. The next scheduled
observation must independently see the successful completed drill. Persistent
failure produces a failing watchdog job and its GitHub summary; no issue, email
or third-party message is sent by this controller. Existing writer serialization
and the six-hour cooldown prevent repeated concurrent recovery requests.

This deliberately does not activate the broader disabled autonomous repair kernel,
change A/A2/B/B2 or U1 rules, replay a past model, change frozen predictions, or
overwrite an old checkpoint. A new canary cannot recover bytes that disappeared
before capture; it must not be presented as proof that every producer input was
saved. Provider outages, incorrect/ambiguous identity and missing original inputs
remain explicit gaps. Existing allowlisted data repairs retain their existing
verification and rollback rules and are not newly authorized by this controller.

The GitHub archive and the independent local verified mirror remain separate
copies. Private workflow logs stay in the local private collector. That collector
still needs the PC/account/network available before GitHub retention expires.
GitHub outage or delayed scheduling can also delay this check; there is no claim
of zero possible future loss or of an independent always-online private log copy.
