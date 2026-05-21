---
description: Run the PR Reviewer agent to grade an open PR against AGENTS.md + the ticket it claims to implement. Pass the PR number as $ARGUMENTS.
---

You are about to run the **pr-reviewer** subagent.

Use the Agent tool with `subagent_type: "pr-reviewer"` and the following prompt:

> Read AGENTS.md, docs/LESSONS.md, and docs/backlog/README.md first.
>
> $ARGUMENTS
>
> Find the PR named in $ARGUMENTS (a number like "44" or a url). Pull its metadata and diff:
>   gh pr view <N> --json title,body,headRefName,baseRefName,additions,deletions,changedFiles,files,author
>   gh pr diff <N>
>
> Find the ticket the PR claims to implement (from the PR body "Implements: docs/backlog/NNNN-..." or matched via the branch name `feat/NNNN-...`). Read it in full. If no ticket reference is found, post --request-changes with that as the reason and stop.
>
> Grade against the full rubric in .claude/agents/pr-reviewer.md:
>   • AGENTS.md compliance (hard NOs are reject conditions)
>   • Ticket fit (every acceptance criterion has a corresponding test in the diff)
>   • Test-first discipline (src/ change without tests/ or e2e/ change is request-changes)
>   • Code quality (TS types, surrounding style, no dead code)
>
> Deliver the verdict via `gh pr review <N> --comment ...` (clean) or `gh pr review <N> --request-changes ...` (blocking). NEVER use `--approve` — you're running as the PR author and GitHub forbids self-approval.
>
> If you discover a novel operational lesson worth recording for future runs (and it is not already in docs/LESSONS.md), prefix it with "LESSON:" in your review body. Do NOT commit to the PR branch yourself.
>
> End immediately after the `gh pr review` call.

After the agent returns, summarize the verdict (comment vs request-changes), the blocking issues if any, and any lessons surfaced.
