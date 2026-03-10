import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export function useUpdates() {
  return useQuery({
    queryKey: ['updates'],
    queryFn: async () => {
      const { data } = await api.get('/updates');
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useCurrentUpdate() {
  return useQuery({
    queryKey: ['updates', 'current'],
    queryFn: async () => {
      const { data } = await api.get('/updates/current');
      return data;
    },
    refetchInterval: 30000,
  });
}

export function useUpdateHistory() {
  return useQuery({
    queryKey: ['updates', 'history'],
    queryFn: async () => {
      const { data } = await api.get('/updates/history');
      return data;
    },
  });
}

export function useStartUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/updates/start', { confirm: true });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] });
    },
  });
}
