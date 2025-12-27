# V1 IMPLEMENTATION SPEC

(Derived from V5 Master Spec — Constitutional)

## Authority rule

This document defines what is built in v1.

If anything here conflicts with V5_MASTER_SPEC.md, V5 wins.

## 0. V1 GOALS (VERY IMPORTANT)

**V1 exists to:**
- Run one real campaign with real capital
- Support one running experiment at a time
- Produce truthful weekly evaluations
- Prevent silent capital bleed
- Avoid any future re-architecture

**V1 does not exist to:**
- optimize UX
- impress users
- automate decisions
- scale aggressively

This is an internal owner system.

## 1. ENTITIES TO BUILD IN V1 (AUTHORITATIVE LIST)

✅ **MUST BUILD**
- Product
- Campaign
- Experiment
- Lead
- TeamMember
- TimeLog
- BonusEvent
- PerformanceEvent
- CostRollup
- Evaluation

🟡 **BUILD AS STUB (schema + minimal UI)**
- OverrideLog
- NotificationLog

❌ **DO NOT BUILD**
- Templates
- Auto-iteration creation
- Portfolio allocator
- CAC/LTV forecasting
- Multi-campaign labor splitting
- Real-time dashboards

## 2. PRODUCT (MINIMAL)

**Purpose**
Anchor campaigns to a product.

**Fields (V1)**
- id
- name
- active (bool)

**Notes**
- No pricing logic
- No billing integration
- Just a container

## 3. CAMPAIGN (V1 IMPLEMENTATION)

**Purpose**
Long-lived distribution thesis.

**Fields (V1)**
- id
- product_id
- name
- description
- owner_user_id
- status (planned | active | paused | completed)
- start_date
- end_date (nullable)
- capital_budget_usd (nullable)
- created_at

**Rules (ENFORCED)**
- Campaign can exist without experiments
- Campaign does NOT define success logic
- Leads belong to campaign

**UI (V1)**
- Create / edit campaign
- Assign team members
- View experiments list

## 4. EXPERIMENT (CORE OF V1)

**Purpose**
Define conversion hypothesis + capital rules.

**Fields (V1)**
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

**Rules (STRICT)**
- Only one experiment per campaign may be running
- Attribution only while running
- Once completed or terminated, experiment is immutable

**UI (V1)**
- Create experiment
- Start / pause / end experiment (admin only)
- View performance + cost summary

## 5. LEADS (CAMPAIGN-OWNED)

**Fields (V1)**
- id
- campaign_id
- contact_data
- status (active | paid_customer | do_not_contact | permanently_not_interested)
- created_at

**Rules**
- Leads may appear in multiple experiments
- Leads exit experiments on terminal status
- No experiment-specific lead duplication

## 6. CRM / DIALER INTEGRATION (NO REWIRING)

**Assumptions**
- Dialer already exists
- Outcomes already exist

**Canonical Outcomes (READ-ONLY)**
- No Answer
- Busy
- Wrong #
- Not Interested
- Callback
- Info
- Schedule

**V1 Rule**
CRM UI and dialer behavior are unchanged in v1.

## 7. PERFORMANCE EVENTS (FACTS)

**PerformanceEvent Table (V1)**

**Fields:**
- id
- campaign_id
- experiment_id
- lead_id (nullable)
- event_type
- event_timestamp
- metadata_json

**Event Types (V1 ENUM)**
- dial_attempt
- conversation
- qpc
- install_scheduled
- install_attended
- calculator_installed
- paid_conversion

**QPC Definition (LOCKED)**
- duration ≥ 150 seconds
- outcome ∈ {Schedule, Info, Callback}

**Attribution Rule (ENFORCED)**
Event belongs to the experiment that is running at event_timestamp.

## 8. COST ATTRIBUTION (V1 MECHANICS)

### 8.1 Team Members

**Fields:**
- id
- name
- email
- role
- hourly_rate_usd
- active

**Rule:**
One campaign per email/login

### 8.2 Time Logs

**Fields:**
- id
- team_member_id
- campaign_id
- date
- hours_logged

No splitting logic.

### 8.3 Bonus Events (NEW)

**Fields:**
- id
- experiment_id
- team_member_id
- event_type
- bonus_amount_usd
- created_at

**Rules:**
- Bonus rules defined on Experiment
- One bonus per qualifying event
- Bonus locked once created
- Only while experiment = running

### 8.4 Tool Costs

**Twilio**
- Pull daily usage via API
- Only record calls ≥ 150 seconds
- All calls keep metadata

**Google Cloud**
- Daily cost import via billing export

### 8.5 Cost Rollup

**Fields:**
- date
- campaign_id
- experiment_id
- source (labor | bonus | twilio | gcp)
- cost_usd

Rollups are append-only.

## 9. EVALUATIONS (HUMAN DECISIONS)

**Evaluation Fields (V1)**
- id
- experiment_id
- created_at
- capital_cap_usd
- time_cap_days
- tranche_size_usd
- verdict (pass | fail | continue | stop)
- reason
- recommended_next_action
- admin_notes

**Rules**
- Evaluations are immutable
- No automation triggered
- Admin-only creation

## 10. STOP / CONTINUE SIGNALS (DISPLAY ONLY)

**Computed Metrics (V1)**
- Capital spent vs cap
- Tranches consumed
- Installs per tranche
- Paid conversions per tranche

**System Behavior**
- Surface signals
- Flag "Evaluation Recommended"
- Never auto-stop

## 11. REPORTING (V1)

**Weekly Admin Email (REQUIRED)**

Includes:
- Campaign
- Experiment
- Spend (week + total)
- Tranches consumed
- QPCs
- Installs
- Paid conversions
- Evaluation recommended (yes/no)

**Interrupt Alert**
- Capital cap ≥ 80–90%
- OR time cap nearing

## 12. OVERRIDES (MINIMAL)

**OverrideLog (STUB)**

**Fields:**
- id
- evaluation_id
- admin_user_id
- rationale
- created_at

No automation tied to this.

## 13. DATA DISCIPLINE (ENFORCED)

- Missing data = not counted
- No retroactive edits
- No inferred metrics
- Historical truth preserved

## 14. EXPLICITLY DEFERRED (DO NOT BUILD)

- Experiment templates
- Auto-scaling
- Auto-iteration
- Portfolio allocator
- CAC/LTV forecasting
- Multi-campaign labor allocation
- Real-time dashboards

## 15. V1 SUCCESS CRITERIA

V1 is successful if:
- You can run one real experiment
- You get a clean weekly evaluation
- Capital spend is visible and bounded
- No re-architecture is required for v2

## FINAL NOTE TO AI DEV

Do not add features.
Do not optimize prematurely.
Do not infer intent.
If unclear, ask.


