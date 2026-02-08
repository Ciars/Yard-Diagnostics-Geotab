# GeoYard Discovery Findings Log

Last updated: 2026-02-08
Owner: Product Discovery
Scope: Circet Ireland + UK transport operations (MyGeotab Add-In context)

## 1) Source Of Truth And Confidence

This log distinguishes between what is confirmed vs inferred.

Confidence scale:
- `High`: validated by direct stakeholder statement or implemented behavior in code.
- `Medium`: documented in PRD/roadmap but not yet validated by stakeholders.
- `Low`: product hypothesis pending stakeholder validation.

Current evidence sources:
- User proxy context (Transport Analyst at Circet Ireland, works directly with Head of Transport, Head of Compliance, Transport Manager Ireland, Admins, Mechanics): `High`
- Proxy research Pack A (Dispatch Readiness Workflow) provided by user on 2026-02-08: `High`
- Product documents: `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/docs/PRD.md`, `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/docs/ROADMAP.md`, `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/docs/TECH_SPEC.md`: `Medium`
- Implemented behavior in code: `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/src/services/FleetDataService.ts`, `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/src/components/Dashboard/Dashboard.tsx`, `/Users/ciaranmadigan/Desktop/Sites/Yard Vision/src/components/AssetTable/AssetHealthDashboard.tsx`: `High`

## 2) Customer And User Map

### Customer (Economic + Organizational)
- Circet transport operations leadership (budget and operational accountability): `Medium`
- Operational deployment context: Geotab MyGeotab Add-In, high-volume fleet operations: `High`

### Users
- Transport Admins (tactical dispatch readiness): `High`
- Transport Manager (strategic utilization, reliability, planning): `High`
- Head of Compliance (safety/compliance assurance and audit evidence): `High`
- Mechanics / maintenance operations (issue resolution): `High`
- Head of Transport (cross-functional performance and risk): `Medium`

## 3) Current Product Reality (As Implemented)

Confirmed implemented capabilities:
- Zone-first yard filtering and high-density asset table/map workflow: `High`
- KPI-driven exception triage (critical, silent, dormant, charging, camera): `High`
- Deep asset health view with fault/exception history and DVIR grouping: `High`
- Polling and refresh model for near-real-time operational awareness: `High`
- Camera health surfaced as a first-class signal: `High`

Known constraints from docs/code:
- Client-side architecture with Geotab API limits; no separate backend system of record: `High`
- Strategic/history-heavy reporting still limited vs tactical real-time view: `Medium`
- Some data fields rely on fallback logic and asynchronous enrichment (possible user trust gap): `Medium`
- Primary operational platform is an in-house system ("Shop") with no current integration path: `High`

## 4) Findings Register (V2)

F-001
- Finding: The primary value moment is fast dispatch readiness decisions at yard level.
- Confidence: `High`
- Evidence: PRD positioning + implemented zone-first architecture.
- Impact: High operational leverage in first hour of day.

F-002
- Finding: Users need exception-first visibility, not raw telematics volume.
- Confidence: `High`
- Evidence: KPI and fault classification model in code and PRD.
- Impact: Direct reduction in cognitive load.

F-003
- Finding: Fault + DVIR + device + camera data is now converged in one interface, but action execution is still external.
- Confidence: `High`
- Evidence: Expanded health dashboard shows diagnostics; limited in-product resolution workflow.
- Impact: Insight-to-action lag remains.

F-004
- Finding: Product is currently stronger for tactical operations than strategic fleet optimization.
- Confidence: `Medium`
- Evidence: Current features are snapshot/operational; roadmap includes historical and cross-zone strategy.
- Impact: Limits manager-level value capture.

F-005
- Finding: Data confidence transparency is likely a major adoption lever.
- Confidence: `Low`
- Evidence: Enrichment/fallback behavior in service layer; no explicit confidence UX.
- Impact: Could materially improve trust in critical decisions.

F-006
- Finding: Compliance stakeholder requirements are partially represented (DVIR visibility) but evidence workflows are not yet explicit.
- Confidence: `Medium`
- Evidence: Open DVIR defect surfacing exists; compliance-specific reporting/audit trail not clear.
- Impact: Risk exposure if unresolved.

F-007
- Finding: Circet largely operates leased vehicles on roughly 4-year cycles (not primarily owned assets).
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Dispatch and lifecycle planning must support lease-cycle-driven issuance and decommissioning.

F-008
- Finding: Fleet composition is highly mixed (EV cars, multiple van classes, specialty vehicles such as hoist vans and polling trucks).
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Readiness logic needs role/vehicle-type-aware thresholds and not a one-size-fits-all model.

