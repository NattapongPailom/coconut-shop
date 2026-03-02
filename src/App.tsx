import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { OrderGrid } from './components/OrderGrid';
import { CompletedOrders } from './components/CompletedOrders';
import { Notification } from './components/Notification';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Order, DailyStats } from './types';
import { api, ApiOrder } from './services/api';
import { useSocket } from './hooks/useSocket';
import { Plus, RefreshCw } from 'lucide-react';

function mapApiOrder(o: ApiOrder): Order {
  return {
    id: o.id,
    queueNumber: o.queueNumber,
    customerName: o.customerName,
    customerLineId: o.customerLineId,
    items: o.items,
    totalPrice: o.totalPrice,
    pickupTime: o.pickupTime,
    status: o.status,
    priorityScore: o.priorityScore,
    note: o.note,
    source: o.source,
    rawMessage: o.rawMessage,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Load Initial Data ──────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const [active, history, dailyStats] = await Promise.all([
        api.getOrders(),
        api.getHistory(),
        api.getStats(),
      ]);
      setOrders(active.map(mapApiOrder));
      setCompletedOrders(history.map(mapApiOrder));
      setStats(dailyStats);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ─── Notification Sound (bell) ──────────────────────────────────────────────

  const playNotificationSound = useCallback(() => {
    try {
      // Use Web Audio API to generate a simple bell sound without external files
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.8);
    } catch {
      // Audio not available — skip silently
    }
  }, []);

  // ─── Socket.io Real-time Updates ────────────────────────────────────────────

  const { status: socketStatus } = useSocket({
    onOrdersInit: (incoming) => {
      setOrders(incoming.map(mapApiOrder));
    },

    onNewOrder: (newOrder) => {
      const order = mapApiOrder(newOrder);
      setOrders((prev) => {
        // Avoid duplicates
        if (prev.some((o) => o.id === order.id)) return prev;
        return [...prev, order].sort((a, b) => b.priorityScore - a.priorityScore);
      });

      const name = newOrder.customerName || 'ลูกค้า';
      setNotification(`🥥 ออเดอร์ใหม่! ${newOrder.queueNumber} — ${name}`);
      playNotificationSound();

      // Refresh stats
      api.getStats().then(setStats).catch(console.error);
    },

    onOrderUpdate: (payload) => {
      if (payload.type === 'status_changed' && payload.order) {
        const updated = mapApiOrder(payload.order);

        if (updated.status === 'done' || updated.status === 'cancelled') {
          setOrders((prev) => prev.filter((o) => o.id !== updated.id));
          if (updated.status === 'done') {
            setCompletedOrders((prev) => [updated, ...prev].slice(0, 100));
          }
        } else {
          setOrders((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o))
          );
        }

        // Refresh stats when status changes
        api.getStats().then(setStats).catch(console.error);
      } else if (payload.type === 'created' && payload.order) {
        const order = mapApiOrder(payload.order);
        setOrders((prev) => {
          if (prev.some((o) => o.id === order.id)) return prev;
          return [...prev, order].sort((a, b) => b.priorityScore - a.priorityScore);
        });
      } else if (payload.type === 'cancelled' && payload.orderId) {
        setOrders((prev) => prev.filter((o) => o.id !== payload.orderId));
      }
    },

    onOrdersResorted: (resorted) => {
      setOrders(resorted.map(mapApiOrder));
    },
  });

  // ─── Status Update Handler ──────────────────────────────────────────────────

  const handleUpdateStatus = useCallback(
    async (id: string, newStatus: Order['status']) => {
      // Optimistic UI update
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
      );

      try {
        await api.updateStatus(id, newStatus);
        // Socket event will sync the actual state
      } catch (err) {
        console.error('Failed to update status:', err);
        // Revert optimistic update on failure
        fetchOrders();
      }
    },
    [fetchOrders]
  );

  // ─── Derived State ──────────────────────────────────────────────────────────

  const waitingOrders = orders
    .filter((o) => o.status === 'waiting')
    .sort((a, b) => b.priorityScore - a.priorityScore || 
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const makingOrders = orders
    .filter((o) => o.status === 'making')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const dailyRevenue = stats?.dailyRevenue ?? 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-20 font-sans">
      <ConnectionStatus status={socketStatus} />
      <Notification message={notification} onClose={() => setNotification(null)} />

      <Header
        activeOrdersCount={waitingOrders.length}
        makingCount={makingOrders.length}
        dailyRevenue={dailyRevenue}
        socketStatus={socketStatus}
      />

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4 text-stone-400">
              <RefreshCw className="w-12 h-12 animate-spin" />
              <p className="text-2xl font-medium">กำลังโหลด...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Priority Section: Making Now */}
            {makingOrders.length > 0 && (
              <OrderGrid
                title="กำลังทำ (Making Now)"
                orders={makingOrders}
                onUpdateStatus={handleUpdateStatus}
              />
            )}

            {/* Queue Section: Waiting */}
            <OrderGrid
              title="คิวรอทำ (Waiting Queue)"
              orders={waitingOrders}
              onUpdateStatus={handleUpdateStatus}
              emptyMessage="ไม่มีคิวรอ — รอออเดอร์ใหม่"
            />

            {/* History Section */}
            <CompletedOrders orders={completedOrders} />
          </>
        )}
      </main>

      {/* Refresh button */}
      <button
        onClick={fetchOrders}
        className="fixed bottom-6 right-6 bg-coconut-green text-white p-4 rounded-full shadow-xl hover:bg-coconut-dark transition-colors z-50"
        title="รีเฟรช (Refresh)"
      >
        <RefreshCw className="w-8 h-8" />
      </button>
    </div>
  );
}

export default App;
