import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export function useClusterStatus() {
  return useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/status');
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useClusterNodes() {
  return useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/nodes');
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useClusterStorage() {
  return useQuery({
    queryKey: ['cluster', 'storage'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/storage');
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useClusterVMs() {
  return useQuery({
    queryKey: ['cluster', 'vms'],
    queryFn: async () => {
      const { data } = await api.get('/cluster/vms');
      return data;
    },
    refetchInterval: 30000,
  });
}
