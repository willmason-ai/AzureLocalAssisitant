import os
import hashlib


class Config:
    # Authentication
    DASHBOARD_PASSWORD = os.getenv('DASHBOARD_PASSWORD', 'admin')
    # JWT_SECRET must be stable across all Gunicorn workers. If not set via env,
    # derive a deterministic secret from the dashboard password so all workers agree.
    JWT_SECRET = os.getenv(
        'JWT_SECRET',
        hashlib.sha256(f"azure-local-dashboard-{os.getenv('DASHBOARD_PASSWORD', 'admin')}".encode()).hexdigest()
    )
    JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))

    # Credential Encryption
    CREDENTIAL_MASTER_KEY = os.getenv('CREDENTIAL_MASTER_KEY', 'change-me-in-production')

    # Claude API
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
    CLAUDE_MODEL = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')

    # Azure Local Connection
    AZURELOCAL_NODE1 = os.getenv('AZURELOCAL_NODE1', 'dell-as01.presidiorocks.com')
    AZURELOCAL_NODE2 = os.getenv('AZURELOCAL_NODE2', 'dell-as02.presidiorocks.com')
    AZURELOCAL_DOMAIN = os.getenv('AZURELOCAL_DOMAIN', 'presidiorocks.com')
    AZURELOCAL_CLUSTER = os.getenv('AZURELOCAL_CLUSTER', 'azurestack01')
    AZURELOCAL_USERNAME = os.getenv('AZURELOCAL_USERNAME', 'hciadmin')
    AZURELOCAL_PASSWORD = os.getenv('AZURELOCAL_PASSWORD', '')

    # WinRM settings
    WINRM_TRANSPORT = os.getenv('WINRM_TRANSPORT', 'ntlm')
    WINRM_USE_SSL = os.getenv('WINRM_USE_SSL', 'true').lower() == 'true'
    SSH_FALLBACK_ENABLED = os.getenv('SSH_FALLBACK_ENABLED', 'true').lower() == 'true'

    # Azure
    AZURE_SUBSCRIPTION_ID = os.getenv('AZURE_SUBSCRIPTION_ID', 'aaaaa147-fd6e-48fb-9a66-d044700dca17')
    AZURE_RESOURCE_GROUP = os.getenv('AZURE_RESOURCE_GROUP', 'rg-azurestack')
    AZURE_TENANT_ID = os.getenv('AZURE_TENANT_ID', '2a731c61-a2b2-4661-8409-5b861cf40d0c')
    AZURE_CLIENT_ID = os.getenv('AZURE_CLIENT_ID', '')
    AZURE_CLIENT_SECRET = os.getenv('AZURE_CLIENT_SECRET', '')

    # App
    PORT = int(os.getenv('PORT', '5230'))
    DATA_DIR = os.getenv('DATA_DIR', '/app/data')

    # Scheduler intervals (seconds)
    HEALTH_CHECK_INTERVAL = int(os.getenv('HEALTH_CHECK_INTERVAL', '60'))
    CREDENTIAL_CHECK_INTERVAL = int(os.getenv('CREDENTIAL_CHECK_INTERVAL', '21600'))
    CVE_CHECK_INTERVAL = int(os.getenv('CVE_CHECK_INTERVAL', '86400'))
