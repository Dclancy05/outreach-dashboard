# Importing Accounts

Account credentials (usernames, passwords, 2FA seeds, cookies, email passwords) must NEVER be committed to this repository. The previous `import-accounts.sql` and `accounts-data.json` files were removed in the credential-purge commit and the git history for those blobs should be filter-repo'd separately.

To import a fresh set of accounts into the `outreach_accounts` table, either (a) use the Supabase dashboard CSV upload UI at `https://supabase.com/dashboard/project/<ref>/editor` and map the columns against `scripts/accounts-data.example.json`, or (b) run a one-off local script that reads from `scripts/accounts-data.local.json` — that filename is gitignored, so credentials stay on your machine. The shape to populate is documented in `accounts-data.example.json`; all fields are strings except `identity_group` (integer). After import, verify with `SELECT count(*), platform FROM outreach_accounts GROUP BY platform;`.
