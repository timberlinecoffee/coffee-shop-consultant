---
name: UI Ship
about: Ship UI changes — triggers mandatory QA Lead review before close
title: "[UI] "
labels: kind=ui-ship
assignees: ""
---

<!--
MANDATORY FLOW: assignee → QA Lead (in_review) → CEO (close)
No UI ship issue may reach done without QA Lead approval.
Apply the execution policy when creating this in Paperclip:
  executionPolicy.stages = [{ type: "review", participants: [{ type: "agent", agentId: "<QA-Lead-id>" }] }]
-->

## Summary

<!-- One paragraph: what changed and why a shop owner would care. -->

## Routes

<!-- List every route touched. The smoke test reads this list. -->

- /

## Buttons / CTAs

<!-- List every button or CTA added or changed. -->

- 

## Smoke Test

<!-- Paste output of: pnpm test:smoke -- --issue=TIM-XXX -->

```
SMOKE_ISSUE=TIM-XXXX pnpm test:smoke

# paste output here
```

## Screenshots

### Desktop (1280 × 800)

<!-- Drag and drop desktop screenshot here -->

### Mobile (375 × 812)

<!-- Drag and drop mobile screenshot here -->

## QA Checklist (filled by assignee before moving to QA review)

- [ ] All buttons enabled — Playwright `expect(button).toBeEnabled()` passes
- [ ] No dead links — `pnpm check:links` passes
- [ ] Form submissions work in smoke run
- [ ] Title case applied to all headings, labels, button text
- [ ] No emoji in body text
- [ ] No AI jargon (delve, leverage, dive deeper, game-changer)
- [ ] Font and spacing use design system tokens only
- [ ] Mobile responsive at 375px — screenshot attached
- [ ] Lighthouse a11y ≥ 90 — CI check green
- [ ] Lighthouse perf ≥ 90 — CI check green
