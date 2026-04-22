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
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  recordingDuration: number;
  setRecordingDuration: (duration: number) => void;
  practiceActive: boolean;
  setPracticeActive: (active: boolean) => void;
  practiceSessionId: string | null;
  setPracticeSessionId: (id: string | null) => void;
  practiceStartedAt: string | null;
  setPracticeStartedAt: (at: string | null) => void;
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
      isRecording: false,
      setIsRecording: (recording) => set({ isRecording: recording }),
      recordingDuration: 0,
      setRecordingDuration: (duration) => set({ recordingDuration: duration }),
      practiceActive: false,
      setPracticeActive: (active) => set({ practiceActive: active }),
      practiceSessionId: null,
      setPracticeSessionId: (id) => set({ practiceSessionId: id }),
      practiceStartedAt: null,
      setPracticeStartedAt: (at) => set({ practiceStartedAt: at }),
    }),
    {
      name: 'courtiq-store',
      partialize: (state) => ({
        activeTeamId: state.activeTeamId,
        practiceActive: state.practiceActive,
        practiceSessionId: state.practiceSessionId,
        practiceStartedAt: state.practiceStartedAt,
      }),
    }
  )
);
