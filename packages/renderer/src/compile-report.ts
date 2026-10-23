/**
 * What the shader compile costs (plan 370, ADR 0308): every shader module or program the renderer
 * creates, with its size and a hash of its source, and every render pipeline (WebGPU) or linked
 * program (WebGL) with how it was created and, where the browser tells, how long it took.
 *
 * - WebGPU: the device's `createShaderModule` and pipeline calls are wrapped. An async pipeline's
 *   time is from the call until its promise resolves; a sync one has no time of its own (Chrome
 *   compiles it on the GPU process before the next submit).
 * - WebGL: `shaderSource`, `attachShader` and `linkProgram` are wrapped; with
 *   `KHR_parallel_shader_compile` each program's completion is polled for its time.
 *
 * The pure half (hashing, the summary) is tested in Bun; the wrapping needs a browser.
 */

export type CompileMode = 'sync' | 'async' | 'program';

export interface ModuleEntry {
	label: string;
	stage: string;
	bytes: number;
	hash: string;
}

export interface PipelineEntry {
	label: string;
	mode: CompileMode;
	/** Bytes of the pipeline's shader sources together. */
	bytes: number;
	/** Wall time until the compile finished, ms; null while pending or where unknown. */
	ms: number | null;
	/** The load phase it was asked for in (`CompileReport.phase`). */
	phase: string;
	/** `performance.now()` when it was asked for. */
	at: number;
	pending: boolean;
	/** The browser refused it (a shader error): nothing draws with it. */
	failed?: boolean;
}

export interface CompileSummary {
	modules: number;
	moduleBytes: number;
	pipelines: number;
	sync: number;
	async: number;
	pending: number;
	/** Pipelines that failed to build. */
	failed: number;
	/** Sum of the timed compiles, ms (they overlap when the browser runs them in parallel). */
	timedMs: number;
	/** The longest timed compiles, longest first. */
	slowest: PipelineEntry[];
	/** The largest modules, largest first. */
	largest: ModuleEntry[];
	/** Pipelines and their time per phase. */
	phases: { phase: string; pipelines: number; timedMs: number; spanMs: number }[];
	/** A hash of every module's source, sorted: the same set of shaders gives the same hash. */
	setHash: string;
}

/** FNV-1a, 32 bits, as 8 hex digits: a source's identity across loads (not a security hash). */
export function hashSource(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * The same source for the same shader on every load (plan 370): three names a buffer uniform after
 * its node's global id (`NodeBuffer_1348856`), which shifts with the order things were built in, so
 * Chrome's shader cache missed on a reload. Inside one module the name is only a name (the binding is
 * by group and number): renumbered in order of first appearance.
 */
export function stableShaderNames(code: string): string {
	const ids = new Map<string, number>();
	return code.replace(/\bNodeBuffer_(\d+)/g, (_, id: string) => {
		let n = ids.get(id);
		if (n === undefined) {
			n = ids.size;
			ids.set(id, n);
		}
		return `NodeBuffer_${n}`;
	});
}

