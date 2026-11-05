import {parseCSV,numeric,assessMetric} from './metrics.js';
const $=id=>document.getElementById(id);
let metrics=[],loadId=0;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function showError(id,message){$(id).textContent=message;$(id).hidden=!message;}
function format(value,unit){return `${value}${unit==='percent'?'%':` ${unit}`}`;}
function renderPreview(){
 $('metric-rows').replaceChildren();$('preview').hidden=false;$('metric-count').textContent=`${metrics.length} metrics`;
 metrics.forEach((m,i)=>{
  const tr=el('tr'),info=el('td');info.append(el('strong',m.name),el('small',m.actual===null?`Row ${m.row} · missing or invalid actual`:format(m.actual,m.unit)));tr.append(info);
  const target=el('input');target.type='number';target.step='any';target.placeholder='e.g. 85';target.setAttribute('aria-label',`Target for ${m.name} (${m.unit})`);target.disabled=m.actual===null;target.addEventListener('input',()=>m.target=target.value);
  const targetCell=el('td');targetCell.append(target,el('small',m.unit));tr.append(targetCell);
  const select=el('select');select.setAttribute('aria-label',`Direction for ${m.name}`);for(const [v,t]of [['min','Higher or equal'],['max','Lower or equal']]){const o=el('option',t);o.value=v;select.append(o);}select.addEventListener('change',()=>m.direction=select.value);const dir=el('td');dir.append(select);tr.append(dir);
  const check=el('input');check.type='checkbox';check.checked=m.actual!==null;m.assess=check.checked;check.disabled=m.actual===null;check.setAttribute('aria-label',`Assess ${m.name}`);check.addEventListener('change',()=>{m.assess=check.checked;target.disabled=!check.checked;select.disabled=!check.checked;});select.disabled=m.actual===null;const assess=el('td');assess.append(check);tr.append(assess);$('metric-rows').append(tr);
 });
}
async function loadFile(file){
 const request=++loadId;metrics=[];$('preview').hidden=true;$('file-status').hidden=true;showError('file-error','');showError('form-error','');
 if(!file)return;
 try{
  if(!/\.csv$/i.test(file.name))throw Error('Choose a file with a .csv extension.');
  if(file.size>1024*1024)throw Error('Choose a CSV smaller than 1 MB.');
  const parsed=parseCSV(await file.text());if(request!==loadId)return;metrics=parsed;renderPreview();$('file-status').textContent=`✓ ${file.name} · ${metrics.length} metrics loaded. Confirm the targets below.`;$('file-status').hidden=false;
 }catch(e){if(request===loadId)showError('file-error',e.message);}
}
$('csv-file').addEventListener('change',e=>loadFile(e.target.files[0]));
const zone=$('dropzone');for(const type of ['dragover','dragenter'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragover');});for(const type of ['dragleave','drop'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.remove('dragover');});zone.addEventListener('drop',e=>{if(e.dataTransfer.files.length!==1){showError('file-error','Drop one CSV at a time.');return;}loadFile(e.dataTransfer.files[0]);});
$('load-sample').addEventListener('click',async()=>{try{const r=await fetch('/samples/sample-vendor-metrics.csv');if(!r.ok)throw Error('Sample unavailable. Try downloading and uploading your CSV.');await loadFile(new File([await r.text()],'sample-vendor-metrics.csv',{type:'text/csv'}));}catch(e){showError('file-error',e.message);}});
$('review-form').addEventListener('submit',e=>{
 e.preventDefault();showError('form-error','');
 if(!$('vendor').value.trim()){showError('form-error','Enter a vendor team name.');$('vendor').focus();return;}
 if(!$('start').value||!$('end').value||$('end').value<$('start').value){showError('form-error','Choose a start and end date. The end must be on or after the start.');$('start').focus();return;}
 if(!metrics.length){showError('form-error','Upload a valid metrics CSV, or try the sample data.');$('csv-file').focus();return;}
 const missing=metrics.find(m=>m.assess&&numeric(m.target)===null);if(missing){showError('form-error',`Enter a numeric target for “${missing.name}”, or uncheck Assess to leave it unassessed.`);return;}
 const results=metrics.map(m=>({...m,...assessMetric(m)}));
 $('summary-cards').replaceChildren();for(const [status,title]of [['met','Targets met'],['missed','Need attention'],['unassessed','Unassessed']]){const card=el('div',undefined,'summary-card');card.append(el('span',title),el('strong',String(results.filter(r=>r.status===status).length)));$('summary-cards').append(card);}
 $('result-rows').replaceChildren();for(const r of results){const tr=el('tr');const name=el('td');name.append(el('strong',r.name),el('small',`CSV row ${r.row}`));tr.append(name,el('td',r.actual===null?'Unavailable':format(r.actual,r.unit)));const target=el('td',r.status==='unassessed'?'Not assessed':`${r.direction==='min'?'≥':'≤'} ${format(numeric(r.target),r.unit)}`);tr.append(target);const status=el('td');status.append(el('span',{met:'Target met',missed:'Target missed',unassessed:'Unassessed'}[r.status],`status ${r.status}`));tr.append(status);$('result-rows').append(tr);}
 $('review-meta').textContent=`${$('vendor').value.trim()} · ${$('start').value} — ${$('end').value}`;$('result-notes').textContent=$('notes').value.trim();$('notes-card').hidden=!$('notes').value.trim();$('prepare-view').hidden=true;$('results-view').hidden=false;$('step-one').classList.remove('active');$('step-two').classList.add('active');$('page-title').textContent='Your numbers, in perspective.';$('page-description').textContent='Review the results. Keep interpretation and next steps in your hands.';$('crumb').textContent='Check performance';window.scrollTo(0,0);$('page-title').tabIndex=-1;$('page-title').focus();
});
$('back').addEventListener('click',()=>{$('prepare-view').hidden=false;$('results-view').hidden=true;$('step-one').classList.add('active');$('step-two').classList.remove('active');$('page-title').textContent='A clearer review starts here.';$('page-description').textContent='Bring your numbers and context together. Turn performance into a plan.';$('crumb').textContent='New review';window.scrollTo(0,0);$('vendor').focus();});
window.addEventListener('beforeunload',e=>{if(metrics.length){e.preventDefault();e.returnValue='';}});
