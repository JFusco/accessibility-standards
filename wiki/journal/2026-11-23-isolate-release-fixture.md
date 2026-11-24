---
topics: [project-maintenance]
---
# Isolate the release preflight fixture

The Office's onboarding push exposed a Git context leak in the release preflight self-test. Git passed the linked worktree's repository environment into the hook, and the fixture's commands inherited it even after changing their working directory. The test now clears Git's repository-local environment before it initializes its temporary repository. The normal pre-push gate still runs on the worktree being pushed. [Repair issue](https://github.com/JFusco/accessibility-standards/issues/11)