/** The summary of a list of modules and pipelines (pure). */
export function summarize(
	modules: readonly ModuleEntry[],
	pipelines: readonly PipelineEntry[],
	top = 10
): CompileSummary {
	const timed = pipelines.filter((p) => p.ms !== null);
	const phases = new Map<
		string,
		{ pipelines: number; timedMs: number; from: number; to: number }
	>();
	for (const p of pipelines) {
		const ph = phases.get(p.phase) ?? { pipelines: 0, timedMs: 0, from: p.at, to: p.at };
		ph.pipelines++;
		ph.timedMs += p.ms ?? 0;
		ph.from = Math.min(ph.from, p.at);
		ph.to = Math.max(ph.to, p.at + (p.ms ?? 0));
		phases.set(p.phase, ph);
	}
	const unique = [...new Set(modules.map((m) => m.hash))].sort();
	return {
		modules: modules.length,
		moduleBytes: modules.reduce((a, m) => a + m.bytes, 0),
		pipelines: pipelines.length,
		sync: pipelines.filter((p) => p.mode === 'sync').length,
		async: pipelines.filter((p) => p.mode !== 'sync').length,
		pending: pipelines.filter((p) => p.pending).length,
		failed: pipelines.filter((p) => p.failed).length,
		timedMs: Math.round(timed.reduce((a, p) => a + (p.ms ?? 0), 0)),
		slowest: [...timed].sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, top),
		largest: [...modules].sort((a, b) => b.bytes - a.bytes).slice(0, Math.max(5, top / 2)),
		phases: [...phases].map(([phase, p]) => ({
			phase,
			pipelines: p.pipelines,
			timedMs: Math.round(p.timedMs),
			spanMs: Math.round(p.to - p.from)
		})),
		setHash: hashSource(unique.join(','))
	};
}

type Listener = () => void;

/** The renderer's compile log; one per renderer. */
export class CompileReport {
	readonly modules: ModuleEntry[] = [];
	readonly pipelines: PipelineEntry[] = [];
	/** What the renderer is doing now (`programs`, `warm`, `background`, `play`, …). */
	phase = 'start';
	/** Keep every source (the measure script's size analysis); off in play to save memory. */
	keepSources = false;
	private readonly sourceList: { label: string; code: string }[] = [];
	private readonly listeners = new Set<Listener>();
	private notifyQueued = false;

	/** Calls `listener` (at most once a frame) after a change; returns the way to stop. */
	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get pending(): number {
		let n = 0;
		for (const p of this.pipelines) if (p.pending) n++;
		return n;
	}

	summary(top = 10): CompileSummary {
		return summarize(this.modules, this.pipelines, top);
	}

	/** Every source kept (`keepSources`), in creation order. */
	sources(): { label: string; code: string }[] {
		return [...this.sourceList];
	}

	addModule(label: string, stage: string, code: string): ModuleEntry {
		const m = { label, stage, bytes: code.length, hash: hashSource(code) };
		this.modules.push(m);
		if (this.keepSources) this.sourceList.push({ label: `${stage}-${label}`, code });
		this.changed();
		return m;
	}

	addPipeline(label: string, mode: CompileMode, bytes: number): PipelineEntry {
		const p: PipelineEntry = {
			label,
			mode,
			bytes,
			ms: null,
			phase: this.phase,
			at: now(),
			pending: mode !== 'sync'
		};
		this.pipelines.push(p);
		this.changed();
		return p;
	}

	done(p: PipelineEntry, timed = true): void {
		if (!p.pending) return;
		p.pending = false;
		if (timed) p.ms = Math.round((now() - p.at) * 10) / 10;
		else p.failed = true;
		this.changed();
	}

	/** The label of the oldest pipeline still compiling (the loading screen's "now"), or ''. */
	current(): string {
		for (const p of this.pipelines) if (p.pending) return p.label;
		return '';
	}

