# Individual Module Reports — Content

Text for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf), which follows the class sample layout: a "Module N: Name" heading, then Module Description, Input, Technology Used and Process Documentation boxes.

**How to copy each file into the template:**
- **Module heading:** the module number and name from section 1. The other identification fields aren't in the sample layout, so they can be skipped.
- **Input and Technology tables:** one bullet per entry (●), AS-IS and TO-BE separately.
- **AS-IS and TO-BE step tables:** the "Process Flow" as a numbered list (1., 2., …). Leave out the Step Type column; it's there only to help you check the TO-BE covers user actions, validations, database operations, integrations and notifications.
- **Output tables:** a numbered "Outputs" list.

The 52 current module reports are available in this folder. MOD-19 (Offline Emergency Queue and Retry) is intentionally excluded because it is no longer needed. The remaining reports use the source specifications in [`docs/modules/`](../modules/) and the current implementation in the backend, frontend, mobile, and shared packages.

**How these were written**
- **TO-BE:** reviewed against the current code as of 2026-10-23: backend services and request checks, plus the mobile and web screens. It includes only behavior supported by the implementation and qualifies provider-dependent or partial capabilities.
- **AS-IS:** describes the usual manual process at the MDRRMO / LGU (hotline, logbook, Facebook page, text messages, barangay public address). Check it against your group's own AS-IS data gathering and interviews, and adjust the wording if it differs.
- **"Owner notes":** any owner notes are not part of the report. They list what to test before the leader signs, and backend features that have no screen yet, which must not be written into the TO-BE.
- **Module Identification:** "Prepared By" is left out on purpose. Fill in the student number, course, group, leader, instructor and dates yourself.
