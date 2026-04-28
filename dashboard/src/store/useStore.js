import { create } from 'zustand'

export const useStore = create((set) => ({
  activePage: 'overview',
  setActivePage: (p) => set({ activePage: p, currentAvatarId: null }),

  selectedAvatar: null,
  setSelectedAvatar: (a) => set({ selectedAvatar: a }),

  // ניווט לעמוד פירוט אווטאר — שומר את ה-id ועובר לעמוד detail
  currentAvatarId: null,
  viewAvatarDetail: (id) => set({ currentAvatarId: id, activePage: 'avatar-detail' }),
  closeAvatarDetail: () => set({ currentAvatarId: null, activePage: 'avatars' }),

  colabHealth: { tts: null, image: null, lipsync: null },
  setColabHealth: (h) => set({ colabHealth: h }),

  apiCallsToday: 0,
  setApiCallsToday: (n) => set({ apiCallsToday: n }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  // modals
  produceModalOpen: false,
  produceModalPrefill: null,
  openProduceModal: (prefill = null) => set({ produceModalOpen: true, produceModalPrefill: prefill }),
  closeProduceModal: () => set({ produceModalOpen: false, produceModalPrefill: null }),

  newAvatarOpen: false,
  setNewAvatarOpen: (v) => set({ newAvatarOpen: v }),

  editAvatar: null,
  setEditAvatar: (a) => set({ editAvatar: a }),

  videoDetail: null,
  setVideoDetail: (v) => set({ videoDetail: v }),
}))
