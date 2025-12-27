# Experiment Playbook (v1)

(Human-facing operating manual)

## What this is

A simple, repeatable way to run outbound distribution experiments for Junk Car Calculator with capital discipline, stable CRM mechanics, and weekly decisions.

## Core rule

CRM mechanics stay stable. Experiments change interpretation and incentives.

No experiment is allowed to "rewire the CRM."

## 1) Roles & responsibilities

**Admin (you)**
- Creates campaigns and experiments
- Starts/pauses/ends experiments
- Sets capital + time caps
- Runs weekly evaluations
- Approves overrides

**SDR**
- Runs outreach
- Logs outcomes honestly (Schedule / Info / Callback / Not Interested)
- Does not decide experiment success

**Activator**
- Attends scheduled install appointments
- Confirms attendance
- Confirms calculator installed (verified)
- Captures blocker notes (login access, website guy, etc.)

## 2) The weekly rhythm (default cadence)

**Monday (or your chosen day) — Weekly Review**
- Read the Weekly Admin Summary email
- If "Evaluation Recommended: YES" → run an Evaluation
- Decide one of:
  - Continue (same experiment)
  - Continue + extend cap (new tranche)
  - Terminate experiment
  - End experiment + start new experiment (iteration)

**Mid-week (only when needed)**
- Only intervene if:
  - stop-loss alert triggers (80–90% cap or time cap nearing)
  - obvious tracking bug (data integrity issue)

## 3) How to start an experiment (checklist)

**Step 1 — Create Experiment**

Fill:
- Name (e.g., "Exp 2 — Install Appointment → Activator Install")
- Hypothesis (1 paragraph)
- Primary success event (e.g., calculator_installed)
- Secondary events (e.g., install_scheduled, paid_conversion)
- Capital cap (e.g., $4,000)
- Time cap (e.g., 14 days)
- Tranche size (e.g., $1,000)
- Bonus rules (if any)

**Step 2 — Set "one running experiment" rule**

Confirm:
- No other experiment is "running" for this campaign

**Step 3 — Confirm tracking is live**

Before the experiment starts, verify:
- Dialer outcomes exist and are unchanged
- QPC definition is active (≥150s + outcomes in {Schedule, Info, Callback})
- Call recording rule is set (record only ≥150s calls)
- Activator can mark attended + installed

**Step 4 — Start Experiment**

Set status → running
Record start timestamp.

## 4) The golden metrics (what matters)

**Always track (facts)**
- QPCs
- Schedules
- Attended installs
- Installs completed
- Paid conversions
- Spend (labor + bonus + twilio + cloud)
- Tranches consumed

**Don't obsess over**
- raw conversations
- call volume
- "activity" metrics that don't connect to installs

## 5) How to run an evaluation (weekly)

**Step 1 — Look at experiment performance summary**

Check:
- Spend vs cap
- Tranches consumed
- Installs per tranche
- Paid per tranche
- Where the funnel breaks (QPC→Schedule, Schedule→Attend, Attend→Install)

**Step 2 — Pick a verdict (admin only)**

- Continue: trend is improving and performance per tranche is acceptable
- Pass: experiment validated strongly (e.g., consistent installs + paid signal)
- Fail: primary constraint is fundamental (pitch/channel mismatch) or no momentum
- Stop: stop-loss hit and no continue condition is met

**Step 3 — Choose reason**

- pitch_channel (people don't want it / wrong ICP / message issue)
- activation_process (handoff/install process failing)
- economics (too expensive per tranche once stable)
- capital_time (ran out of budget/time)
- inconclusive (data broken or too little signal)

**Step 4 — Choose recommended next action**

- continue_experiment
- extend_budget
- start_new_experiment
- graduate_campaign (evergreen)
- kill_campaign

**Step 5 — Write notes (required if verdict != continue)**

Always log:
- What changed
- What you learned
- The one hypothesis for next iteration

## 6) When to kill vs iterate vs continue

**Kill (terminate experiment) when:**
- You've burned ≥2 tranches and installs per tranche ~0
- You have QPCs but scheduling collapses consistently
- Installs happen but paid conversions are consistently zero after enough volume

**Iterate (start new experiment) when:**
- The bottleneck is obvious and fixable (pitch, ICP filter, activator process)
- You can change one major variable and retest

**Continue when:**
- Installs per tranche are stable or improving
- Paid signal begins to appear
- Activator process is smooth and repeatable

## 7) Override doctrine (rare, but allowed)

You may override stop-loss / caps only if:
- You log a rationale in the evaluation
- The override is timestamped
- You specify a new cap or tranche amount
- You state the exact condition that ends the override

No silent overrides.

## 8) Bonus rules guidance (so incentives don't corrupt learning)

**Good bonuses**
- Paid per install completed
- Paid per paid conversion

**Avoid**
- "Trials created" bonuses (we already learned this gets gamed)
- Multi-step conditional bonuses (too complex, disputes)
- Anything SDRs can self-trigger without verification

## 9) Data integrity rules

- Missing data does not count
- No retroactive edits
- If tracking breaks mid-week, mark evaluation as inconclusive and fix tracking first


