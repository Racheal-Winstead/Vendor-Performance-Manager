export function numeric(value){
 const s=String(value??'').trim();
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
export function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw Error('Unexpected quote in CSV. Export the sheet as comma-separated values.');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){
   row.push(cell);cell='';closed=false;
   if(c!==','){if(row.some(v=>v.trim()))rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
  }else{if(closed)throw Error('Unexpected text after a quoted CSV field.');cell+=c;}
 }
 if(quoted)throw Error('A quoted CSV field is not closed.');
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 const headers=rows.shift()?.map(v=>v.trim());
 if(!headers||headers.join(',')!=='metric_name,actual_value,unit')throw Error('Use exactly these columns: metric_name, actual_value, unit.');
 if(!rows.length)throw Error('The CSV has no metrics. Add at least one data row.');
 if(rows.length>100)throw Error('This first version supports up to 100 metrics per review.');
 const seen=new Set();
 return rows.map((r,i)=>{
  if(r.length!==3)throw Error(`Row ${i+2} must have exactly three columns.`);
  const [name,value,unit]=r.map(s=>s.trim());
  if(!name||!unit)throw Error(`Row ${i+2} needs a metric name and unit.`);
  if(seen.has(name.toLowerCase()))throw Error(`Row ${i+2} repeats a metric name. Use unique names.`);
  seen.add(name.toLowerCase());
  if(name.length>200||unit.length>50)throw Error(`Row ${i+2} has an unusually long name or unit.`);
  return {name,raw:value,actual:numeric(value),unit,target:'',direction:'min',assess:true,row:i+2};
 });
}
export function assessMetric(metric){
 const actual=numeric(metric.raw),target=numeric(metric.target);
 if(!metric.assess||actual===null||target===null||!['min','max'].includes(metric.direction))return {status:'unassessed',gap:null};
 const pass=metric.direction==='min'?actual>=target:actual<=target;
 return {status:pass?'met':'missed',gap:actual-target};
}

export const STORAGE_KEY='vendor-performance-reviews-v1';
export function validateReview(r){
 if(!r||typeof r.id!=='string'||typeof r.vendor!=='string'||typeof r.start!=='string'||typeof r.end!=='string'||typeof r.notes!=='string'||typeof r.updatedAt!=='string'||!Array.isArray(r.metrics)||r.metrics.length>100)throw Error('Saved review has an unsupported format.');
 const metrics=r.metrics.map(m=>{
  if(!m||typeof m.name!=='string'||typeof m.raw!=='string'||typeof m.unit!=='string'||typeof m.target!=='string'||!['min','max'].includes(m.direction)||typeof m.assess!=='boolean'||!Number.isInteger(m.row))throw Error('Saved metrics have an unsupported format.');
  return {...m,actual:numeric(m.raw)};
 });
 return {...r,metrics};
}
export function readReviews(storage){
 const raw=storage.getItem(STORAGE_KEY);if(!raw)return [];
 const list=JSON.parse(raw);if(!Array.isArray(list))throw Error('Saved review library is not a list.');
 return list.map(validateReview);
}
export function saveReview(storage,review){
 const valid=validateReview(review),list=readReviews(storage);
 const next=[valid,...list.filter(r=>r.id!==valid.id)];
 storage.setItem(STORAGE_KEY,JSON.stringify(next));return next;
}
