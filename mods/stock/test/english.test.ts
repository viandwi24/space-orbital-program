/**
 * The game is global: every player-facing string of the stock content is English (owner,
 * 2026-10-21). This scans every registered definition's strings for common Indonesian words, so a
 * name like "Kuncup" or "Stasiun Cakrawala" cannot come back unnoticed.
 */
import { describe, expect, test } from 'bun:test';
import { loaded } from './helpers.ts';

/** Common Indonesian words, and the ones the part and blueprint names used before. */
export const INDONESIAN_WORDS = [
	// everyday words
	'dan',
	'yang',
	'untuk',
	'dengan',
	'tidak',
	'ini',
	'itu',
	'dari',
	'ke',
	'di',
	'akan',
	'atau',
	'adalah',
	'bisa',
	'harus',
	'sudah',
	'belum',
	'juga',
	'pada',
	'kami',
	'kita',
	'anda',
	'saya',
	'roket',
	'tangki',
	'mesin',
	'kapsul',
	'satelit',
	'stasiun',
	'teleskop',
	'bulan',
	'bumi',
	'peluncuran',
	'misi',
	'parasut',
	'bahan',
	'bakar',
	'muatan',
	'awak',
	'peneliti',
	'pengorbit',
	'cakrawala',
	'penjelajah',
	'ulang',
	'alik',
	// the old part nicknames
	'tong',
	'corong',
	'runcing',
	'pisah',
	'kubah',
	'perisai',
	'ruang',
	'kuncup',
	'wahana',
	'tungku',
	'tunggal',
	'raksasa',
	'timur',
	'teropong',
	'tapak',
	'simpul',
	'sepasang',
	'sayap',
	'saring',
	'rumah',
	'rangka',
	'rajawali',
	'piring',
	'pintu',
	'pilar',
	'penyelamat',
	'payung',
	'paruh',
	'palka',
	'oktaf',
	'merkuri',
	'mahkota',
	'lonceng',
	'lompat',
	'lentera',
	'lendir',
	'lempeng',
	'kecil',
	'kompas',
	'medan',
	'kisi',
	'kipas',
	'kepak',
	'kelopak',
	'kaleng',
	'kaki',
	'kabin',
	'jendela',
	'jelajah',
	'jabat',
	'hirup',
	'hembus',
	'hampa',
	'getar',
	'ekor',
	'delapan',
	'cedok',
	'cambuk',
	'cabang',
	'butir',
	'bola',
	'bintang',
	'bentang',
	'bengkel',
	'bekal',
	'bara',
	'arsip',
	'lampu',
	'baterai',
	'antena',
	'kendali',
	'pendarat'
] as const;

const WORDS = new Set<string>(INDONESIAN_WORDS);

/** Every string inside `value` (keys excluded: ids and field names are not shown to players). */
function strings(value: unknown, out: string[] = []): string[] {
	if (typeof value === 'string') out.push(value);
	else if (Array.isArray(value)) for (const v of value) strings(v, out);
	else if (value && typeof value === 'object')
		for (const v of Object.values(value as Record<string, unknown>)) strings(v, out);
	return out;
}

/** The Indonesian words in `text`, matched as whole words, ignoring case. */
export function indonesianWordsIn(text: string): string[] {
	return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => WORDS.has(w));
}

describe('stock content is English (owner, 2026-10-21)', () => {
	test('no registered definition shows an Indonesian word', () => {
		const found: string[] = [];
		let scanned = 0;
		const regs = loaded.registries as unknown as Record<string, { list?: () => unknown[] }>;
		for (const [name, registry] of Object.entries(regs)) {
			const items = typeof registry?.list === 'function' ? registry.list() : [];
			for (const item of items) {
				for (const s of strings(item)) {
					scanned++;
					// identifiers and paths (`stock.tank-small`, `#e9ebee`) are not text
					if (/^[a-z0-9_.:/#-]+$/.test(s)) continue;
					const hits = indonesianWordsIn(s);
					if (hits.length) found.push(`${name}: "${s.slice(0, 80)}" (${hits.join(', ')})`);
				}
			}
		}
		expect(scanned).toBeGreaterThan(500);
		expect(found).toEqual([]);
	});

	test('the detector catches the old names', () => {
		expect(indonesianWordsIn('OrbitX PR-16 "Kuncup"')).toEqual(['kuncup']);
		expect(indonesianWordsIn('Stasiun Cakrawala')).toEqual(['stasiun', 'cakrawala']);
		expect(indonesianWordsIn('OrbitX PR-16 "Bud"')).toEqual([]);
	});
});
