# No remote git from this machine

## Rules

1. **Do not** `git push` from the shared agent box.
2. **Do not** `gh repo create`, `gh auth`, or clone/search private user repos
   from this environment.
3. **Do not** ask Claude Code (or any subagent) to search GitHub for the user's
   repositories.
4. This project ships **without** a git remote. Ming initialises git **locally**.

## How Ming should publish (on HIS machine)

```sh
# On Ming's laptop / workstation — not on the agent box
unzip harness2-dsh-mvp.zip        # creates ./harness2-dsh/
cd harness2-dsh
git init
git add .
git commit -m "Initial Harness² × dsh hybrid MVP"

# Create the empty remote on GitHub via the website or `gh` ON HIS MACHINE, then:
git remote add origin git@github.com:YOUR_GITHUB_USER/your-repo.git
git branch -M main
git push -u origin main
```

Use placeholders `YOUR_GITHUB_USER/your-repo` until Ming fills them in locally.
Never commit real usernames, emails, or private repo URLs into this tree from
the agent box. Run `git config user.name` / `user.email` on your own machine only; nothing
in this tree sets them.

## Why

The agent box is shared infrastructure. Remotes, credentials, and user-repo
discovery belong on Ming's own machine under his control.