F-009
- Finding: "Shop" is the primary dispatch/admin system of record for vehicle/driver assignment and commissioning/decommissioning.
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: GeoYard must coexist with Shop-centric workflows.

F-010
- Finding: Shop is dated and currently not integrable.
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Workflow improvements should assume no direct Shop API integration in near term.

F-011
- Finding: Predictable dispatch events (new hires and planned lease-cycle replacements) are generally manageable.
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Highest product value likely sits in unplanned volatility, not planned issuance flows.

F-012
- Finding: Operational volatility is driven by staff churn and contract loss events, creating bulk decommissioning pressure.
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Bulk workflows are a major opportunity area and likely current pain amplifier.

F-013
- Finding: Daily operations currently rely mostly on Shop plus Geotab.
- Confidence: `High`
- Evidence: Proxy Pack A.
- Impact: Any proposed workflow must map clearly to this two-tool reality.

F-014
- Finding: Initial perception is that current road-ready visibility is "covering pretty well."
- Confidence: `Medium`
- Evidence: Proxy Pack A (subjective assessment).
- Impact: Priority may shift from basic readiness visibility toward workflow speed, reliability, and edge-case handling.

F-015
- Finding: Geotab fault-management workflow is currently not utilized operationally.
- Confidence: `High`
- Evidence: Proxy Pack B.
- Impact: Fault-derived triage and resolution features may have low immediate adoption unless workflow/process ownership is established.

F-016
- Finding: DVIR process is actively used and is a compliance requirement.
- Confidence: `High`
- Evidence: Proxy Pack B.
- Impact: DVIR is a mandatory pathway and should be treated as the primary issue-to-resolution workflow anchor.

F-017
- Finding: Minor/mid-level issues are often handled by onsite Northgate workshop mechanics.
- Confidence: `Medium`
- Evidence: Proxy Pack B ("believe" statement).
- Impact: Resolution routing likely needs local-vs-vendor classification and ownership clarity.

F-018
- Finding: Severe issues may be sent back to vendor repair centers.
- Confidence: `Medium`
- Evidence: Proxy Pack B ("believe" statement).
- Impact: Cross-party handoff and status visibility are likely critical friction points.

F-019
- Finding: Tracking offsite vendor repairs is problematic; vehicles may remain in repair centers for long periods.
- Confidence: `High`
- Evidence: Proxy Pack B.
- Impact: Long-cycle blind spots likely increase downtime risk and reduce dispatch certainty.

F-020
- Finding: Issue detection responsibility follows vehicle possession (transport team pre-handover, then driver once assigned).
- Confidence: `High`
- Evidence: Proxy Pack B follow-up.
- Impact: Detection accountability is distributed; handover boundaries are critical control points.

F-021
- Finding: Onsite vs vendor repair routing appears to be driven by whether repair is feasible without major part replacement.
- Confidence: `Medium`
- Evidence: Proxy Pack B follow-up ("I think").
- Impact: Triage logic should capture repair complexity/parts dependency as a routing signal.

F-022
- Finding: Repair tracking lives in Shop, with unclear automation beyond system entry.
- Confidence: `Medium`
- Evidence: Proxy Pack B follow-up.
- Impact: Status latency and manual-update risk likely persist in offsite repair lifecycle.

F-023
- Finding: Extreme vendor repair dwell can reach up to one year.
- Confidence: `High`
- Evidence: Proxy Pack B follow-up.
- Impact: This is a severe utilization and readiness risk; escalation/SLA visibility is a high-priority opportunity.

F-024
- Finding: Return-to-service gate includes roadworthy condition plus telematics device and camera present.
- Confidence: `High`
- Evidence: Proxy Pack B follow-up.
- Impact: Dispatch readiness should explicitly show these gate checks as pass/fail criteria.

F-025
- Finding: Fleet electrification is under active organizational pressure and currently high stress.
- Confidence: `High`
- Evidence: User strategic context update (2026-02-08).
- Impact: EV adoption barriers now directly affect transport operating stability and leadership confidence.

F-026
- Finding: Circet accepted a large EV van intake (hundreds of Vivaro-E units) based on favorable supplier offer.
- Confidence: `High`
- Evidence: User strategic context update (2026-02-08).
- Impact: Assignment and utilization risk is concentrated if adoption constraints persist.

F-027
- Finding: Driver acceptance is a key EV deployment constraint; home charging feasibility is frequently blocked (renting/on-street parking).
- Confidence: `High`
- Evidence: User strategic context update (2026-02-08).
- Impact: EV allocation cannot be based on vehicle availability alone; driver/home-charging eligibility is a gating factor.

