import React, { useRef, useEffect, useMemo } from "react";
import { useAppState } from "../../context/AppContext";
import { TimelineRow, formatTimelineTime } from "./TimelineRow";
import { buildTimelineDisplayItems } from "../../lib/timelineDisplay";

export const ConversationStage: React.FC = () => {
	const state = useAppState();
	const scrollRef = useRef<HTMLDivElement>(null);
	const autoScrollEnabledRef = useRef(true);

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
									return (
										<TimelineRow
											key={item.key}
											node={item.node}
											showTime
										/>
									);
								}

								if (item.kind === "run") {
									const time = formatTimelineTime(
										item.completedAt,
									);
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
											{time.short && (
												<div
													className="timeline-run-time"
													title={time.full}
												>
													{time.short}
												</div>
											)}
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
