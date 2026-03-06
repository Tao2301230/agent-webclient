import React, { useState } from "react";
import type { TimelineNode } from "../../context/types";
import { MaterialIcon } from "../common/MaterialIcon";

interface ThinkingBlockProps {
	node: TimelineNode;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ node }) => {
	const [expanded, setExpanded] = useState(node.expanded ?? false);

	const text = node.text || "";
	const isLoading = node.status === "running" || node.status === "streaming";

	return (
		<div>
			<button
				className={`thinking-trigger ${expanded ? "is-open" : ""}`}
				onClick={() => setExpanded(!expanded)}
			>
				<MaterialIcon name="chevron_right" className="chevron" />
				{isLoading ? "思考中..." : "思考过程"}
			</button>
			<div className={`thinking-detail ${expanded ? "is-open" : ""}`}>
				{text}
			</div>
		</div>
	);
};