F-028
- Finding: Range anxiety exists but appears secondary to charging-access constraints.
- Confidence: `Medium`
- Evidence: User strategic context update (relative weighting statement).
- Impact: Product/design focus should prioritize charging-feasibility workflow before range-education interventions.

F-029
- Finding: Transport manager stress is materially elevated due to EV transition friction and cascading operational pressure.
- Confidence: `High`
- Evidence: User strategic context update (2026-02-08).
- Impact: There is a near-term need for manager-facing risk visibility and escalation support.

F-030
- Finding: EV ineligibility drivers include route/duty profiles where daily distance or road-time patterns are unsuitable for Vivaro-E operations.
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: Assignment feasibility must include duty-profile constraints, not only charging/home context.

F-031
- Finding: Home-charging infeasibility has multiple structural causes (renting restrictions, terraced-road parking, allocated spaces away from home).
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: EV acceptance constraints are systemic and unlikely to be solved by communications alone.

F-032
- Finding: Current practical fallback for EV-ineligible drivers is often diesel assignment.
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: Electrification targets and diesel contingency planning are in direct operational tension.

F-033
- Finding: Public charging is used as fallback but is materially expensive.
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: Cost leakage likely increases when EV assignment is forced without charging-fit.

F-034
- Finding: Leadership tracks multiple electrification KPIs (acceptance rate, utilization, cost, CO2), with acceptance currently prioritized due to surplus leased EV vans incurring daily cost.
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: Near-term product success should optimize acceptance and utilization before secondary metrics.

F-035
- Finding: Escalation ownership and vendor dwell thresholds remain undefined/unknown in current discovery evidence.
- Confidence: `High`
- Evidence: User follow-up (2026-02-08) with explicit unknowns.
- Impact: This governance gap is a risk multiplier for downtime and accountability.

F-036
- Finding: A key weekly stressor for transport management is standby buffer calibration (too many idle vehicles vs too few for unexpected demand).
- Confidence: `High`
- Evidence: User follow-up (2026-02-08).
- Impact: There is a high-value planning opportunity around standby sizing and risk-adjusted fleet availability.

F-037
- Finding: External EV playbook research reinforces an existing local pain pattern: surplus EV vans can accumulate when vehicle capability and driver duty-cycle/charging context are mismatched.
- Confidence: `Medium`
- Evidence: EV Fleet Adoption Playbook (user-provided PDF) + alignment with local proxy findings.
- Impact: Assignment logic and pre-qualification become central to avoiding lease-cost waste.

F-038
- Finding: Treating Vivaro-e 50kWh and 75kWh as separate operational classes is a practical planning principle with direct assignment implications.
- Confidence: `Medium`
- Evidence: EV Fleet Adoption Playbook; references include EV database and industry sources.
- Impact: Reduces avoidable assignment failures from using one EV profile for heterogeneous routes.

F-039
- Finding: Charging-source mix (home/depot vs public rapid) is likely the dominant controllable driver of EV operating cost variance.
- Confidence: `Medium`
- Evidence: EV Fleet Adoption Playbook cost tables and cited charging-price differentials.
- Impact: Public-charging-heavy operations can undermine EV business case despite electrification progress.

F-040
- Finding: Shared charging infrastructure partnerships (e.g., inter-fleet depot access) appear to be a viable intervention pattern.
- Confidence: `Medium`
- Evidence: EV Fleet Adoption Playbook references Openreach/First Bus examples.
- Impact: Can expand charging availability without equivalent capex for new depot grid build-out.

F-041
- Finding: Source quality in the external playbook is mixed (official sources + press releases + trade blogs + Reddit), so hard numeric thresholds should be treated as hypotheses, not policy.
- Confidence: `High`
- Evidence: Works-cited quality review from EV Fleet Adoption Playbook.
- Impact: Prevents overconfident rollout decisions based on non-validated benchmark numbers.

F-042
- Finding: A weighted EV-eligibility model is directionally strong, but default weights/thresholds need local calibration against Circet route, payload, weather, and role realities.
- Confidence: `High`
- Evidence: EV Fleet Adoption Playbook model structure + local operating context.
- Impact: Supports pragmatic deployment while reducing false positives/false negatives in assignment.

F-043
- Finding: Standby capacity and vendor repair dwell are a coupled system; controlling one without the other increases both idle-cost risk and dispatch shortfall risk.
- Confidence: `High`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model (user-provided PDF) + alignment with local findings on long dwell (`F-023`) and standby stress (`F-036`).
- Impact: Product should unify standby and dwell decisions in one control workflow, not separate views.

