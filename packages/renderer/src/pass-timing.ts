/**
 * Names for the GPU passes (plan 392, ADR 0330): every WebGPU command encoder the renderer makes
 * carries the pass that asked for it (`planet`, `moon`, `scene`), as its label and as a debug group,
 * so an Xcode Metal capture names them; and each pass's GPU time is read from the timestamp pool by
 * the render context that made it. The scene pass includes the bloom and output passes of the post
 * chain (three makes those inside one call).
 */

/** The pass that is drawing now, and which render context belongs to which pass. */
export class PassTag {
	/** The pass the renderer is in, or '' outside any. */
	current = '';
	/** Render context id (`renderContext_<id>`) to pass name, for the encoders made so far. */
	readonly contexts = new Map<string, string>();

	/** Runs `draw` with `pass` current, restoring what was before. */
	within<T>(pass: string, draw: () => T): T {
		const before = this.current;
		this.current = pass;
		try {
			return draw();
		} finally {
			this.current = before;
		}
	}
}

/** The parts of a three.js timestamp uid, `r:<frameCalls>:<contextId>:f<frame>` (or `c:` for compute). */
export function parseTimestampUid(
	uid: string
): { kind: 'render' | 'compute'; context: string; frame: number } | null {
	const m = /^([rc]):(\d+):(.+):f(\d+)$/.exec(uid);
	if (!m) return null;
	return { kind: m[1] === 'r' ? 'render' : 'compute', context: m[3]!, frame: Number(m[4]) };
}

export interface PassTimes {
	/** GPU ms per frame by pass. */
	ms: Record<string, number>;
	/** Render contexts (passes of the GPU) per frame by pass: the frame's count of full-screen passes and more. */
	contexts: Record<string, number>;
}

/**
 * GPU time by pass: the timestamp pool's durations, grouped by the pass that made each render
 * context and divided by the frames the pool holds. A context no pass claimed goes to `other`.
 */
export function passTimes(
	timestamps: Iterable<readonly [string, number]>,
	passOfContext: ReadonlyMap<string, string>,
	frames: number
): PassTimes {
	const ms: Record<string, number> = {};
	const contexts: Record<string, number> = {};
	const f = Math.max(1, frames);
	for (const [uid, duration] of timestamps) {
		const p = parseTimestampUid(uid);
		if (!p || p.kind !== 'render') continue;
		const pass = passOfContext.get(p.context) ?? 'other';
		ms[pass] = (ms[pass] ?? 0) + duration / f;
		contexts[pass] = (contexts[pass] ?? 0) + 1 / f;
	}
	return { ms, contexts };
}

type Encoder = GPUCommandEncoder & { __passLabelled?: boolean };

/**
 * Makes the device name the pass of each command encoder it creates: the label becomes
 * `<pass>/<label>` and a debug group `<pass>` wraps the encoder's commands. Records the render
 * context of the encoder in `tag.contexts`. Safe to call once per device; returns a function that
 * puts the device's own method back.
 */
export function labelCommandEncoders(device: GPUDevice, tag: PassTag): () => void {
	const original = device.createCommandEncoder.bind(device);
	device.createCommandEncoder = (descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder => {
		const pass = tag.current || 'unlabelled';
		const label = descriptor?.label ? `${pass}/${descriptor.label}` : pass;
		const m = /^renderContext_(\d+)$/.exec(descriptor?.label ?? '');
		if (m) tag.contexts.set(m[1]!, pass);
		const encoder = original({ ...descriptor, label }) as Encoder;
		if (!encoder.__passLabelled) {
			encoder.__passLabelled = true;
			encoder.pushDebugGroup(pass);
			const finish = encoder.finish.bind(encoder);
			encoder.finish = (d?: GPUCommandBufferDescriptor): GPUCommandBuffer => {
				encoder.popDebugGroup();
				return finish(d);
			};
		}
		return encoder;
	};
	return () => {
		device.createCommandEncoder = original;
	};
}
