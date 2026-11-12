# Skill Repository Release Checklist

- [ ] `npm run validate` passes (JSON, syntax, links, versions, agents, secrets)
- [ ] `npm run selftest` executed; failures fixed or skipped tests recorded in docs/verification-report.md
- [ ] VERSION.md, package.json and CHANGELOG.md agree
- [ ] docs/version-history.md reflects real capability changes only
- [ ] MCP examples clearly marked as examples; no keys in any config
- [ ] `npm run package` produced dist/*.zip and .sha256
- [ ] ZIP contains no node_modules, clone-workspace, .auth, .env
