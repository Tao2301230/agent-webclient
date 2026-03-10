import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { TimelineRow, formatTimelineTime } from "./TimelineRow";
import { buildTimelineDisplayItems } from "../../lib/timelineDisplay";
import { serializeRunTranscript } from "../../lib/runTranscript";
import { UiButton } from "../ui/UiButton";
import { MaterialIcon } from "../common/MaterialIcon";

async function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "absolute";
	textarea.style.left = "-9999px";
	document.body.appendChild(textarea);
	textarea.select();
	const copied = document.execCommand("copy");
	document.body.removeChild(textarea);
	if (!copied) {
		throw new Error("copy failed");
	}
}

export const ConversationStage: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const scrollRef = useRef<HTMLDivElement>(null);
	const autoScrollEnabledRef = useRef(true);
	const statusTimerRef = useRef<Map<string, number>>(
		new Map(),
	);
	const [actionStatus, setActionStatus] = useState<Record<string, string>>({});

	const isNearBottom = (el: HTMLDivElement, threshold = 24): boolean => {
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	};

	const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior });
	};

	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter((node): node is NonNullable<typeof node> => Boolean(node));
	}, [state.timelineOrder, state.timelineNodes]);
	const displayItems = useMemo(() => {
		return buildTimelineDisplayItems(
			timelineEntries,
			state.events,
		);
	}, [timelineEntries, state.events]);

	const flashActionStatus = useCallback((key: string, text: string) => {
		const existing = statusTimerRef.current.get(key);
		if (existing) {
			window.clearTimeout(existing);
		}
		setActionStatus((current) => ({ ...current, [key]: text }));
		const timer = window.setTimeout(() => {
			setActionStatus((current) => {
				const next = { ...current };
				delete next[key];
				return next;
			});
			statusTimerRef.current.delete(key);
		}, 1600);
		statusTimerRef.current.set(key, timer);
	}, []);

	const handleCopy = useCallback(
		async (key: string, text: string) => {
			try {
				await copyText(text);
				flashActionStatus(key, "已复制");
			} catch {
				flashActionStatus(key, "复制失败");
			}
		},
		[flashActionStatus],
	);

	const handleResend = useCallback(
		(text: string) => {
			if (state.streaming || !text.trim()) return;
			window.dispatchEvent(
				new CustomEvent("agent:send-message", { detail: { message: text } }),
			);
		},
		[state.streaming],
	);

	useEffect(() => {
		return () => {
			statusTimerRef.current.forEach((timer) =>
				window.clearTimeout(timer),
			);
			statusTimerRef.current.clear();
		};
	}, []);

	/* Default behavior: enter with auto-scroll enabled and stay pinned to bottom. */
	useEffect(() => {
		scrollToBottom("auto");
	}, []);

	/* Auto-scroll while pinned to bottom (including initial load). */
	useEffect(() => {
		if (!autoScrollEnabledRef.current) return;
		scrollToBottom("auto");
	}, [state.streaming, timelineEntries.length, state.chatId]);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		const handleScroll = () => {
			autoScrollEnabledRef.current = isNearBottom(el);
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, []);

	return (
		<div className="conversation-stage">
			<div className="messages-scroll" ref={scrollRef} id="messages">
				<div className="timeline-stack">
					{displayItems.length === 0 ? (
						<div className="timeline-empty">
							<p>开始新的对话，或从左侧选择已有对话</p>
						</div>
					) : (
						<div className="timeline-lane">
							{displayItems.map((item) => {
								if (item.kind === "query") {
									const queryTime = formatTimelineTime(item.node.ts);
									const queryCopyKey = `${item.key}:copy`;
									return (
										<TimelineRow
											key={item.key}
											node={item.node}
											metaNode={
												<div className="timeline-meta-row">
													{queryTime.short && (
														<div
															className="timeline-row-time"
															title={queryTime.full}
														>
															{queryTime.short}
														</div>
													)}
													<UiButton
														className="timeline-meta-btn"
														variant="ghost"
														size="sm"
														onClick={() =>
															handleCopy(
																queryCopyKey,
																item.node.text || "",
															)
														}
													>
														<MaterialIcon name="content_copy" />
														{actionStatus[queryCopyKey] || "复制"}
													</UiButton>
													<UiButton
														className="timeline-meta-btn"
														variant="ghost"
														size="sm"
														disabled={state.streaming}
														onClick={() =>
															handleResend(item.node.text || "")
														}
													>
														<MaterialIcon name="refresh" />
														重发
													</UiButton>
												</div>
											}
										/>
									);
								}

								if (item.kind === "run") {
									const time = formatTimelineTime(
										item.completedAt,
									);
									const runCopyKey = `${item.key}:copy`;
									const isDownvoted =
										state.downvotedRunKeys.has(item.key);
									return (
										<section
											key={item.key}
											className="timeline-run-group"
										>
											<div className="timeline-run-items">
												{item.nodes.map((node) => (
													<TimelineRow
														key={node.id}
														node={node}
													/>
												))}
											</div>
											<div className="timeline-run-meta">
												{time.short && (
													<div
														className="timeline-run-time"
														title={time.full}
													>
														{time.short}
													</div>
												)}
												<UiButton
													className="timeline-meta-btn"
													variant="ghost"
													size="sm"
													onClick={() =>
														handleCopy(
															runCopyKey,
															serializeRunTranscript(
																item.queryNode,
																item.nodes,
															),
														)
													}
												>
													<MaterialIcon name="content_copy" />
													{actionStatus[runCopyKey] || "复制"}
												</UiButton>
												<UiButton
													className={`timeline-meta-btn ${isDownvoted ? "is-downvoted" : ""}`}
													variant="ghost"
													size="sm"
													active={isDownvoted}
													onClick={() =>
														dispatch({
															type: "TOGGLE_RUN_DOWNVOTE",
															runKey: item.key,
														})
													}
												>
													<MaterialIcon name="thumb_down" />
													{isDownvoted ? "已点踩" : "点踩"}
												</UiButton>
											</div>
										</section>
									);
								}

								return (
									<TimelineRow
										key={item.key}
										node={item.node}
									/>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
