import { solveMRV, grade, encodeRegions } from '../lab/queens.mjs';
// Tutorial board (02 §11.5), canonical labels (first appearance, row-major).
const rows = ['ABCC','AACC','ADDC','DDDD'];
const map = {A:0,B:1,C:2,D:3}; const reg = new Int8Array(16);
rows.join('').split('').forEach((ch,i)=>reg[i]=map[ch]);
console.log('record r', encodeRegions(4, reg));
console.log('solutions', solveMRV(4, reg, 5).map(s=>Array.from(s).join('')));
console.log('grade', JSON.stringify(grade(4, reg)));
