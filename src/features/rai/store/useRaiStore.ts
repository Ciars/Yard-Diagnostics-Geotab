import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { RaiMessage, RaiToolCall, RaiVehicleDetailSnapshot } from '@/features/rai/types';

interface RaiState {
    isOpen: boolean;
    draft: string;
    messages: RaiMessage[];
    isSending: boolean;
    pendingToolCalls: RaiToolCall[];
    lastError: string | null;
    lastSentAt: number;
    expandedDetailByVehicleId: Record<string, RaiVehicleDetailSnapshot>;
}

interface RaiActions {
    setOpen: (isOpen: boolean) => void;
    toggleOpen: () => void;
    setDraft: (draft: string) => void;
    addMessage: (message: RaiMessage) => void;
    clearMessages: () => void;
    setIsSending: (isSending: boolean) => void;
    setPendingToolCalls: (calls: RaiToolCall[]) => void;
    setLastError: (error: string | null) => void;
    touchSentAt: () => void;
    upsertExpandedDetail: (detail: RaiVehicleDetailSnapshot) => void;
    clearExpandedDetails: () => void;
}

type RaiStore = RaiState & RaiActions;

const initialState: RaiState = {
    isOpen: false,
    draft: '',
    messages: [],
    isSending: false,
    pendingToolCalls: [],
    lastError: null,
    lastSentAt: 0,
    expandedDetailByVehicleId: {},
};

export const useRaiStore = create<RaiStore>()(
    import.meta.env.DEV
        ? devtools(
            (set) => ({
                ...initialState,
                setOpen: (isOpen) => set({ isOpen }, false, 'rai/setOpen'),
                toggleOpen: () => set((state) => ({ isOpen: !state.isOpen }), false, 'rai/toggleOpen'),
                setDraft: (draft) => set({ draft }, false, 'rai/setDraft'),
                addMessage: (message) => set(
                    (state) => ({ messages: [...state.messages, message] }),
                    false,
                    'rai/addMessage'
                ),
                clearMessages: () => set({ messages: [] }, false, 'rai/clearMessages'),
                setIsSending: (isSending) => set({ isSending }, false, 'rai/setIsSending'),
                setPendingToolCalls: (pendingToolCalls) => set({ pendingToolCalls }, false, 'rai/setPendingTools'),
                setLastError: (lastError) => set({ lastError }, false, 'rai/setLastError'),
                touchSentAt: () => set({ lastSentAt: Date.now() }, false, 'rai/touchSentAt'),
                upsertExpandedDetail: (detail) => set(
                    (state) => ({
                        expandedDetailByVehicleId: {
                            ...state.expandedDetailByVehicleId,
                            [detail.vehicleId]: detail,
                        },
                    }),
                    false,
                    'rai/upsertExpandedDetail'
                ),
                clearExpandedDetails: () => set({ expandedDetailByVehicleId: {} }, false, 'rai/clearExpandedDetails'),
            }),
            { name: 'RaiStore' }
        )
        : (set) => ({
            ...initialState,
            setOpen: (isOpen) => set({ isOpen }),
            toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
            setDraft: (draft) => set({ draft }),
            addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
            clearMessages: () => set({ messages: [] }),
            setIsSending: (isSending) => set({ isSending }),
            setPendingToolCalls: (pendingToolCalls) => set({ pendingToolCalls }),
            setLastError: (lastError) => set({ lastError }),
            touchSentAt: () => set({ lastSentAt: Date.now() }),
            upsertExpandedDetail: (detail) => set((state) => ({
                expandedDetailByVehicleId: {
                    ...state.expandedDetailByVehicleId,
                    [detail.vehicleId]: detail,
                },
            })),
            clearExpandedDetails: () => set({ expandedDetailByVehicleId: {} }),
        })
);