F-044
- Finding: Static standby percentages are weak under volatility; target buffer should be tied to service-level intent plus observed demand and OOS variance.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model sizing framework.
- Impact: Enables defensible standby targets and clearer rightsizing/surge triggers.

F-045
- Finding: Splitting reserve into hot standby, warm buffer, and strategic contingency is a practical way to separate immediate readiness from slower backup capacity.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model reserve-tier framework.
- Impact: Prevents hidden idle inventory and improves response planning under uncertainty.

F-046
- Finding: Vendor dwell control depends on stage-level timestamps (OOS start, vendor acknowledgement, estimate, approval, parts ETA, repair start, repair complete, return-to-service).
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model + cited work-order practices.
- Impact: Without stage timestamps, escalation ownership and SLA control remain ambiguous.

F-047
- Finding: Approval lag, parts delays, and queue delays are likely major dwell drivers alongside technical repair complexity.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model process-failure decomposition.
- Impact: Intervention should target approval/handoff latency, not only workshop throughput.

F-048
- Finding: Time-based escalation ladders with explicit owner by threshold (hours/day triggers) are a repeatable control pattern for long vendor dwell.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model escalation design and SLA patterns.
- Impact: Provides a concrete template to close current unknowns on escalation ownership and trigger points.

F-049
- Finding: A structured cadence (daily readiness huddle, weekly standby+dwell control tower, monthly vendor performance review) is a plausible operating model for reducing firefighting.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model governance cadence.
- Impact: Can reduce manager stress by making high-friction decisions predictable and owned.

F-050
- Finding: Source quality in this external pack is mixed; it combines strong public/industry bodies with vendor blogs and trade content.
- Confidence: `High`
- Evidence: Works-cited review from Standby Capacity and Vendor Repair Dwell Operating Model.
- Impact: Use the operating model and instrumentation structure as transferable patterns, but treat hard thresholds as local calibration hypotheses.

F-051
- Finding: Transit spare-ratio references (e.g., ~10–13% observed examples and ~20% guideline contexts) are useful boundary checks but not directly transferable to Circet’s leased commercial-van context.
- Confidence: `Medium`
- Evidence: Standby Capacity and Vendor Repair Dwell Operating Model synthesis of FTA/APTA/TRB references.
- Impact: Avoid copying benchmark ratios; calibrate with Circet volatility, dwell distribution, and service-level targets.

F-052
- Finding: A practical “traffic-light” standby control policy (red/amber/green) can convert buffer decisions from gut-feel into explicit weekly triggers.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity (user-provided PDF).
- Impact: Improves repeatability and governance for standby increases/decreases.

F-053
- Finding: Dynamic Buffer Management (DBM) is presented as a low-data method that can run on simple operational counts (available standby, denials/stockouts) instead of heavy forecasting.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity model description.
- Impact: Feasible near-term operating model for Circet where system integration is constrained.

F-054
- Finding: The pack’s strongest transferable idea is to size standby against asymmetric cost-of-underage vs cost-of-overage (missed dispatch cost vs idle lease cost), not fixed percentages.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity (Newsvendor framing).
- Impact: Creates a defensible bridge between operations and finance on standby policy.

F-055
- Finding: Separating demand volatility into “churn/onboarding” vs “mechanical/repair” helps prevent one pooled standby buffer from masking distinct failure modes.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity framework.
- Impact: Supports cleaner intervention design (HR/dispatch planning vs repair escalation).

F-056
- Finding: Two guardrails are operationally specific and testable: remove long-repair vehicles from active-fleet denominator, and reclaim low-utilization “hoarded” standby assets.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity guardrail section.
- Impact: Reduces hidden capacity distortion and avoids over-buffering.

F-057
- Finding: A shadow-phase rollout (track and simulate decisions before changing fleet count) is a pragmatic adoption pattern for high-stress operations.
- Confidence: `Medium`
- Evidence: Optimizing Fleet Standby Capacity 90-day plan.
- Impact: Lowers rollout risk and improves trust before committing lease/rental changes.

F-058
- Finding: Numeric claims in this pack (e.g., specific standby percentages and performance uplifts) appear directional but not sufficiently source-transparent for policy lock-in.
- Confidence: `High`
- Evidence: Optimizing Fleet Standby Capacity source section quality and limited citation specificity.
- Impact: Treat hard thresholds as hypotheses requiring local validation data.

F-059
- Finding: In comparable UK fleet SMR reporting, in-garage VOR averages can be relatively short, while upstream delays (booking lead time, diagnostics backlog) create much larger readiness impacts.
- Confidence: `Medium`
- Evidence: Vendor Repair Dwell Reduction Operating Model synthesis.
- Impact: Dispatch risk management must track pre-repair waiting stages, not only workshop duration.

