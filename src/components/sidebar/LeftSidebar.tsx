import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import {
	pickChatAgentLabel,
	formatChatTimeLabel,
} from "../../lib/chatListFormatter";
import type { Chat, WorkerRow } from "../../context/types";

const ChatItem: React.FC<{
	chat: Chat;
	agents: Array<{ key?: string; name?: string }>;
	isActive: boolean;
	onClick: () => void;
}> = ({ chat, agents, isActive, onClick }) => {
	const label = pickChatAgentLabel(chat, agents);
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

const WorkerItem: React.FC<{
	row: WorkerRow;
	isActive: boolean;
	onClick: () => void;
}> = ({ row, isActive, onClick }) => {
	const time = row.latestUpdatedAt
		? formatChatTimeLabel(row.latestUpdatedAt)
		: "--";
	const preview = row.latestRunContent || (row.hasHistory ? row.latestChatName : "暂无历史会话");

	return (
		<button
			className={`chat-item worker-item ${isActive ? "is-active" : ""} ${row.hasHistory ? "" : "is-empty"}`}
			onClick={onClick}
		>
			<div className={`chat-title ${row.type === "team" ? "team-row-main" : ""}`}>
				<MaterialIcon
					name={row.type === "team" ? "groups" : "person"}
					className="inline-icon"
				/>{" "}
				{row.displayName}
			</div>
			<div className="chat-meta-line">
				{row.type === "team" ? `Team · ${time}` : `${row.role || "--"} · ${time}`}
			</div>
			<div className="chat-meta-line">{preview}</div>
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

	const filteredWorkerRows = useMemo(() => {
		const filter = state.chatFilter.toLowerCase().trim();
		if (!filter) return state.workerRows;
		return state.workerRows.filter((row) =>
			String(row.searchText || "").includes(filter),
		);
	}, [state.workerRows, state.chatFilter]);

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
					aria-label="关闭对话列表"
					onClick={() =>
						dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false })
					}
				>
					<MaterialIcon name="close" />
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
					<MaterialIcon name="edit_square" />
					<span>新对话</span>
				</button>
				<button
					className="icon-btn"
					onClick={() => {
						if (state.conversationMode === "worker") {
							window.dispatchEvent(
								new CustomEvent("agent:refresh-agents"),
							);
							window.dispatchEvent(
								new CustomEvent("agent:refresh-teams"),
							);
							window.dispatchEvent(
								new CustomEvent("agent:refresh-chats"),
							);
						} else {
							window.dispatchEvent(
								new CustomEvent("agent:refresh-chats"),
							);
						}
					}}
				>
					<MaterialIcon name="refresh" />
					<span>刷新</span>
				</button>
			</div>

			<label className="field-label" htmlFor="chat-search">
				搜索
			</label>
			<input
				id="chat-search"
				className="text-input"
				type="text"
				placeholder={
					state.conversationMode === "worker"
						? "按 名称 / key / teamId 过滤..."
						: "搜索对话..."
				}
				value={state.chatFilter}
				onChange={(e) =>
					dispatch({
						type: "SET_CHAT_FILTER",
						filter: e.target.value,
					})
				}
			/>

			<div className="chat-meta">
				<span className="chat-meta-label">
					{state.conversationMode === "worker" ? "Worker" : "Agent"}
				</span>
				{state.chatId && state.chatAgentById.has(state.chatId) && (
					<span className="chip">
						{state.chatAgentById.get(state.chatId)}
					</span>
				)}
			</div>

			<div className="chat-list" id="chat-list">
				{state.conversationMode === "worker" ? (
					filteredWorkerRows.length === 0 ? (
						<div className="status-line">暂无员工/小组</div>
					) : (
						filteredWorkerRows.map((row) => (
							<WorkerItem
								key={row.key}
								row={row}
								isActive={row.key === state.workerSelectionKey}
								onClick={() =>
									window.dispatchEvent(
										new CustomEvent("agent:select-worker", {
											detail: { workerKey: row.key },
										}),
									)
								}
							/>
						))
					)
				) : filteredChats.length === 0 ? (
					<div className="status-line">暂无对话</div>
				) : (
					filteredChats.map((chat) => (
						<ChatItem
							key={chat.chatId}
							chat={chat}
							agents={state.agents}
							isActive={chat.chatId === state.chatId}
							onClick={() => handleSelectChat(chat.chatId)}
						/>
					))
				)}
			</div>

			{state.conversationMode === "worker" && state.workerRelatedChats.length > 0 && (
				<div className="chat-list worker-related-list">
					<div className="chat-meta">
						<span className="chat-meta-label">关联会话</span>
					</div>
					{state.workerRelatedChats.map((chat) => (
						<button
							key={chat.chatId}
							className={`chat-item ${chat.chatId === state.chatId ? "is-active" : ""}`}
							onClick={() => handleSelectChat(chat.chatId)}
						>
							<div className="chat-title">{chat.chatName || chat.chatId}</div>
							<div className="chat-meta-line">
								{formatChatTimeLabel(chat.updatedAt)}
							</div>
						</button>
					))}
				</div>
			)}
		</aside>
	);
};
