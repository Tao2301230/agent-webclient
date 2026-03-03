import React from "react";

export const AtmosphereLayer: React.FC = () => {
	return (
		<div className="atmo-layer">
			<div className="atmo-layer atmo-grid" />
			<div className="atmo-layer atmo-glow atmo-glow-a" />
			<div className="atmo-layer atmo-glow atmo-glow-b" />
		</div>
	);
};