	/** Wraps a WebGPU device's module and pipeline creation (once per device). */
	watchWebGPU(device: GPUDevice): void {
		const d = device as GPUDevice & { __compileReport?: boolean };
		if (d.__compileReport) return;
		d.__compileReport = true;
		const sizes = new WeakMap<object, number>();
		const createModule = device.createShaderModule.bind(device);
		d.createShaderModule = (desc: GPUShaderModuleDescriptor): GPUShaderModule => {
			const code = typeof desc.code === 'string' ? stableShaderNames(desc.code) : '';
			const module = createModule(code ? { ...desc, code } : desc);
			const label = desc.label ?? '';
			this.addModule(label, label.split('_')[0] ?? '', code);
			sizes.set(module, code.length);
			return module;
		};
		const bytesOf = (desc: GPURenderPipelineDescriptor | GPUComputePipelineDescriptor): number => {
			let n = 0;
			const r = desc as GPURenderPipelineDescriptor & GPUComputePipelineDescriptor;
			for (const stage of [r.vertex, r.fragment, r.compute])
				if (stage?.module) n += sizes.get(stage.module) ?? 0;
			return n;
		};
		const sync = device.createRenderPipeline.bind(device);
		d.createRenderPipeline = (desc: GPURenderPipelineDescriptor): GPURenderPipeline => {
			this.addPipeline(desc.label ?? '', 'sync', bytesOf(desc));
			return sync(desc);
		};
		const later = device.createRenderPipelineAsync.bind(device);
		d.createRenderPipelineAsync = (
			desc: GPURenderPipelineDescriptor
		): Promise<GPURenderPipeline> => {
			const p = this.addPipeline(desc.label ?? '', 'async', bytesOf(desc));
			const made = later(desc);
			made.then(
				() => this.done(p),
				() => this.done(p, false)
			);
			return made;
		};
		const compute = device.createComputePipeline.bind(device);
		d.createComputePipeline = (desc: GPUComputePipelineDescriptor): GPUComputePipeline => {
			this.addPipeline(desc.label ?? 'compute', 'sync', bytesOf(desc));
			return compute(desc);
		};
		const computeLater = device.createComputePipelineAsync.bind(device);
		d.createComputePipelineAsync = (
			desc: GPUComputePipelineDescriptor
		): Promise<GPUComputePipeline> => {
			const p = this.addPipeline(desc.label ?? 'compute', 'async', bytesOf(desc));
			const made = computeLater(desc);
			made.then(
				() => this.done(p),
				() => this.done(p, false)
			);
			return made;
		};
	}

	/**
	 * Wraps a WebGL2 context's shader and program calls (once per context). With
	 * `KHR_parallel_shader_compile` every linked program is polled until it completes.
	 */
	watchWebGL(gl: WebGL2RenderingContext, labelOf?: (program: WebGLProgram) => string): void {
		const g = gl as WebGL2RenderingContext & { __compileReport?: boolean };
		if (g.__compileReport) return;
		g.__compileReport = true;
		const parallel = gl.getExtension('KHR_parallel_shader_compile') as {
			COMPLETION_STATUS_KHR: number;
		} | null;
		const shaderBytes = new WeakMap<WebGLShader, number>();
		const programBytes = new WeakMap<WebGLProgram, number>();
		const source = gl.shaderSource.bind(gl);
		g.shaderSource = (shader: WebGLShader, raw: string): void => {
			const code = stableShaderNames(raw);
			const stage =
				gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
			const name = /#define SHADER_NAME (\S+)/.exec(code)?.[1] ?? '';
			this.addModule(name, stage, code);
			shaderBytes.set(shader, code.length);
			source(shader, code);
		};
		const attach = gl.attachShader.bind(gl);
		g.attachShader = (program: WebGLProgram, shader: WebGLShader): void => {
			programBytes.set(program, (programBytes.get(program) ?? 0) + (shaderBytes.get(shader) ?? 0));
			attach(program, shader);
		};
		const link = gl.linkProgram.bind(gl);
		g.linkProgram = (program: WebGLProgram): void => {
			const entry = this.addPipeline(
				labelOf?.(program) ?? '',
				parallel ? 'program' : 'sync',
				programBytes.get(program) ?? 0
			);
			link(program);
			if (!parallel) return;
			const poll = (): void => {
				let complete = true;
				try {
					complete =
						gl.isContextLost() ||
						gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) === true;
				} catch {
					complete = true;
				}
				if (complete) this.done(entry);
				else setTimeout(poll, 4);
			};
			poll();
		};
	}

	private changed(): void {
		if (this.notifyQueued || this.listeners.size === 0) return;
		this.notifyQueued = true;
		const fire = (): void => {
			this.notifyQueued = false;
			for (const l of this.listeners) l();
		};
		if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
		else queueMicrotask(fire);
	}
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
