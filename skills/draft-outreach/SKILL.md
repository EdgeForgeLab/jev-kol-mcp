---
name: draft-outreach
description: >-
  Draft a first KOL collaboration email and one day-3 follow-up from jev-kol
  tool results. Use when the user asks to write, revise, or send outreach,
  a collaboration email, or a follow-up to a TikTok or YouTube creator.
---

# Draft outreach

Write in the user's language. Ask once if the campaign or the offer is missing. This server does not send mail and does not know whether anyone replied.

1. Use `search_kols` when the creator is not already in the conversation.
2. Use `score_fit` with that creator's bio and the campaign before recommending a send.
3. If `dimensions.mismatch` is not `none`, or outreach probability is low, say why and wait. Draft only if the user still wants the email.

Use only fields returned by those tools: handle, displayName, bio, contactEmail, primaryNiche, location, and the score_fit result. Never invent an email address, follower count, rate, audience, or past brand partner. If `contactEmail` is null, say there is no public email and leave the recipient line empty.

Return two messages. The offer and the campaign must come from the user. Do not mention Jev, scores, or this tool in either email.

## First email

Subject and body for a new message. State the campaign and the offer once. Invite a yes or a no.

## Follow-up

One follow-up only. Deliver it together with the first email, and label it: send only after the user confirms the first email went out, 3 days have passed, and there is still no reply.

- Subject starts with `Re:` so it stays on the same thread.
- Shorter than the first email. Restate the campaign and the offer in one or two lines. Do not retell the pitch.
- Keep the same offer unless the user supplies a new one.
- Give a clear stop: if this round is not a fit, one reply is enough and there will be no further message.
- Do not add urgency, scarcity, or guilt.
- Use the same language as the first email.

Do not write a follow-up when the first email was never sent, or when the creator already replied, including a refusal or "later". A third email only if the user explicitly asks.
