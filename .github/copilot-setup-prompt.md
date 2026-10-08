# AGAP — Copilot Setup Prompt

Copy the prompt below and paste it into **GitHub Copilot Chat** in VS Code (`Ctrl+Alt+I` or click the Copilot icon in the sidebar).

---

## Prompt to paste into Copilot Chat

```
I just cloned the AGAP emergency response system monorepo from https://github.com/crud-j/agap-emergency.git and I need to set it up locally without Docker. Please read the file DEVELOPER_SETUP.md in the root of this project and guide me through the full setup step by step.

For each step:
1. Tell me what the step does and why it is needed
2. Give me the exact command(s) to run for my operating system
3. Tell me what a successful result looks like before moving to the next step
4. If a step fails, help me troubleshoot before continuing

Start by detecting my operating system, then walk me through:
- Installing Node.js 20+, pnpm, PostgreSQL 15+ with PostGIS, and Redis
- Creating the agap_db database and enabling the required PostgreSQL extensions
- Cloning and entering the repo (skip if I am already inside it)
- Running pnpm install
- Copying .env.example to .env and filling in the required values
- Running Prisma migrations and the database seed
- Starting the backend, frontend, and optionally the mobile app
- Verifying all services are running correctly

Ask me which surface I am working on (backend only, frontend, or mobile) so you can skip steps that are not relevant to me.
```

---

## How to use

1. Open the cloned `agap-emergency` folder in VS Code
2. Open Copilot Chat with `Ctrl+Alt+I` (Windows/Linux) or `Cmd+Alt+I` (macOS)
3. Paste the prompt above and press Enter
4. Answer Copilot's follow-up questions (OS, which surface you're working on)
5. Follow each step it gives you — it will wait for you to confirm before moving on

## Tips

- If Copilot asks to read `DEVELOPER_SETUP.md`, click **Allow** so it can reference the full guide
- You can ask follow-up questions at any step, e.g. *"the migration failed, here is the error"*
- If you are only working on the backend, tell Copilot so it skips the mobile setup
- Your `.env` password does not need to match anyone else's — just make sure it matches what you set in PostgreSQL on your own machine
