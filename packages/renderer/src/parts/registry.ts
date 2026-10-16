/** Procedural generator registry, keyed by `PartVisual.kind` (ADR 0028). */
import type { PartVisual } from '@orbital/core';
import type { Material, Object3D } from 'three';
import type { GeometryBuilder, SlotName } from './builder.ts';
import type { PartDetail } from './types.ts';

export interface GenContext {
	/** Cylinder shape of the part, metres; the retracted model fits inside it. For a box shape: half the wider horizontal side and the height. */
	radius: number;
	height: number;
	/** Bounding box of the shape (x, y, z), metres; the model fits inside it. */
	size: readonly [number, number, number];
	visual: PartVisual;
	detail: PartDetail;
	builder: GeometryBuilder;
	/** Numeric parameter from `visual.params`, defaulted and clamped. */
	param(name: string, fallback: number, min: number, max: number): number;
}

/** A piece that moves (landing legs); built per model instance from shared geometry. */
export interface DynamicPart {
	object: Object3D;
	/** 0 = retracted, 1 = deployed. */
	animate(progress: number): void;
	/** Triangles with the piece fully out. */
	triangles: number;
	/** Frees the geometry this instance created. */
	dispose(): void;
}

export interface GeneratedPart {
	dynamic?: (material: (slot: SlotName) => Material) => DynamicPart;
}

export type PartGenerator = (ctx: GenContext) => GeneratedPart | void;

const generators = new Map<string, PartGenerator>();

export function registerPartGenerator(kind: string, generator: PartGenerator): void {
	generators.set(kind, generator);
}
export function getPartGenerator(kind: string): PartGenerator | undefined {
	return generators.get(kind);
}
export function partGeneratorKinds(): string[] {
	return [...generators.keys()];
}