F-060
- Finding: The long-tail dwell problem is strongly associated with unknown parts ETA, diagnostics-capacity constraints, and low-response vendor communication periods.
- Confidence: `Medium`
- Evidence: Vendor Repair Dwell Reduction Operating Model source synthesis.
- Impact: Dwell control should prioritize “no plan/no ETA” cases as a separate risk class.

F-061
- Finding: Dedicated downtime ownership (“Dwell Controller”) plus tiered escalation and vendor re-routing is the most repeatedly evidenced intervention pattern for reducing dwell days.
- Confidence: `Medium`
- Evidence: Vendor Repair Dwell Reduction Operating Model case comparisons.
- Impact: Supports introducing named case ownership and re-route authority in operating design.

F-062
- Finding: Bilateral SLA design matters: vendor responsiveness and ETA discipline must be paired with internal approval-speed commitments to avoid self-inflicted dwell.
- Confidence: `Medium`
- Evidence: Vendor Repair Dwell Reduction Operating Model clause framework.
- Impact: Product/workflow changes should include approval-lag visibility and accountability, not vendor-only metrics.

F-063
- Finding: “Data as a contractual deliverable” (daily structured updates with stage timestamps) is a practical workaround where system integration is limited.
- Confidence: `High`
- Evidence: Vendor Repair Dwell Reduction Operating Model implementation guidance.
- Impact: Circet can build reliable dwell governance without direct Shop API access.

F-064
- Finding: A 30/60/90 rollout with tracker-first, pilot escalation on top vendors, then contractual hardening is a pragmatic sequencing model.
- Confidence: `Medium`
- Evidence: Vendor Repair Dwell Reduction Operating Model implementation plan.
- Impact: Reduces change risk while preserving dispatch continuity during transition.

F-065
- Finding: Source quality for this pack is mixed but stronger than prior packs on governance mechanics (public audit/procurement + provider case studies + media triangulation).
- Confidence: `High`
- Evidence: Vendor Repair Dwell Reduction Operating Model source list review.
- Impact: Escalation/governance structure is reasonably transferable; raw dwell benchmarks still require local validation.

## 5) Opportunity Hypotheses (Working)

H-01 Closed-loop issue resolution
- Hypothesis: Adding assignment/escalation/closure tracking will improve conversion from “issue seen” to “issue fixed.”
- Confidence: `Medium`
- Metric: Time-to-action, closure SLA, repeat-dispatch failures.

H-02 Decision confidence layer
- Hypothesis: Showing freshness/source-confidence per signal will reduce hesitation and false reassurance.
- Confidence: `Low`
- Metric: User trust score, override behavior, alert acknowledgement quality.

H-03 Compliance operating view
- Hypothesis: A dedicated compliance/risk lens (with auditable outputs) increases adoption by Compliance leadership.
- Confidence: `Medium`
- Metric: Manual reporting time, audit preparation effort, unresolved critical defect age.

H-04 Strategic manager mode
- Hypothesis: Multi-zone comparison + historical trend reporting unlocks manager-level retention and expansion value.
- Confidence: `Medium`
- Metric: Weekly active manager usage, strategic decision cycle time, dormant asset reduction.

H-05 Next-shift readiness forecast
- Hypothesis: Readiness prediction (battery/fault/charging risk) outperforms static threshold dashboards.
- Confidence: `Low`
- Metric: Dispatch failure rate, preventive interventions completed.

H-06 EV assignment feasibility workflow
- Hypothesis: Explicitly scoring driver-to-EV assignment feasibility (charging access, parking context, role constraints) will improve EV acceptance and utilization.
- Confidence: `Medium`
- Metric: EV acceptance rate, EV idle days, reassignment cycles, manager escalation volume.

H-07 Standby buffer optimizer
- Hypothesis: Decision support for minimum-safe standby by role/region/day can reduce both idle-cost waste and shortfall risk.
- Confidence: `Medium`
- Metric: Idle standby days, unfilled unexpected demand events, emergency reassignment count.

H-08 Charging-mix guardrails
- Hypothesis: Explicit policy guardrails for public-rapid charging share (with intervention triggers) will preserve EV unit economics during transition.
- Confidence: `Medium`
- Metric: %kWh home/depot vs public rapid, EV cost-per-mile variance, escalations due to charging infeasibility.

H-09 Vendor dwell control tower
- Hypothesis: A stage-timestamped vendor dwell control tower with time-based escalation ownership will reduce long-tail downtime and lower standby oversizing pressure.
- Confidence: `Medium`
- Metric: P50/P90 dwell days, % vehicles crossing Day-7 OOS, approval-lag hours, and standby surplus days.

