import React from "react";

interface UserBubbleProps {
	text: string;
}

export const UserBubble: React.FC<UserBubbleProps> = ({ text }) => {
	return (
		<div className="timeline-user-bubble">
			<div className="timeline-text">{text}</div>
		</div>
	);
};
