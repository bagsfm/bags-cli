export const readStream = async (
	stream: NodeJS.ReadableStream | null,
): Promise<string> => {
	if (!stream) {
		return "";
	}

	return await new Promise((resolve, reject) => {
		let output = "";
		stream.setEncoding?.("utf8");
		stream.on("data", (chunk) => {
			output += String(chunk);
		});
		stream.on("error", reject);
		stream.on("end", () => resolve(output));
	});
};
