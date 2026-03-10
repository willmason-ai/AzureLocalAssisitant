"""Shared enum maps for PowerShell numeric values returned via ConvertTo-Json."""

# Failover Cluster enums
CLUSTER_NODE_STATE = {0: 'Up', 1: 'Down', 2: 'Paused', 3: 'Joining'}
CLUSTER_NODE_STATUS = {
    0: 'Normal', 1: 'Isolated', 2: 'Quarantined',
    3: 'DrainInProgress', 4: 'DrainCompleted', 5: 'DrainFailed'
}
VM_STATE = {
    1: 'Other', 2: 'Running', 3: 'Off', 4: 'Stopping', 5: 'Saved',
    6: 'Paused', 7: 'Starting', 8: 'Reset', 9: 'Saving',
    10: 'Stopping', 11: 'Pausing', 12: 'Resuming'
}

# MOC enums (Get-MocNode returns numeric health/state)
MOC_HEALTH = {0: 'Healthy', 1: 'Warning', 2: 'Critical', 3: 'Unknown'}
MOC_STATE = {0: 'Active', 1: 'Inactive', 2: 'Maintenance', 3: 'Unknown'}

# Solution Update enums (Get-SolutionUpdate State)
SOLUTION_UPDATE_STATE = {
    0: 'Unknown', 1: 'HasPrerequisite', 2: 'Downloading',
    3: 'Ready', 4: 'NotApplicableBecauseAnotherUpdateIsInProgress',
    5: 'Preparing', 6: 'Installing', 7: 'Installed',
    8: 'PreparationFailed', 9: 'InstallationFailed',
    10: 'Invalid', 11: 'Recalled', 12: 'HealthChecking',
    13: 'HealthCheckFailed', 14: 'ReadyToInstall',
    15: 'ScanInProgress', 16: 'ScanFailed',
}

# Solution Update Run enums
SOLUTION_UPDATE_RUN_STATE = {
    0: 'Unknown', 1: 'InProgress', 2: 'Succeeded',
    3: 'Failed', 4: 'Cancelled',
}

# HCI Registration enums
HCI_CONNECTION_STATUS = {0: 'NotYet', 1: 'Connected', 2: 'Disconnected', 3: 'Error'}
HCI_REGISTRATION_STATUS = {0: 'NotYet', 1: 'Registered', 2: 'Unregistered', 3: 'Error'}


def resolve_enums(data, field_map):
    """Replace numeric enum values with readable strings in parsed PS output."""
    if data is None:
        return data
    items = data if isinstance(data, list) else [data]
    for item in items:
        if not isinstance(item, dict):
            continue
        for field, enum_map in field_map.items():
            if field in item and isinstance(item[field], int):
                item[field] = enum_map.get(item[field], f'Unknown({item[field]})')
    return data
