import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

type ReadStream = (stream: NodeJS.ReadableStream | null) => Promise<string>;

const loadReadStream = async (): Promise<ReadStream | undefined> => {
	try {
		const module = await import("../../src/play/utils/read-stream.ts");
		return module.readStream as ReadStream | undefined;
	} catch {
		return undefined;
	}
};

describe("readStream", () => {
	test("returns an empty string for missing streams and collects output", async () => {
		const readStream = await loadReadStream();

		expect(typeof readStream).toBe("function");
		if (!readStream) {
			return;
		}

		expect(await readStream(null)).toBe("");

		const stream = new PassThrough();
		const outputPromise = readStream(stream);

		stream.write("bags");
		stream.write(" cli");
		stream.end(" rules");

		await expect(outputPromise).resolves.toBe("bags cli rules");
	});

	test("rejects when the stream emits an error", async () => {
		const readStream = await loadReadStream();

		expect(typeof readStream).toBe("function");
		if (!readStream) {
			return;
		}

		const stream = new PassThrough();
		const outputPromise = readStream(stream);
		const error = new Error("stream failed");

		stream.emit("error", error);

		await expect(outputPromise).rejects.toBe(error);
	});
});
