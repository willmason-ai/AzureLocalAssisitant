"""Azure Management REST API client using SPN credentials.

Avoids the need for `az CLI` on cluster nodes (which fails via WinRM due to DPAPI).
"""

import logging
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class AzureAPIClient:
    TOKEN_URL = 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token'
    MGMT_BASE = 'https://management.azure.com'

    def __init__(self, config):
        self.tenant_id = config.get('AZURE_TENANT_ID', '')
        self.client_id = config.get('AZURE_CLIENT_ID', '')
        self.client_secret = config.get('AZURE_CLIENT_SECRET', '')
        self.subscription_id = config.get('AZURE_SUBSCRIPTION_ID', '')
        self.resource_group = config.get('AZURE_RESOURCE_GROUP', '')
        self.cluster_name = config.get('AZURELOCAL_CLUSTER', 'azurestack01')
        self.node_names = [
            config.get('AZURELOCAL_NODE1', 'dell-as01.presidiorocks.com').split('.')[0],
            config.get('AZURELOCAL_NODE2', 'dell-as02.presidiorocks.com').split('.')[0],
        ]
        self._token = None
        self._token_expiry = 0

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.tenant_id)

    def _acquire_token(self):
        if self._token and time.time() < self._token_expiry - 60:
            return self._token

        url = self.TOKEN_URL.format(tenant_id=self.tenant_id)
        resp = requests.post(url, data={
            'grant_type': 'client_credentials',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'scope': 'https://management.azure.com/.default',
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        self._token = data['access_token']
        self._token_expiry = time.time() + data.get('expires_in', 3600)
        logger.info("Acquired Azure management token")
        return self._token

    def _get(self, path: str, api_version: str = '2023-05-01') -> dict:
        token = self._acquire_token()
        url = f"{self.MGMT_BASE}{path}"
        if '?' in url:
            url += f"&api-version={api_version}"
        else:
            url += f"?api-version={api_version}"

        resp = requests.get(url, headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _resource_group_path(self) -> str:
        return f"/subscriptions/{self.subscription_id}/resourceGroups/{self.resource_group}"

    def get_arb_extensions(self, appliance_name: str = None) -> list:
        if appliance_name is None:
            appliance_name = f'{self.cluster_name}-arcbridge'
        """Get Arc Resource Bridge (appliance) extensions via K8s configuration API."""
        path = (
            f"{self._resource_group_path()}/providers/Microsoft.ResourceConnector"
            f"/appliances/{appliance_name}/providers"
            f"/Microsoft.KubernetesConfiguration/extensions"
        )
        try:
            data = self._get(path, api_version='2023-05-01')
            return data.get('value', [])
        except Exception as e:
            logger.error(f"Failed to get ARB extensions: {e}")
            return []

    def get_node_extensions(self, machine_name: str) -> list:
        """Get Arc connected machine extensions."""
        path = (
            f"{self._resource_group_path()}/providers/Microsoft.HybridCompute"
            f"/machines/{machine_name}/extensions"
        )
        try:
            data = self._get(path, api_version='2024-07-10')
            return data.get('value', [])
        except Exception as e:
            logger.error(f"Failed to get extensions for {machine_name}: {e}")
            return []

    def get_all_extensions(self) -> dict:
        """Get both ARB and node extensions."""
        result = {
            'arb_extensions': self.get_arb_extensions(),
            'node_extensions': {}
        }
        for node in self.node_names:
            result['node_extensions'][node] = self.get_node_extensions(node)
        return result
