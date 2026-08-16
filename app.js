const API="https://verblijfwijzer-samen.moek72.chatgpt.site/api";
const TOKEN_KEY="vw_samenwerking_token";
const STATUSSES=["Te doen","Bezig","Klaar voor controle","Goedgekeurd","Geblokkeerd"];
let token=localStorage.getItem(TOKEN_KEY)||"";
let workspace=null,currentFilter="Alle",installPrompt=null;
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const slug=value=>value.toLowerCase().replaceAll(" ","-");
const assigneeName=value=>value==="Codex"?"Moek (met Codex)":value;

async function api(path,options={}){
  const headers={"content-type":"application/json",...(options.headers||{})};
  if(token)headers.authorization=`Bearer ${token}`;
  let response;
  try{response=await fetch(`${API}${path}`,{...options,headers})}catch{setOffline(true);throw new Error("Geen verbinding.")}
  setOffline(false);const body=await response.json().catch(()=>({}));
  if(response.status===401&&path!=="/unlock"){localStorage.removeItem(TOKEN_KEY);token="";showLogin();throw new Error("Log opnieuw in.")}
  if(!response.ok)throw new Error(body.error||"Er ging iets mis.");return body;
}
function setOffline(value){$("#offline").hidden=!value}
function toast(message){const box=$("#toast");box.textContent=message;box.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>box.hidden=true,2600)}

async function login(event){
  event.preventDefault();const button=event.currentTarget.querySelector("button");button.disabled=true;$("#login-error").textContent="";
  try{const result=await api("/unlock",{method:"POST",body:JSON.stringify({role:$("#login-role").value,pin:$("#login-pin").value})});token=result.token;localStorage.setItem(TOKEN_KEY,token);$("#login-pin").value="";await loadWorkspace();showApp()}catch(error){$("#login-error").textContent=error.message}finally{button.disabled=false}
}
function showLogin(){$("#login-view").hidden=false;$("#app-view").hidden=true}
function showApp(){$("#login-view").hidden=true;$("#app-view").hidden=false}
function logout(){token="";workspace=null;localStorage.removeItem(TOKEN_KEY);showLogin()}
async function loadWorkspace(){workspace=await api("/workspace");render()}

