import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../app/context/AppContext";
import {
	pickChatAgentLabel,
	formatChatTimeLabel,
} from "../../lib/chatListFormatter";
import type { Chat } from "../../app/context/types";

const ChatItem: React.FC<{
	chat: Chat;
	isActive: boolean;
	onClick: () => void;
}> = ({ chat, isActive, onClick }) => {
	const label = pickChatAgentLabel(chat);
	const time = formatChatTimeLabel(chat.updatedAt);
	const title = chat.chatName || chat.chatId || "(无标题)";

	return (
		<button
			className={`chat-item ${isActive ? "is-active" : ""}`}
			onClick={onClick}
		>
			<div className="chat-title">{title}</div>
			<div className="chat-meta-line">
				{label} · {time}
			</div>
		</button>
	);
};

export const LeftSidebar: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const filteredChats = useMemo(() => {
		const filter = state.chatFilter.toLowerCase().trim();
		if (!filter) return state.chats;
		return state.chats.filter((chat) => {
			const name = (chat.chatName || "").toLowerCase();
			const id = (chat.chatId || "").toLowerCase();
			return name.includes(filter) || id.includes(filter);
		});
	}, [state.chats, state.chatFilter]);

	const handleSelectChat = (chatId: string) => {
		window.dispatchEvent(
			new CustomEvent("agent:load-chat", { detail: { chatId } }),
		);
		if (state.layoutMode === "mobile-drawer") {
			dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false });
		}
	};

	return (
		<aside
			className={`sidebar left-sidebar ${state.leftDrawerOpen || state.layoutMode !== "mobile-drawer" ? "is-open" : ""}`}
			id="left-sidebar"
		>
			<div className="sidebar-head">
				<h2>对话列表</h2>
				<button
					className="drawer-close"
					onClick={() =>
						dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false })
					}
				>
					✕
				</button>
			</div>

			<div className="left-actions">
				<button
					className="icon-btn"
					onClick={() => {
						dispatch({ type: "SET_CHAT_ID", chatId: "" });
						dispatch({ type: "RESET_CONVERSATION" });
					}}
				>
					新对话
				</button>
				<button
					className="icon-btn"
					onClick={() => {
						window.dispatchEvent(
							new CustomEvent("agent:refresh-chats"),
						);
					}}
				>
					刷新
				</button>
			</div>

			<label className="field-label" htmlFor="chat-search">
				搜索
			</label>
			<input
				id="chat-search"
				className="text-input"
				type="text"
				placeholder="搜索对话..."
				value={state.chatFilter}
				onChange={(e) =>
					dispatch({
						type: "SET_CHAT_FILTER",
						filter: e.target.value,
					})
				}
			/>

			<div className="chat-meta">
				<span className="chat-meta-label">Agent</span>
				{state.chatId && state.chatAgentById.has(state.chatId) && (
					<span className="chip">
						{state.chatAgentById.get(state.chatId)}
					</span>
				)}
			</div>

			<div className="chat-list" id="chat-list">
				{filteredChats.length === 0 ? (
					<div className="status-line">暂无对话</div>
				) : (
					filteredChats.map((chat) => (
						<ChatItem
							key={chat.chatId}
							chat={chat}
							isActive={chat.chatId === state.chatId}
							onClick={() => handleSelectChat(chat.chatId)}
						/>
					))
				)}
			</div>
		</aside>
	);
};
