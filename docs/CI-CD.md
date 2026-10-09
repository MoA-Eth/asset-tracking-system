# CI/CD with Jenkins: setup and daily use

How code gets from GitHub to the staging and production servers, and how to set the pipeline up again from scratch. For installing the servers themselves, see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## How it works

```
 GitHub (main)  ──►  Jenkins  ──── SSH ────►  Staging    10.10.20.156
                     builds the               Production 10.10.20.155
                     Docker images            (no internet: they only
                                               receive finished images)
```

1. A pull request is merged into `main`. GitHub Actions has already run the tests on it.
2. Jenkins checks GitHub every 5 minutes. When `main` has a new commit, it **deploys to staging by itself**.
3. Someone checks staging, creates a **release** (a version tag such as `v2.1.0`) on GitHub, and deploys that release to **production by hand** in Jenkins.

Each deploy: build images → back up the database → send images over SSH → restart the app → health check.

## Key facts

| Item | Value |
|---|---|
| Jenkins | https://jenkins.moa.gov.et |
| Job | folder **asset tracking** → **moa-ams-deploy** |
| Pipeline definition | [`Jenkinsfile`](../Jenkinsfile) in this repository, branch `main` |
| Jenkins node | label `docker` (has Docker and internet access) |
| Credential | `moa-ams-deploy-ssh` (SSH Username with private key) |
| Staging | `10.10.20.156`, account `assetmgts` |
| Production | `10.10.20.155`, account `assetmgtp` |
| App folder on servers | `/opt/moa-ams` (`docker-compose.yml`, `.env`, `ssl/`) |
| Running version | In the app: bottom of the sidebar, or the Profile page. Also `https://<server>/api/health` → `version`, `commit` |
| Releases | https://github.com/MoA-Eth/asset-tracking-system/releases |

---

## Setup from scratch

Do these once, in order. Steps 1–3 connect Jenkins to the servers; steps 4–5 create the pipeline.

### 1. Prepare each server

Each server must already run the app once by hand ([DEPLOYMENT.md](DEPLOYMENT.md), setup steps 1–8):

- Docker installed, and the deploy account (`assetmgts` / `assetmgtp`) in the `docker` group.
- `/opt/moa-ams` owned by that account, containing `.env` and `ssl/`.
- No source code and no internet access needed.

### 2. Give Jenkins an SSH key for the servers

On the Jenkins host, create a key used only for this project:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/moa_ams_deploy -N "" -C "jenkins-moa-ams"
cat ~/.ssh/moa_ams_deploy.pub      # the public half: one line starting with ssh-ed25519
```

On **each server**, as the deploy account, add that public line:

```bash
echo 'ssh-ed25519 AAAA... jenkins-moa-ams' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

- `~/.ssh/authorized_keys` holds the Jenkins key. Keep administrators' own keys in `~/.ssh/authorized_keys2` (the server reads both), so neither side overwrites the other.
- The private half (`~/.ssh/moa_ams_deploy`, no `.pub`) never leaves the Jenkins host. Never paste it into chat or email.

### 3. Store the private key in Jenkins

**Manage Jenkins → Credentials → (global) → Add Credentials**:

| Field | Value |
|---|---|
| Kind | SSH Username with private key |
| ID | `moa-ams-deploy-ssh` (must match the `Jenkinsfile`) |
| Description | Asset Tracking deploy key: 10.10.20.156, 10.10.20.155 |
| Username | `assetmgts` (the `Jenkinsfile` sets the real account per server) |
| Private Key | Enter directly → paste the whole private key file |

> Jenkins runs inside a container with its own `~/.ssh`. A key that works from the Jenkins host's shell is not automatically available to pipelines. Always go through this credential.

### 4. The `Jenkinsfile`

It is already in the repository. The parts you might change:

| Part | Purpose |
|---|---|
| `agent { label 'docker' }` | Runs on the Jenkins node that has Docker |
| `parameters` | `TARGET`: staging (default) or production. `VERSION`: release tag; required for production |
| Stage *Select Version* | Checks out the release tag, refuses production without one, names the run (e.g. `#9 production v2.1.0`) |
| `triggers { pollSCM('H/5 * * * *') }` | Checks GitHub every 5 minutes; new commits deploy to staging |
| `DEPLOY_HOST`, `DEPLOY_USER` | Server address and SSH account per target |
| `sshagent(['moa-ams-deploy-ssh'])` | The credential from step 3 |
| Stages | Select Version → Build Images → Backup Database → Send Images → Deploy → Health Check |

Change it like any code: branch → pull request → merge. Jenkins reads the new version on its next run. To check the syntax before merging (needs a Jenkins API token from *your user → Security*):

```bash
curl -X POST -u '<user>:<api-token>' -F "jenkinsfile=<Jenkinsfile" \
  https://jenkins.moa.gov.et/pipeline-model-converter/validate
```

### 5. Create the Jenkins job

1. Open the **asset tracking** folder → **New Item** → name `moa-ams-deploy` → **Pipeline** → **OK**.
2. Under **Pipeline**:

   | Field | Value |
   |---|---|
   | Definition | Pipeline script from SCM |
   | SCM | Git |
   | Repository URL | `https://github.com/MoA-Eth/asset-tracking-system.git` |
   | Credentials | none (the repository is public) |
   | Branch Specifier | `*/main` |
   | Script Path | `Jenkinsfile` |

