import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";

export const EventPopover: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ top: 80, right: 320 });
	const isOpen = state.eventPopoverIndex >= 0 && !!state.eventPopoverEventRef;
	const event = state.eventPopoverEventRef;
	const jsonStr = useMemo(
		() => (event ? JSON.stringify(event, null, 2) : ""),
		[event],
	);

	useLayoutEffect(() => {
		if (!isOpen) return;
		const el = popoverRef.current;
		if (!el) return;

		const updatePosition = () => {
			const margin = 8;
			const viewW = window.innerWidth;
			const viewH = window.innerHeight;
			const width = Math.min(420, Math.max(260, viewW - margin * 2));
			el.style.width = `${width}px`;

			const anchor = state.eventPopoverAnchor ?? {
				x: Math.max(margin, viewW - width - margin),
				y: 80,
			};

			const height = el.offsetHeight || 320;
			const maxTop = Math.max(margin, viewH - height - margin);
			const top = Math.max(margin, Math.min(anchor.y + 8, maxTop));
			const maxLeft = Math.max(margin, viewW - width - margin);
			const left = Math.max(margin, Math.min(anchor.x, maxLeft));
			const right = Math.max(margin, viewW - left - width);
			setPosition({ top, right });
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		return () => window.removeEventListener("resize", updatePosition);
	}, [isOpen, jsonStr, state.eventPopoverAnchor]);

	if (!isOpen || !event) {
		return null;
	}

	return (
		<div
			ref={popoverRef}
			className="event-popover"
			id="event-popover"
			style={{
				top: `${position.top}px`,
				right: `${position.right}px`,
				width: `min(420px, calc(100vw - 16px))`,
			}}
		>
			<div className="event-popover-head">
				<strong>{event.type}</strong>
				<button
					aria-label="关闭事件详情"
					onClick={() =>
						dispatch({
							type: "SET_EVENT_POPOVER",
							index: -1,
							event: null,
							anchor: null,
						})
					}
				>
					<MaterialIcon name="close" />
				</button>
			</div>
			<pre className="event-popover-body">{jsonStr}</pre>
		</div>
	);
};
