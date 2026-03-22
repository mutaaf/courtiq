import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Team, Coach } from '@/types/database';

interface AppState {
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  syncStatus: 'idle' | 'syncing' | 'error';
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTeamId: null,
      setActiveTeamId: (id) => set({ activeTeamId: id }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      isOnline: true,
      setIsOnline: (online) => set({ isOnline: online }),
      syncStatus: 'idle',
      setSyncStatus: (status) => set({ syncStatus: status }),
    }),
    {
      name: 'courtiq-store',
      partialize: (state) => ({ activeTeamId: state.activeTeamId }),
    }
  )
);
