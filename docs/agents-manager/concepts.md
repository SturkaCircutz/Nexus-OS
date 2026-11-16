# Agents Manager — Concepts (for the next meeting)

Status: **ideas only, no widget built yet** (on hold by decision, 11 Nov).
Companion to the user's ask: *"Agents manager (can put on hold until next meeting
but try to come up with some ideas/concepts, maybe work with the Agent team)."*

This doc proposes what the Agents Manager could be, what it must NOT be, and the
questions to settle with the Agent team. Nothing here is implemented; the widget
would follow the standard app scaffold once the model is agreed.

---

## 1. What an "agent" is in Nexus today

- **The UI agent** (`shell/agent/agentStore`): the orb. Five statuses
  (idle / listening / thinking / speaking / error), one anchor of seven, replies
  spoken in a bubble. It is the *interface* to agents.
- **Wire agents** (`types/agentEvents.ts`): the seven wire states and typed
  events the engine emits. This is the *contract* layer.
- **The engine** (`apps/engine`): runs tools, produces typed payloads the shell
  renders as widgets.

So the shell already has one agent-shaped hole: **the engine can run work, but
there is no surface that answers "what are my agents doing right now?"** That is
the Agents Manager's reason to exist.

## 2. The concept: a duty roster, not a chat list

The proposal is **the roster**: a widget that shows every agent the engine knows
about as a *duty* — what it's doing, for whom, since when — with three verbs the
shell already speaks: **pause, resume, dismiss**.

Why a roster rather than a chat list:

- The orb is the conversation. Duplicating chat inside a widget splits the
  One-Face rule (the user talks to the orb, not to cards).
- The engine's events are status-shaped (running / waiting / done / error), which
  maps directly onto roster rows. No new wire contract needed to start.
- A roster is honest about the thing users actually need: *is anything working in
  the background, and is anything stuck?*

### Row anatomy (one agent, one line)

```
[•] research-web      running   2m14s   drafting summary…      [pause]
[•] file-indexer      waiting   0m40s   needs a decision        [open]
[•] nightly-sync      error     1m02s   source unreachable      [retry] [dismiss]
[ ] morning-brief     idle      —       scheduled 07:00         [run now]
```

- Status glyph reuses the agent status vocabulary (same words as the orb's
  statuses, so the OS speaks with one voice).
- The orb can *point* at the roster: when a roster row enters `error`, the orb
  shows its error preset. That coupling is cheap and makes the OS feel aware.

## 3. The three levels (what to build in which order)

**Level 1 — Read-only roster (MVP).**
Engine exposes `list_agents` + agent events already exist. Widget renders rows;
no control verbs yet. Ships value immediately: visibility.

**Level 2 — Verbs.**
`pause` / `resume` / `cancel` per agent, plus `run now` for scheduled duties.
Engine adds command endpoints; shell adds the buttons. The orb speaks the
replies ("paused research-web").

**Level 3 — Duties (scheduled + delegated).**
Duties with schedules ("nightly at 07:00"), delegation ("while I'm away, have
research-web watch the folder"), and per-agent permissions. This is where the
Automations design (referenced in `apps/types.ts` as the future home of agent
actions) and the Agents Manager meet — recommend one shared doc, not two.

## 4. Agents manager ↔ agents (multiple avatars?)

The current orb is *the* avatar. Options to discuss with the Agent team:

- **One face, many hands (recommended):** the orb stays the single presence; the
  roster is how you see the hands. Keeps identity clean, avoids N orbs fighting
  over seven anchors.
- **Orb dressing:** the orb's ring/state reflects the roster aggregate (any agent
  working → working ripples; any agent error → error burst). The DotField soul
  already has these modes, so this is nearly free and worth doing at Level 1.
- **Multiple avatars (defer):** only if the engine later treats agents as
  first-class presences with their own conversations.

## 5. What it must NOT be

- Not a second chat surface (the orb owns conversation).
- Not a settings page for the engine (that's Settings' job if/when needed).
- Not a permission pop-up factory — approvals belong to an interrupt panel
  (`InterruptPanel` exists in the UI library for exactly this).

## 6. Open questions for the Agent team

1. Does the engine's agent model have identities stable enough for a roster
   (`agent id`, `label`, `status`, `since`)? If not, what's the minimal shape?
2. Are pause/resume/cancel technically honest today, or aspirational? Roster
   rows must never show verbs the engine can't perform.
3. Scheduled duties: engine-side or shell-side timers?
4. Permissions model: who approves what, and where does it surface (roster vs
   interrupt panel)?
5. Do agents ever own files/artifacts the Files viewer should show? If yes, the
   roster's row can link into Files previews.

## 7. Recommended decision

Agree Level 1 scope at the meeting: `list_agents` contract + read-only roster
widget + orb coupling (error/working reflection). Defer verbs and duties to
Level 2/3 after the engine confirms honest semantics.
