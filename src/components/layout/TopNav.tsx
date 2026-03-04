import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";

export const TopNav: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const statusClass = state.streaming
		? "is-running"
		: state.events.some((e) => e.type === "error")
			? "is-error"
			: "is-idle";

	const statusText = state.streaming ? "运行中..." : "就绪";

	return (
		<nav className="top-nav">
			<div className="top-nav-inner">
				<div className="nav-group">
					<button
						id="open-left-drawer-btn"
						className="icon-btn"
						onClick={() =>
							dispatch({
								type: "SET_LEFT_DRAWER_OPEN",
								open: !state.leftDrawerOpen,
							})
						}
					>
						☰
					</button>
					<div className="brand-mark">
						<div className="brand-logo">A</div>
						<div className="brand-text">
							<strong>AGENT</strong>
							<span>Webclient</span>
						</div>
					</div>
				</div>

				<div className="nav-group">
					<span
						className={`status-pill ${statusClass}`}
						id="api-status"
					>
						{statusText}
					</span>
					<button
						className="icon-btn"
						id="new-chat-btn"
						onClick={() => {
							dispatch({ type: "SET_CHAT_ID", chatId: "" });
							dispatch({ type: "RESET_CONVERSATION" });
						}}
					>
						＋ 新对话
					</button>
					<button
						className="icon-btn"
						id="settings-btn"
						onClick={() =>
							dispatch({ type: "SET_SETTINGS_OPEN", open: true })
						}
					>
						⚙
					</button>
					<button
						id="open-right-drawer-btn"
						className="icon-btn"
						onClick={() =>
							dispatch({
								type: "SET_RIGHT_DRAWER_OPEN",
								open: !state.rightDrawerOpen,
							})
						}
					>
						≡
					</button>
				</div>
			</div>
		</nav>
	);
};
