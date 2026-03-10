import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)


class CVEChecker:
    MSRC_API_BASE = "https://api.msrc.microsoft.com/cvrf/v3.0"

    def __init__(self):
        self.http_client = httpx.Client(timeout=30)
        self._cache = {}
        self._cache_time = None
        self._cache_ttl = timedelta(hours=12)

    def get_recent_cves(self, months_back: int = 6) -> list:
        if self._cache_time and datetime.utcnow() - self._cache_time < self._cache_ttl:
            return self._cache.get('cves', [])

        results = []
        now = datetime.utcnow()
        for i in range(months_back):
            date = now - timedelta(days=30 * i)
            doc_id = date.strftime("%Y-%b")
            try:
                resp = self.http_client.get(f"{self.MSRC_API_BASE}/cvrf/{doc_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    results.extend(self._parse_cvrf_for_hci(data))
            except Exception as e:
                logger.warning(f"Failed to fetch MSRC data for {doc_id}: {e}")
                continue

        self._cache['cves'] = results
        self._cache_time = datetime.utcnow()
        return results

    def _parse_cvrf_for_hci(self, cvrf_data: dict) -> list:
        cves = []
        vulnerabilities = cvrf_data.get('Vulnerability', [])
        for vuln in vulnerabilities:
            product_statuses = vuln.get('ProductStatuses', [])
            is_hci = False
            for status in product_statuses:
                product_ids = status.get('ProductID', [])
                # Check if any product ID relates to Azure Stack HCI / Azure Local
                for pid in product_ids:
                    if isinstance(pid, str) and ('azure stack hci' in pid.lower() or 'azure local' in pid.lower()):
                        is_hci = True
                        break

            if not is_hci:
                # Also check product tree
                notes = vuln.get('Notes', [])
                for note in notes:
                    if isinstance(note, dict):
                        val = note.get('Value', '')
                        if 'azure stack hci' in val.lower() or 'azure local' in val.lower():
                            is_hci = True
                            break

            if is_hci:
                cve_id = vuln.get('CVE', '')
                title = ''
                severity = ''
                for note in vuln.get('Notes', []):
                    if isinstance(note, dict):
                        if note.get('Type') == 4:  # Description
                            title = note.get('Value', '')[:200]
                threats = vuln.get('Threats', [])
                for threat in threats:
                    if isinstance(threat, dict) and threat.get('Type') == 3:
                        desc = threat.get('Description', {})
                        severity = desc.get('Value', '') if isinstance(desc, dict) else ''

                cves.append({
                    'cve_id': cve_id,
                    'title': title,
                    'severity': severity,
                    'revision_date': vuln.get('RevisionHistory', [{}])[0].get('Date', '') if vuln.get('RevisionHistory') else ''
                })

        return cves
