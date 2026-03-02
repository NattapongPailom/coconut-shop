import React, { useState, useEffect } from 'react';
import { Clock, ShoppingBag, DollarSign, Wifi, WifiOff } from 'lucide-react';
import { ConnectionStatus } from '../hooks/useSocket';

interface HeaderProps {
  activeOrdersCount: number;
  makingCount: number;
  dailyRevenue: number;
  socketStatus: ConnectionStatus;
}

export const Header: React.FC<HeaderProps> = ({
  activeOrdersCount,
  makingCount,
  dailyRevenue,
  socketStatus,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = currentTime.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateString = currentTime.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isConnected = socketStatus === 'connected';

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-stone-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">

        {/* Shop Info & Connection Status */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="bg-coconut-green p-3 rounded-2xl shadow-lg relative">
            <span className="text-3xl">🥥</span>
            {/* Connection indicator dot */}
            <span
              className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                isConnected ? 'bg-green-500' : 'bg-red-400 animate-pulse'
              }`}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-coconut-dark leading-none">
              มะพร้าวเจ๊ประจวบ
            </h1>
            <p className="text-stone-500 text-sm font-medium">{dateString}</p>
          </div>
        </div>

        {/* Center Clock (Large) */}
        <div className="hidden md:flex items-center gap-2 bg-stone-100 px-6 py-2 rounded-full border border-stone-200">
          <Clock className="w-6 h-6 text-coconut-green" />
          <span className="text-3xl font-bold text-stone-800 tracking-widest font-mono">
            {timeString}
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Making Count */}
          {makingCount > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 px-5 py-3 rounded-xl border border-blue-100 flex-1 md:flex-none">
              <div className="bg-blue-100 p-2 rounded-lg">
                <span className="text-2xl">🍳</span>
              </div>
              <div>
                <p className="text-xs text-blue-800 font-semibold uppercase tracking-wider">
                  กำลังทำ
                </p>
                <p className="text-2xl font-bold text-blue-900">{makingCount}</p>
              </div>
            </div>
          )}

          {/* Waiting Count */}
          <div className="flex items-center gap-3 bg-amber-50 px-5 py-3 rounded-xl border border-amber-100 flex-1 md:flex-none">
            <div className="bg-amber-100 p-2 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-amber-800 font-semibold uppercase tracking-wider">
                รอทำ (Waiting)
              </p>
              <p className="text-2xl font-bold text-amber-900">{activeOrdersCount}</p>
            </div>
          </div>

          {/* Daily Revenue */}
          <div className="flex items-center gap-3 bg-emerald-50 px-5 py-3 rounded-xl border border-emerald-100 flex-1 md:flex-none">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">
                ยอดวันนี้ (Today)
              </p>
              <p className="text-2xl font-bold text-emerald-900">
                ฿{dailyRevenue.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
