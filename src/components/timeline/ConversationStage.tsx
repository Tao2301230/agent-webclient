import React, { useRef, useEffect, useMemo } from "react";
import { useAppState } from "../../app/context/AppContext";
import { TimelineRow } from "./TimelineRow";

export const ConversationStage: React.FC = () => {
	const state = useAppState();
	const scrollRef = useRef<HTMLDivElement>(null);
	const autoScrollEnabledRef = useRef(true);

	const isNearBottom = (el: HTMLDivElement, threshold = 24): boolean => {
		return (
			el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
		);
	};

	const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior });
	};

	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter(Boolean);
	}, [state.timelineOrder, state.timelineNodes]);

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
					{timelineEntries.length === 0 ? (
						<div className="timeline-empty">
							<p>开始新的对话，或从左侧选择已有对话</p>
						</div>
					) : (
						<div className="timeline-lane">
							{timelineEntries.map((node) => (
								<TimelineRow key={node!.id} node={node!} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
