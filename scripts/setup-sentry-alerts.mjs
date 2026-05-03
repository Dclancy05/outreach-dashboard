#!/usr/bin/env node
// Wave 3.6 — push sentry/alerts.yml into Sentry via API.
//
// Sentry doesn't natively read alert configs from a repo. This script
// reads sentry/alerts.yml, finds existing alert rules with the same name,
// and PUTs each rule (or POSTs a new one).
//
// Usage:
//   SENTRY_AUTH_TOKEN=... SENTRY_ORG_SLUG=... node scripts/setup-sentry-alerts.mjs
//
// Note: telegram action requires a Sentry → Telegram integration to be
// installed in the org first. This script doesn't install integrations;
// it only creates rules that reference them.

import fs from "node:fs";
import yaml from "js-yaml";

const TOKEN = process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG_SLUG;
if (!TOKEN || !ORG) {
  console.error("Missing SENTRY_AUTH_TOKEN or SENTRY_ORG_SLUG");
  process.exit(1);
}

const cfg = yaml.load(fs.readFileSync("sentry/alerts.yml", "utf8"));
if (!cfg?.alerts?.length) {
  console.error("No alerts in sentry/alerts.yml");
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`https://sentry.io/api/0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Sentry API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

for (const alert of cfg.alerts) {
  const project = alert.project_slug;
  console.log(`→ ${alert.name} (project=${project})`);
  const existing = await api(`/projects/${ORG}/${project}/rules/`);
  const found = existing.find((r) => r.name === alert.name);
  const body = {
    name: alert.name,
    actionMatch: "all",
    filterMatch: "all",
    conditions: alert.conditions || [],
    filters: alert.filters || [],
    actions: alert.actions || [],
    frequency: 30,
  };
  if (found) {
    await api(`/projects/${ORG}/${project}/rules/${found.id}/`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    console.log(`   ↻ updated rule ${found.id}`);
  } else {
    const created = await api(`/projects/${ORG}/${project}/rules/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`   ✓ created rule ${created.id}`);
  }
}
console.log("Done.");
