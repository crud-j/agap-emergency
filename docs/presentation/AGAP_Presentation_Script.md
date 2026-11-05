# AGAP Presentation Script

**AGAP: A GPS-Based Mobile Emergency Alert System for Immediate Hospital / Ambulance Dispatch**
Bocaue, Bulacan

| Slide | Title | Speaker |
|---|---|---|
| — | Title / Project Presentation | Justine |
| 01 | Project Background | Justine |
| 02 | Problem Encountered | Justine |
| 03 | Project Objectives | Vanessa |
| 04 | Proposed Solution | Vanessa |
| 05 | Users and Coverage | Aldrin |
| 06 | Key Features | Jhobert |
| 07 | Emergency Response Workflow | Christian |
| 08 | System Architecture | Jhobert |
| 09 | System Walkthrough · Citizen | Jhobert |
| 10 | System Walkthrough · Responder | Aldrin |
| 11 | System Walkthrough · Operations | Christian |
| 13 | Evaluation and Safeguards | Christian |
| — | Conclusion + Thank You | Vanessa |

> Delivery tip: each part is about 45 to 75 seconds. Use the script as a guide, not something to read word for word.

---

## Title / Project Presentation — *Justine*

Good day, everyone. We are here to present our project, **AGAP**, a GPS-Based Mobile Emergency Alert System for Immediate Hospital and Ambulance Dispatch.

AGAP is built for the Municipality of Bocaue, Bulacan. It covers three connected areas: **emergency reporting, dispatch, and coordination**. Our goal is to help the right responders get moving sooner, with the right information in hand.

---

## 01 / Project Background — *Justine*

Every emergency begins with information. Before anyone can respond, the team needs to know three things:

- **What** happened: the emergency report and its details.
- **Where** it happened: GPS coordinates and a location responders can find.
- **What next**: review, dispatch, responder updates, and coordination.

In Bocaue, emergencies range from medical cases and road accidents to floods and fires. In every one of them, clear information leads to better coordination. That idea is the starting point of AGAP.

---

## 02 / Problem Encountered — *Justine*

So where can emergency coordination become difficult? We identified four challenges that AGAP is designed to address. We note that actual local procedures should still be confirmed with the MDRRMO.

1. **Incomplete information.** A person reporting under stress can easily miss important details.
2. **Unclear location.** Verbal directions may not pinpoint where the incident is.
3. **Scattered updates.** Information may be spread across calls, texts, and other channels.
4. **Limited shared visibility.** It is hard to see assignments and response progress in one place.

With that, I'll pass it to Vanessa for our objectives.

---

## 03 / Project Objectives — *Vanessa*

Thank you, Justine. Based on those challenges, AGAP has four practical objectives:

1. **Structure reports:** capture key emergency details in an organized format.
2. **Identify location:** use GPS coordinates to help locate the incident.
3. **Centralize records:** keep incident details, assignments, and status history connected.
4. **Support coordination:** give dispatchers and responders shared, up-to-date information.

Each objective answers one of the problems we just discussed.

---

## 04 / Proposed Solution — *Vanessa*

Our solution can be summed up in one line: **one incident, one connected record.**

In AGAP, the **incident record** is the single reference for the whole response. Everything connects to it: the **citizen's report**, the **GPS location**, the **dispatch** assignment, and the **response updates** from the field.

One important point: AGAP supports decision-making but does not replace it. **Final dispatch decisions always remain with authorized personnel.**

Next, Aldrin will discuss who uses the system.

---

## 05 / Users and Coverage — *Aldrin*

Thank you, Vanessa. AGAP supports four main groups of users:

1. **Citizen or reporter** submits the emergency report and location.
2. **MDRRMO dispatcher** reviews incidents and authorizes which unit to send.
3. **Responder** receives the assignment and reports progress from the field.
4. **Hospital or facility** coordinates receiving the patient and transport details.

For geographic scope, the system covers the **Municipality of Bocaue, Bulacan only**.

