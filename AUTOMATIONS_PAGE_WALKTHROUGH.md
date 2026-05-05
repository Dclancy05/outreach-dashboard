# Automations Page — Walkthrough

> The Loom-replacement. Imagine I'm your aunt and you're showing her the
> page. No tech jargon. Just "click this, look for this."

---

## What this page is

The **Automations** page is where you **teach the system how to do stuff**.

You walk through one task one time — like sending a DM on Instagram. The
system watches. It saves every click. From then on, it can do that exact
same task for every lead in your pipeline. Forever. Without you.

You don't write code. You don't write rules. You just **do the thing**
and the page **records the thing**. That's it.

Think of it like teaching somebody how to make a sandwich by making one
in front of them. You don't read them a recipe. You make the sandwich.
They watch. Then they can make it.

---

## The 4 tabs

When you open `/automations` you'll see 4 tabs at the top. Here's what
each one is for.

### Tab 1 — Overview

This is the **catalog**. You'll see a grid of tiles. Each tile is one
thing the system can do — "Instagram → Send DM," "Facebook → Follow,"
"LinkedIn → Connect with Note," and so on. There are 27 of them
across 9 platforms.

Each tile has a colored badge:
- **Green** = Active. The system knows how to do this. It works.
- **Yellow** = Needs Recording. You haven't taught the system this one yet.
- **Red** = Broken. It used to work but Instagram (or whoever) changed something. Needs to be re-recorded or auto-fixed.
- **Blue** = Testing. The system is checking right now if it still works.

At the top of this tab there's a **dummy group selector**. A "dummy
group" is a fake account + proxy combo we use just for recording. You
don't run real campaigns through these — they're for practice runs.
Pick one. The page already picks the recommended one for you.

There's also a **Pause All** button up top. If something looks weird
and you want to stop everything immediately, smash that button.

### Tab 2 — Your Automations

This is the **list of recordings you've made**. Every time you record
something, it shows up here.

You can:
- **Rename** any of them by clicking the name
- **Replay** one — watch the recording play back step-by-step like a movie
- **Test** one — run it against a test account (Starbucks for IG, Microsoft for LI, etc.) to make sure it still works
- **Import / Export** as JSON — useful if you want to share a recording with someone else or back them up

### Tab 3 — Live View

This shows the **VPS Chrome screen, live, in real time**.

The "VPS" is the computer in the cloud where all your accounts run. It's
running Chrome 24/7. This tab lets you see what Chrome is doing right
now without opening a new window.

If a recording is in progress, you'll see it here. If a campaign is
sending messages, you'll see those messages getting sent.

### Tab 4 — Maintenance

This is the **doctor's office** for your automations.

Once a day, at 10 AM UTC, the system runs every recording you've made
against its test target. If something stopped working — like Instagram
moved the "Send" button — this tab will show:
- **Which recording broke**
- **What went wrong** (the error message + a screenshot of what Chrome saw)
- **What the AI tried to do to fix it** (with cost in pennies)
- **A "Re-record" button** if the AI couldn't save it

You don't have to come here unless something breaks. You'll get a
Telegram alert if a recording goes down.

---

## How to record an automation (step-by-step)

Let's say you want to teach the system to send Instagram DMs. Here's
exactly what to do.

**Step 1.** Go to `/automations`. You're on the Overview tab by default.

**Step 2.** Look at the top of the page for the **dummy group dropdown**.
It probably already says "IG Dummy Group A" or something like that.
That's fine. The system picked the right one for you. If you want to
pick a different one, click the dropdown and choose one.

**Step 3.** Find the tile that says **"Instagram — Send DM."** Click it.

**Step 4.** A big modal pops up. The right side has a **live Chrome
viewer**. You'll see Chrome already loaded the dummy account's
Instagram profile and pre-filled the cookies. **Don't close this
modal** — that's where the magic happens.

