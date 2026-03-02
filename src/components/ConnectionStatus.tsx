import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { ConnectionStatus as Status } from '../hooks/useSocket';

interface ConnectionStatusProps {
  status: Status;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  if (status === 'connected') return null; // Don't show when connected

  const config = {
    connecting: {
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      text: 'กำลังเชื่อมต่อ...',
      bg: 'bg-amber-500',
    },
    disconnected: {
      icon: <WifiOff className="w-4 h-4" />,
      text: 'ขาดการเชื่อมต่อ — กำลังพยายามเชื่อมต่อใหม่',
      bg: 'bg-red-500',
    },
    error: {
      icon: <WifiOff className="w-4 h-4" />,
      text: 'เชื่อมต่อไม่ได้ — ตรวจสอบเซิร์ฟเวอร์',
      bg: 'bg-red-700',
    },
  };

  const c = config[status];

  return (
    <div className={`fixed top-0 left-0 right-0 z-[100] ${c.bg} text-white py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium`}>
      {c.icon}
      <span>{c.text}</span>
    </div>
  );
};
