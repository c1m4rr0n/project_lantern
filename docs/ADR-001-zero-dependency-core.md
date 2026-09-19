# ADR 001 — Zero-dependency executable core
Status: accepted

The first runnable milestone uses Node 22 built-ins only. This is not the final production stack. It isolates product risk from framework/package risk, allows offline demonstration, and makes automated evaluation reproducible. Provider interfaces are deliberately separated so storage/auth/edge services can be replaced later.