**Step 5.** **Do the thing.** Click around in the Chrome viewer like
you would normally. Go to a profile. Click Message. Type a sample
message. Hit Send. Take your time. Every click, every keystroke,
every page navigation is being recorded.

**Step 6.** When you're done, click the **Stop** button at the bottom
of the modal. The system takes over and runs three steps in order:
- **Analyze** — figures out what you did
- **Build** — saves it as a re-runnable recipe
- **Self-test** — replays it against a test account to make sure it actually works

You'll see a progress bar move through each phase. Takes about 30-60
seconds total.

**Step 7.** **Wait for the result.** One of two things happens:
- ✅ **Self-test passes** → confetti, the modal closes, the tile flips to **green/Active**. You're done. Forever. The system can now send IG DMs.
- ❌ **Self-test fails** → the modal shows you exactly what broke + a screenshot. The AI auto-repair tries one fix automatically. If that works, you're done. If not, you'll see a **"Re-record"** button. Click it and start over from Step 4.

That's it. You just taught the system how to do something.

---

## What success looks like

When everything's working, you'll see this progression:

1. **Pipeline phase 1: "Recording…"** — modal shows the Chrome viewer, you're clicking around
2. **Pipeline phase 2: "Analyzing…"** — system is figuring out the steps you took
3. **Pipeline phase 3: "Building…"** — system saves the recipe
4. **Pipeline phase 4: "Self-testing…"** — system replays the recipe against a test target
5. **Pipeline phase 5: "Done!"** — green confetti + the tile flips to **Active** with a green badge

The green Active badge on the tile means: **the system can now do this
task on its own, for every lead, forever, until something on the
platform changes.**

---

## What failure looks like

If anything goes wrong, the modal will show a **failure card** instead
of confetti.

The failure card shows:
- 🔴 A red banner: "Self-test failed at step 3" (or wherever it failed)
- A **screenshot** of what Chrome was seeing at the moment it broke
- An **error message** in plain English (like "Couldn't find the Send button")
- An **AI repair status**: "Auto-repair in progress…" → either "Repaired ✅" or "Repair failed"
- A **Re-record** button at the bottom

If AI auto-repair worked, you don't have to do anything. Just close the
modal — the tile is now Active.

If AI auto-repair couldn't fix it, click **Re-record** and walk through
the steps one more time. The platform probably moved a button. Your
re-recording teaches the system the new layout.

---

## When to use the Maintenance tab

You shouldn't need to come here often. The system pings you on Telegram
when something breaks.

But if you ever want to **proactively check that everything still
works**, click the Maintenance tab and look for any red rows. Each red
row is one recording that failed its daily test.

For each broken recording, you'll see:
- The platform + action (e.g. "Instagram → Send DM")
- The exact error
- A screenshot
- What the AI tried
- How much the AI repair cost (usually pennies — like $0.02)
- A Re-record button if you need to do it manually

**Pro tip.** When Instagram does one of their big redesigns, expect
2-5 things in this tab to go red over the next 24 hours. Don't panic.
Click Re-record on each one. You'll be back to all-green in under 10
minutes.

---

## The behind-the-scenes stuff (only read if you're curious)

- This page is backed by a **16-hour audit** that found and fixed 28 bugs (5 critical) right before it shipped. Detail in `AUTOMATIONS_BUGS_FOUND.md`.
- The system ran **1,445+ live recording-flow lifecycles** during testing — none of them failed. Detail in `Test Results — Automations Page FINAL 2026-05-05.md`.
- The recordings are stored in a Supabase database, not on the VPS. So if the VPS crashes, your recipes survive.
- The AI auto-repair uses a small Claude model and only fires when something breaks — not on every action. Daily cost is usually pennies.
- The daily maintenance check runs at 10 AM UTC (6 AM Eastern). You'll get a Telegram ping if anything breaks.

That's everything. You should be able to record your first automation
in under 2 minutes.
