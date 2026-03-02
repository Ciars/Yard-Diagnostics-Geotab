import { useEffect, useMemo, useRef } from 'react';
import {
    IconArrowUp,
    IconBrain,
    IconLoader2,
    IconMessageCircle,
    IconPlayerStop,
    IconRefresh,
    IconSparkles,
    IconX,
} from '@tabler/icons-react';
import type { RaiMessage, RaiSuggestedPrompt, RaiToolCall } from '@/features/rai/types';
import './RaiPanel.css';

interface RaiPanelProps {
    isOpen: boolean;
    draft: string;
    setDraft: (value: string) => void;
    messages: RaiMessage[];
    isSending: boolean;
    pendingToolCalls: RaiToolCall[];
    lastError: string | null;
    badges: string[];
    suggestedPrompts: RaiSuggestedPrompt[];
    onClose: () => void;
    onSend: (text: string) => void;
    onCancel: () => void;
    onRetry: () => void;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function RaiPanel(props: RaiPanelProps) {
    const {
        isOpen,
        draft,
        setDraft,
        messages,
        isSending,
        pendingToolCalls,
        lastError,
        badges,
        suggestedPrompts,
        onClose,
        onSend,
        onCancel,
        onRetry,
    } = props;

    const threadRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!threadRef.current) return;
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }, [messages, isSending, pendingToolCalls]);

    const canSend = draft.trim().length > 0 && !isSending;

    const emptyStatePrompts = useMemo(() => suggestedPrompts.slice(0, 3), [suggestedPrompts]);

    return (
        <aside
            className={`rai-panel ${isOpen ? 'rai-panel--open' : ''}`}
            aria-hidden={!isOpen}
            aria-label="Rai copilot panel"
        >
            <header className="rai-panel__header">
                <div className="rai-panel__title-wrap">
                    <span className="rai-panel__logo"><IconSparkles size={16} /></span>
                    <div>
                        <h2>Rai</h2>
                        <p>Operational copilot</p>
                    </div>
                </div>
                <button className="rai-panel__close" onClick={onClose} aria-label="Close Rai panel">
                    <IconX size={16} />
                </button>
            </header>

            {badges.length > 0 && (
                <div className="rai-panel__badges" aria-label="Active context">
                    {badges.map((badge) => (
                        <span key={badge} className="rai-panel__badge">{badge}</span>
                    ))}
                </div>
            )}

            <div className="rai-panel__thread" ref={threadRef}>
                {messages.length === 0 ? (
                    <div className="rai-panel__empty-state">
                        <IconBrain size={24} />
                        <h3>Ask Rai for dispatch and risk guidance</h3>
                        <p>Rai uses your active zone, filters, and expanded vehicle context.</p>
                        <div className="rai-panel__prompt-grid">
                            {emptyStatePrompts.map((item) => (
                                <button
                                    key={item.id}
                                    className="rai-panel__prompt"
                                    onClick={() => onSend(item.prompt)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <article
                                key={message.id}
                                className={`rai-message rai-message--${message.role}`}
                            >
                                <div className="rai-message__meta">
                                    <span>{message.role === 'assistant' ? 'Rai' : 'You'}</span>
                                    <time>{formatTime(message.createdAt)}</time>
                                </div>
                                <p>{message.text}</p>
                                {message.cites && message.cites.length > 0 && (
                                    <div className="rai-message__footer">
                                        {message.cites.map((cite) => (
                                            <span key={cite} className="rai-message__pill">{cite}</span>
                                        ))}
                                    </div>
                                )}
                            </article>
                        ))}
                        {isSending && (
                            <div className="rai-message rai-message--assistant rai-message--loading">
                                <IconLoader2 size={16} className="rai-spin" />
                                <span>Rai is analyzing current operational context…</span>
                            </div>
                        )}
                        {pendingToolCalls.length > 0 && (
                            <div className="rai-panel__tool-status">
                                <IconMessageCircle size={14} />
                                <span>Gathering additional data ({pendingToolCalls.length} tool call{pendingToolCalls.length > 1 ? 's' : ''})</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {lastError && (
                <div className="rai-panel__error">
                    <span>{lastError}</span>
                    <button onClick={onRetry}><IconRefresh size={14} /> Retry</button>
                </div>
            )}

            <div className="rai-panel__suggestions" aria-label="Suggested prompts">
                {suggestedPrompts.map((item) => (
                    <button key={item.id} onClick={() => onSend(item.prompt)} disabled={isSending}>
                        {item.label}
                    </button>
                ))}
            </div>

            <footer className="rai-panel__composer">
                <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask Rai about risk, readiness, or maintenance priorities"
                    rows={2}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            if (canSend) {
                                onSend(draft);
                            }
                        }
                    }}
                />
                <div className="rai-panel__composer-actions">
                    {isSending ? (
                        <button className="rai-panel__cancel" onClick={onCancel}>
                            <IconPlayerStop size={14} /> Cancel
                        </button>
                    ) : (
                        <button
                            className="rai-panel__send"
                            onClick={() => onSend(draft)}
                            disabled={!canSend}
                        >
                            <IconArrowUp size={14} /> Send
                        </button>
                    )}
                </div>
            </footer>
        </aside>
    );
}
