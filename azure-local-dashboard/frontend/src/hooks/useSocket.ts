import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

/**
 * Map of SocketIO event keys (emitted by the backend scheduler) to the
 * React Query cache keys they should invalidate.  When the backend pushes
 * a `cluster_update` event with `{ key: '<cache_key>' }`, we invalidate
 * the corresponding React Query queries so the UI refetches immediately.
 */
const CACHE_KEY_MAP: Record<string, string[][]> = {
  cluster_health:       [['cluster', 'status'], ['cluster', 'nodes']],
  health_faults:        [['cluster', 'status']],
  storage_pools:        [['cluster', 'storage']],
  virtual_disks:        [['cluster', 'storage']],
  cluster_vms:          [['cluster', 'vms']],
  cluster_nodes_detail: [['cluster', 'nodes']],
  updates:              [['updates']],
  update_current:       [['updates', 'current']],
  update_history:       [['updates', 'history']],
  kva_token:            [['credentials']],
  hci_registration:     [['credentials']],
  moc_nodes:            [['credentials']],
};

/**
 * Hook that establishes a single SocketIO connection to the backend and
 * listens for `cluster_update` events.  On each event it invalidates the
 * matching React Query cache keys so the UI refreshes without waiting for
 * the next polling interval.
 *
 * Call this once near the top of the component tree (e.g. in Layout).
 */
export function useSocket() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connect to the same origin the page was served from.
    // In dev mode, Vite proxies /socket.io/ to the backend (see vite.config.ts).
    const socket = io({
      // Let socket.io-client infer the URL from window.location
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[ws] connected to backend');
    });

    socket.on('disconnect', (reason) => {
      console.log('[ws] disconnected:', reason);
    });

    socket.on('cluster_update', (payload: { key: string }) => {
      const queryKeys = CACHE_KEY_MAP[payload.key];
      if (queryKeys) {
        for (const qk of queryKeys) {
          queryClient.invalidateQueries({ queryKey: qk });
        }
      } else {
        // Unknown key -- invalidate everything as a safe fallback
        queryClient.invalidateQueries();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  return socketRef;
}
