# Vendor Performance Manager

Help vendor performance managers turn metrics and quality notes into reviewed findings and tracked improvement actions.

Project owners: Racheal Winstead and Deshawn Jeter.

## Planned workflow

Upload vendor metrics and quality-review notes, confirm targets, review flagged issues, approve an evidence-backed review, and assign follow-up actions.

## First build

- CSV upload and user-defined target checks
- AI-assisted summaries with source references and human approval
- Action tracker with owners, deadlines, and status
- Synthetic demonstration data

## User stories

These stories concern the selected Google Vendor Performance Manager JD, not the separate Cyber Risk Analyst lesson exercise. They are proposed needs, not validated interview findings.

1. As a vendor performance manager, I need to compare uploaded metrics with targets I confirm so that I can identify results that need attention.
   - Source: JD duty to monitor performance metrics and diagnose performance issues. Assumption: CSV upload and manager-entered targets are suitable inputs.
2. As a vendor performance manager, I need to inspect the evidence supporting a suggested finding so that I can decide whether it belongs in my review.
   - Source: JD duties covering call audits, quality reviews, and data-driven feedback. Assumption: linking notes to metrics helps this decision.
3. As a vendor performance manager, I need to edit and approve a draft review so that the summary I share reflects findings I have checked.
   - Source: JD duty to share performance insights and consult on business reviews. Assumption: an AI-assisted draft saves useful preparation time.
4. As a vendor performance manager, I need to record an action’s owner, deadline, and status alongside its finding so that I can check progress on agreed improvements.
   - Source: JD duty to follow up on mitigation plans. Assumption: a manager-maintained tracker fits the actual workflow.
5. As the pair building for this role, we need to establish how managers define targets, prepare reviews, and track actions so that implementation addresses a verified workflow.
   - Discovery story: interview a role-holder and document evidence and unresolved gaps before treating the proposed workflow as validated.

## Environment and credential handling

Copy `.env.example` to `.env` when setting up another checkout. The local `.env` is ignored by Git; `.env.example` contains only empty configuration values and is safe to commit. No API key is needed for this setup sprint. Add a key only when implementing a server-side AI integration; never expose it in browser code or commit it.

No application runtime has been selected or installed yet. Environment variable names are provisional. Confirm the stack with the pair before implementation.

## Branch workflow

- `main`: stable, demo-ready work
- `developer`: shared integration branch
- `codex/racheal`: Racheal’s work
- `codex/deshawn`: Deshawn’s work

Open pull requests from individual branches into `developer`; merge tested milestones from `developer` into `main`.

## Run locally

Requires Node.js 18 or newer. No package installation or API key is needed.

```bash
npm run dev
```

Open http://127.0.0.1:4175/. To use another port, run `PORT=4176 npm run dev`.

## First working milestone

- Upload or drag in a CSV (up to 1 MB and 100 metrics), or try the sample data.
- Enter vendor team and review dates, preview metrics, and enter numeric targets.
- Choose higher-or-equal or lower-or-equal for each target.
- Leave unknown targets unassessed by unchecking Assess. Missing/invalid actuals cannot pass.
- Compare results and inspect the supplied review notes; go back to adjust inputs.

CSV schema: `metric_name,actual_value,unit`. Each file covers one team and review period. Percent values use 78, not 78%. Sample data is fictional, not Google's actual performance data.

## Verification

```bash
npm test
```

24 tests cover quoted CSVs, malformed inputs, missing values, equality, minimum/maximum targets, and unassessed states. Browser checks cover sample loading, required targets, and pass/miss/unassessed output.

## Current limits

This is a browser-local prototype. Data is kept in memory for this tab and is not saved after refresh. CSV contents and notes are not sent to a server. Google Fonts requests external font files only. The local HTTP server serves only explicitly allowed public assets, not `.env` or repository files.

AI drafting, saved reviews, review approval, action tracking, accounts, and integrations are not implemented. No time-savings or business-value claim has been validated. The proposed backend and persistence stack in the PRD remain future decisions.

## Status

Upload and deterministic target-comparison milestone implemented on `codex/racheal`.
