import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export function useClusterStatus() {
  return useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/status', { timeout: 20000 });
      return data;
    },
    refetchInterval: 30000,
    retry: 1,
  });
}

export function useClusterNodes() {
  return useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/nodes', { timeout: 20000 });
      return data;
    },
    refetchInterval: 60000,
    retry: 1,
  });
}

export function useClusterStorage() {
  return useQuery({
    queryKey: ['cluster', 'storage'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/storage', { timeout: 20000 });
      return data;
    },
    refetchInterval: 60000,
    retry: 1,
  });
}

export function useClusterVMs() {
  return useQuery({
    queryKey: ['cluster', 'vms'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/vms', { timeout: 20000 });
      return data;
    },
    refetchInterval: 30000,
    retry: 1,
  });
}
