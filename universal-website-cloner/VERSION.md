# Version

**Release:** 1.0.0
**Capability level:** V12
**Date:** 2026 (first consolidated release)

## How versioning works here
- **Release number** (semver, `package.json`): the packaged repository. This is the first release, so it is 1.0.0.
- **Capability levels V1–V12**: milestones describing *what the system can do*, developed and consolidated together in this release. They are not separate folders or copies. Each level lists concrete files and verification in [docs/version-history.md](docs/version-history.md).
- No earlier version existed in the workspace when this repository was created, so nothing was inherited or migrated.

## Next release rules
Bump the release only for real changes (see [CHANGELOG.md](CHANGELOG.md)); add a capability level only when it adds a new capability with implementation, docs and validation.
