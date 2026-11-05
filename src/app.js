import {parseCSV,numeric,assessMetric,readReviews,saveReview} from './metrics.js';
const $=id=>document.getElementById(id);
let metrics=[],loadId=0,currentId=null,dirty=false;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function showError(id,message){$(id).textContent=message;$(id).hidden=!message;}
function format(value,unit){return `${value}${unit==='percent'?'%':` ${unit}`}`;}
function renderPreview(){
 $('metric-rows').replaceChildren();$('preview').hidden=false;$('metric-count').textContent=`${metrics.length} metrics`;
 metrics.forEach((m,i)=>{
  const tr=el('tr'),info=el('td');info.append(el('strong',m.name),el('small',m.actual===null?`Row ${m.row} · missing or invalid actual`:format(m.actual,m.unit)));tr.append(info);
  const target=el('input');target.type='number';target.step='any';target.placeholder='e.g. 85';target.setAttribute('aria-label',`Target for ${m.name} (${m.unit})`);target.value=m.target;target.disabled=m.actual===null||!m.assess;target.addEventListener('input',()=>m.target=target.value);
  const targetCell=el('td');targetCell.append(target,el('small',m.unit));tr.append(targetCell);
  const select=el('select');select.setAttribute('aria-label',`Direction for ${m.name}`);for(const [v,t]of [['min','Higher or equal'],['max','Lower or equal']]){const o=el('option',t);o.value=v;select.append(o);}select.value=m.direction;select.addEventListener('change',()=>m.direction=select.value);const dir=el('td');dir.append(select);tr.append(dir);
  const check=el('input');check.type='checkbox';check.checked=m.actual!==null&&m.assess;check.disabled=m.actual===null;check.setAttribute('aria-label',`Assess ${m.name}`);check.addEventListener('change',()=>{m.assess=check.checked;target.disabled=!check.checked;select.disabled=!check.checked;});select.disabled=m.actual===null||!m.assess;const assess=el('td');assess.append(check);tr.append(assess);$('metric-rows').append(tr);
 });
}
async function loadFile(file){
 const request=++loadId;metrics=[];markDirty();$('preview').hidden=true;$('file-status').hidden=true;showError('file-error','');showError('form-error','');
 if(!file)return;
 try{
  if(!/\.csv$/i.test(file.name))throw Error('Choose a file with a .csv extension.');
  if(file.size>1024*1024)throw Error('Choose a CSV smaller than 1 MB.');
  const parsed=parseCSV(await file.text());if(request!==loadId)return;metrics=parsed;markDirty();renderPreview();$('file-status').textContent=`✓ ${file.name} · ${metrics.length} metrics loaded. Confirm the targets below.`;$('file-status').hidden=false;
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
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

function markDirty(){dirty=true;$('save-status').textContent='Unsaved changes — click Save review to keep them.';}
$('review-form').addEventListener('input',markDirty);
$('review-form').addEventListener('change',markDirty);
function library(selected=''){
 try{
  const list=readReviews(localStorage);$('saved-reviews').replaceChildren();
  const blank=el('option',list.length?'Choose a saved review':'No saved reviews yet');blank.value='';$('saved-reviews').append(blank);
  for(const r of list){const option=el('option',`${r.vendor} · ${r.start||'No date'} — ${r.end||'No date'}`);option.value=r.id;$('saved-reviews').append(option);}
  $('saved-reviews').value=selected;showError('save-error','');
 }catch{$('open-review').disabled=true;showError('save-error','Saved reviews could not be read. Browser storage may be blocked or contain unsupported data. Existing data has not been changed.');}
}
$('save-review').addEventListener('click',()=>{
 if(!$('vendor').value.trim()){showError('save-error','Enter a vendor team name before saving. Draft targets and dates can remain incomplete.');$('vendor').focus();return;}
 const id=currentId||crypto.randomUUID();
 try{
  saveReview(localStorage,{id,vendor:$('vendor').value.trim(),start:$('start').value,end:$('end').value,notes:$('notes').value,metrics,updatedAt:new Date().toISOString()});
  currentId=id;dirty=false;library(id);$('save-status').textContent=`Saved on this computer at ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}. Other browsers and devices do not share these reviews.`;
 }catch{showError('save-error','This review could not be saved. Browser storage may be full, blocked, or unreadable. Keep this tab open; your current work is still here.');}
});
$('open-review').addEventListener('click',()=>{
 const id=$('saved-reviews').value;if(!id){showError('save-error','Choose a saved review first.');return;}
 if(dirty&&!confirm('Open the saved review and discard unsaved changes in this tab?'))return;
 try{
  const r=readReviews(localStorage).find(r=>r.id===id);if(!r)throw Error('Missing review');
  loadId++;currentId=r.id;metrics=r.metrics;$('vendor').value=r.vendor;$('start').value=r.start;$('end').value=r.end;$('notes').value=r.notes;$('csv-file').value='';
  if(metrics.length)renderPreview();else $('preview').hidden=true;
  $('file-status').textContent=`✓ ${metrics.length} saved metrics restored. You do not need to upload the CSV again.`;$('file-status').hidden=!metrics.length;
  showError('file-error','');showError('form-error','');showError('save-error','');$('back').click();dirty=false;
  $('save-status').textContent=`Opened saved review. Last saved ${new Date(r.updatedAt).toLocaleString()}. Results will be recalculated when you check performance.`;
 }catch{showError('save-error','Unable to open this review. Current work has not been intentionally replaced.');}
});
$('new-review').addEventListener('click',()=>{
 if(dirty&&!confirm('Start a new review and discard unsaved changes?'))return;
 loadId++;currentId=null;metrics=[];$('review-form').reset();$('preview').hidden=true;$('file-status').hidden=true;showError('file-error','');showError('form-error','');showError('save-error','');$('back').click();dirty=false;$('saved-reviews').value='';$('save-status').textContent='New review. Save to keep it in this browser on this computer.';
});
library();
