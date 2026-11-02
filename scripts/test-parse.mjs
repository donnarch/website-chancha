import assert from 'node:assert/strict';
import { findPlate } from '../src/lib/plates.js';
import { parseText, parseOcrText, parseDaysToken } from '../src/lib/parseCars.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('✓', name); };

ok('plate basic', () => assert.equal(findPlate('그랜저 12가3456 흰색').plate, '12가3456'));
ok('plate 3 digits', () => assert.equal(findPlate('123나4567').plate, '123나4567'));
ok('plate with spaces', () => assert.equal(findPlate('12 가 3456').plate, '12가3456'));
ok('plate region', () => assert.equal(findPlate('서울 12가3456').plate, '서울12가3456'));
ok('plate OCR digits', () => assert.equal(findPlate('l2가345O').plate, '12가3450'));
ok('model not region', () => assert.equal(findPlate('아반떼 12가3456').plate, '12가3456'));
ok('no plate', () => assert.equal(findPlate('hello world 1234'), null));
ok('days token', () => assert.deepEqual(parseDaysToken('월목'), ['월', '목']));
ok('days token yoil', () => assert.deepEqual(parseDaysToken('화요일'), ['화']));

ok('excel paste with header', () => {
  const t = '차량번호\t차종\t색상\t동\t위치\t연락처\t요일\t비고\n12가3456\t그랜저\t흰색\t101\tB2\t010-1234-5678\t월목\t앞범퍼 흠집\n34나5678\t소나타\t검정\t102동\t지하1층\t\t화\t';
  const { rows } = parseText(t);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plate, '12가3456');
  assert.equal(rows[0].model, '그랜저');
  assert.equal(rows[0].block, '101동');
  assert.equal(rows[0].location, 'B2');
  assert.equal(rows[0].phone, '01012345678');
  assert.deepEqual(rows[0].days, ['월', '목']);
  assert.equal(rows[1].location, 'B1');
  assert.deepEqual(rows[1].days, ['화']);
});

ok('headerless tab list', () => {
  const { rows } = parseText('12가3456\t그랜저\t101동\tB2\n56다7890\tK5\t102동\tB1');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].model, 'K5');
  assert.equal(rows[1].block, '102동');
});

ok('plain plates one per line', () => {
  const { rows, unparsed } = parseText('12가3456\n34나5678\n\n서울 56다7890\nhello');
  assert.equal(rows.length, 3);
  assert.equal(unparsed.length, 1);
});

ok('ocr line with index and noise', () => {
  const { rows } = parseOcrText('1. 12가3456  그랜저  흰색  101동  B2\n2) 34나 5678 소나타 검정 102동 지하1층\n---\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model, '그랜저');
  assert.equal(rows[0].color, '흰색');
  assert.equal(rows[0].location, 'B2');
  assert.equal(rows[1].plate, '34나5678');
  assert.equal(rows[1].model, '소나타');
  assert.equal(rows[1].location, 'B1');
});

ok('csv commas', () => {
  const { rows } = parseText('plate,model,color\n12가3456,Genesis,Black');
  assert.equal(rows[0].model, 'Genesis');
  assert.equal(rows[0].color, 'Black');
});

ok('short 4-digit plate table line (OCR of boss spreadsheet)', () => {
  const { rows } = parseOcrText('|. 디요르ㅣ| 1 | 일 |ㅣ센팀누리 _ㆍㅇ 」 [2590 |벤츠e 。 |쥐색|104동| _  |지하1층| _ |해운대구|재송동| _ 오후 _ |');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plate, '2590');
  assert.equal(rows[0].apartment, '센팀누리');
  assert.equal(rows[0].model, '벤츠e');
  assert.equal(rows[0].color, '쥐색');
  assert.equal(rows[0].block, '104동');
  assert.equal(rows[0].location, 'B1');
  assert.deepEqual(rows[0].days, ['일']);
});
ok('multi floor + note + days with (격)', () => {
  const { rows } = parseOcrText('|디요르| 5 |일,수|센텀스타| 7016 |gle|검정|a동|지하5층에 주차할 때도 있음|지하1,3층|해운대구|재송동|오후6시이후|');
  assert.equal(rows[0].plate, '7016');
  assert.deepEqual(rows[0].days, ['수', '일']);
  assert.equal(rows[0].location, 'B1,3');
  assert.match(rows[0].remarks, /주차할 때도/);
  assert.equal(rows[0].entryTime, '오후6시이후');
  const r2 = parseOcrText('|디요르| 8 |일(격)|자이1차| 5679 |벤츠e|검정|107동|월 실내 1회|지하2층|해운대구|우동|오후8시이후|').rows[0];
  assert.deepEqual(r2.days, ['일']);
  assert.match(r2.remarks, /격주/);
});
ok('excel paste of the boss sheet (header with 4-digit plates)', () => {
  const t = '작업자\t요일\t아파트명\t차번호\t차종\t색상\t동\t당일특이사항\t위치\t비고\t구\t동\t입차시간\n디요르\t일\t센텀누리\t2590\t벤츠e\t쥐색\t104동\t\t지하1층\t\t해운대구\t재송동\t오후';
  const { rows } = parseText(t);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plate, '2590');
  assert.equal(rows[0].apartment, '센텀누리');
  assert.equal(rows[0].block, '104동');
  assert.equal(rows[0].location, 'B1');
  assert.equal(rows[0].entryTime, '오후');
  assert.deepEqual(rows[0].warn, []);
});
console.log(`\n${n} parser tests passed`);

import { autoDistribute } from '../src/lib/distribute.js';
ok('auto distribute keeps blocks together & balanced', () => {
  const cars = [];
  for (let i = 0; i < 30; i++) cars.push({ id: 'a' + i, block_name: '101동', apartment_id: 'x' });
  for (let i = 0; i < 20; i++) cars.push({ id: 'b' + i, block_name: '102동', apartment_id: 'x' });
  for (let i = 0; i < 10; i++) cars.push({ id: 'c' + i, block_name: '103동', apartment_id: 'x' });
  const m = autoDistribute(cars, ['w1', 'w2']);
  const load = { w1: 0, w2: 0 };
  Object.values(m).forEach((w) => load[w]++);
  assert.equal(Object.keys(m).length, 60);
  assert.equal(load.w1, 30);
  assert.equal(load.w2, 30);
  const b = new Set(cars.filter((c) => c.block_name === '102동').map((c) => m[c.id]));
  assert.equal(b.size, 1);
});
ok('auto distribute giant block splits', () => {
  const cars = Array.from({ length: 90 }, (_, i) => ({ id: 'z' + i, block_name: '1동', apartment_id: 'x' }));
  const m = autoDistribute(cars, ['w1', 'w2', 'w3']);
  const load = {};
  Object.values(m).forEach((w) => (load[w] = (load[w] || 0) + 1));
  assert.deepEqual(Object.values(load).sort(), [30, 30, 30]);
});
console.log('all tests done');
