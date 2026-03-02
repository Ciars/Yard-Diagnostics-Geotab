import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IGeotabApi } from '@/services/GeotabApiFactory';
import { useRaiStore } from '@/features/rai/store/useRaiStore';
import type { RaiChatRequest, RaiContextSnapshot, RaiMessage, RaiSuggestedPrompt } from '@/features/rai/types';
import { postRaiChat, createClientRequestId, hashStableId } from '@/features/rai/api/raiClient';
import { executeRaiToolCalls } from '@/features/rai/tools/clientTools';

interface RaiIdentity {
    sessionId: string;
    userHash: string;
}

function createMessage(role: RaiMessage['role'], text: string): RaiMessage {
    return {
        id: createClientRequestId(),
        role,
        text,
        createdAt: Date.now(),
    };
}

interface UseRaiControllerArgs {
    api: IGeotabApi | null;
    context: RaiContextSnapshot;
    suggestedPrompts: RaiSuggestedPrompt[];
}

const MAX_TOOL_ROUNDS = 3;

export function useRaiController({ api, context, suggestedPrompts }: UseRaiControllerArgs) {
    const isOpen = useRaiStore((state) => state.isOpen);
    const draft = useRaiStore((state) => state.draft);
    const messages = useRaiStore((state) => state.messages);
    const isSending = useRaiStore((state) => state.isSending);
    const pendingToolCalls = useRaiStore((state) => state.pendingToolCalls);
    const lastError = useRaiStore((state) => state.lastError);
    const lastSentAt = useRaiStore((state) => state.lastSentAt);
    const expandedDetailByVehicleId = useRaiStore((state) => state.expandedDetailByVehicleId);

    const setOpen = useRaiStore((state) => state.setOpen);
    const toggleOpen = useRaiStore((state) => state.toggleOpen);
    const setDraft = useRaiStore((state) => state.setDraft);
    const addMessage = useRaiStore((state) => state.addMessage);
    const setIsSending = useRaiStore((state) => state.setIsSending);
    const setPendingToolCalls = useRaiStore((state) => state.setPendingToolCalls);
    const setLastError = useRaiStore((state) => state.setLastError);
    const touchSentAt = useRaiStore((state) => state.touchSentAt);

    const abortRef = useRef<AbortController | null>(null);
    const contextRef = useRef(context);
    const [identity, setIdentity] = useState<RaiIdentity>({
        sessionId: 'anonymous-session',
        userHash: 'anonymous',
    });

    useEffect(() => {
        contextRef.current = context;
    }, [context]);

    useEffect(() => {
        let cancelled = false;

        async function resolveIdentity() {
            if (!api) {
                setIdentity({ sessionId: 'anonymous-session', userHash: 'anonymous' });
                return;
            }

            try {
                const session = await api.getSession();
                if (cancelled) return;

                const sessionId = session.sessionId || 'geotab-session';
                const userSeed = `${session.database}:${session.userName}`;
                setIdentity({
                    sessionId,
                    userHash: hashStableId(userSeed),
                });
            } catch {
                if (cancelled) return;
                setIdentity({ sessionId: 'anonymous-session', userHash: 'anonymous' });
            }
        }

        resolveIdentity();

        return () => {
            cancelled = true;
        };
    }, [api]);

    const sendMessage = useCallback(async (rawText: string) => {
        const text = rawText.trim();
        if (!text || isSending) return;

        const now = Date.now();
        if (now - lastSentAt < 350) {
            return;
        }

        const userMessage = createMessage('user', text);
        addMessage(userMessage);
        setDraft('');
        setIsSending(true);
        setLastError(null);
        touchSentAt();

        const conversation = [...messages, userMessage].map((message) => ({
            role: message.role,
            text: message.text,
            createdAt: message.createdAt,
        }));

        const requestId = createClientRequestId();
        let toolResults: RaiChatRequest['toolResults'] = undefined;
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
                const payload: RaiChatRequest = {
                    requestId,
                    sessionId: identity.sessionId,
                    userHash: identity.userHash,
                    conversation,
                    context: contextRef.current,
                    toolResults,
                };

                const response = await postRaiChat(payload, controller.signal);

                if (response.type === 'answer') {
                    addMessage({
                        ...createMessage('assistant', response.answer),
                        cites: response.cites,
                        usedData: response.usedData,
                    });
                    setPendingToolCalls([]);
                    return;
                }

                if (response.type === 'error') {
                    throw new Error(response.message);
                }

                setPendingToolCalls(response.calls);
                toolResults = await executeRaiToolCalls(response.calls, {
                    api,
                    getContextSnapshot: () => contextRef.current,
                    getExpandedDetail: (vehicleId) => expandedDetailByVehicleId[vehicleId] ?? null,
                });
            }

            throw new Error('Rai reached the tool-call limit before producing an answer.');
        } catch (error) {
            if (controller.signal.aborted) {
                setLastError('Request cancelled.');
                return;
            }

            const message = error instanceof Error ? error.message : 'Rai request failed.';
            setLastError(message);
            addMessage(createMessage('assistant', `I could not complete that request: ${message}`));
        } finally {
            setIsSending(false);
            setPendingToolCalls([]);
            abortRef.current = null;
        }
    }, [
        addMessage,
        api,
        expandedDetailByVehicleId,
        identity.sessionId,
        identity.userHash,
        isSending,
        lastSentAt,
        messages,
        setDraft,
        setIsSending,
        setLastError,
        setPendingToolCalls,
        touchSentAt,
    ]);

    const cancelInFlight = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const retryLast = useCallback(() => {
        const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
        if (!lastUserMessage) return;
        void sendMessage(lastUserMessage.text);
    }, [messages, sendMessage]);

    const badges = useMemo(() => {
        const list: string[] = [];
        if (context.app.selectedZoneName) list.push(`Zone: ${context.app.selectedZoneName}`);
        if (context.app.activeKpiFilter) list.push(`Filter: ${context.app.activeKpiFilter}`);
        if (context.focus.expandedVehicleName) list.push(`Focus: ${context.focus.expandedVehicleName}`);
        if (context.summary.criticalCount > 0) list.push(`Critical: ${context.summary.criticalCount}`);
        return list.slice(0, 4);
    }, [context]);

    return {
        isOpen,
        draft,
        setDraft,
        messages,
        isSending,
        pendingToolCalls,
        lastError,
        sendMessage,
        cancelInFlight,
        retryLast,
        openPanel: () => setOpen(true),
        closePanel: () => setOpen(false),
        toggleOpen,
        suggestedPrompts,
        badges,
    };
}
