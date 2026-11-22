# AU-Getway: instructions for the coding assistant

## Push when a task is finished (standing permission)

The owner has permanently allowed this. Do **not** wait for a "push" reminder and do not ask first.

When you finish a task that changed files in this repo:

1. Check your work as far as the machine allows (type check, the unit tests, a run of the part you changed).
2. Commit the changes with a clear message that says what changed and why.
3. Push to GitHub: `git push origin <current branch>` (normally `main`).
   - The only allowed remote is `origin` = `https://github.com/SohelOnlineit/AUGetway.git`.
   - Check `git remote get-url origin` first. If it points anywhere else, do not push; tell the owner.
4. Tell the owner in one line that it was pushed (commit id), and that the live server still needs
   `sudo bash /var/www/au.uniqbd.com/deploy/ubuntu/update.sh` to get it.

Never:
- Commit secrets or private data: `.env*` (except `.env.example`), passwords, tokens, API keys, `backups/`, `*.sql` dumps of real data, `*.apk`, `.pgdata`.
- Force-push, rewrite published history, skip hooks, or change global git config.
- Make an empty commit when there is nothing to commit.
- Push work that is half done, or work whose checks fail. Say what failed instead.

If the push is rejected because GitHub has newer commits, run `git pull --rebase origin <branch>`.
If that has conflicts, stop and tell the owner. Do not force anything.

Commit author for this repo is `Sohel <sohelonlineit@gmail.com>` (set in this repo's local git config).
On this Windows machine git may report "dubious ownership"; pass `-c safe.directory=D:/AuGetway` on the command instead of changing config.

## Project notes

- Monorepo (pnpm): `apps/api` (NestJS 11 + Prisma 7), `apps/web` (Next.js 16), `apps/mobile` (Expo Android app with a Kotlin module), `packages/types`, `deploy/ubuntu`.
- The README has the setup, environment variables and the live-server update steps.
- Pushing does not deploy. The live server updates only when `deploy/ubuntu/update.sh` runs there.
- Do not edit `D:\AmarPin.com`. It is a different site that was used only as a reference.