function render(){
  if(!workspace)return;const tasks=workspace.tasks||[],messages=workspace.messages||[];const approved=tasks.filter(t=>t.status==="Goedgekeurd").length;const progress=tasks.length?Math.round(approved/tasks.length*100):0;
  $("#profile-name").textContent=workspace.role;$("#avatar").textContent=workspace.role[0];$("#avatar").className=`avatar ${workspace.role.toLowerCase()}`;
  $("#progress").textContent=`${progress}%`;$("#progress-ring").style.setProperty("--value",`${progress*3.6}deg`);
  $("#stat-total").textContent=tasks.length;$("#stat-doing").textContent=tasks.filter(t=>t.status==="Bezig").length;$("#stat-review").textContent=tasks.filter(t=>t.status==="Klaar voor controle").length;$("#stat-messages").textContent=messages.length;$("#message-count").textContent=messages.length||"";
  $("#next-tasks").innerHTML=tasks.filter(t=>t.status!=="Goedgekeurd").slice(0,4).map(task=>taskHtml(task)).join("")||empty("Geen open actiepunten.");
  $("#latest-messages").innerHTML=messages.slice(0,4).map(messageHtml).join("")||empty("Nog geen berichten.");
  renderTasks();$("#conversation").innerHTML=messages.map(messageHtml).join("")||empty("Nog geen berichten. Schrijf hieronder het eerste bericht.");bindStatusSelects();
}
function countdown(task){
  if(task.status==="Goedgekeurd")return {text:"Afgerond",className:"done"};
  const today=new Date();today.setHours(0,0,0,0);
  const deadline=new Date(`${task.dueDate}T00:00:00`);
  const days=Math.round((deadline-today)/86400000);
  if(days===0)return {text:"Deadline vandaag",className:"today"};
  if(days===1)return {text:"Nog 1 dag",className:"soon"};
  if(days>1)return {text:`Nog ${days} dagen`,className:days<=7?"soon":""};
  const late=Math.abs(days);return {text:`${late} ${late===1?"dag":"dagen"} te laat`,className:"late"};
}
function taskHtml(task,detailed=false){
  const date=new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("nl-NL",{day:"numeric",month:"short",year:"numeric"});
  const timer=countdown(task),done=task.status==="Goedgekeurd";
  return `<article class="task-row"><i class="status-dot s-${slug(task.status)}"></i><div class="task-copy"><strong>${escapeHtml(task.title)}</strong><div class="meta"><span>${escapeHtml(assigneeName(task.assignee))}</span><span>${date}</span><span>${escapeHtml(task.category)}</span></div><div class="countdown ${timer.className}">${timer.text}</div>${detailed&&task.checkMethod?`<p class="check">Controle: ${escapeHtml(task.checkMethod)}</p>`:""}</div><div class="task-actions"><select class="status-select" data-id="${task.id}" aria-label="Status">${STATUSSES.map(status=>`<option ${status===task.status?"selected":""}>${status}</option>`).join("")}</select><button class="task-button extend" type="button" data-extend-id="${task.id}" data-due-date="${task.dueDate}">+ 7 dagen</button><button class="task-button complete" type="button" data-done-id="${task.id}" ${done?"disabled":""}>${done?"✓ Gedaan":"✓ Afvinken"}</button></div></article>`;
}
function messageHtml(message){const date=new Date(`${message.createdAt}Z`).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});return `<article class="message"><div class="avatar ${slug(message.author)}">${escapeHtml(message.author[0])}</div><div><div class="message-head"><strong>${escapeHtml(message.author)}</strong><time>${date}</time></div><p>${escapeHtml(message.body)}</p></div></article>`}
function empty(text){return `<div class="empty">${escapeHtml(text)}</div>`}
function renderTasks(){if(!workspace)return;const list=currentFilter==="Alle"?workspace.tasks:workspace.tasks.filter(t=>t.assignee===currentFilter);$("#task-list").innerHTML=list.map(task=>taskHtml(task,true)).join("")||empty("Geen actiepunten voor deze keuze.");bindStatusSelects()}
async function updateTask(button,change,message){
  button.disabled=true;
  try{await api("/workspace",{method:"PATCH",body:JSON.stringify(change)});await loadWorkspace();toast(message)}
  catch(error){toast(error.message)}finally{button.disabled=false}
}
function bindStatusSelects(){
  document.querySelectorAll(".status-select").forEach(select=>{select.onchange=()=>updateTask(select,{id:Number(select.dataset.id),status:select.value},"Status bijgewerkt.")});
  document.querySelectorAll("[data-done-id]").forEach(button=>{button.onclick=()=>updateTask(button,{id:Number(button.dataset.doneId),status:"Goedgekeurd"},"Actiepunt afgevinkt.")});
  document.querySelectorAll("[data-extend-id]").forEach(button=>{button.onclick=()=>{
    const deadline=new Date(`${button.dataset.dueDate}T12:00:00`);deadline.setDate(deadline.getDate()+7);
    updateTask(button,{id:Number(button.dataset.extendId),dueDate:deadline.toISOString().slice(0,10)},"Deadline met 7 dagen verlengd.");
  }});
}
async function sendMessage(event){event.preventDefault();const form=event.currentTarget,body=form.elements.body.value.trim();if(!body)return;try{await api("/workspace",{method:"POST",body:JSON.stringify({type:"message",body})});form.reset();await loadWorkspace();toast("Bericht verstuurd.")}catch(error){toast(error.message)}}
async function addTask(event){event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));try{await api("/workspace",{method:"POST",body:JSON.stringify({type:"task",...values})});form.reset();await loadWorkspace();toast("Actiepunt toegevoegd.")}catch(error){toast(error.message)}}
function showPage(page){document.querySelectorAll(".page").forEach(section=>section.hidden=section.id!==`page-${page}`);document.querySelectorAll("#nav button").forEach(button=>button.classList.toggle("active",button.dataset.page===page));$("#page-title").textContent={overview:"Overzicht",tasks:"Actiepunten",messages:"Berichten",documents:"Documenten"}[page]}

window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("#install").hidden=false});
$("#install").addEventListener("click",async()=>{if(!installPrompt){toast("Gebruik het browsermenu en kies ‘Zet op beginscherm’.");return}await installPrompt.prompt();installPrompt=null;$("#install").hidden=true});
$("#login-form").addEventListener("submit",login);$("#logout").addEventListener("click",logout);$("#message-form").addEventListener("submit",sendMessage);$("#task-form").addEventListener("submit",addTask);
$("#nav").addEventListener("click",event=>{const button=event.target.closest("button[data-page]");if(button)showPage(button.dataset.page)});document.addEventListener("click",event=>{const button=event.target.closest("button[data-go]");if(button)showPage(button.dataset.go)});
$("#filters").addEventListener("click",event=>{const button=event.target.closest("button[data-filter]");if(!button)return;currentFilter=button.dataset.filter;document.querySelectorAll("[data-filter]").forEach(item=>item.classList.toggle("selected",item===button));renderTasks()});
window.addEventListener("online",()=>{setOffline(false);if(token)loadWorkspace().catch(()=>{})});window.addEventListener("offline",()=>setOffline(true));
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));
(async()=>{if(!token){showLogin();return}try{await loadWorkspace();showApp()}catch{if(!token)showLogin()}})();setInterval(()=>{if(token&&!document.hidden)loadWorkspace().catch(()=>{})},30000);
