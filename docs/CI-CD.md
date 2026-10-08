# CI/CD with Jenkins: setup and daily use

How code gets from GitHub to the staging and production servers, and how to set the pipeline up again from scratch. For installing the servers themselves, see [ON-PREMISE-SETUP.md](ON-PREMISE-SETUP.md).

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
3. Someone checks staging, then deploys to **production by hand** in Jenkins.

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
| Running version | `https://<server>/api/health` → `commit` |

---

## Setup from scratch

Do these once, in order. Steps 1–3 connect Jenkins to the servers; steps 4–5 create the pipeline.

### 1. Prepare each server

Each server must already run the app once by hand ([ON-PREMISE-SETUP.md](ON-PREMISE-SETUP.md)):

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
| `parameters { choice(name: 'TARGET', ...) }` | Staging (default) or production |
| `triggers { pollSCM('H/5 * * * *') }` | Checks GitHub every 5 minutes; new commits deploy to staging |
| `DEPLOY_HOST`, `DEPLOY_USER` | Server address and SSH account per target |
| `sshagent(['moa-ams-deploy-ssh'])` | The credential from step 3 |
| Stages | Build Images → Backup Database → Send Images → Deploy → Health Check |

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
4. Confirm: the run is green, and `https://10.10.20.156/api/health` shows the latest `main` commit.

---

## Daily use

| Task | How |
|---|---|
| Release a change | Merge the PR into `main`. Within 5 minutes staging deploys itself. |
| Deploy to production | After checking staging: **moa-ams-deploy → Build with Parameters → `production` → Build** |
| Redeploy staging by hand | **Build with Parameters → `staging` → Build** |
| See what each server runs | `https://<server>/api/health` → `commit` |
| Follow a run | Click the run number → **Stages** or **Console Output** |
| Roll back a bad release | On the server: [DEPLOYMENT.md](DEPLOYMENT.md) §9, *Rolling back* (`:previous` images) |

Deploy production soon after checking staging: each run builds from the latest `main`.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Run stuck on *"Still waiting to schedule task … reserved for jobs with matching label"* | The pipeline needs `agent { label 'docker' }`. |
| *"Could not find specified credentials: moa-ams-deploy-ssh"* | The credential is missing or its ID differs from the `Jenkinsfile`. |
| *"Permission denied (publickey,password)"* at Backup Database | The credential's private key doesn't match the public key in the server's `~/.ssh/authorized_keys`. |
| Merges don't reach staging by themselves | Run the job once by hand; check **Git Polling Log** on the job page. |
| Health Check fails | The run prints the server logs. On the server: `cd /opt/moa-ams && docker compose logs backend`. |
| Backend log: *"The database needs an upgrade step"* | Run the upgrade scripts: [DEPLOYMENT.md](DEPLOYMENT.md) §8. |
