import React, { useRef, useCallback, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MentionSuggest } from "./MentionSuggest";
import { COMPOSER_MAX_LINES } from "../../context/constants";
import { createRequestId, interruptChat, steerChat } from "../../lib/apiClient";
import { parseLeadingMentionDraft } from "../../lib/mentionParser";

export const ComposerArea: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const [inputValue, setInputValue] = useState("");
	const [plusMenuOpen, setPlusMenuOpen] = useState(false);

	const isFrontendActive = !!state.activeFrontendTool;

	const autoresize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
		const maxHeight = lineHeight * COMPOSER_MAX_LINES;
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	}, []);

	useEffect(() => {
		autoresize();
	}, [inputValue, autoresize]);

	useEffect(() => {
		if (!plusMenuOpen) return;

		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (plusMenuRef.current?.contains(target)) return;
			setPlusMenuOpen(false);
		};

		const onEsc = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setPlusMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onEsc);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onEsc);
		};
	}, [plusMenuOpen]);

	const closeMention = useCallback(() => {
		dispatch({ type: "SET_MENTION_OPEN", open: false });
		dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: [] });
		dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
	}, [dispatch]);

	const updateMentionSuggestions = useCallback(
		(value: string) => {
			const draft = parseLeadingMentionDraft(value);
			if (!draft) {
				closeMention();
				return;
			}

			const query = String(draft.token || "").toLowerCase();
			const candidates = state.agents
				.filter((agent) => {
					const key = String(agent.key || "").toLowerCase();
					const name = String(agent.name || "").toLowerCase();
					if (!query) return true;
					return key.includes(query) || name.includes(query);
				})
				.slice(0, 8);

			if (candidates.length === 0) {
				closeMention();
				return;
			}

			dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: candidates });
			dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
			dispatch({ type: "SET_MENTION_OPEN", open: true });
		},
		[closeMention, dispatch, state.agents],
	);

	const selectMentionByIndex = useCallback(
		(index: number) => {
			const target = state.mentionSuggestions[index];
			if (!target) return;
			const displayLabel = String(target.name || "").trim() || target.key;
			const next = `@${displayLabel} `;
			setInputValue(next);
			closeMention();
			window.requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				const caret = next.length;
				el.setSelectionRange(caret, caret);
			});
		},
		[closeMention, state.mentionSuggestions],
	);

	const handleSend = useCallback(() => {
		const message = inputValue.trim();
		if (!message || state.streaming) return;
		setInputValue("");
		/* Dispatch a custom event so hooks can pick up the send action */
		window.dispatchEvent(
			new CustomEvent("agent:send-message", { detail: { message } }),
		);
	}, [inputValue, state.streaming]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (state.mentionOpen && state.mentionSuggestions.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					dispatch({
						type: "SET_MENTION_ACTIVE_INDEX",
						index:
							(state.mentionActiveIndex + 1) %
							state.mentionSuggestions.length,
					});
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					dispatch({
						type: "SET_MENTION_ACTIVE_INDEX",
						index:
							(state.mentionActiveIndex -
								1 +
								state.mentionSuggestions.length) %
							state.mentionSuggestions.length,
					});
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					closeMention();
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					selectMentionByIndex(state.mentionActiveIndex);
					return;
				}
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[
			handleSend,
			state.mentionOpen,
			state.mentionSuggestions,
			state.mentionActiveIndex,
			dispatch,
			closeMention,
			selectMentionByIndex,
		],
	);

	const resolveCurrentRunId = useCallback(() => {
		const fromState = String(state.runId || "").trim();
		if (fromState) return fromState;

		for (let i = state.events.length - 1; i >= 0; i -= 1) {
			const event = state.events[i];
			const rid = String(
				(event as { runId?: string }).runId || "",
			).trim();
			if (rid) return rid;
		}
		return "";
	}, [state.runId, state.events]);

	const resolveCurrentAgentKey = useCallback(() => {
		const chatId = String(state.chatId || "").trim();
		if (chatId) {
			const remembered = String(
				state.chatAgentById.get(chatId) || "",
			).trim();
			if (remembered) return remembered;
		}
		return String(state.pendingNewChatAgentKey || "").trim();
	}, [state.chatId, state.chatAgentById, state.pendingNewChatAgentKey]);

	const handleInterrupt = useCallback(async () => {
		const chatId = String(state.chatId || "").trim();
		const runId = resolveCurrentRunId();
		const requestId = createRequestId("req");
		const agentKey = resolveCurrentAgentKey();
		if (!chatId || !runId) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
			});
			return;
		}

		try {
			await interruptChat({
				requestId,
				chatId,
				runId,
				agentKey: agentKey || undefined,
				message: "",
				planningMode: Boolean(state.planningMode),
			});
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] requested for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
			});
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] failed: ${(error as Error).message}`,
			});
		} finally {
			state.abortController?.abort();
			dispatch({ type: "SET_STREAMING", streaming: false });
			dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
		}
	}, [
		dispatch,
		resolveCurrentRunId,
		resolveCurrentAgentKey,
		state.chatId,
		state.abortController,
		state.planningMode,
	]);

	const handleSteer = useCallback(async () => {
		const message = state.steerDraft.trim();
		if (!message || !state.streaming) return;

		const chatId = String(state.chatId || "").trim();
		const runId = resolveCurrentRunId();
		const requestId = createRequestId("req");
		const agentKey = resolveCurrentAgentKey();
		if (!chatId || !runId) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
			});
			return;
		}

		try {
			await steerChat({
				requestId,
				chatId,
				runId,
				agentKey: agentKey || undefined,
				message,
				planningMode: Boolean(state.planningMode),
			});
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] submitted for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
			});
			dispatch({ type: "SET_STEER_DRAFT", draft: "" });
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] failed: ${(error as Error).message}`,
			});
		}
	}, [
		state.steerDraft,
		state.streaming,
		state.chatId,
		resolveCurrentRunId,
		resolveCurrentAgentKey,
		dispatch,
		state.planningMode,
	]);

	useEffect(() => {
		const onSelectMention = (event: Event) => {
			const agentKey = String(
				(event as CustomEvent).detail?.agentKey || "",
			).trim();
			const agentName = String(
				(event as CustomEvent).detail?.agentName || "",
			).trim();
			if (!agentKey) return;
			const displayLabel = agentName || agentKey;
			setInputValue(`@${displayLabel} `);
			closeMention();
		};

		window.addEventListener("agent:select-mention", onSelectMention);
		return () =>
			window.removeEventListener("agent:select-mention", onSelectMention);
	}, [closeMention]);

	return (
		<div
			className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
		>
			{state.mentionOpen && <MentionSuggest />}
			{state.streaming && !isFrontendActive && (
				<div className="steer-bar">
					<input
						type="text"
						className="steer-input"
						placeholder="输入引导内容..."
						value={state.steerDraft}
						onChange={(e) =>
							dispatch({
								type: "SET_STEER_DRAFT",
								draft: e.target.value,
							})
						}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleSteer();
							}
						}}
					/>
					<button
						className="steer-btn"
						type="button"
						disabled={!state.steerDraft.trim()}
						onClick={handleSteer}
					>
						引导
					</button>
				</div>
			)}
			<div
				className={`composer-pill ${isFrontendActive ? "hidden" : ""}`}
			>
				<textarea
					ref={textareaRef}
					id="message-input"
					rows={3}
					placeholder={
						isFrontendActive
							? "前端工具处理中，请在确认面板内提交"
							: "回复消息...（Enter 发送，Shift+Enter 换行）"
					}
					disabled={isFrontendActive}
					value={inputValue}
					onChange={(e) => {
						const next = e.target.value;
						setInputValue(next);
						updateMentionSuggestions(next);
					}}
					onKeyDown={handleKeyDown}
				/>
				<div className="flex justify-between w-full">
					<div className="composer-plus-wrap" ref={plusMenuRef}>
						<button
							type="button"
							className="composer-plus-btn"
							aria-expanded={plusMenuOpen}
							onClick={() => setPlusMenuOpen((open) => !open)}
						>
							+
						</button>
						{plusMenuOpen && (
							<div className="composer-plus-popover">
								<label
									className="planning-toggle"
									htmlFor="planning-mode-switch"
								>
									<input
										id="planning-mode-switch"
										type="checkbox"
										checked={state.planningMode}
										onChange={(e) =>
											dispatch({
												type: "SET_PLANNING_MODE",
												enabled: e.target.checked,
											})
										}
									/>
									<span>计划模式</span>
								</label>
							</div>
						)}
					</div>
					{state.streaming ? (
						<button
							className="interrupt-btn"
							id="interrupt-btn"
							disabled={isFrontendActive}
							onClick={handleInterrupt}
						>
							中断
						</button>
					) : (
						<button
							className="send-btn"
							id="send-btn"
							disabled={isFrontendActive}
							onClick={handleSend}
						>
							↑
						</button>
					)}
				</div>
			</div>
		</div>
	);
};
