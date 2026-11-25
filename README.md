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

- **C1** ([`src/controls/c1-done-assignee-resolution.js`](src/controls/c1-done-assignee-resolution.js)): Every Jira issue in status `Done` has an assignee and a resolution.

### Planned

- Confluence policy review dates
- Changes linked to tickets
- Audit evidence pack Confluence page generation
- Teamwork Graph write-back
- Atlassian MCP server integration

## Architecture

- **Forge app** (`manifest.yml`):
  - `rovo:agent` module (`EvidenceDesk`) with instructions to call `check-control` and report only returned data
  - `action` module (`check-control`) backed by `checkControl` in `src/index.js`
  - Minimal scope: `read:jira-work`
- **Modular controls** (`src/controls/`):
  - `src/controls/types.js`: shared result shape (`ControlResult`) and `buildControlResult` helper
  - `src/controls/registry.js`: control lookup registry (`getControl`, `listControlIds`)
  - One file per control under `src/controls/` (currently `c1-done-assignee-resolution.js`)

## Tech

- Atlassian Forge (`@forge/api`)
- Atlassian Rovo (`rovo:agent`)
- Jira Cloud REST API v3 (`/rest/api/3/search/jql`, `/rest/api/3/serverInfo`)
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
