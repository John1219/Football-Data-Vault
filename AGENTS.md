# Project Rules — Football Data Vault

## Git Interaction Policy

All state-changing Git and GitHub interactions for this repository **must be handled exclusively in the dedicated Git thread** (`conversationId: 89da7d45-e22e-42f3-a1cc-c42adf6f9cbc`) so that the entire Git history and workflow stay in one place.

- **Allowed in any thread (read-only):** `git status`, `git diff`, `git log`, `git show`.
- **Restricted to the dedicated Git thread (`89da7d45-e22e-42f3-a1cc-c42adf6f9cbc`):** `git add`, `git commit`, `git push`, `git pull`, `git fetch`, `git merge`, `git rebase`, `git reset`, `git checkout`, `git switch`, `git branch`, `git tag`, `git stash`, and `gh` CLI commands.
- **If you are in any other thread** and the user asks to commit, push, pull, branch, or otherwise interact with Git/GitHub (or when code changes are ready to be committed), **do not run those Git commands**. Instead, remind the user to switch to the dedicated Git thread (`89da7d45-e22e-42f3-a1cc-c42adf6f9cbc`) to perform the Git operation.
