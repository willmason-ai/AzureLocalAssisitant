import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export function useCredentialStatus() {
  return useQuery({
    queryKey: ['credentials', 'status'],
    queryFn: async () => {
      const { data } = await api.get('/credentials/status');
      return data;
    },
    refetchInterval: 300000, // 5 minutes
  });
}

export function useARBStatus() {
  return useQuery({
    queryKey: ['credentials', 'arb'],
    queryFn: async () => {
      const { data } = await api.get('/credentials/arb-status');
      return data;
    },
    refetchInterval: 300000,
  });
}

export function useRepairMoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/credentials/repair-moc', { confirm: true });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'], exact: false });
    },
  });
}

export function useRotateKVA() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (validityDays: number = 365) => {
      const { data } = await api.post('/credentials/rotate-kva', {
        confirm: true,
        validity_days: validityDays,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'], exact: false });
    },
  });
}