H-10 Standby trigger policy
- Hypothesis: A simple red/amber/green standby trigger policy with weekly adjustment rules will reduce both missed dispatches and idle standby cost versus unmanaged buffers.
- Confidence: `Medium`
- Metric: Red-zone frequency, missed dispatches due to no vehicle, standby utilization %, and spot-hire spend.

H-11 Geotab-first dwell control
- Hypothesis: A Geotab-first dwell control tower (vendor geofence events + stage timestamp tracker + SLA countdown/escalation) will reduce Day-14+ dwell volume and standby inflation even without Shop integration.
- Confidence: `Medium`
- Metric: % events with unknown ETA, Day-14+/Day-30+ dwell rates, re-route cycle time, and replacement-hire spend.

## 6) Proxy Research Packs (For Deep Research LLM)

Use this output format for every pack:
- Top 5 findings (ranked by impact)
- Persona affected
- Current workaround
- Frequency + severity
- Quantified impact (time/cost/risk)
- Evidence confidence (`High`/`Medium`/`Low`)
- Recommended product bets (`Now`/`Next`/`Later`)

Pack A: Dispatch Readiness Workflow
- Learn: End-to-end workflow from first review to first dispatch.
- Questions:
  - What is the exact sequence of tools/steps each morning?
  - Where are delays, blind spots, or handoff failures?
  - What info is needed in first 30 seconds vs deep dive?

Pack B: Triage-To-Repair Workflow
- Learn: How faults/defects become actions and then verified fixes.
- Questions:
  - Who owns triage, assignment, and closure?
  - What causes reopen/repeat issues?
  - What context mechanics need but don’t get quickly?

Pack C: Compliance And Risk Workflow
- Learn: How compliance decisions are made and evidenced.
- Questions:
  - What are highest-risk defect/fault categories?
  - What reporting and audit artifacts are mandatory?
  - What currently requires manual compilation?

Pack D: Data Trust And Alert Credibility
- Learn: Where users distrust telemetry.
- Questions:
  - Which alerts are perceived as noisy or late?
  - What stale/missing-data scenarios create bad decisions?
  - What confidence signal would make users trust/act faster?

Pack E: Strategic Fleet Planning
- Learn: Weekly/monthly strategic decisions and reporting needs.
- Questions:
  - Which decisions depend on historical trend data?
  - Which cross-yard comparisons are most valuable?
  - Which KPIs influence replacement/redeployment budgets?

Pack F: Integration And Change Constraints
- Learn: System/process dependencies and rollout blockers.
- Questions:
  - What existing systems must be integrated first (CMMS/planning/compliance)?
  - What governance/security constraints exist?
  - What training/change-management risks are most likely?

Pack G: EV Adoption And Assignment Feasibility
- Learn: Why EV assignments fail and how to reduce refusal/reassignment loops.
- Questions:
  - What proportion of drivers cannot install or access home charging?
  - What non-home-charging alternatives are realistically available by region/team?
  - What criteria are used today when matching driver-to-EV?
  - What are the top reasons for EV refusal (ranked)?
  - What is the operational/cost impact of unsuccessful EV assignments?

Pack H: Standby Capacity Strategy And Volatility
- Learn: How standby targets are set and where over/under-buffering causes losses.
- Questions:
  - How is standby level currently decided each week?
  - What signals trigger standby increases/reductions?
  - What is the historical cost of over-buffering (idle lease cost)?
  - What is the operational penalty of under-buffering (missed/late dispatch)?
  - Which roles/regions are most volatile?

## 6.1) Pack A Received: Dispatch Readiness Workflow (2026-02-08)

Top findings captured:
- Core system context: Shop is the primary operational tool; Geotab is also used daily.
- Asset model context: leased fleet lifecycle is central to planning.
- Dispatch pattern: planned events are manageable; unplanned churn/contract shifts are harder.
- Key pain area signal: bulk decommissioning under volatility.
- Product signal: readiness view may already be acceptable at baseline.

Current workaround:
- Teams handle cross-system work manually between Shop and Geotab.
- Bulk decommission scenarios appear process-heavy and coordination-heavy.

Evidence confidence:
- Most statements in this pack are `High` confidence (direct proxy operational context).
- "Road-ready score is covering well" is logged as `Medium` confidence pending wider persona validation.

What is still unknown in Pack A:
- Exact 5am-to-first-vehicle step sequence by role.
- Time spent per yard and where delay clusters appear.
- Frequency/severity of "last-minute surprise" cases.
- Quantified impact of bulk decommission events (hours, errors, dispatch risk).

