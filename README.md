# EvidenceDesk

A deterministic compliance evidence assistant for Jira, powered by Atlassian Forge and Rovo.

## Problem

Audit evidence collection across Jira, Confluence, and Bitbucket is manual, time-consuming, and error-prone. Teams often spend hours sampling tickets, checking fields, and assembling links for SOC 2 and ISO 27001 audits.

## What It Does

EvidenceDesk pairs an Atlassian Rovo agent with deterministic Forge action handlers:

- The Rovo agent invokes the `check-control` Forge action rather than guessing compliance status.
- Each control evaluates live product data in code and returns a structured result containing:
  - `status`: `pass`, `fail`, or `missing_evidence`
  - `checked`: number of items evaluated
  - `reason`: deterministic summary of the outcome
  - `failures`: non-compliant items with issue keys, reasons, and direct URLs
  - `evidence`: evaluated items with clickable evidence links
- The Rovo agent explains the structured result in plain language with issue links, without inventing data.

## Controls

### Implemented

Registered in [`src/controls/registry.js`](src/controls/registry.js):

- **C1** ([`src/controls/c1-done-assignee-resolution.js`](src/controls/c1-done-assignee-resolution.js)): Every Jira issue in `statusCategory = Done` has an assignee and a resolution.
- **C2** ([`src/controls/c2-policy-review-date.js`](src/controls/c2-policy-review-date.js)): Confluence pages labeled `policy` (queried via CQL `label = "policy" AND type = page`) have a latest version date within 365 days.
- **C3** ([`src/controls/c3-traceability.js`](src/controls/c3-traceability.js)): Done Jira issues of type `Change`, `Task`, or `Story` have at least one issue link or remote link.
- **C4** ([`src/controls/c4-segregation-of-duties.js`](src/controls/c4-segregation-of-duties.js)): Assigned Done Jira issues of type `Change` have distinct assignee and reporter accounts.
- **C5** ([`src/controls/c5-timeliness.js`](src/controls/c5-timeliness.js)): Resolved Jira `Bug` issues with priority `Highest` or `Critical` are resolved within 7 days.

### Implemented Features

- Single-control compliance check (`check-control`)
- Full parallel compliance audit (`run-audit`) with per-control error isolation
- Timestamped Confluence Audit Evidence Pack page generation (`generate-evidence-pack`)

### Planned

- Teamwork Graph write-back
- Atlassian MCP server integration

## Architecture

- **Forge app** (`manifest.yml`):
  - `rovo:agent` module (`EvidenceDesk`) with instructions to call `check-control` for single controls, `run-audit` for full audit readiness checks, or `generate-evidence-pack` to publish a Confluence evidence pack
  - `action` modules: `check-control` (`checkControl`), `run-audit` (`runAudit`), and `generate-evidence-pack` (`generateEvidencePack`) in `src/index.js`
  - Shared audit runner (`src/audit.js`) and Confluence evidence pack builder (`src/evidence-pack.js`)
  - Minimal scopes: `read:jira-work`, `search:confluence`, `read:page:confluence`, `read:space:confluence`, `write:page:confluence`
- **Modular controls** (`src/controls/`):
  - `src/controls/types.js`: shared result shape (`ControlResult`) and `buildControlResult` helper
  - `src/controls/jira-client.js`: shared Jira REST API v3 search/pagination and site URL helper
  - `src/controls/registry.js`: control lookup registry (`getControl`, `listControlIds`, `listControls`)
  - One file per control under `src/controls/` (`C1`–`C5`)

## Tech

- Atlassian Forge (`@forge/api`)
- Atlassian Rovo (`rovo:agent`)
- Jira Cloud REST API v3 (`/rest/api/3/search/jql`, `/rest/api/3/serverInfo`, `/rest/api/3/issue/{key}/remotelink`)
- Confluence Cloud REST API (`/wiki/rest/api/search` CQL, `/wiki/api/v2/spaces`, `/wiki/api/v2/pages`)
- Node.js

## Setup

Prerequisites: Node.js and an Atlassian Cloud site with Jira and Rovo enabled.

```bash
# 1. Install dependencies
npm install

# 2. Install Forge CLI and log in
npm install -g @forge/cli
forge login

# 3. Deploy and install to your Jira site
forge deploy -e development
forge install --site <your-site>.atlassian.net --product jira -e development
```

## How to Test

Open Rovo Chat on your Jira site, select the **EvidenceDesk** agent, and send:

```text
Run compliance check C1 on Jira Done issues
```

You can inspect function logs with:

```bash
forge logs -e development
```

## Hackathon

Built for **Atlassian Codegeist 2026** — Category: **Apps for Specialized Industries**.

## License

[MIT](LICENSE)
