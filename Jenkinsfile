pipeline {
    agent { label 'built-in' }

    options {
        timestamps()
        disableConcurrentBuilds()
    }
    // Staging is the default, so a run started without choosing never reaches production
    parameters {
        choice(name: 'TARGET', choices: ['staging', 'production'], description: 'Server to deploy main to: staging (10.10.20.156) or production (10.10.20.155)')
    }
    environment {
        // The on-premise server and the account Jenkins signs in with over SSH
        DEPLOY_HOST = "${params.TARGET == 'production' ? '10.10.20.155' : '10.10.20.156'}"
        DEPLOY_USER = 'ams'
        APP_DIR     = '/opt/moa-ams'
        COMPOSE     = 'docker compose'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/MoA-Eth/asset-tracking-system.git',
                        credentialsId: 'github-moa-ams'
                    ]]
                ])
            }
        }

        // Start-up brings the database tables up to date, so keep a copy from just before every deploy
        stage('Backup Database') {
            steps {
                sshagent(['deploy-server-ssh']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '
                            cd ${APP_DIR} &&
                            mkdir -p backups &&
                            if ${COMPOSE} ps --services --status running | grep -qx db; then
                                ${COMPOSE} exec -T db pg_dump -U moa_ams -Fc moa_ams > backups/pre-deploy-\$(date +%F_%H%M%S).dump &&
                                find backups -name "pre-deploy-*.dump" -mtime +30 -delete;
                            else
                                echo "Database not running yet (first deploy): no backup taken";
                            fi
                        '
                    """
                }
            }
        }

        stage('Pull & Build on Deploy Server') {
            steps {
                sshagent(['deploy-server-ssh']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '
                            cd ${APP_DIR} &&
                            git pull origin main &&
                            ${COMPOSE} build --pull
                        '
                    """
                }
            }
        }

        // Replaces only the containers whose image changed; the database keeps running
        stage('Deploy') {
            steps {
                sshagent(['deploy-server-ssh']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '
                            cd ${APP_DIR} &&
                            ${COMPOSE} up -d --remove-orphans
                        '
                    """
                }
            }
        }

        // The API answers once the database is ready; the first start can take a minute.
        // -k: the certificate names ams.moa.gov.et, not localhost.
        stage('Health Check') {
            steps {
                sshagent(['deploy-server-ssh']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} '
                            for i in \$(seq 1 24); do
                                if curl -skf https://localhost/api/health > /dev/null; then
                                    echo "Healthy";
                                    exit 0;
                                fi;
                                sleep 5;
                            done;
                            cd ${APP_DIR} && ${COMPOSE} logs --tail=50 backend nginx;
                            exit 1
                        '
                    """
                }
            }
        }
    }

    post {
        success {
            echo "Deployment to ${params.TARGET ?: 'staging'} (${DEPLOY_HOST}) succeeded."
        }
        failure {
            sshagent(['deploy-server-ssh']) {
                sh "ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${APP_DIR} && ${COMPOSE} logs --tail=100'"
            }
            echo "Deployment FAILED. Check logs above. The database copy from before this deploy is in ${APP_DIR}/backups."
        }
        always {
            sshagent(['deploy-server-ssh']) {
                sh "ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${DEPLOY_HOST} 'cd ${APP_DIR} && ${COMPOSE} ps'"
            }
        }
    }
}