## 6.2) Pack B Received: Fault + DVIR Triage To Resolution (2026-02-08)

Top findings captured:
- Geotab fault area is not currently used by the company.
- DVIR is used and mandatory for compliance.
- Likely routing model: smaller issues onsite workshop; larger issues vendor repair centers.
- Tracking of vendor/offsite repairs is problematic.
- Long dwell time in repair centers is a known operational pain.
- Detection accountability follows current possessor of vehicle.
- Return-to-service includes roadworthy + telematics + camera checks.

Current workaround:
- DVIR appears to be the operational trigger, with repair routing handled through existing workshop/vendor channels.
- Offsite status tracking seems manual and fragmented.

Evidence confidence:
- `High`: DVIR requirement, Geotab fault workflow not utilized, tracking pain and long vendor dwell.
- `Medium`: precise routing thresholds and ownership model (onsite vs vendor) pending confirmation.
- `High`: distributed detection ownership and return-to-service gate criteria.

What is still unknown in Pack B:
- Exact owner by step after detection: triage, assign, approve, close.
- SLA targets for onsite and vendor repairs.
- How closure is recorded and reconciled back into dispatch decisions.
- Reopen rate / repeat-defect rate.
- Which role is accountable for chasing long vendor dwell cases.
- Whether Shop repair tracking includes automated status transitions or reminders.

## 6.3) Strategic Context Received: EV Transition Pressure (2026-02-08)

Top findings captured:
- Organization is under pressure to electrify fleet.
- Large EV van intake has been accepted (Vivaro-E at scale).
- Driver acceptance is constrained primarily by charging practicality at home.
- Range anxiety is present but secondary.
- Stress load on transport management is rising.
- Ineligibility also comes from duty-profile mismatch (distance/road-time role fit).
- Current fallback is often diesel, with public charging used but expensive.
- Acceptance rate is currently leadership's dominant KPI due to surplus EV carrying cost.
- Weekly standby balancing is a major manager stressor.

Current workaround:
- Assignment decisions appear to be handled case-by-case with no clear feasibility scoring framework logged yet.

Evidence confidence:
- `High` for existence of pressure, intake scale direction, and charging-feasibility friction.
- `Medium` for relative ranking of refusal reasons (needs quantification).

What is still unknown in EV context:
- EV assignment refusal rate and trend.
- Eligibility criteria currently used before assigning EVs.
- Regional differences in charging feasibility.
- Utilization impact: EV idle time, reassignment cycles, and dispatch penalties.
- Quantified public-charging spend vs diesel fallback cost.
- Which teams/roles most frequently fail EV matching.

## 6.4) External Research Ingested: EV Fleet Adoption Playbook (2026-02-08)

Document ingested:
- `/Users/ciaranmadigan/Downloads/EV Fleet Adoption Playbook.pdf`

Discerning assessment summary:
- Strong directional value:
  - Duty-cycle-first assignment logic.
  - 50kWh vs 75kWh role separation.
  - Charging-mix economics as a core control variable.
  - Structured fallback hierarchy and phased implementation.
- Weaker evidence areas:
  - Some quantitative claims rely on trade/vendor/blog sources and at least one Reddit reference.
  - Several thresholds (e.g., fixed mileage cut-offs) are likely context-sensitive and should not be copied verbatim.
- Recommendation:
  - Use the framework structure, not the raw numbers, as the implementation starting point.
  - Validate thresholds with Circet-specific telemetry before policy decisions.

Source confidence ladder for this pack:
- `Higher confidence`: UK policy framework references, official operator partnership announcements.
- `Medium confidence`: aggregated industry data and specialist publications.
- `Lower confidence`: vendor marketing/blog figures and forum-derived operational assumptions.

## 6.5) External Research Ingested: Standby Capacity And Vendor Repair Dwell Operating Model (2026-02-08)

Document ingested:
- `/Users/ciaranmadigan/Downloads/Standby Capacity and Vendor Repair Dwell Operating Model for Leased Commercial Fleets.pdf`

Discerning assessment summary:
- Strong directional value:
  - Treat standby sizing and vendor dwell as one coupled control system.
  - Use stage-level repair timestamps to expose non-mechanical delay drivers.
  - Apply explicit escalation ownership and decision cadence (daily/weekly/monthly).
  - Frame standby decisions against target service level and measured volatility.
- Weaker evidence areas:
  - Several numeric thresholds and exemplars are transit-oriented and not directly comparable to Circet’s operating model.
  - Source base includes vendor/trade/blog material in addition to higher-quality public/industry references.
