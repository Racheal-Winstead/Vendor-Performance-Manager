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