---

## 06 / Key Features — *Jhobert*

Thank you, Aldrin. Here is a quick view of what AGAP helps users do:

- **Report:** submit structured emergency details.
- **Locate:** capture GPS coordinates automatically.
- **Manage:** keep one incident record and track its status from start to finish.
- **Dispatch:** help authorized staff assign the right unit.
- **Coordinate:** share responder and hospital updates in real time.
- **Review:** keep an audit history and operational summaries for accountability.

Christian will now walk us through how these features work together.

---

## 07 / Emergency Response Workflow — *Christian*

Thank you, Jhobert. This slide shows the simplified flow, from first report to closure, in seven stages:

**Report → Capture Location → Validate → Dispatch → Respond → Coordinate → Resolve.**

A citizen sends a report, the system attaches the GPS location, and the dispatcher validates it. The dispatcher then assigns a unit, the responder heads to the scene, updates are shared with the hospital if needed, and the incident is resolved.

The key point is that **every stage updates the same incident record.** The system supports the staff's judgment but does not replace it.

---

## 08 / System Architecture — *Jhobert*

This is how the technology fits together, in four layers:

1. **Applications:** a citizen mobile app, a responder mobile app, and a web portal for the Operations Center.
2. **Backend:** a NestJS / Node.js server that provides a REST API, plus WebSocket for real-time updates.
3. **Data and jobs:** PostgreSQL with PostGIS for location data, Redis and BullMQ for background tasks, and media storage for photos.
4. **Integrations:** GPS and map services, push notifications, and SMS notifications.

In short, all three apps talk to **one backend**, and that backend keeps **one source of truth** for every incident.

---

## 09 / System Walkthrough · Citizen — *Jhobert*

Here is the citizen mobile app. From the home screen, a resident can start an emergency alert right away.

- The **SOS button uses press-and-hold**, which helps prevent accidental alerts.
- Once triggered, the alert is sent to the **Operations Center**.
- **Shake-to-alert** is available as another option for when a user cannot easily tap the screen.

The goal is to make reporting fast and simple, even under stress. I'll now hand it to Aldrin for the responder side.

---

## 10 / System Walkthrough · Responder — *Aldrin*

Thank you, Jhobert. This is the responder's mission interface.

- It shows the number of **current assignments and pending offers** at a glance.
- It has a **dedicated area for mission details**, so responders know where to go and what to expect.
- Responders can **refresh the mission list** to see the latest status.

This keeps the field team aligned with the Operations Center without relying only on calls or messages.

---

## 11 / System Walkthrough · Operations — *Christian*

This is the Operations Center dashboard, the dispatcher's main view.

- It displays **critical, unreviewed, and active incident counts**, so urgent cases stand out.
- It shows **units available** and **incidents currently in the field**.
- It gives **shortcuts** to review reports, assign units, and open the live map.

In one screen, the dispatcher can see what needs attention and act on it quickly.

---

## 13 / Evaluation and Safeguards — *Christian*

Because AGAP is an emergency-related system, testing and safeguards are essential.

**Testing and evaluation.** We plan functional, integration, usability, performance, and security testing, using **ISO/IEC 25010** as our quality reference.

**Important limitations:**

- AGAP **does not replace 911 or local hotlines**. It complements them.
- It **cannot guarantee** GPS accuracy, network connectivity, or ambulance availability.
- Dispatch recommendations are **advisory only**. Authorized staff make the decision.
- Actual deployment requires **LGU approval, validated data, staff training, and clear procedures**.

Vanessa will now close our presentation.

---

## Conclusion + Thank You — *Vanessa*

Thank you, Christian. To conclude: **better-organized information leads to a more coordinated response.**

AGAP connects emergency reporting, location information, dispatch, and response updates through **one incident-centered platform for Bocaue**. It is designed to support our responders and MDRRMO staff, so that help can reach people sooner and with the right information.

Thank you very much for listening. We are happy to answer your questions.
