# DISTRIBUTION + CAPITAL GOVERNANCE SYSTEM V5 MASTER SPEC (CONSTITUTIONAL)

## Purpose

Build a system that allows the company to run repeatable distribution experiments with capital discipline, stable mechanics, and human judgment — without lying to itself, over-automating uncertainty, or rewriting history.

## 0. PHILOSOPHY (NON-NEGOTIABLE)

- Optimize for truth over comfort
- Optimize for signal per dollar, not activity
- Separate facts, interpretation, and judgment
- Preserve historical memory
- Delay automation until truth stabilizes
- Humans make decisions; systems enforce reality
- This system exists to govern capital, not motivate people.

## 1. THE FIVE-LAYER MODEL (LOCKED)

```
Product
└── Campaign (enduring thesis)
    └── Experiment (conversion hypothesis)
        ├── Performance (facts)
        ├── Cost (capital truth)
        └── Evaluation (judgment)
```

If these layers blur, the system is broken.

## 2. PRODUCT

**Definition**

A Product is what the company sells (e.g. Junk Car Calculator). Products are long-lived and own campaigns.

## 3. CAMPAIGN (LONG-LIVED THESIS)

**Definition**

A Campaign represents a durable distribution thesis. Example: "Outbound SDR-led distribution for Junk Car Calculator." Campaigns last months or years.

**Campaign Owns:**
- Leads
- Team assignments
- High-level capital intent
- Multiple experiments over time

**Campaign Does NOT:**
- Define conversion mechanics
- Decide success/failure
- Change CRM behavior

**Campaign Fields (V5)**
- id
- product_id
- name
- description
- owner_user_id
- status (planned | active | paused | completed)
- start_date
- end_date (nullable)
- capital_budget_usd (umbrella, optional)
- created_at

## 4. EXPERIMENT (CORE UNIT OF LEARNING)

**Definition**

An Experiment is a specific conversion hypothesis inside a campaign. Examples:
- Trial → self-serve activation
- Install appointment → activator install
- Founder-led demo → white-glove onboarding

Experiments are short-lived (weeks) and iterative.

**Experiment Controls (Interpretation Only)**

An Experiment defines:
- Primary success event
- Secondary events
- Denominator logic (QPC, etc.)
- Capital cap
- Time cap
- Bonus rules
- Evaluation logic

It does NOT:
- Rewire CRM buttons
- Change dialer flows
- Auto-trigger workflows

**Experiment Fields (V5)**
- id
- campaign_id
- name
- hypothesis
- status (planned | running | paused | completed | terminated)
- start_date
- end_date
- capital_cap_usd
- time_cap_days
- tranche_size_usd
- primary_success_event
- secondary_events[]
- created_at

**Rules**
- Only one experiment per campaign may be running
- Attribution only occurs while experiment is running
- Completed/terminated experiments are immutable

## 5. LEADS (CAMPAIGN-OWNED)

**Rules (LOCKED)**
- Leads belong to Campaigns
- Leads may participate in multiple Experiments
- Experiments do NOT own leads
- Leads exit the system on terminal business states

**Terminal States**
- paid_customer
- do_not_contact
- permanently_not_interested

Once terminal, lead is excluded from future experiments.

## 6. CRM / DIALER (STABLE PRIMITIVES)

**Principle**

CRM mechanics are stable forever. Experiments only change how events are interpreted.

**Canonical Dialer Outcomes (IMMUTABLE)**
- No Answer
- Busy
- Wrong #
- Not Interested
- Callback
- Info
- Schedule

These never change.

## 7. PERFORMANCE LAYER (FACTS ONLY)

**Canonical Events (V5)**
- Dial Attempt
- Conversation (>10s)
- Qualified Pitch Conversation (QPC)
  - duration ≥ 150s
  - outcome ∈ {Schedule, Info, Callback}
- Install Appointment Scheduled
- Install Appointment Attended
- Calculator Installed
- Paid Conversion

**Attribution Rule**

Events are attributed to the experiment running at the time the event occurs. No retroactive reassignment.

## 8. COST ATTRIBUTION (CAPITAL TRUTH)

### 8.1 Labor Rules
- One campaign per email/login
- Multiple campaigns → multiple emails
- Hours roll up mechanically
- labor_cost = hours × hourly_rate

### 8.2 Bonuses (Experiment-Scoped)

**Bonus Rules (Defined per Experiment)**
- event_type (schedule | install_completed | paid_conversion)
- bonus_amount_usd
- eligible_roles
- max_per_period (optional)

**Bonus Rules**
- Bonuses are binary
- One bonus per event
- Bonuses lock once paid
- No retroactive changes
- Only while experiment = running

### 8.3 Tools
- Twilio Usage Records API
- Record calls ONLY if duration ≥ 150s
- Metadata retained for all calls
- Google Cloud Billing export → BigQuery
- Daily rollups

### 8.4 Cost Rollup Table
- date
- campaign_id
- experiment_id
- source (labor | bonus | twilio | gcp)
- cost_usd

## 9. EVALUATION (HUMAN JUDGMENT LAYER)

**Definition**

An Evaluation records an explicit human decision about an Experiment.

**Evaluation Fields**
- id
- experiment_id
- created_at
- capital_cap_usd
- time_cap_days
- tranche_size_usd
- verdict (pass | fail | continue | stop)
- reason (pitch | activation | economics | capital | inconclusive)
- recommended_next_action
- admin_notes

**Rules**
- Evaluations are immutable
- Evaluations do NOT trigger automation
- System surfaces signals; humans decide

## 10. STOP / CONTINUE LOGIC (BURN-NORMALIZED)

**Stop-Loss (Governor)**
- Capital cap OR time cap

**Continue Logic**
- Normalized per capital tranche, not time or headcount
- Example signals:
  - installs per $1k ≥ X
  - paid per $2k ≥ Y
  - improving trend per tranche

## 11. REPORTING & CADENCE

**Weekly Admin Summary (DEFAULT)**
Includes:
- Spend (week + total)
- Tranches consumed
- QPCs
- Schedules
- Installs
- Paid conversions
- "Evaluation recommended?" flag

**Interrupt Alerts**
- Stop-loss proximity (80–90%)
- Manual Evaluation Trigger
- Admin-only action.

## 12. OVERRIDE DOCTRINE (LOCK THIS)

Admin may override rules only if:
- Rationale is logged
- Override is tied to an Evaluation
- Override is timestamped
- No silent exceptions.

## 13. DATA IMPERFECTION POLICY

- Missing data = not counted
- No backfilling guesses
- Imperfect truth > fictional precision

## 14. WHAT V5 REFUSES TO DO

❌ Dynamic CRM rewiring
❌ Auto-scaling
❌ Auto-iteration creation
❌ AI verdicts
❌ Forecasting CAC/LTV
❌ Per-lead attribution
❌ Performance gamification
❌ Real-time dashboards

## 15. BUILD GUIDANCE

**What to Build First**
- Campaigns
- Experiments
- Performance attribution
- Cost rollups
- Evaluations
- Weekly reporting

**What is Explicitly Deferred**
- Templates
- Automation
- Portfolio allocator
- CAC enforcement

## FINAL DIRECTIVE TO DEV

Build stable primitives. Interpret through experiments. Govern through capital. Decide through humans. Preserve truth forever.


