const API="https://verblijfwijzer-samen.moek72.chatgpt.site/api";
const TOKEN_KEY="vw_samenwerking_token";
const STATUSSES=["Te doen","Bezig","Klaar voor controle","Goedgekeurd","Geblokkeerd"];
let token=localStorage.getItem(TOKEN_KEY)||"";
let workspace=null,currentFilter="Alle",installPrompt=null;
const openTasks=new Set();
const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const slug=value=>value.toLowerCase().replaceAll(" ","-");
const assigneeName=value=>value==="Codex"?"Moek (met Codex)":value;
const TASK_GUIDANCE={
  1:{steps:["Open het voorbereidingspakket bij Documenten.","Controleer of de eerste gebruiker iemand buiten Nederland is die bij een partner in Nederland wil wonen.","Bevestig welke partnerroutes binnen versie 1 vallen en noteer uitzonderingen bij Berichten."],link:["Open voorbereidingspakket","https://docs.google.com/document/d/1otzzUfGr_DP8ZiwptaRQXVYOJFMrEcMEXmjlfMmJHRQ/edit"]},
  2:{steps:["Open het bronnenregister bij Documenten.","Controleer per IND-bron of deze bij de juiste route en beslisregel hoort.","Noteer ontbrekende wetgeving, rechtspraak of juridische passages bij Berichten."],link:["Open bronnenregister","https://docs.google.com/document/d/1H8xbwvaaqOt5psIptmrw8UdiJC6emgdPn0FTN8fxV4A/edit"]},
  3:{steps:["Werk de technische vragenvolgorde uit vanuit de goedgekeurde productkeuzes.","Koppel iedere vertakking aan een veilige mogelijke uitkomst.","Laat twijfel altijd eindigen in ‘niet betrouwbaar vast te stellen’."],link:["Open beslisboom","https://docs.google.com/document/d/1cMXRimpTvGGXq8x_7pDzSuo_xcQp_7AKTm3E5cZYtqE/edit"]},
  4:{steps:["Je uitgebreide juridische uitwerking is ontvangen en volledig inhoudelijk doorgenomen.","Er is een aparte revisiekopie gemaakt met vier technische correcties; jouw originele document is ongewijzigd bewaard.","Moek neemt nu eerst de openstaande productkeuzes door.","Daarna volgen alleen de resterende juridische beslispunten die echt jouw oordeel nodig hebben — zie Berichten."],link:["Controleer de beslisboom","https://docs.google.com/document/d/1cMXRimpTvGGXq8x_7pDzSuo_xcQp_7AKTm3E5cZYtqE/edit"]},
  5:{steps:["Bouw de goedgekeurde beslisboom om tot een invulbare RouteCheck.","Toon voorwaarden als voldaan, onbekend of aandachtspunt.","Controleer de werking op telefoon en computer."]},
  6:{steps:["Open eerst de opzet voor de 50 testzaken.","Controleer per zaak of de verwachte juridische uitkomst juist is.","Vergelijk die verwachting met de technische uitkomst en noteer ieder verschil."],link:["Open opzet testzaken","https://docs.google.com/document/d/1c_iwBBtgv4CrcGs2Qt8mJuioN9i-e_K0EXtkEI69SVM/edit"]},
  7:{steps:["Test inloggen, navigeren en uitloggen op telefoon en computer.","Open een actiepunt, wijzig een status en stuur een testbericht.","Noteer fouten met apparaat, scherm en uitgevoerde stap bij Berichten."]},
  8:{steps:["Maak een korte omschrijving van de gesloten proef.","Vraag maximaal 20 passende proefgebruikers en leg hun toezegging vast.","Deel de test pas nadat de juridische basis is goedgekeurd."]},
  9:{steps:["Laat proefgebruikers de volledige check uitvoeren.","Verzamel onduidelijke vragen, verkeerde uitkomsten, fouten en betaalbereidheid.","Maak van iedere noodzakelijke verbetering een nieuw actiepunt."]},
  10:{steps:["Controleer of er geen kritieke technische fout meer openstaat.","Laat bevestigen dat de juridische routes, teksten en bronnen actueel zijn.","Beslis daarna: doorgaan, eerst aanpassen of stoppen."]}
};

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
  const timer=countdown(task),done=task.status==="Goedgekeurd",guide=TASK_GUIDANCE[task.id]||{steps:["Lees de omschrijving en de controlewijze.","Voer het actiepunt uit en zet vragen bij Berichten.","Vink het punt af wanneer de controle is geslaagd."]};
  const isOpen=openTasks.has(task.id),detailId=`task-detail-${detailed?"full":"next"}-${task.id}`;
  const detail=`<div id="${detailId}" class="task-detail" ${isOpen?"":"hidden"}><h4>Wat moet je doen?</h4><ol>${guide.steps.map(step=>`<li>${escapeHtml(step)}</li>`).join("")}</ol>${task.checkMethod?`<p><strong>Wanneer is het klaar?</strong><br>${escapeHtml(task.checkMethod)}</p>`:""}${guide.link?`<a href="${guide.link[1]}" target="_blank" rel="noreferrer">${escapeHtml(guide.link[0])} →</a>`:""}</div>`;
  return `<article class="task-row ${isOpen?"open":""}"><i class="status-dot s-${slug(task.status)}"></i><div class="task-copy"><button class="task-toggle" type="button" data-task-toggle="${task.id}" aria-expanded="${isOpen}" aria-controls="${detailId}"><span><strong>${escapeHtml(task.title)}</strong><small>${isOpen?"Verberg uitleg":"Bekijk wat je moet doen"}</small></span><b aria-hidden="true">⌄</b></button><div class="meta"><span>${escapeHtml(assigneeName(task.assignee))}</span><span>${date}</span><span>${escapeHtml(task.category)}</span></div><div class="countdown ${timer.className}">${timer.text}</div></div><div class="task-actions"><select class="status-select" data-id="${task.id}" aria-label="Status">${STATUSSES.map(status=>`<option ${status===task.status?"selected":""}>${status}</option>`).join("")}</select><button class="task-button extend" type="button" data-extend-id="${task.id}" data-due-date="${task.dueDate}">+ 7 dagen</button><button class="task-button complete" type="button" data-done-id="${task.id}" ${done?"disabled":""}>${done?"✓ Gedaan":"✓ Afvinken"}</button></div>${detail}</article>`;
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
  document.querySelectorAll("[data-task-toggle]").forEach(button=>{button.onclick=()=>{const id=Number(button.dataset.taskToggle);openTasks.has(id)?openTasks.delete(id):openTasks.add(id);render()}});
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
