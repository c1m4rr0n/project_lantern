# Committee Report 001 — Product decision and executable core
Date: 2026-09-18

## Decision
Build a read-mostly B2B procurement-intelligence SaaS. Internal codename: **Project Lantern**.

## Why
1. Official government data can seed the product at very low marginal data cost.
2. Matching and triage recur continuously, making subscription revenue structurally plausible.
3. The workflow is highly automatable and can be demonstrated without external credentials.
4. Consequential actions remain with the customer: Lantern finds, analyzes and organizes; it does not submit bids.

## Change made after research
The research name “BidOps AI” was rejected after a live collision check found existing procurement products using BidOps. Branding is therefore deferred until a dedicated availability review.

## Milestone 0.1 objective
Prove the core loop before adding infrastructure: company profile → opportunity ingestion → deterministic match score → reasons/blockers → compliance matrix.

## Technical choice
A zero-dependency Node 22 modular monolith was chosen for the first executable milestone. This is deliberate: it removes package-install/network risk and lets the committee run the product with one command. Provider, scoring, storage and UI are separated so production services can replace local components without rewriting the workflow.

## AI decision
No LLM is in the hot path yet. Deterministic rules should discard obvious mismatches first. LLM extraction will be added only for document requirements and nuanced fit reasoning, reducing cost and hallucination exposure.

## External dependency currently needed from the user
None for the mock-backed MVP. A SAM.gov public API key will become useful when switching the sync job from mock data to live opportunities.
