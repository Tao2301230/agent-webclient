import React, { useState } from "react";
import { useAppState, useAppDispatch } from "../../app/context/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "../../app/context/constants";
import { setAccessToken } from "../../lib/apiClient";

export const SettingsModal: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [tokenInput, setTokenInput] = useState(state.accessToken);
	const [error, setError] = useState("");

	const handleSave = () => {
		const token = tokenInput.trim();
		setAccessToken(token);
		localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
		dispatch({ type: "SET_ACCESS_TOKEN", token });
		setError("");
		dispatch({ type: "SET_SETTINGS_OPEN", open: false });
	};

	const handleThemeToggle = () => {
		const current = document.documentElement.getAttribute("data-theme");
		const next = current === "dark" ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", next);
	};

	return (
		<div
			className="modal"
			id="settings-modal"
			onClick={(e) => {
				if (e.target === e.currentTarget)
					dispatch({ type: "SET_SETTINGS_OPEN", open: false });
			}}
		>
			<div className="modal-card settings-card">
				<div className="settings-head">
					<h3>设置</h3>
					<button
						onClick={() =>
							dispatch({ type: "SET_SETTINGS_OPEN", open: false })
						}
					>
						关闭
					</button>
				</div>

				<div className="field-group">
					<label htmlFor="settings-token">Access Token</label>
					<input
						id="settings-token"
						type="password"
						placeholder="输入访问令牌..."
						value={tokenInput}
						onChange={(e) => setTokenInput(e.target.value)}
					/>
					{error && <p className="settings-error">{error}</p>}
					<p className="settings-hint">设置访问令牌以连接后端 API</p>
				</div>

				<div className="settings-inline-actions">
					<button onClick={handleSave}>保存</button>
				</div>

				<div className="settings-grid" style={{ marginTop: "16px" }}>
					<button
						onClick={() =>
							window.dispatchEvent(
								new CustomEvent("agent:refresh-agents"),
							)
						}
					>
						刷新智能体
					</button>
					<button onClick={handleThemeToggle}>切换主题</button>
					<button
						onClick={() => {
							dispatch({ type: "CLEAR_DEBUG" });
							dispatch({ type: "CLEAR_EVENTS" });
						}}
					>
						清空日志
					</button>
				</div>
			</div>
		</div>
	);
};
