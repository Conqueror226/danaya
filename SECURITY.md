# Security boundary

Danaya 0.2 is a technical pilot for fictitious-data evaluation. It must not be presented as an approved national EMR, clinically validated product or legally certified health-data service.

Implemented: server-side account sessions; salted scrypt hashes; account revocation; exact-origin write protection; facility isolation; role-specific clinical reads and transitions; optimistic updates; no browser localStorage of records/tokens; same-origin gateway; no published database/API ports; configurable HTTPS; request bounds; scoped audit events.

Before real health data: appoint the accountable operator, validate the applicable legal basis and data residency/retention obligations, complete a privacy impact review, enforce appropriate MFA and care-team access, define consent withdrawal/emergency access/minor representation, support clinical amendments and reconciliation, configure encrypted storage and off-host backups, test restores and incidents, and commission independent security, clinical and accessibility reviews. A consent checkbox alone is not a complete legal basis or consent lifecycle.

Operator database access is highly privileged. Audit rows are not externally tamper-evident. Docker volumes are not automatically encrypted. No cross-server offline synchronization, automated clinical decisions, medication interaction checking or general retry deduplication is provided.

Report vulnerabilities privately through the repository owner's approved security reporting channel. Do not put credentials, live patient data, database dumps or exploitable deployment details into public issues. If old prototype credentials were used outside demonstrations, rotate them: removing them from the current tree does not erase repository history.
