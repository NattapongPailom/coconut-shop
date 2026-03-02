import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ApiOrder } from '../services/api';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface SocketEvents {
  onNewOrder?: (order: ApiOrder) => void;
  onOrderUpdate?: (payload: { type: string; order?: ApiOrder; orderId?: string }) => void;
  onOrdersInit?: (orders: ApiOrder[]) => void;
  onOrdersResorted?: (orders: ApiOrder[]) => void;
}

export function useSocket(events: SocketEvents) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);
  const eventsRef = useRef(events);

  // Keep events ref up-to-date without re-connecting
  useEffect(() => {
    eventsRef.current = events;
  });

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    // Connect to the backend (proxied through Vite in dev, direct in prod)
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
    });

    socket.on('disconnect', (reason) => {
      setStatus('disconnected');
      console.warn('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      setStatus('error');
      console.error('[Socket] Connection error:', err.message);
    });

    // Receive initial order list on connect
    socket.on('orders:init', (orders: ApiOrder[]) => {
      eventsRef.current.onOrdersInit?.(orders);
    });

    // New order received from LINE
    socket.on('order:new', (order: ApiOrder) => {
      eventsRef.current.onNewOrder?.(order);
    });

    // Any order status change or creation
    socket.on('orders:update', (payload: { type: string; order?: ApiOrder; orderId?: string }) => {
      eventsRef.current.onOrderUpdate?.(payload);
    });

    // Priority scores recalculated — re-sorted list
    socket.on('orders:resorted', (orders: ApiOrder[]) => {
      eventsRef.current.onOrdersResorted?.(orders);
    });
  }, []);

  useEffect(() => {
    connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { status, socket: socketRef.current };
}
