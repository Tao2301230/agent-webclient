import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import type { AgentEvent, ToolState } from "../../context/types";
import type { DebugTab } from "../../context/constants";
import { DEBUG_TABS } from "../../context/constants";
import { MaterialIcon } from "../common/MaterialIcon";

function safeStr(v: unknown): string {
	if (typeof v === "string") return v;
	if (v === null || v === undefined) return "";
	return String(v);
}

const EventRow: React.FC<{
	event: AgentEvent;
	index: number;
	onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ event, index, onClick }) => {
	const type = String(event.type || "");
	const ts = event.timestamp
		? new Date(event.timestamp).toLocaleTimeString()
		: "--";

	let kindClass = "";
	if (type.startsWith("error") || type === "run.error")
		kindClass = "event-kind-error";
	else if (type.startsWith("run.")) kindClass = "event-kind-run";
	else if (type.startsWith("tool.")) kindClass = "event-kind-tool";
	else if (type.startsWith("content.")) kindClass = "event-kind-content";
	else if (type.startsWith("reasoning.")) kindClass = "event-kind-content";
	else if (type.startsWith("plan.")) kindClass = "event-kind-plan";

	const summary = event.delta
		? safeStr(event.delta).slice(0, 80)
		: event.message
			? safeStr(event.message).slice(0, 80)
			: "";

	return (
		<div
			className={`event-row is-clickable ${kindClass}`}
			onClick={onClick}
		>
			<div className="event-row-head">
				<strong>{type}</strong>
				<span className="event-row-time">{ts}</span>
			</div>
			{summary && <div className="event-row-summary">{summary}</div>}
		</div>
	);
};

/* Tool card for the "Tools" tab */
const ToolCard: React.FC<{ toolState: ToolState }> = ({ toolState }) => {
	const status = toolState.toolParams ? "has-params" : "no-params";
	const paramsText = toolState.toolParams
		? JSON.stringify(toolState.toolParams, null, 2)
		: toolState.argsBuffer || "{}";

	return (
		<article className="debug-event-card">
			<div className="debug-event-head">
				<strong>tool: {toolState.toolName || toolState.toolId}</strong>
			</div>
			<div className="mono debug-event-meta">
				runId={toolState.runId || "-"} toolId={toolState.toolId} | type=
				{toolState.toolType || "-"} | api={toolState.toolApi || "-"}
			</div>
			{toolState.description && (
				<div className="debug-event-meta">{toolState.description}</div>
			)}
			<pre className="debug-event-json">{paramsText}</pre>
		</article>
	);
};

const tabLabels: Record<DebugTab, string> = {
	events: "Events",
	logs: "Logs",
	tools: "Tools",
};

export const RightSidebar: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const toolEntries = useMemo(() => {
		return Array.from(state.toolStates.values());
	}, [state.toolStates]);

	return (
		<aside
			className={`sidebar right-sidebar ${
				state.layoutMode === "desktop-fixed"
					? state.desktopDebugSidebarEnabled
						? "is-open"
						: ""
					: state.rightDrawerOpen
						? "is-open"
						: ""
			}`}
			id="right-sidebar"
		>
			<div className="sidebar-head">
				<h2>调试面板</h2>
				<button
					className="drawer-close"
					aria-label="关闭调试面板"
					onClick={() =>
						dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: false })
					}
				>
					<MaterialIcon name="close" />
				</button>
			</div>

			<div className="debug-tabs">
				{DEBUG_TABS.map((tab) => (
					<button
						key={tab}
						className={`debug-tab ${state.activeDebugTab === tab ? "active" : ""}`}
						onClick={() =>
							dispatch({ type: "SET_ACTIVE_DEBUG_TAB", tab })
						}
					>
						{tabLabels[tab]}
					</button>
				))}
			</div>

			<div className="debug-panel">
				{/* Events Tab */}
				{state.activeDebugTab === "events" && (
					<>
						{/* <div className="debug-panel-head">
							<button
								className="debug-clear-btn"
								onClick={() =>
									dispatch({ type: "CLEAR_EVENTS" })
								}
							>
								清空
							</button>
						</div> */}
						<div className="list" id="events-list">
							{state.events.length === 0 ? (
								<div className="status-line">暂无事件</div>
							) : (
								state.events.map((event, idx) => (
									<EventRow
										key={idx}
										event={event}
										index={idx}
										onClick={(e) => {
											const rect =
												e.currentTarget.getBoundingClientRect();
											dispatch({
												type: "SET_EVENT_POPOVER",
												index: idx,
												event,
												anchor: {
													x: rect.left,
													y: rect.bottom,
												},
											});
										}}
									/>
								))
							)}
						</div>
					</>
				)}

				{/* Logs Tab */}
				{state.activeDebugTab === "logs" && (
					<>
						<div className="debug-panel-head">
							{/* <button
								className="debug-clear-btn"
								onClick={() =>
									dispatch({ type: "CLEAR_DEBUG" })
								}
							>
								清空
							</button> */}
						</div>
						<pre className="debug-log" id="debug-log">
							{state.debugLines.length === 0
								? "暂无日志"
								: state.debugLines.join("\n")}
						</pre>
					</>
				)}

				{/* Tools Tab */}
				{state.activeDebugTab === "tools" && (
					<div className="list" id="pending-tools">
						{toolEntries.length === 0 ? (
							<div className="status-line">暂无 tool 事件</div>
						) : (
							toolEntries.map((ts) => (
								<ToolCard key={ts.toolId} toolState={ts} />
							))
						)}
					</div>
				)}
			</div>
		</aside>
	);
};
