Application Port Scenario Data Testing Approach & Strategy

This document describes the process and steps of validating an application source code port of any type (via XMAI, adhoc agentic, manual rewrite, etc) via scenario data testing. It is also known as snapshot or golden data testing. It is agnostic to source or target programming language, or source or target database. It can be extended to also test non-database functionality such as emails, file system writes, API calls, etc. The end goal is to provide deterministic metrics on the correctness of the application port.

Step 1 - Determine Scenarios
Determine a number of testing scenarios for common and important unique functionality of the application. The amount of scenario testing coverage is to be determined in conjunction with the client, as there is diminishing returns in the coverage. An example scenario could be 'run the nightly batch invoice process', or 'add a number of items via data entry program', or 'perform maintenance updates on a series of records'. The number and complexity of the scenarios determines the testing coverage.

Step 2 - Source Environment Data Setup
In the ideal setup, a single 'starting' data set snapshot would be created in a new environment that the code will run in. This should be as small a data snapshot as possible, and not contain production/real data. All scenarios will start with that data set and modify it in some way. If necessary there could be multiple starting data sets.
In conjunction with the client, the scenarios will be run on the source system and the 'after' snapshot of each data scenario will be saved.
During the run, the database tables that are read and written to will be logged (eg via STRDBMON on IBM i, or other DB-level logging). This list will be used to determine the tables that will need to be validated later.

Step 3 - Convert Source Data
Each scenario's starting and 'after' (or 'expected') snapshot data will need to be converted and imported into the target database. This could be as simple as a CSV import, or could require a custom loading program. Example changes of format could be date fields from numeric to DATE or TIMESTAMP, field length extensions, dropped fields (eg audit columns), etc. It needs to be repeatable for each data scenario, and as scenario data changes.

Step 4 - Create Automated Scenario Tests in Target
In the target application, create automatable test scripts that do the equivalent scenario actions that the client did on the source environment in Step 2. This might be as simple as running an API call, or could be a series of commands. New hooks may need to be added to the application to trigger functionality, such as emulating a nightly batch job run. If the time/day/week is relevant to scenarios, system time emulation might need to be added to the application. Other 'scenario testing only' logic may need to be added as necessary.

Step 5 - Create Scenario Snapshot Comparison Tests
Add automated tests to compare the 'expected' and 'actual' snapshots to see if the scenario tests passed or not. This may be via SQL scripts and/or a custom loading program depending on complexity. The tests will need to ignore columns in tables that are expected to be different, such as fields with times, user names (audit fields), randomized data, or race-condition dependent data (such as auto-incrementing fields). Since a table can be compared in multiple scenarios, these tests should be modular per table. The output of the test should contain the row differences between the expected and actual snapshots.

Step 6 - Create End-to-End Scenario Tests
Create an automatable test setup that loads a target environment's database with the 'starting' data snapshot for a scenario, runs the scenario test actions, runs the scenario snapshot comparison test, and reports on pass/fail, along with the row differences of any failures. It should do this for each scenario either in sequence or in parallel in multiple environments if possible. This process might need to be nightly due to setup and test run/processing time.

Iteration
Scenario tests will run and data differences will be fixed by the development team. New scenarios may be added as necessary or determine by the project team and client. Scenario snapshot data may need to be updated as the source application may be under active development and changes, or bugs may have been discovered in the application and the desired data may be different. After go-live these tests will still be useful in the ongoing development of the ported application.

Non Database Test Extensions
This type of testing does not capture non-database tests, but it can be added. For example, if the source application sends an email at the end of the nightly batch process, this information can be stored in a pseudo audit table for the scenario. The target application can be modified to write to this audit table with relevant information when run in scenario testing mode, and that audit table can be validated just like any other type of table. This can be extended to any other non-database functionality that is desired to be tested.
