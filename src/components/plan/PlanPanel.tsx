import React from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";

export const PlanPanel: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	if (!state.plan) return null;

	const tasks = state.plan.plan || [];
	const totalTasks = tasks.length;
	const completedTasks = tasks.filter((t) => t.status === "completed").length;
	const runningTask = tasks.find((t) => t.status === "running");

	const summaryText = runningTask
		? runningTask.description || "执行中..."
		: completedTasks === totalTasks
			? "所有任务已完成"
			: `${completedTasks}/${totalTasks} 完成`;

	return (
		<div
			className={`floating-plan ${state.planExpanded ? "is-expanded" : ""}`}
			id="floating-plan"
		>
			<button
				className="plan-header"
				onClick={() => {
					dispatch({
						type: "SET_PLAN_EXPANDED",
						expanded: !state.planExpanded,
					});
					dispatch({
						type: "SET_PLAN_MANUAL_OVERRIDE",
						override: !state.planExpanded,
					});
				}}
			>
				<span className="plan-summary-status">PLAN</span>
				<span className="plan-summary-text">{summaryText}</span>
				<span className="plan-id-label">{state.plan.planId}</span>
			</button>

			<ul className="plan-list">
				{tasks.map((task) => {
					const runtime = state.planRuntimeByTaskId.get(task.taskId);
					const status = runtime?.status || task.status || "pending";

					return (
						<li
							key={task.taskId}
							className="plan-item"
							data-status={status}
						>
							<span className="plan-badge" />
							<span>{task.description || task.taskId}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
};
