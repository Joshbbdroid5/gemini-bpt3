/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name: string;
            username?: string;
            last_name?: string;
          };
        };
        expand?: () => void;
        close?: () => void;
        HapticFeedback?: {
          notificationOccurred?: (type: string) => void;
        };
      };
    };
  }
}

export {};