3. **Save**, then **Build Now** once. This first run deploys to staging and registers the TARGET choice and the 5-minute check. From then on the job shows **Build with Parameters**.
4. Confirm: the run is green, and staging's sidebar (or `/api/health`) shows `main` with the latest commit.

---

## Daily use

| Task | How |
|---|---|
| Get a change onto staging | Merge the PR into `main`. Within 5 minutes staging deploys itself. |
| Deploy to production | Create a release (below), then **Build with Parameters → TARGET `production`, VERSION `v2.1.0` → Build** |
| Redeploy staging by hand | **Build with Parameters → `staging` → Build** (VERSION empty) |
| See what each server runs | Bottom of the app's sidebar (or the Profile page), or `https://<server>/api/health` |
| Follow a run | Click the run (named e.g. `#9 production v2.1.0`) → **Stages** or **Console Output** |
| Roll back a bad release | Quick: [DEPLOYMENT.md → Rolling back](DEPLOYMENT.md#rolling-back) (`:previous` images). Or deploy the previous release tag to production. |

### Releasing

A release is a Git tag on `main` named `vMAJOR.MINOR.PATCH`. Increase **PATCH** for fixes (`v2.1.0` → `v2.1.1`), **MINOR** for new features (`v2.2.0`), **MAJOR** for large or breaking changes (`v3.0.0`).

1. Check staging: it runs the latest `main`, shown as `main · <commit>` in the sidebar.
2. On GitHub: **Releases → Draft a new release → Choose a tag**, type the new version (e.g. `v2.1.0`) → *Create new tag on publish*, target **`main`**.
3. Click **Generate release notes** (lists the merged pull requests since the last release), review, **Publish release**.
4. In Jenkins: **Build with Parameters → TARGET `production`, VERSION `v2.1.0` → Build**.
5. Check production: the sidebar shows `v2.1.0`.

Tag only commits that staging has run: production then gets exactly what was tested.

---

## From a change to production: the checklist

What each environment takes, and the steps in order:

| | Takes | Starts |
|---|---|---|
| **Staging** | the latest `main` | by itself, within 5 minutes of a merge |
| **Production** | a release tag (`v2.1.0`): a fixed snapshot of `main`, built fresh. Never staging's images | by hand in Jenkins, with VERSION |

Merging more to `main` after a release changes staging only: production stays on its tag until the next release.

1. **Branch and pull request.** Work on a branch (`feat/…`, `fix/…`, `docs/…`), open a pull request into `main`. `main` is protected: the 3 CI checks must pass and one other person must approve (repository admins can bypass). Use a clear commit message and PR description: what changed, how it was tested, and anything to do on deploy.
2. **Merge.** Staging deploys itself. Check the run is green in Jenkins.
3. **Check staging** ([After a deploy](#after-a-deploy)), and try the change on screen. Do not release a commit that staging hasn't run.
4. **Release.** On GitHub, create the tag `vMAJOR.MINOR.PATCH` on `main` and publish it with release notes ([Releasing](#releasing), template below).
5. **Deploy to production.** Jenkins → **Build with Parameters** → TARGET `production`, VERSION the new tag → **Build**. It backs up the database first.
6. **Check production** ([After a deploy](#after-a-deploy)). If something is wrong, roll back ([DEPLOYMENT.md → Rolling back](DEPLOYMENT.md#rolling-back)): fast with `:previous`, or deploy the previous tag.

### After a deploy

| Check | How |
|---|---|
| The run is green | Jenkins run page. Stage *Health Check* passes. If it fails, Jenkins prints the server logs and the old version stays (or is restored from `:previous`) |
| Right version | `curl -sk https://<server>/api/health` → `version` and `commit` match the tag (production) or the latest `main` commit (staging). `environment` says `stage` or `prod` |
| Containers healthy | On the server: `cd /opt/moa-ams && docker compose ps`: `db` and `backend` healthy, `nginx` running |
| Start-up upgrade ran cleanly | `docker compose logs backend \| grep -E "Upgrade\|did not run"`: `Upgrade:` lines for each data change, and no *"did not run"* warning. No lines at all is normal when there was nothing to change |
| The change works | Open the app, check the version in the sidebar, and use the feature. Production has no demo accounts: sign in as a real user |

### Release notes template

```
## What's new
- <feature or change, in plain words for the people who use it>

## Fixes
- <what was wrong, now fixed>

## Upgrade notes
- <anything that changes on deploy: new permissions, data moved at start-up, settings to set.
  Write "Nothing manual." if there is none>
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Run stuck on *"Still waiting to schedule task … reserved for jobs with matching label"* | The pipeline needs `agent { label 'docker' }`. |
| *"Could not find specified credentials: moa-ams-deploy-ssh"* | The credential is missing or its ID differs from the `Jenkinsfile`. |
| *"Permission denied (publickey,password)"* at Backup Database | The credential's private key doesn't match the public key in the server's `~/.ssh/authorized_keys`. |
| *"Production deploys a release: set VERSION…"* | Production needs a release tag in VERSION ([Releasing](#releasing)). |
| `git checkout` fails in *Select Version* | The tag doesn't exist on GitHub: check the spelling, or publish the release first. |
| Merges don't reach staging by themselves | Run the job once by hand; check **Git Polling Log** on the job page. |
| Health Check fails | The run prints the server logs. On the server: `cd /opt/moa-ams && docker compose logs backend`. |
| Backend log: *"The database needs an upgrade step"* | Run the upgrade scripts: [DEPLOYMENT.md → Database upgrades](DEPLOYMENT.md#database-upgrades). |
