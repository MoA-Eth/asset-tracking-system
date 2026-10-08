// Deploys to the staging or production server: staging gets the latest main, production a release tag.
// The servers have no internet access, so Jenkins builds the images and sends them over SSH;
// the servers only load them and restart. See docs/CI-CD.md.
pipeline {
    // The Jenkins controller node that has Docker
    agent { label 'docker' }

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }
    // Staging is the default, so a run started without choosing never reaches production
    parameters {
        choice(name: 'TARGET', choices: ['staging', 'production'], description: 'Server to deploy to: staging (10.10.20.156) or production (10.10.20.155)')
        string(name: 'VERSION', defaultValue: '', trim: true, description: 'Release tag to deploy, e.g. v2.1.0. Required for production. Empty on staging: the latest main.')
    }
    // Check GitHub every 5 minutes; new commits on main deploy to staging on their own.
    // Triggered runs use the default TARGET, so production is only ever deployed by hand.
    triggers {
        pollSCM('H/5 * * * *')
    }
    environment {
        DEPLOY_HOST = "${params.TARGET == 'production' ? '10.10.20.155' : '10.10.20.156'}"
        DEPLOY_USER = "${params.TARGET == 'production' ? 'assetmgtp' : 'assetmgts'}"
        APP_DIR     = '/opt/moa-ams'
        APP_IMAGES  = 'moa-ams-backend:latest moa-ams-nginx:latest'
        SSH_OPTS    = '-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30'
        // docker-compose.yml requires these even to build; the real values are in the server's .env
        POSTGRES_PASSWORD = 'build-only'
        JWT_SECRET        = 'build-only-not-used-build-only-not-used'
    }

    stages {

        // Production only takes a release, so it never gets code staging hasn't run
        stage('Select Version') {
            steps {
                script {
                    def version = (params.VERSION ?: '').trim()
                    if (params.TARGET == 'production' && !version) {
                        error('Production deploys a release: set VERSION to a release tag such as v2.1.0 (docs/CI-CD.md, "Releasing").')
                    }
                    if (version && !version.matches(/v\d+\.\d+\.\d+/)) {
                        error("VERSION must look like v2.1.0, not '${version}'.")
                    }
                    if (version) {
                        sh 'git fetch --tags --force origin'
                        if (sh(returnStatus: true, script: "git rev-parse -q --verify 'refs/tags/${version}^{commit}' >/dev/null") != 0) {
                            error("Release ${version} doesn't exist on GitHub: publish it first, or check the spelling (docs/CI-CD.md, \"Releasing\").")
                        }
                        sh "git checkout -q --detach 'refs/tags/${version}^{commit}'"
                    }
                    env.APP_VERSION = version ?: 'main'
                    currentBuild.displayName = "#${env.BUILD_NUMBER} ${params.TARGET} ${env.APP_VERSION}"
                }
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    # Version and commit end up in /api/health and in the app, so you can see what each server runs
                    export APP_COMMIT=$(git rev-parse --short HEAD)
                    echo "Building $APP_VERSION ($APP_COMMIT)"
                    docker compose -p moa-ams-ci build --pull
                    docker image ls --format '{{.Repository}}:{{.Tag}}  {{.Size}}' | grep '^moa-ams-'
                '''
            }
        }

        // Start-up brings the database tables up to date, so keep a copy from just before every deploy
        stage('Backup Database') {
            steps {
                sshagent(['moa-ams-deploy-ssh']) {
                    sh '''
                        ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "
                            cd $APP_DIR && mkdir -p backups &&
                            if docker compose ps --services --status running | grep -qx db; then
                                f=backups/pre-deploy-\\$(date +%F_%H%M%S).dump &&
                                docker compose exec -T db pg_dump -U moa_ams -Fc moa_ams > \\$f &&
                                ls -lh \\$f &&
                                find backups -name 'pre-deploy-*.dump' -mtime +30 -delete;
                            else
                                echo 'Database not running (first deploy): no backup taken';
                            fi
                        "
                    '''
                }
            }
        }

        stage('Send Images') {
            steps {
                sshagent(['moa-ams-deploy-ssh']) {
                    sh '''
                        TARGET_SSH="$DEPLOY_USER@$DEPLOY_HOST"

                        # Keep the running version as :previous, for a quick rollback
                        ssh $SSH_OPTS "$TARGET_SSH" '
                            for i in moa-ams-backend moa-ams-nginx; do
                                docker image inspect $i:latest >/dev/null 2>&1 && docker tag $i:latest $i:previous || true
                            done
                        '

                        docker save $APP_IMAGES | gzip -1 | ssh $SSH_OPTS "$TARGET_SSH" 'gunzip | docker load'

                        # The database image rarely changes: send it only when the server doesn't have it
                        DB_IMAGE=$(docker compose config --images | grep '^postgres')
                        if ! ssh $SSH_OPTS "$TARGET_SSH" "docker image inspect $DB_IMAGE" >/dev/null 2>&1; then
                            docker pull "$DB_IMAGE"
                            docker save "$DB_IMAGE" | gzip -1 | ssh $SSH_OPTS "$TARGET_SSH" 'gunzip | docker load'
                        fi

                        scp $SSH_OPTS docker-compose.yml "$TARGET_SSH:$APP_DIR/docker-compose.yml"
                    '''
                }
            }
        }

        // Replaces only the containers whose image changed; the database keeps running
        stage('Deploy') {
            steps {
                sshagent(['moa-ams-deploy-ssh']) {
                    sh '''
                        ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "
                            cd $APP_DIR &&
                            docker compose up -d --no-build --remove-orphans &&
                            docker image prune -f
                        "
                    '''
                }
            }
        }

        // The API answers once the database is ready; the first start can take a minute.
        // -k: the certificate names *.moa.gov.et, not localhost.
        stage('Health Check') {
            steps {
                sshagent(['moa-ams-deploy-ssh']) {
                    sh '''
                        ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" '
                            for i in $(seq 1 24); do
                                if curl -skf https://localhost/api/health; then echo; echo Healthy; exit 0; fi
                                sleep 5
                            done
                            echo "No healthy answer after 2 minutes"
                            exit 1
                        '
                    '''
                }
            }
        }
    }

    post {
        success {
            echo "Deployment of ${env.APP_VERSION} to ${params.TARGET ?: 'staging'} (${DEPLOY_HOST}) succeeded."
        }
        failure {
            sshagent(['moa-ams-deploy-ssh']) {
                sh 'ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "cd $APP_DIR && docker compose logs --tail=100 backend nginx" || true'
            }
            echo "Deployment FAILED. Check the logs above. If it failed at Deploy or Health Check, the previous version is tagged :previous and the database copy from before this deploy is in ${APP_DIR}/backups (docs/DEPLOYMENT.md, 'Rolling back'). If it failed before Deploy, the running app was not changed."
        }
        always {
            sshagent(['moa-ams-deploy-ssh']) {
                sh 'ssh $SSH_OPTS "$DEPLOY_USER@$DEPLOY_HOST" "cd $APP_DIR && docker compose ps" || true'
            }
        }
    }
}
