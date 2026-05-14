# Application Port Scenario Data Testing — Program Plan

| | |
|---|---|
| **Document Type** | Program Plan |
| **Status** | Draft |
| **Version** | 1.0 |
| **Date** | 2026-05-13 |
| **Related Document** | Application Port Scenario Data Testing — Approach & Strategy |

---

## Executive Summary

This program plan operationalizes the *Application Port Scenario Data Testing Approach & Strategy* for a specific client engagement. It defines the phases, deliverables, roles, effort estimates, risks, and success criteria for validating an application source code port using scenario-based snapshot testing.

The plan is designed to scale across a wide range of application complexity — from ~20,000 LOC to 2+ million LOC. Effort estimates, scenario counts, and phase durations are expressed as scaling guidance rather than fixed values, and should be calibrated during the Discovery phase for each engagement.

---

## Table of Contents

1. [Phases & Work Breakdown](#phases--work-breakdown)
2. [Deliverables](#deliverables)
3. [Roles & Responsibilities](#roles--responsibilities)
4. [Effort Estimation Guide](#effort-estimation-guide)
5. [Risks & Mitigations](#risks--mitigations)
6. [Assumptions](#assumptions)
7. [Success Criteria & Exit Conditions](#success-criteria--exit-conditions)
8. [Ongoing Operations](#ongoing-operations)

---

## Phases & Work Breakdown

### Phase 0 — Discovery & Planning

**Objective:** Assess the application, agree on scope, and calibrate the plan.

| Task | Description |
|------|-------------|
| 0.1 Application Assessment | Review the source application's size, complexity, number of programs/modules, database table count, batch processes, and integration points. |
| 0.2 Scenario Scope Agreement | Work with the client to determine the number and type of scenarios. Agree on coverage targets (see Effort Estimation Guide). |
| 0.3 Environment Requirements | Identify source and target environment needs — isolated test environments, database access, credentials, network access, and tooling. |
| 0.4 Plan Calibration | Using the assessment data, calibrate effort estimates, timeline, and team composition for the remaining phases. Produce a project-specific schedule. |
| 0.5 Artifact Repository Setup | Establish version-controlled repository for all test artifacts: scenario definitions, data snapshots, schema mappings, test scripts, and expected results. |

**Gate:** Signed-off scope agreement and calibrated project schedule before proceeding.

---

### Phase 1 — Scenario Definition

*Maps to Strategy Step 1*

**Objective:** Define and document all testing scenarios.

| Task | Description |
|------|-------------|
| 1.1 Identify Functional Areas | Catalog the application's major functional areas (e.g., batch processing, data entry, reporting, integrations). |
| 1.2 Define Scenarios | For each functional area, define specific scenarios with: name, description, preconditions, steps, expected database changes, and expected non-database side effects. |
| 1.3 Prioritize Scenarios | Assign priority (P1/P2/P3) based on business criticality and risk. P1 scenarios are required for go-live; P2 are strongly recommended; P3 are nice-to-have. |
| 1.4 Client Review & Sign-off | Review scenario list with client. Obtain sign-off on scope. |

**Deliverable:** Scenario Definition Document (see Deliverables section).

---

### Phase 2 — Source Environment Data Setup

*Maps to Strategy Step 2*

**Objective:** Create starting data snapshots and capture expected results on the source system.

| Task | Description |
|------|-------------|
| 2.1 Create Starting Data Set | Build a minimal, non-production data set in an isolated source environment. If multiple starting states are needed, create each as a named snapshot. |
| 2.2 Execute Scenarios on Source | Run each scenario on the source system. Capture the 'after' data snapshot for each. |
| 2.3 Log Database Activity | Enable database-level monitoring during scenario execution (e.g., STRDBMON on IBM i, Extended Events on SQL Server, pg_stat_statements on PostgreSQL) to identify all tables read and written. |
| 2.4 Document Table Impact Map | Produce a table-level impact map per scenario: which tables are read, inserted, updated, or deleted. |
| 2.5 Capture Non-Database Side Effects | Document any non-database outputs (emails sent, files written, API calls made) per scenario for later validation. |

**Deliverable:** Source data snapshots (starting + expected per scenario), Table Impact Map, Non-Database Side Effects Log.

**Dependency:** Requires client participation and source system access.

---

### Phase 3 — Data Conversion & Schema Mapping

*Maps to Strategy Step 3*

**Objective:** Convert source data snapshots into the target database format and document the mapping.

| Task | Description |
|------|-------------|
| 3.1 Document Schema Mapping | Create a formal schema mapping document covering: table/column renames, data type changes (e.g., numeric dates → DATE/TIMESTAMP), field length changes, dropped columns, added columns, default values. |
| 3.2 Build Data Conversion Scripts | Create repeatable, automated scripts to convert source snapshots into target-loadable format. |
| 3.3 Build Data Loading Scripts | Create repeatable, automated scripts to load converted data into the target database. Must support loading any scenario's starting or expected snapshot. |
| 3.4 Validate Conversion | Spot-check converted data against source to confirm accuracy. Run conversion for all scenarios and verify load success. |

**Deliverable:** Schema Mapping Document, Data Conversion Toolkit (scripts + documentation).

---

### Phase 4 — Automated Scenario Test Creation

*Maps to Strategy Step 4*

**Objective:** Create automatable test scripts in the target environment that replicate each scenario.

| Task | Description |
|------|-------------|
| 4.1 Design Test Automation Framework | Choose or build a test harness that can: load data, execute scenario actions, and invoke comparison tests. Define conventions for test naming, configuration, and execution. |
| 4.2 Implement Scenario Test Scripts | For each scenario, create an automated script that performs the equivalent actions in the target application. |
| 4.3 Add Application Test Hooks | Where needed, add hooks to the target application to support testing: batch job triggers, time/date emulation, test-mode flags for non-database side effects (e.g., write to audit table instead of sending email). |
| 4.4 Implement Non-Database Audit Capture | For scenarios with non-database side effects, implement audit table writes in the target application (active only in test mode) so these can be validated like any other table. |
| 4.5 Validate Test Scripts | Run each test script manually to confirm it executes the correct actions. |

**Deliverable:** Automated Scenario Test Suite, Application Test Hooks (documented).

---

### Phase 5 — Snapshot Comparison Test Creation

*Maps to Strategy Step 5*

**Objective:** Build automated comparison tests that diff expected vs. actual data per scenario.

| Task | Description |
|------|-------------|
| 5.1 Design Comparison Framework | Define the comparison approach: SQL-based diffs, custom comparison tool, or existing framework. Design modular per-table comparisons reusable across scenarios. |
| 5.2 Define Exclusion Rules | For each table, document columns to exclude from comparison (timestamps, audit user fields, auto-increment IDs, randomized data). Store as configuration, not hard-coded. |
| 5.3 Implement Table Comparisons | Build comparison tests for each table in the Table Impact Map. Each comparison should output: row count differences, missing rows, extra rows, and column-level value differences. |
| 5.4 Implement Non-Database Comparisons | Build comparison tests for audit tables capturing non-database side effects. |
| 5.5 Validate Comparisons | Run comparisons with known-matching data (should pass) and known-different data (should fail with correct diff output). |

**Deliverable:** Snapshot Comparison Test Suite, Exclusion Rules Configuration.

---

### Phase 6 — End-to-End Integration & Automation

*Maps to Strategy Step 6*

**Objective:** Wire everything together into a fully automated, repeatable test pipeline.

| Task | Description |
|------|-------------|
| 6.1 Build E2E Test Orchestrator | Create an orchestration script/pipeline that for each scenario: (1) loads starting data, (2) runs scenario test, (3) runs snapshot comparison, (4) collects results. |
| 6.2 Implement Reporting | Build a results report showing: per-scenario pass/fail, per-table pass/fail, row-level diffs for failures, and summary statistics (e.g., "14/16 scenarios passing, 42/45 tables matching"). |
| 6.3 Configure Parallel Execution | If multiple target environments are available, configure parallel scenario execution to reduce total run time. |
| 6.4 Schedule Nightly Runs | Set up nightly (or on-demand) automated execution of the full test suite. Configure notifications for the development team on completion. |
| 6.5 End-to-End Validation | Run the full pipeline. Verify that known-passing scenarios pass and known-failing scenarios fail with correct diagnostics. |

**Deliverable:** E2E Test Pipeline (automated, scheduled), Test Results Dashboard/Report.

---

### Phase 7 — Iteration & Stabilization

*Maps to Strategy Iteration section*

**Objective:** Run the feedback loop until all scenarios pass and the port is validated.

| Task | Description |
|------|-------------|
| 7.1 Triage Failures | For each failing scenario, determine root cause: bug in ported application, bug in test script, bug in data conversion, or expected difference requiring exclusion rule update. |
| 7.2 Fix & Re-test | Development team fixes ported application bugs. Test team fixes test/conversion bugs. Re-run affected scenarios. |
| 7.3 Add New Scenarios | As the port matures, add P2 and P3 scenarios. Add scenarios for newly discovered edge cases. |
| 7.4 Update Expected Data | If the source application changes (active development, bug fixes), re-capture expected snapshots and re-run conversion. |
| 7.5 Go-Live Readiness Assessment | When all P1 scenarios pass and P2 pass rate meets the agreed threshold, produce a Go-Live Readiness Report. |

**Deliverable:** Go-Live Readiness Report, Final Test Results.

**This phase is iterative and runs continuously until go-live.**

---

## Deliverables

| # | Deliverable | Phase | Format |
|---|-------------|-------|--------|
| D1 | Calibrated Project Schedule | 0 | Project plan (Gantt/timeline) |
| D2 | Scenario Definition Document | 1 | Markdown/Word document |
| D3 | Source Data Snapshots | 2 | Database exports (CSV/SQL dumps) |
| D4 | Table Impact Map | 2 | Spreadsheet or Markdown table |
| D5 | Schema Mapping Document | 3 | Spreadsheet or Markdown table |
| D6 | Data Conversion Toolkit | 3 | Scripts + README in version control |
| D7 | Automated Scenario Test Suite | 4 | Scripts in version control |
| D8 | Application Test Hooks Documentation | 4 | Markdown document |
| D9 | Snapshot Comparison Test Suite | 5 | Scripts in version control |
| D10 | Exclusion Rules Configuration | 5 | Config file(s) in version control |
| D11 | E2E Test Pipeline | 6 | CI/CD pipeline or orchestration scripts |
| D12 | Test Results Dashboard/Report | 6 | Automated report (HTML/Markdown/PDF) |
| D13 | Go-Live Readiness Report | 7 | PDF/Word document |

---

## Roles & Responsibilities

| Role | Responsibility | Staffing |
|------|---------------|----------|
| **Project Lead** (Consulting) | Overall plan execution, client communication, risk management, phase gate reviews | 1 |
| **Test Architect** (Consulting) | Design test framework, comparison approach, E2E pipeline, exclusion rules | 1 |
| **Test Developer(s)** (Consulting) | Implement scenario tests, comparison tests, data conversion scripts, E2E orchestration | 1–4 depending on scale |
| **Application Developer(s)** (Consulting) | Add test hooks to target application, fix ported application bugs found by scenario tests | From porting team |
| **Client SME(s)** | Define scenarios, execute scenarios on source system, validate expected results, review/sign-off | 1–2 |
| **Client DBA / Sys Admin** | Provide source environment access, assist with database monitoring, environment provisioning | As needed |

---

## Effort Estimation Guide

Effort scales with application complexity. The table below provides guidance ranges.

### Scaling Factors

| Factor | Small App (~20K LOC) | Medium App (~200K LOC) | Large App (~2M LOC) |
|--------|---------------------|----------------------|---------------------|
| Estimated Scenario Count | 5–15 | 20–50 | 50–150+ |
| Database Tables Impacted | 10–30 | 50–200 | 200–1000+ |
| Non-DB Side Effects | 0–3 | 5–15 | 15–50+ |

### Phase Effort Estimates

| Phase | Small | Medium | Large | Notes |
|-------|-------|--------|-------|-------|
| 0 — Discovery & Planning | 1–2 weeks | 2–4 weeks | 4–8 weeks | Large apps may require multi-week assessment |
| 1 — Scenario Definition | 1–2 weeks | 2–4 weeks | 4–8 weeks | Heavily dependent on client availability |
| 2 — Source Data Setup | 1–2 weeks | 2–4 weeks | 4–8 weeks | Client-led; consulting supports |
| 3 — Data Conversion | 1–2 weeks | 2–6 weeks | 4–12 weeks | Complexity of schema differences is the driver |
| 4 — Scenario Test Creation | 2–4 weeks | 4–10 weeks | 8–20+ weeks | Largest variable; depends on scenario complexity |
| 5 — Comparison Test Creation | 1–2 weeks | 2–6 weeks | 4–12 weeks | Scales with table count |
| 6 — E2E Integration | 1–2 weeks | 2–4 weeks | 3–6 weeks | Relatively fixed; infrastructure-dependent |
| 7 — Iteration | Ongoing | Ongoing | Ongoing | Runs in parallel with porting development |

**Note:** Phases 1–3 can partially overlap. Phases 4–5 can run in parallel. Phase 7 begins as soon as Phase 6 produces first results.

---

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Client cannot provide an isolated source environment for snapshotting | Medium | High | Discuss environment requirements in Phase 0. Escalate early. Explore read-only replication as alternative. |
| R2 | Source data contains production/sensitive data that cannot be used in test environments | Medium | High | Build data anonymization into the conversion pipeline (Phase 3). Agree on approach in Phase 0. |
| R3 | Schema differences between source and target are more complex than anticipated | Medium | Medium | Allocate buffer time in Phase 3. Conduct early proof-of-concept conversion on 2–3 representative tables. |
| R4 | Non-deterministic behavior causes false test failures (timestamps, sequences, random data) | High | Medium | Design exclusion rules framework (Phase 5) to be easily configurable. Expect iterative tuning. |
| R5 | Source system has undocumented side effects (triggers, stored procedures, exit programs) | Medium | High | Database monitoring in Phase 2 will surface these. Allocate investigation time. |
| R6 | Client SME availability is limited, blocking Phases 1–2 | High | High | Identify backup SMEs. Front-load client-dependent work. Provide structured templates to minimize SME time. |
| R7 | Large application scenario test suite takes too long to run nightly | Low | Medium | Design for parallel execution from the start (Phase 6). Prioritize P1 scenarios for fast-feedback runs. |
| R8 | Source application is under active development, causing expected data to shift | Medium | Medium | Version all snapshots. Build re-capture and re-conversion into the iteration workflow (Phase 7). |

---

## Assumptions

1. The client will provide access to an isolated source environment (or assist in creating one) for scenario execution and data capture.
2. The client will assign SME(s) with sufficient application domain knowledge to define and execute scenarios.
3. The target application's porting/development team is a separate workstream; this plan covers the testing infrastructure and validation, not the port itself.
4. Test environments (source and target) will be available for the duration of the engagement.
5. All test artifacts (scripts, data, configuration) will be stored in a shared version control repository.
6. The target application can be modified to add test hooks (batch triggers, time emulation, audit table writes) without impacting production functionality.
7. Database-level monitoring is available on the source system to capture table access patterns.

---

## Success Criteria & Exit Conditions

### Phase Gate Criteria

| Phase | Exit Criteria |
|-------|--------------|
| Phase 0 | Calibrated schedule signed off by client and consulting leadership |
| Phase 1 | Scenario Definition Document reviewed and signed off by client |
| Phase 2 | All scenario snapshots captured; Table Impact Map complete |
| Phase 3 | All snapshots successfully converted and loaded into target; spot-check validation passed |
| Phase 4 | All scenario test scripts execute successfully in target environment |
| Phase 5 | Comparison tests correctly identify known-matching and known-different data |
| Phase 6 | Full E2E pipeline runs unattended and produces accurate reports |

### Go-Live Readiness Criteria

Testing is considered **complete and go-live ready** when:

- **100% of P1 scenarios pass** with zero unexplained row differences across all validated tables.
- **≥90% of P2 scenarios pass** (or a client-agreed threshold).
- All failing scenarios have documented, client-accepted explanations (e.g., known source system bugs, agreed behavioral differences).
- The Go-Live Readiness Report has been reviewed and signed off by both the client and consulting project lead.

---

## Ongoing Operations

After go-live, the scenario testing infrastructure remains valuable:

- **Regression Testing:** Run the scenario suite against new releases of the ported application to catch regressions.
- **New Feature Validation:** Add new scenarios as the ported application evolves beyond the original source.
- **Source Decommission Validation:** Final full-suite run before decommissioning the source system to confirm parity.

The test suite, data conversion toolkit, and E2E pipeline should be handed over to the client's development/QA team with documentation and training as part of project closeout.

---

*This program plan should be calibrated during Phase 0 for each specific engagement. The effort estimates and scaling factors above are guidelines based on industry experience and should be refined with application-specific assessment data.*
