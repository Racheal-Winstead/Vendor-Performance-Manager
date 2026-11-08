import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,assessMetric} from '../src/metrics.js';
const header='metric_name,actual_value,unit\n';
test('reads sample data, BOM, CRLF, quotes and blank lines',()=>{
 const r=parseCSV('\uFEFF'+header.replace('\n','\r\n')+'"Quality, calls",78,percent\r\n\r\n');assert.equal(r[0].name,'Quality, calls');assert.equal(r[0].actual,78);
 assert.equal(parseCSV(header+'"A ""quoted"" metric",0,hours')[0].name,'A "quoted" metric');
});
test('rejects malformed schemas, duplicate rows and broken quoting',()=>{
 for(const s of ['name,value,unit\na,1,%',header,header+'a,1,%\na,2,%',header+'a,1,% ,extra',header+'"a,1,%',header+'a"b,1,%',header+'"a"b,1,%'])assert.throws(()=>parseCSV(s));
});
test('missing and invalid numbers never become zero',()=>{for(const value of ['','abc','78%','0x10','Infinity'])assert.equal(parseCSV(header+`a,${value},percent`)[0].actual,null);});
const cases=[['90','85','min','met'],['85','85','min','met'],['78','85','min','missed'],['3','4','max','met'],['4','4','max','met'],['6','4','max','missed'],['0','0','min','met'],['0','0','max','met'],['-1','0','min','missed'],['-1','0','max','met'],['1.1','1.2','min','missed'],['1.2','1.1','min','met'],['','','min','unassessed'],['','0','min','unassessed'],['abc','85','min','unassessed'],['78','','min','unassessed'],['78','abc','min','unassessed'],['78','0','max','missed'],['78','Infinity','min','unassessed'],['Infinity','0','max','unassessed']];
for(const [raw,target,direction,status]of cases)test(`compare ${JSON.stringify(raw)} ${direction} ${JSON.stringify(target)} → ${status}`,()=>assert.equal(assessMetric({raw,target,direction,assess:true}).status,status));
test('explicit skip is unassessed even with complete values',()=>assert.equal(assessMetric({raw:'78',target:'85',direction:'min',assess:false}).status,'unassessed'));
