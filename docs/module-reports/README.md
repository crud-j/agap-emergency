# Individual Module Reports — Content

Text for the Individual Module Report template ([M_5.pdf](../M_5.pdf), the MODULE 05 sample). Each file holds one module's Input, Process and Output (IPO) in the order the template uses.

**How to copy each file into the template (match M_5.pdf):**
- **Title block:** "AGAP: A GPS-Based Mobile Emergency Alert System for Immediate Hospital / Ambulance Dispatch", then `MODULE NN — Module Name` from section 1.
- **Module Description box:** the Description and Purpose rows. The instructions also ask for "the tasks it performs", so add the **Tasks Performed** list under Description (or as a third row).
- **Input box:** "AS-IS Input:" and "TO-BE Input:" as bullet lists (●), one bullet per table row. Skip empty cells.
- **Technology Used box:** "AS-IS Technologies:" and "TO-BE Technologies:" the same way.
- **Process Documentation:** the AS-IS table (Steps, Process Description), then "AS-IS Outputs"; the TO-BE table **with the Step Type column** (Steps, Process Description, Step Type), then "TO-BE Process Outputs".
- **Signature block:** Prepared by (the member), Approved By (the leader), Checked By (the instructor).
- **Leave out:** section 1's other fields and the **Owner notes** at the end of each file. Owner notes are a test checklist and a "Do not claim" list for the member, not report content.

**Check the M_5.pdf sample itself:** its first AS-IS Input bullet has extra text pasted in ("…phone worksSource bulletins (PAGASA, river gauge reading, DepEd / LGU orders)"). That text belongs to MOD-53. MOD-05 has only two AS-IS inputs (see [MOD-05](MOD-05_Emergency_Readiness_and_Permission_Status.md)). Fix it before printing MOD-05.

The 52 module reports are in this folder. MOD-19 (Offline Emergency Queue and Retry) is intentionally excluded because it was eliminated from the system; the citizen app's offline needs are covered by the idempotent submission in MOD-06 and the responder outbox in MOD-32/40.

**How these were written**
- **TO-BE:** first written against the code on 2026-10-23, then re-checked on 2026-10-31 against the commits since then (hospital destination routing, automation plan Phases 1–4) and the uncommitted Unit Field Flow work (Phases 1–4). It includes only behavior a screen or job actually performs. Features that exist only on the server, or only behind a setting that is off by default, are listed under "Do not claim" in the owner notes instead.
- **API paths** are written as served: `/v1/...` (there is no `/api` prefix; `/api` is the Swagger page).
- **AS-IS:** describes the usual manual process at the MDRRMO / LGU (hotline, logbook, Facebook page, text messages, barangay public address). Check it against your group's own AS-IS data gathering and interviews, and adjust the wording if it differs.
- **Uncommitted work:** as of 2026-10-31, MOD-15, 23, 32, 34, 48 and 52 (rescue totals) describe parts of the Unit Field Flow plan that are not committed yet, and MOD-21 ("Next actions") and MOD-28 (Units / Responders views) describe the uncommitted page redesigns. Commit that work before printing those reports.
- **Module Identification:** "Prepared By" is left out on purpose. Fill in the student number, course, group, leader, instructor and dates yourself.
