# MajesticToolkit 1.6.3 — Punishment Overlay

- Open the floating MT panel on a permitted XenForo forum, then select **Наказания**, use **Alt+Shift+P**, or the `punishments` command in Navigation 2.0.
- Search the active profile's Rules Database by code, title, aliases and text; filter by category, sanction type, favorites or recently opened rules. Open the original source, read conditions, and switch to a linked Binder 2.0 template.
- Select one sanction per rule and enter a value within the stored range. Fixed values and unitless sanctions such as WARN are supported. The background independently validates the current revision and selected value.
- Save up to 40 selected rules in each thread draft. Up to 50 recent non-empty thread drafts per profile are retained locally. Pagination and URL fragments share the same thread ID. Reopening a thread restores its draft. Old revisions and archived rules cannot be previewed or inserted until selected again; remove stale entries first.
- Preview, copy, or explicitly confirm insertion of a plain-text draft in the current forum editor. Nothing is posted or applied automatically. Multiple sanctions are not summed or converted; the calculator and policy engine are planned for 1.6.4.
- Rules and sanctions are supplied by the user's existing database, including imported `binds_and_links.json`. Imported rules remain unverified. No new permissions or network services. The overlay can be disabled per forum or profile in Forum Core settings. It shares the existing panel placement, appearance and density.
- Backup v15 remains compatible. Rule data and overlay settings are exported; temporary thread drafts remain local to the installation and are not included in backups. Clear the draft from its panel or remove its profile to delete it.

## Verification

`npm run verify` checks the unit suite, four browser builds, manifests, packages and SHA-256. `npm run test:browser` runs deterministic Chromium XenForo DOM fixtures with mocked WebExtension transport (optional Firefox via `MAJESTIC_E2E_BROWSERS`). Real authenticated sites and signed Safari/device installation require separate validation.
