---
description: Run the Product Groomer agent to add new backlog tickets. Optionally pass a focus area (growth, billing, parent-portal, mobile, retention, etc.) as $ARGUMENTS.
---

You are about to run the **product-groomer** subagent.

Use the Agent tool with `subagent_type: "product-groomer"` and the following prompt. The agent will read the codebase + current backlog, then add 3-6 new tickets to `docs/backlog/` using the existing template and conventions.

Prompt for the agent:

> Read AGENTS.md, docs/LESSONS.md, README.md, CLAUDE.md, docs/backlog/README.md, and every file under docs/backlog/ to ground yourself in the product and the current state of the backlog.
>
> Then produce a fresh ideation pass: **3 to 6 new backlog tickets** in `docs/backlog/`. Use the next available NNNN ids. Follow `docs/backlog/_template.md` exactly — frontmatter, user story, four-lens "Why now", acceptance criteria mapped to test scenarios, out-of-scope, engineering notes.
>
> Do not duplicate work already in the backlog (read every existing ticket first).
>
> Do not touch anything under `src/`, `tests/`, `e2e/`, or `supabase/migrations/`.
>
> $ARGUMENTS
>
> When you finish: list the new ticket ids + one-line titles, then mark the single most leveraged next one. Stop. Do not start implementing.

After the agent returns, summarize the new backlog state: how many tickets total, the top-priority one, and what the dev agent should pick up next with `/ship`.
