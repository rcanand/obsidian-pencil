export interface Point {
	x: number;
	y: number;
	/** Pressure 0..1. Undefined for non-pressure devices (treated as 0.5). */
	p?: number;
}

export interface Stroke {
	id: string;
	/** Hex color string like "#ffffff". */
	color: string;
	/** Base stroke thickness in canvas units. */
	size: number;
	points: Point[];
}

export interface WhiteboardData {
	version: 1;
	/** Initial view transform (optional). */
	view?: { x: number; y: number; scale: number };
	strokes: Stroke[];
}

export const EMPTY_DATA: WhiteboardData = {
	version: 1,
	strokes: [],
};

export function parseData(text: string): WhiteboardData {
	const trimmed = text.trim();
	if (!trimmed) return { ...EMPTY_DATA };
	try {
		const data = JSON.parse(trimmed) as WhiteboardData;
		if (!data || typeof data !== "object") return { ...EMPTY_DATA };
		if (!Array.isArray(data.strokes)) data.strokes = [];
		data.version = 1;
		return data;
	} catch {
		return { ...EMPTY_DATA };
	}
}

export function serializeData(data: WhiteboardData): string {
	return JSON.stringify(data, null, 2);
}