- Recommendation:
  - Use this pack as an operating-model template (workflow, cadence, instrumentation, escalation structure).
  - Treat ratio/threshold values as starting hypotheses and calibrate against Circet data before policy lock-in.

Source confidence ladder for this pack:
- `Higher confidence`: FTA/APTA/TRB/DOE references and formal audit/governance publications.
- `Medium confidence`: public-sector case studies and fleet-industry benchmark summaries.
- `Lower confidence`: vendor blogs, marketing-style guidance, and trade commentary.

## 6.6) External Research Ingested: Optimizing Fleet Standby Capacity (2026-02-08)

Document ingested:
- `/Users/ciaranmadigan/Downloads/Optimizing Fleet Standby Capacity.pdf`

Discerning assessment summary:
- Strong directional value:
  - Standby should be managed with explicit trigger rules, not static percentages.
  - Cost-of-underage vs cost-of-overage framing is useful for finance-operational alignment.
  - Minimal viable dataset approach is pragmatic for low-integration environments.
  - Shadow-phase rollout is a sensible risk-control pattern before live fleet-size decisions.
- Weaker evidence areas:
  - Several numeric recommendations are asserted with limited source granularity in the extracted source section.
  - Some benchmarks appear cross-sector/transfer-based and need local calibration.
- Recommendation:
  - Use the operating logic (triggering, guardrails, rollout cadence) as transferable structure.
  - Calibrate thresholds (zone bands, trigger counts, utilization targets) with Circet historical data before policy standardization.

Source confidence ladder for this pack:
- `Higher confidence`: established OR concepts (newsvendor framing, buffer-control logic).
- `Medium confidence`: cross-fleet case claims with partial methodological detail.
- `Lower confidence`: specific percentage/performance uplift assertions without strong traceable citation detail.

## 6.7) External Research Ingested: Vendor Repair Dwell Reduction Operating Model (2026-02-08)

Document ingested:
- `/Users/ciaranmadigan/Downloads/Vendor Repair Dwell Reduction Operating Model for a Leased Commercial Fleet.pdf`

Discerning assessment summary:
- Strong directional value:
  - Prioritize long-tail dwell control over average repair-time reporting.
  - Use named case ownership, tiered escalation, and explicit re-route rights.
  - Treat data reporting and stage timestamps as enforceable operating/contract requirements.
  - Sequence rollout as tracker-first -> pilot escalation -> contractual hardening.
- Weaker evidence areas:
  - Telecom/utility-specific public dwell benchmarks remain limited.
  - Several quantified outcomes are provider case-study based and may include selection bias.
- Recommendation:
  - Use this pack to define operating mechanics (ownership, thresholds, clause structure, cadence).
  - Validate numeric thresholds and SLA cut points using Circet’s own dwell distribution before locking policy.

Source confidence ladder for this pack:
- `Higher confidence`: public audit and procurement-governance references.
- `Medium confidence`: provider case studies and trade publications with named metrics.
- `Lower confidence`: media examples of extreme waits and secondary summaries.

## 7) Open Unknowns (Explicit Uncertainty)

- Unknown: Exact operational SLA targets per role for issue response and closure.
- Unknown: Compliance evidence requirements at artifact level (what must be exportable and retained).
- Unknown: Which current alerts are most trusted vs ignored.
- Unknown: Financial impact model used by leadership (downtime cost, failed-dispatch cost, maintenance leakage).
- Unknown: Integration priority order across existing systems and teams.
- Unknown: Quantified EV assignment feasibility rates (home charging access, refusal reasons, and reassignment overhead).
- Unknown: Defined owner and threshold model for vendor-repair escalation.
- Unknown: Quantified standby over/under-buffer costs by week/region.
- Unknown: Baseline stage-duration distribution for repair lifecycle (acknowledgement, estimate, approval, parts ETA, repair start, completion) by vendor.
- Unknown: Current standby taxonomy and policy (hot vs warm vs contingency) and who authorizes buffer-state changes.
- Unknown: Monetized “cost of missed dispatch” by role/contract type to support any newsvendor-style standby baseline.
- Unknown: Current baseline for standby utilization and denial frequency (needed to judge whether trigger-policy change is additive).
- Unknown: Current distribution of vendor dwell by stage for Circet specifically (booking wait vs diagnostics vs approval vs parts vs active repair).
- Unknown: Which vendor contracts already permit re-route, replacement-vehicle recovery, or penalty/credit enforcement.

## 8) Next Update Protocol

When proxy findings are received:
- Add each finding as `F-###` with confidence and source.
- Promote/demote hypothesis confidence as evidence improves.
- Tag each finding to a persona and business metric.
- Convert validated findings into roadmap candidates with `Now/Next/Later`.
