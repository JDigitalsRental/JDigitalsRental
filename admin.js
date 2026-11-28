import {initializeApp} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,collection,doc,getDocs,onSnapshot,query,orderBy,limit,where,
  setDoc,getDoc,updateDoc,deleteDoc,writeBatch,runTransaction,serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {getStorage,ref as storageRef,uploadBytes,getBlob,deleteObject} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

const firebaseConfig={
  apiKey:"AIzaSyDYxovJjUSbgiAPLbsNPpcUbrSCISnejqY",
  authDomain:"jdigitalrental.firebaseapp.com",
  projectId:"jdigitalrental",
  storageBucket:"jdigitalrental.firebasestorage.app",
  messagingSenderId:"611741872259",
  appId:"1:611741872259:web:01b3c2bec73d078999ebb6"
};

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);
const evidenceStorage=getStorage(app);
// Shared, public-readable availability only. Firestore security rules must restrict writes to admin.
const jdrUnliRef=doc(db,"publicSettings","unliSwap");
let jdrUnliState={trophy:true,nonTrophy:true};
let jdrUnliReady=false;
function jdrPaintUnliAdmin(){
 for(const [key,id] of [["trophy","jdrTrophyToggle"],["nonTrophy","jdrNonTrophyToggle"]]){
  const button=document.getElementById(id);if(!button)continue;
  const enabled=jdrUnliState[key]!==false;
  button.textContent=enabled?"🟢 ON — Available":"🔴 OFF — FULL";
  button.style.background=enabled?"#104331":"#621d30";
  button.style.borderColor=enabled?"#26d987":"#e65c7b";
  button.disabled=!jdrUnliReady||auth.currentUser?.uid!==ADMIN_UID;
 }
}
function jdrStartUnliAdmin(){
 onSnapshot(jdrUnliRef,snap=>{
  const data=snap.exists()?snap.data():{};
  jdrUnliState={trophy:data.trophy!==false,nonTrophy:data.nonTrophy!==false};
  jdrUnliReady=true;jdrPaintUnliAdmin();
  document.getElementById("jdrUnliAdminStatus").textContent="Live availability is synced with the customer website.";
 },error=>{
  jdrUnliReady=false;jdrPaintUnliAdmin();
  document.getElementById("jdrUnliAdminStatus").textContent="Unable to read settings: "+error.message;
 });
 for(const [key,id] of [["trophy","jdrTrophyToggle"],["nonTrophy","jdrNonTrophyToggle"]]){
  document.getElementById(id).addEventListener("click",async()=>{
   if(!jdrUnliReady||auth.currentUser?.uid!==ADMIN_UID)return;
   const button=document.getElementById(id);button.disabled=true;
   try{
    // Update only the selected field; do not overwrite the other switch.
    await setDoc(jdrUnliRef,{[key]:jdrUnliState[key]===false,updatedAt:serverTimestamp()},{merge:true});
   }catch(error){jdrNotice("Could not update UNLI SWAP: "+error.message)}
   finally{jdrPaintUnliAdmin()}
  });
 }
}

// Replace this with the Apps Script Web App /exec URL after deployment.
const GOOGLE_DRIVE_UPLOAD_URL="https://script.google.com/macros/s/AKfycbxF83TFjp2hH1T7Vb3jBQ6Q0TR9S1xiEfSJv_AEtDB9wcZYGaAUoTW0prnJT2ngzKDp/exec";

const $=id=>document.getElementById(id);
let gameCache=new Map();
let selectedGameId=null;
let historyItems=[];
let historyVisible=15;

function gameName(g){return g?.name||g?.title||"Untitled Game"}

function activityData(type,gameId,g,details,slot=""){
  return {
    type,gameId,gameName:gameName(g),slot,details,
    actor:auth.currentUser?.email||auth.currentUser?.uid||"Admin",
    createdAt:serverTimestamp()
  };
}

async function commitActivity(kind,gameId,g,details,operation,slot=""){
  const batch=writeBatch(db);
  const gameRef=doc(db,"games",gameId);

  if(operation.action==="update")batch.update(gameRef,operation.data);
  else if(operation.action==="create")batch.set(gameRef,operation.data);
  else if(operation.action==="delete")batch.delete(gameRef);

  batch.set(
    doc(collection(db,"rentalActivity")),
    activityData(kind,gameId,g,details,slot)
  );

  await batch.commit();
}

function changeDetails(before,after){
  const changes=[];

  for(const slot of ["trophy","nonTrophy"]){
    const fields=slotFields(slot);
    const oldStatus=getSlotStatus(before,slot);
    const newStatus=getSlotStatus(after,slot);
    const label=slot==="trophy"?"Trophy":"Non-Trophy";

    if(oldStatus!==newStatus)
      changes.push(`${label}: ${oldStatus} → ${newStatus}`);

    const oldDate=dateToInput(before[fields.date]);
    const newDate=dateToInput(after[fields.date]);

    if(oldDate!==newDate)
      changes.push(`${label} return: ${oldDate||"Not set"} → ${newDate||"Not set"}`);
  }

  if(before.status!==after.status)
    changes.push(`Game: ${before.status||"Not set"} → ${after.status}`);

  if(dateToInput(before.availableDate)!==dateToInput(after.availableDate))
    changes.push("Release date changed");

  return changes;
}

function priceDetails(before,after){
  const a=getPrices(before);
  const b=getPrices(after);
  const changes=[];

  const fields=[
    ["weeklyTrophy","Trophy weekly"],
    ["weeklyNonTrophy","Non-Trophy weekly"],
    ["twoWeeksTrophy","Trophy 14 days"],
    ["twoWeeksNonTrophy","Non-Trophy 14 days"],
    ["monthlyTrophy","Trophy UNLI SWAP"],
    ["monthlyNonTrophy","Non-Trophy UNLI SWAP"],
    ["singleMonthlyTrophy","Trophy single-game monthly"],
    ["singleMonthlyNonTrophy","Non-Trophy single-game monthly"]
  ];

  for(const [key,label] of fields){
    if(a[key]!==b[key])
      changes.push(`${label}: ${money(a[key])} → ${money(b[key])}`);
  }

  return changes;
}

function renderHistory(){
  const filter=$("historyFilter").value;

  const selected=historyItems.filter(a=>
    filter==="all"||
    a.type===filter||
    (filter==="game"&&["game-added","game-deleted"].includes(a.type))
  );

  const box=$("historyList");
  box.replaceChildren();

  if(!selected.length){
    const p=document.createElement("p");
    p.className="history-empty";
    p.textContent="No recorded activities for this filter yet.";
    box.appendChild(p);
  }

  const icons={
    extension:"📅",
    return:"✅",
    status:"🔄",
    price:"💰",
    "game-added":"➕",
    "game-deleted":"🗑️"
  };

  const titles={
    extension:"Rental Extended",
    return:"Rental Returned",
    status:"Status Updated",
    price:"Prices Updated",
    "game-added":"Game Added",
    "game-deleted":"Game Deleted"
  };

  for(const a of selected.slice(0,historyVisible)){
    const item=document.createElement("div");
    item.className="history-item";

    const heading=document.createElement("strong");
    heading.textContent=
      `${icons[a.type]||"📝"} ${titles[a.type]||"Activity"} — ${a.gameName||"Unknown Game"}`;

    const detail=document.createElement("small");
    detail.textContent=(a.slot?a.slot+" • ":"")+(a.details||"");

    const meta=document.createElement("small");
    const dt=a.createdAt?.toDate?.();

    meta.textContent=
      (dt?dt.toLocaleString("en-PH",{timeZone:"Asia/Manila"}):"Time pending")+
      " • "+(a.actor||"Admin");

    item.append(heading,detail,meta);
    box.appendChild(item);
  }

  $("moreHistory").style.display=
    selected.length>historyVisible?"block":"none";
}

async function loadActivityHistory(){
  try{
    const snapshot=await getDocs(collection(db,"rentalActivity"));

    historyItems=snapshot.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

    historyItems.sort((a,b)=>
      (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)
    );

    renderHistory();
  }catch(err){
    console.error("Activity history:",err);

    $("historyList").textContent=
      "History unavailable. Check Firestore rentalActivity read permissions.";
  }
}

$("historyFilter").addEventListener("change",()=>{
  historyVisible=15;
  renderHistory();
});

$("refreshHistory").addEventListener("click",loadActivityHistory);

$("clearHistory").addEventListener("click",async()=>{
  const button=$("clearHistory");
  if(!auth.currentUser||auth.currentUser.uid!==ADMIN_UID){
    jdrNotice("Admin access is required.");
    return;
  }
  const approved=await jdrConfirm(
    "PERMANENTLY DELETE ALL Rental Activity History?\n\n"+
    "This removes activity log records from Firebase and cannot be undone.\n"+
    "Games, rental slots, waiting list, and prices will NOT be deleted.\n\n"+
    "Press OK to delete, or Cancel to keep your history."
  );
  if(!approved)return;
  button.disabled=true;
  const original=button.textContent;
  button.textContent="Clearing history...";
  let deleted=0;
  try{
    // Delete only rentalActivity documents, in safe batches under Firestore limits.
    const snapshot=await getDocs(collection(db,"rentalActivity"));
    const docs=snapshot.docs;
    for(let i=0;i<docs.length;i+=400){
      const batch=writeBatch(db);
      for(const item of docs.slice(i,i+400))batch.delete(item.ref);
      await batch.commit();
      deleted+=Math.min(400,docs.length-i);
    }
    historyVisible=15;
    await loadActivityHistory();
    jdrNotice(deleted?`✅ Cleared ${deleted} activity records.`:"Activity History is already empty.");
  }catch(error){
    console.error("Clear history failed:",error);
    await loadActivityHistory();
    jdrNotice("Unable to clear all activity history. " +
      (error.code==="permission-denied"?"Firestore delete permission is not enabled. No rules were changed.":error.message||"Please retry.")+
      (deleted?`\n${deleted} records were already deleted before the error.`:""));
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});


$("moreHistory").addEventListener("click",()=>{
  historyVisible+=15;
  renderHistory();
});

const money=n=>"₱"+Number(n||0).toLocaleString("en-PH");

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#39;"
}[c]));

function openModal(id){
  $(id).classList.add("active");
}

function closeModal(id){
  if(id==="manageModal"&&jdrRentalsMounted)jdrSwitchManageTab('game');
  $(id).classList.remove("active");
}

function dateToInput(value){
  if(!value||/available now/i.test(String(value)))
    return "";

  if(/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;

  const text=String(value).trim();
  const match=text.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  const d=match?new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00`):new Date(text);

  if(Number.isNaN(d.getTime()))
    return "";

  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

function dateToText(value){
  if(!value)return "";

  const [y,m,d]=value.split("-").map(Number);

  return new Date(y,m-1,d).toLocaleDateString("en-US",{
    month:"long",
    day:"numeric",
    year:"numeric"
  });
}

function todayISO(){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date());
}

function isDue(date){
  const iso=dateToInput(date);
  return !!iso&&iso<=todayISO();
}

function addWeek(iso){
  const [y,m,d]=iso.split("-").map(Number);
  const date=new Date(y,m-1,d);

  date.setDate(date.getDate()+7);

  return [
    date.getFullYear(),
    String(date.getMonth()+1).padStart(2,"0"),
    String(date.getDate()).padStart(2,"0")
  ].join("-");
}
function addMonth(iso){
  const [y,m,d]=iso.split("-").map(Number);
  const target=new Date(y,m,1);

  const lastDay=new Date(
    target.getFullYear(),
    target.getMonth()+1,
    0
  ).getDate();

  target.setDate(Math.min(d,lastDay));

  return [
    target.getFullYear(),
    String(target.getMonth()+1).padStart(2,"0"),
    String(target.getDate()).padStart(2,"0")
  ].join("-");
}

function numberFrom(id){
  const raw=$(id).value.trim();

  if(raw==="")
    throw Error("Please complete all six price fields.");

  const n=Number(raw);

  if(!Number.isFinite(n)||n<0)
    throw Error("Please enter valid prices.");

  return n;
}

function pricesFromForm(prefix){
  const weeklyTrophy=numberFrom(prefix+"WeeklyTrophy");
  const weeklyNonTrophy=numberFrom(prefix+"WeeklyNonTrophy");
  const twoWeeksTrophy=numberFrom(prefix+"TwoWeeksTrophy");
  const twoWeeksNonTrophy=numberFrom(prefix+"TwoWeeksNonTrophy");
  const monthlyTrophy=numberFrom(prefix+"MonthlyTrophy");
  const monthlyNonTrophy=monthlyTrophy; // One shared UNLI SWAP price for both slots
  const singleMonthlyTrophy=numberFrom(prefix+"SingleMonthlyTrophy");
  const singleMonthlyNonTrophy=numberFrom(prefix+"SingleMonthlyNonTrophy");

  return {
    weeklyTrophy,
    weeklyNonTrophy,
    twoWeeksTrophy,
    twoWeeksNonTrophy,
    monthlyTrophy,
    monthlyNonTrophy,
    singleMonthlyTrophy,
    singleMonthlyNonTrophy,
    weekly:weeklyTrophy,
    monthly:monthlyTrophy
  };
}

function getPrices(g){
  return {
    weeklyTrophy:Number(g.weeklyTrophy??g.weekly??350),
    weeklyNonTrophy:Number(g.weeklyNonTrophy??300),
    twoWeeksTrophy:Number(g.twoWeeksTrophy??650),
    twoWeeksNonTrophy:Number(g.twoWeeksNonTrophy??550),
    monthlyTrophy:Number(g.monthlyTrophy??850),
    monthlyNonTrophy:Number(g.monthlyTrophy??850),
    singleMonthlyTrophy:Number(g.singleMonthlyTrophy??500),
    singleMonthlyNonTrophy:Number(g.singleMonthlyNonTrophy??400)
  };
}

const rentplayPriceKeys=["weeklyTrophy","weeklyNonTrophy","twoWeeksTrophy","twoWeeksNonTrophy","singleMonthlyTrophy","singleMonthlyNonTrophy","monthlyTrophy","monthlyNonTrophy"];
function rentplayPricesFromForm(prefix,existing){
  const base=existing?.rentplayPrices||{};
  const original=prefix==="new"?pricesFromForm("new"):getPrices(existing||{});
  const result={};
  for(const key of rentplayPriceKeys){
    const field=$(prefix+"Rentplay"+key.charAt(0).toUpperCase()+key.slice(1));
    if(!field)throw Error("RENTPLAY PH price fields missing. Refresh admin.html.");
    const raw=field.value.trim();
    if(raw===""){
      result[key]=Number(base[key]??original[key]);
    }else{
      const value=Number(raw);
      if(!Number.isFinite(value)||value<0)throw Error("Invalid RENTPLAY PH price: "+key);
      result[key]=value;
    }
  }
  return result;
}
function fillRentplayPrices(prefix,game){
  for(const key of rentplayPriceKeys){
    const field=$(prefix+"Rentplay"+key.charAt(0).toUpperCase()+key.slice(1));
    if(field)field.value=game?.rentplayPrices?.[key]??"";
  }
}

function slotFields(slot){
  return slot==="trophy"
    ?{status:"trophyStatus",date:"trophyDate"}
    :{status:"nonTrophyStatus",date:"nonTrophyDate"};
}

function normalizedSlotStatus(value){
  if(value===true)return "currently-rented";
  if(value===false)return "available";

  const text=String(value??"").toLowerCase().trim();

  if([
    "currently-rented",
    "currently rented",
    "rented",
    "true"
  ].includes(text))
    return "currently-rented";

  if([
    "available",
    "available now",
    "false",
    "open"
  ].includes(text))
    return "available";

  return "";
}

function getSlotStatus(game,slot){
  const fields=slotFields(slot);
  const explicit=normalizedSlotStatus(game[fields.status]);

  if(explicit)return explicit;

  const date=String(game[fields.date]||"").trim();

  if(/^available now$/i.test(date))
    return "available";

  if(game.status==="currently-rented")
    return "currently-rented";

  return "available";
}

function slotState(game,slot){
  if(game.status==="upcoming")
    return "upcoming";

  if(getSlotStatus(game,slot)==="available")
    return "available";

  const date=game[slotFields(slot).date];

  return isDue(date)?"due":"rented";
}

function slotText(state){
  if(state==="due")return "🟡 DUE FOR RETURN";
  if(state==="rented")return "🔴 CURRENTLY RENTED";
  if(state==="upcoming")return "🟡 UPCOMING";
  return "🟢 AVAILABLE";
}

function overallStatus(game){
  if(game.status==="upcoming")
    return "upcoming";

  const a=slotState(game,"trophy");
  const b=slotState(game,"nonTrophy");

  if(a==="available"||b==="available")
    return "available";

  if(a==="due"||b==="due")
    return "due";

  return "rented";
}

function derivedGameStatus(trophy,nonTrophy,currentStatus){
  if(currentStatus==="upcoming")return "upcoming";

  // Overall is available whenever at least one slot is available.
  return trophy==="currently-rented" &&
    nonTrophy==="currently-rented"
      ?"currently-rented"
      :"available";
}

function slotHTML(game,slot){
  const state=slotState(game,slot);
  const date=game[slotFields(slot).date];
  const label=slot==="trophy"?"🏆 Trophy":"🎮 Non-Trophy";

  return `
    <div class="slot-row">
      <span>${label}</span>
      <span class="slot-badge ${state}">
        ${slotText(state)}
      </span>
    </div>
    <div>
      ${
        state==="available"
          ?"Available Now"
          :state==="upcoming"
            ?"Not released yet"
            :"Expected return: "+esc(date||"Date not set")
      }
    </div>
  `;
}

async function loadAdminGames(){
  const snapshot=await getDocs(collection(db,"games"));

  gameCache.clear();
  $("gameGrid").innerHTML="";

  let active=0;
  let availableSlots=0;
  let dueToday=0;
  let overdue=0;

  const alerts=[];
  const today=todayISO();

  snapshot.forEach(gameDoc=>{
    const g=gameDoc.data();
    gameCache.set(gameDoc.id,g);

    if(g.status!=="upcoming"){
      for(const slot of ["trophy","nonTrophy"]){
        const state=slotState(g,slot);
        const label=slot==="trophy"?"🏆 Trophy":"🎮 Non-Trophy";
        const name=g.name||g.title||"Untitled Game";

        if(state==="available"){
          availableSlots++;
        }else{
          active++;

          const raw=g[slotFields(slot).date];
          const iso=dateToInput(raw);

          if(iso===today){
            dueToday++;
            alerts.push({
              id:gameDoc.id,name,label,iso,
              kind:"Due Today",rank:1
            });
          }else if(iso&&iso<today){
            overdue++;
            alerts.push({
              id:gameDoc.id,name,label,iso,
              kind:"Overdue",rank:0
            });
          }
        }
      }
    }

    const p=getPrices(g);
    const status=overallStatus(g);
    const card=document.createElement("article");

    card.className="game-card";

    card.innerHTML=`
      <div class="game-top">
        <h3>${esc(g.name||g.title||"Untitled Game")}</h3>
        <span class="status ${status}">
          ${slotText(status)}
        </span>
      </div>

      <div class="price-grid">
        <div class="price-box">
          <small>🏆 Weekly Trophy</small>
          <strong>${money(p.weeklyTrophy)}</strong>
        </div>

        <div class="price-box">
          <small>🎮 Weekly Non-Trophy</small>
          <strong>${money(p.weeklyNonTrophy)}</strong>
        </div>

        <div class="price-box"><small>🏆 14 Days Trophy</small><strong>${money(p.twoWeeksTrophy)}</strong></div>
        <div class="price-box"><small>🎮 14 Days Non-Trophy</small><strong>${money(p.twoWeeksNonTrophy)}</strong></div>

        <div class="price-box">
          <small>🏆 Monthly UNLI Trophy</small>
          <strong>${money(p.monthlyTrophy)}</strong>
        </div>

        <div class="price-box">
          <small>🎮 Monthly UNLI Non-Trophy</small>
          <strong>${money(p.monthlyNonTrophy)}</strong>
        </div>

        <div class="price-box">
          <small>🏆 1 Month Single Game — Trophy</small>
          <strong>${money(p.singleMonthlyTrophy)}</strong>
        </div>

        <div class="price-box">
          <small>🎮 1 Month Single Game — Non-Trophy</small>
          <strong>${money(p.singleMonthlyNonTrophy)}</strong>
        </div>
      </div>

      <div class="details">
        ${slotHTML(g,"trophy")}
        ${slotHTML(g,"nonTrophy")}

        ${
          g.status==="upcoming"
            ?"<p>📅 Release: "+esc(g.availableDate||"Date TBA")+"</p>"
            :""
        }
      </div>

      <button class="manage" type="button">
        Manage Game
      </button>
    `;

    card.querySelector(".manage").addEventListener("click",()=>{
      openManage(gameDoc.id);
    });

    $("gameGrid").appendChild(card);
  });

  $("totalGames").textContent=snapshot.size;
  $("activeSlots").textContent=active;
  $("availableSlots").textContent=availableSlots;
  $("dueToday").textContent=dueToday;
  $("overdueSlots").textContent=overdue;

  const alertBox=$("priorityAlerts");
  alertBox.replaceChildren();

  alerts.sort((a,b)=>
    a.rank-b.rank||a.iso.localeCompare(b.iso)
  );

  if(!alerts.length){
    const empty=document.createElement("p");
    empty.className="priority-empty";
    empty.textContent=
      "✅ No due or overdue rental slots right now.";

    alertBox.appendChild(empty);
  }

  for(const item of alerts){
    const row=document.createElement("div");
    row.className="priority-item";

    const info=document.createElement("div");
    const title=document.createElement("strong");

    title.textContent=
      (item.rank===0?"🔴 ":"🟡 ")+
      item.kind+" — "+item.name;

    const detail=document.createElement("small");

    detail.textContent=
      item.label+
      " • Expected return: "+
      dateToText(item.iso)+
      " • Awaiting confirmed return";

    info.append(title,detail);

    const button=document.createElement("button");
    button.type="button";
    button.textContent="Manage";

    button.addEventListener("click",()=>{
      openManage(item.id);
    });

    row.append(info,button);
    alertBox.appendChild(row);
  }

  // Waiting-list total is updated by the bounded notification listener.
}
function updateManageSlotUI(slot){
  const prefix=slot==="trophy"?"manageTrophy":"manageNonTrophy";
  const status=$(prefix+"Status").value;
  const date=$(prefix+"Date").value;

  const state=
    status==="available"?"available":
    isDue(date)?"due":"rented";

  const badge=$(prefix+"Badge");

  badge.className="slot-badge "+state;
  badge.textContent=slotText(state);

  const notice=$(prefix+"Notice");

  const confirmButton=$(
    slot==="trophy"
      ?"confirmTrophyReturn"
      :"confirmNonTrophyReturn"
  );

  if($("manageStatusUpcoming").checked){
    notice.textContent="This game is still upcoming.";
    confirmButton.disabled=true;
  }else if(status==="available"){
    notice.textContent="This slot is available.";
    confirmButton.disabled=true;
  }else{
    notice.textContent=state==="due"
      ?"Return date reached. Check the renter's disable video before confirming."
      :"Currently rented. Confirm return only after checking proof.";

    confirmButton.disabled=false;
  }

  updateExtensionPreview(slot);
}

// Move the existing Rental Management form into the selected game's window.
// One live form is reused: no duplicate IDs, writes, or Firebase collections.
let jdrRentalsMounted=false;
let jdrRentalScopeGameId=null;
function jdrRestoreRentalPanel(){
 if(!jdrRentalsMounted)return;
 const section=$('rentalManagementModal').querySelector('.psn-panel');
 if(section){const host=$('rentalManagementModal').querySelector('.management-modal-card')||$('rentalManagementModal').querySelector('.manage-modal-card');host.appendChild(section);}
 jdrRentalsMounted=false;
 jdrRentalScopeGameId=null;
 $('rentalSearch').value='';
 psnRender();
}
function jdrRenderAccountSlots(){
 const host=$('jdrAccountSlots');if(!host)return;
 host.replaceChildren();
 if(!jdrRentalsMounted||!jdrRentalScopeGameId)return;
 const gameId=jdrRentalScopeGameId;
 const owners=psnAccounts.filter(a=>(a.gameIds||[]).includes(gameId))
  .sort((a,b)=>(a.email||'').localeCompare(b.email||''));
 const total=owners.length*2;
 const used=(slot)=>owners.filter(a=>psnRentals.some(r=>r.accountId===a.id&&r.gameId===gameId&&r.slot===slot&&r.status==='rented')).length;
 const trophyUsed=used('trophy'),nonTrophyUsed=used('nonTrophy'),rented=trophyUsed+nonTrophyUsed;
 const summary=document.createElement('section');summary.className='jdr-slot-summary';
 psnLine(summary,'strong','📊 Live PSN Slot Availability');
 const grid=document.createElement('div');grid.className='jdr-slot-counts';
 for(const [label,num,kind] of [['TOTAL',total,'total'],['RENTED',rented,'rented'],['AVAILABLE',total-rented,'available']]){
  const tile=document.createElement('div');tile.className='jdr-slot-count '+kind;
  psnLine(tile,'strong',String(num));psnLine(tile,'small',label);grid.append(tile);
 }
 summary.append(grid);
 psnLine(summary,'div','🏆 Trophy: '+(owners.length-trophyUsed)+' available / '+trophyUsed+' rented');
 psnLine(summary,'div','🎮 Non-Trophy: '+(owners.length-nonTrophyUsed)+' available / '+nonTrophyUsed+' rented');
 psnLine(summary,'small','Based on saved PSN renter records. Customer website availability is separate; check account sharing before assigning.');
 host.append(summary);
 if(!owners.length){psnLine(host,'p','No PSN accounts own this game yet. Add the game to a PSN account first.');return;}
 for(const [index,account] of owners.entries()){
  const card=document.createElement('section');card.className='jdr-account-card';
  psnLine(card,'h4',`📧 Account ${index+1}: ${account.email||'No email'}`);
  if(account.region)psnLine(card,'small','🌎 '+account.region);
  for(const slot of ['trophy','nonTrophy']){
   const panel=document.createElement('div');panel.className='jdr-account-slot';
   psnLine(panel,'strong',psnSlotLabel(slot));
   const active=psnRentals.filter(r=>r.accountId===account.id&&r.gameId===gameId&&r.slot===slot&&r.status==='rented')
     .sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
   if(active.length){
    const r=active[0];
    psnLine(panel,'small','🔴 CURRENTLY RENTED • '+(r.renterName||'Unnamed renter'));
    psnLine(panel,'small','Start: '+(r.startDate||'Not set')+' • Expected return: '+(r.returnDate||'Not set'));
    if(active.length>1)psnLine(panel,'small','⚠️ Multiple active records: '+active.length+'. Review duplicate assignments.');
    const btn=document.createElement('button');btn.type='button';btn.textContent='✏️ Edit Renter';
    btn.onclick=()=>{jdrPrefillAccountSlot(account.id,slot,r);};
    panel.append(btn);
   }else{
    psnLine(panel,'small','🟢 No active renter for this game/slot');
    const btn=document.createElement('button');btn.type='button';btn.textContent='➕ Assign Renter';
    btn.onclick=()=>jdrPrefillAccountSlot(account.id,slot,null);
    panel.append(btn);
   }
   card.append(panel);
  }
  host.append(card);
 }
}
function jdrPrefillAccountSlot(accountId,slot,rental){
 const form=$('psnRentalForm');if(!form)return;
 $('psnRentalEditId').value=rental?.id||'';
 $('psnRentalAccount').value=accountId;
 psnRentalGameChoices();
 $('psnRentalGame').value=jdrRentalScopeGameId||'';
 $('psnRentalSlot').value=slot;
 $('psnRenterName').value=rental?.renterName||'';
 $('psnStartDate').value=rental?.startDate||'';
 $('psnReturnDate').value=rental?.returnDate||'';
 $('psnRentalStatus').value=rental?.status||'rented';
 $('psnRentalSave').textContent=rental?'💾 Update Assignment':'💾 Save Assignment';
 form.scrollIntoView({behavior:'smooth',block:'start'});
}
function jdrGameRentalFilter(){
 if(!jdrRentalsMounted||!selectedGameId)return;
 const gameId=selectedGameId;
 jdrRentalScopeGameId=gameId;
 const select=$('psnRentalAccount');
 const old=select.value;
 select.replaceChildren(psnOption('','Select PSN account for this game'));
 const owners=psnAccounts.filter(a=>(a.gameIds||[]).includes(gameId));
 owners.forEach(a=>select.append(psnOption(a.id,a.email+(a.region?' • '+a.region:''))));
 if(owners.some(a=>a.id===old))select.value=old;
 else if(owners.length===1)select.value=owners[0].id;
 psnRentalGameChoices();
 const gameSelect=$('psnRentalGame');
 gameSelect.disabled=false;
 if(select.value && owners.some(a=>a.id===select.value && (a.gameIds||[]).includes(gameId))){
  gameSelect.value=gameId;
 }
 const title=psnGameTitle(gameId);
 $('jdrGameRentalSummary').textContent='🎮 '+title+' • '+owners.length+' PSN account(s) own this game. Choose an account to assign a renter. Only rentals for this game are shown below.';
 $('rentalSearch').value='';
 psnRender();
 jdrRenderAccountSlots();
}
function jdrSwitchManageTab(tab){
 const rental=tab==='renters';
 $('jdrGameDetails').style.display=rental?'none':'';
 $('jdrUnifiedRentals').style.display=rental?'block':'none';
 $('jdrGameTab').setAttribute('aria-selected',String(!rental));
 $('jdrRentersTab').setAttribute('aria-selected',String(rental));
 if(rental){
  const section=$('rentalManagementModal').querySelector('.psn-panel');
  if(section){$('jdrRentalMount').appendChild(section);jdrRentalsMounted=true;}
  jdrRentalScopeGameId=selectedGameId;
  psnRender();
  psnLoad().then(jdrGameRentalFilter);
 }else{
  $('psnRentalGame').disabled=false;
  jdrRestoreRentalPanel();
 }
 $('manageModal').querySelector('.manage-modal-card').scrollTop=0;
}
$('jdrGameTab').onclick=()=>jdrSwitchManageTab('game');
$('jdrRentersTab').onclick=()=>jdrSwitchManageTab('renters');
function openManage(id){
  const g=gameCache.get(id);
  if(!g)return;

  if(jdrRentalsMounted)jdrSwitchManageTab('game');
  selectedGameId=id;
  coverData.manage=null;
  $("manageGameCover").value="";
  $("manageGameCoverHint").textContent="Leave empty to keep the current image.";
  showCover("manage",g.image||"");

  const p=getPrices(g);
  // RENTPLAY PH uses the same game prices; no separate pricing form.

  fillMediaForm("manage",g);

  $("manageGameName").textContent=
    g.name||g.title||"Manage Game";

  $("manageStatusUpcoming").checked=g.status==="upcoming";
  $("manageStatus").value=
    g.status==="upcoming"?"upcoming":"available";

  for(const key of [
    "WeeklyTrophy",
    "WeeklyNonTrophy",
    "TwoWeeksTrophy",
    "TwoWeeksNonTrophy",
    "MonthlyTrophy",
    "MonthlyNonTrophy",
    "SingleMonthlyTrophy",
    "SingleMonthlyNonTrophy"
  ]){
    const field=key.charAt(0).toLowerCase()+key.slice(1);
    $("manage"+key).value=p[field];
  }

  $("manageAvailableDate").value=
    dateToInput(g.availableDate);

  $("manageTrophyStatus").value=
    getSlotStatus(g,"trophy");

  $("manageNonTrophyStatus").value=
    getSlotStatus(g,"nonTrophy");

  $("manageTrophyDate").value=
    dateToInput(g.trophyDate);

  $("manageNonTrophyDate").value=
    dateToInput(g.nonTrophyDate);

  $("trophyExtensionPeriod").value="week";
  $("nonTrophyExtensionPeriod").value="week";

  updateManageSlotUI("trophy");
  updateManageSlotUI("nonTrophy");

  openModal("manageModal");
}

function readSlot(prefix){
  const status=$(prefix+"Status").value;
  const date=$(prefix+"Date").value;

  if(status==="currently-rented"&&!date){
    throw Error(
      "Please enter an expected return date for every rented slot."
    );
  }

  return {
    status,
    date:status==="available"?"Available Now":dateToText(date)
  };
}

function formGameData(prefix){
  const prices=pricesFromForm(prefix);

  const trophy=readSlot(
    prefix==="new"?"newTrophy":"manageTrophy"
  );

  const nonTrophy=readSlot(
    prefix==="new"?"newNonTrophy":"manageNonTrophy"
  );

  const selectedStatus=$(
    prefix==="new"
      ?"newGameStatusUpcoming"
      :"manageStatusUpcoming"
  ).checked?"upcoming":"available";

  const availableDate=dateToText(
    $(prefix==="new"
      ?"newGameAvailableDate"
      :"manageAvailableDate").value
  );

  if(selectedStatus==="upcoming"&&!availableDate){
    throw Error("Please select the upcoming release date.");
  }

  return {
    ...prices,
    status:derivedGameStatus(
      trophy.status,
      nonTrophy.status,
      selectedStatus
    ),
    availableDate:selectedStatus==="upcoming"?availableDate:"",
    trophyStatus:trophy.status,
    nonTrophyStatus:nonTrophy.status,
    trophyDate:trophy.date,
    nonTrophyDate:nonTrophy.date
  };
}


function safeHttpsUrl(value,kind){
  const raw=String(value||"").trim();
  if(!raw)return "";
  let url;
  try{url=new URL(raw)}catch{throw Error("Please enter a valid "+kind+" URL.");}
  if(url.protocol!=="https:")throw Error(kind+" URL must use HTTPS.");
  return url.href;
}
function youtubeTrailerUrl(value){
  const href=safeHttpsUrl(value,"YouTube trailer");
  if(!href)return "";
  const url=new URL(href);
  const host=url.hostname.toLowerCase();
  const validHosts=["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be","youtube-nocookie.com","www.youtube-nocookie.com"];
  if(!validHosts.includes(host))throw Error("Trailer must be a YouTube link.");
  let videoId="";
  if(host.endsWith("youtu.be"))videoId=url.pathname.split("/")[1]||"";
  else if(url.pathname==="/watch")videoId=url.searchParams.get("v")||"";
  else if(url.pathname.startsWith("/embed/")||url.pathname.startsWith("/shorts/")||url.pathname.startsWith("/live/"))
    videoId=url.pathname.split("/")[2]||"";
  if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId))throw Error("Invalid YouTube video ID. Please paste an official trailer link.");
  return "https://www.youtube.com/watch?v="+videoId;
}
function mediaFromForm(prefix){
  const screenshots=$(prefix+"Screenshots").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(screenshots.length>8)throw Error("Maximum 8 screenshots per game.");
  return {
    description:$(prefix+"Description").value.trim().slice(0,5000),
    trailerUrl:youtubeTrailerUrl($(prefix+"TrailerUrl").value),
    screenshots:screenshots.map(url=>safeHttpsUrl(url,"Screenshot")),
    developer:$(prefix+"Developer").value.trim().slice(0,150),
    publisher:$(prefix+"Publisher").value.trim().slice(0,150),
    releaseDate:$(prefix+"ReleaseDate").value
  };
}
function fillMediaForm(prefix,g){
  $(prefix+"Description").value=g.description||"";
  $(prefix+"TrailerUrl").value=g.trailerUrl||"";
  $(prefix+"Screenshots").value=Array.isArray(g.screenshots)?g.screenshots.join("\n"):"";
  $(prefix+"Developer").value=g.developer||"";
  $(prefix+"Publisher").value=g.publisher||"";
  $(prefix+"ReleaseDate").value=dateToInput(g.releaseDate);
}


/* IMAGE UPLOAD: compressed cover stored in the game's existing image field.
   No Firebase Storage or billing setup needed. Keep images small: Firestore has
   a 1 MiB document limit. */
const coverData={new:null,manage:null};
async function compressCover(file){
  if(!file || !file.type.startsWith("image/"))throw Error("Please select an image file.");
  if(file.size>12*1024*1024)throw Error("Image is too large. Please choose one under 12 MB.");
  const bitmap=await createImageBitmap(file);
  try{
    for(const width of [600,480,360,280]){
      const scale=Math.min(1,width/bitmap.width,800/bitmap.height);
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.78,.65,.5,.35]){
        const result=canvas.toDataURL("image/jpeg",quality);
        if(result.length<160000)return result;
      }
    }
    throw Error("Unable to compress this photo. Try a smaller image.");
  }finally{bitmap.close();}
}
function showCover(prefix,src){
  const img=$(prefix+"GameCoverPreview");
  if(src){img.src=src;img.style.display="block";}
  else{img.removeAttribute("src");img.style.display="none";}
}
for(const prefix of ["new","manage"]){
  $(prefix+"GameCover").addEventListener("change",async e=>{
    const file=e.target.files?.[0];
    coverData[prefix]=null;
    if(!file){showCover(prefix,prefix==="manage"?gameCache.get(selectedGameId)?.image:"");return;}
    $(prefix+"GameCoverHint").textContent="⏳ Preparing photo...";
    try{
      coverData[prefix]=await compressCover(file);
      showCover(prefix,coverData[prefix]);
      $(prefix+"GameCoverHint").textContent="✅ Ready! Click Save to apply the cover.";
    }catch(err){
      e.target.value="";
      $(prefix+"GameCoverHint").textContent="❌ "+err.message;
      jdrNotice(err.message);
    }
  });
}

/* SAVE GAME CHANGES */

$("saveGameChanges").addEventListener("click",async()=>{
  if(!selectedGameId)return;

  const btn=$("saveGameChanges");

  try{
    if($("manageGameCover").files.length && !coverData.manage)
      throw Error("Please wait for the cover to finish processing.");
    const updates={...formGameData("manage"),...mediaFromForm("manage")};
    if(coverData.manage)updates.image=coverData.manage;

    btn.disabled=true;

    const previous=gameCache.get(selectedGameId);
    const next={...previous,...updates};

    const statusChanges=changeDetails(previous,next);
    const priceChanges=priceDetails(previous,next);

    const batch=writeBatch(db);

    batch.update(
      doc(db,"games",selectedGameId),
      updates
    );

    if(statusChanges.length){
      batch.set(
        doc(collection(db,"rentalActivity")),
        activityData(
          "status",
          selectedGameId,
          previous,
          statusChanges.join(" | ")
        )
      );
    }

    if(priceChanges.length){
      batch.set(
        doc(collection(db,"rentalActivity")),
        activityData(
          "price",
          selectedGameId,
          previous,
          priceChanges.join(" | ")
        )
      );
    }

    await batch.commit();

    closeModal("manageModal");

    await loadAdminGames();
    await psnSyncFromGames();
    await loadActivityHistory();

    jdrNotice("Game and slot statuses updated successfully! 🎮");

  }catch(error){
    console.error(error);
    jdrNotice(error.message||"Unable to save changes.");
  }finally{
    btn.disabled=false;
  }
});

/* CONFIRM RENTAL RETURN */

async function confirmReturn(slot){
  if(!selectedGameId)return;

  const g=gameCache.get(selectedGameId);

  if(!g||g.status==="upcoming")return;

  const label=slot==="trophy"?"Trophy":"Non-Trophy";
  const fields=slotFields(slot);

  if(getSlotStatus(g,slot)==="available"){
    jdrNotice(label+" slot is already available.");
    return;
  }

  if(!await jdrConfirm(
    "Have you checked the renter's disable video?\n\n"+
    "Confirm return of "+label+" slot for "+
    (g.name||g.title)+"?"
  ))return;

  const btn=$(
    slot==="trophy"
      ?"confirmTrophyReturn"
      :"confirmNonTrophyReturn"
  );

  btn.disabled=true;

  try{
    const otherSlot=
      slot==="trophy"?"nonTrophy":"trophy";

    const otherStatus=getSlotStatus(g,otherSlot);

    const updates={
      [fields.status]:"available",
      [fields.date]:"Available Now",
      status:derivedGameStatus(
        slot==="trophy"?"available":otherStatus,
        slot==="nonTrophy"?"available":otherStatus,
        g.status
      )
    };

    await commitActivity(
      "return",
      selectedGameId,
      g,
      `Previous return: ${g[fields.date]||"Not set"} → Available Now`,
      {action:"update",data:updates},
      label
    );

    closeModal("manageModal");

    await loadAdminGames();
    await psnSyncFromGames();
    await loadActivityHistory();

    jdrNotice(
      "✅ "+label+
      " return confirmed! Slot is now available."
    );

  }catch(error){
    console.error(error);
    jdrNotice("Unable to confirm return.");
  }finally{
    btn.disabled=false;
  }
}

$("confirmTrophyReturn").addEventListener(
  "click",
  ()=>confirmReturn("trophy")
);

$("confirmNonTrophyReturn").addEventListener(
  "click",
  ()=>confirmReturn("nonTrophy")
);

/* RENTAL EXTENSION */

function extensionElements(slot){
  const trophy=slot==="trophy";

  return {
    date:$(
      trophy?"manageTrophyDate":"manageNonTrophyDate"
    ),
    status:$(
      trophy?"manageTrophyStatus":"manageNonTrophyStatus"
    ),
    period:$(
      trophy?"trophyExtensionPeriod":"nonTrophyExtensionPeriod"
    ),
    preview:$(
      trophy?"trophyExtensionPreview":"nonTrophyExtensionPreview"
    ),
    button:$(
      trophy?"extendTrophy":"extendNonTrophy"
    )
  };
}
function getExtendedDate(iso,period){
  if(!iso)return "";

  return period==="month"
    ?addMonth(iso)
    :addWeek(iso);
}

function updateExtensionPreview(slot){
  const el=extensionElements(slot);
  const game=gameCache.get(selectedGameId);
  const fields=slotFields(slot);

  const savedDate=game
    ?dateToInput(game[fields.date])
    :"";

  const shownDate=el.date.value;

  if($("manageStatusUpcoming").checked){
    el.preview.textContent=
      "Upcoming games cannot be extended.";

    el.button.disabled=true;
    return;
  }

  if(el.status.value!=="currently-rented"){
    el.preview.textContent=
      "This slot is available. Extension is not needed.";

    el.button.disabled=true;
    return;
  }

  if(!shownDate){
    el.preview.textContent=
      "Please enter an expected return date.";

    el.button.disabled=true;
    return;
  }

  if(!savedDate||savedDate!==shownDate){
    el.preview.textContent=
      "The return date has unsaved changes. Save Changes first, then reopen this game.";

    el.button.disabled=true;
    return;
  }

  const next=getExtendedDate(
    savedDate,
    el.period.value
  );

  el.preview.innerHTML=`
    <div>
      Current Return:
      <strong>${esc(dateToText(savedDate))}</strong>
    </div>

    <div style="color:#70ffb1;margin-top:6px">
      New Return:
      <strong>${esc(dateToText(next))}</strong>
    </div>
  `;

  el.button.disabled=false;
}

async function extendRental(slot){
  if(!selectedGameId)return;

  const game=gameCache.get(selectedGameId);
  const el=extensionElements(slot);

  if(!game||game.status==="upcoming")return;

  const fields=slotFields(slot);

  if(getSlotStatus(game,slot)!=="currently-rented"){
    jdrNotice("This slot is not currently rented.");
    return;
  }

  const oldDate=dateToInput(game[fields.date]);

  if(!oldDate||oldDate!==el.date.value){
    jdrNotice(
      "Please save or reload the current return date before extending."
    );
    return;
  }

  const period=el.period.value;
  const newDate=getExtendedDate(oldDate,period);

  if(!newDate){
    jdrNotice("Invalid return date.");
    return;
  }

  const label=slot==="trophy"?"Trophy":"Non-Trophy";
  const duration=period==="week"?"1 Week":"1 Month";

  if(!await jdrConfirm(
    "Please confirm payment has been received.\n\n"+
    "Game: "+(game.name||game.title)+"\n"+
    "Slot: "+label+"\n"+
    "Extension: "+duration+"\n"+
    "Old Return: "+dateToText(oldDate)+"\n"+
    "New Return: "+dateToText(newDate)+"\n\n"+
    "Save extension to Firebase?"
  ))return;

  el.button.disabled=true;

  try{
    const otherSlot=
      slot==="trophy"?"nonTrophy":"trophy";

    const otherStatus=getSlotStatus(game,otherSlot);

    const updates={
      [fields.status]:"currently-rented",
      [fields.date]:dateToText(newDate),
      status:derivedGameStatus(
        slot==="trophy"
          ?"currently-rented"
          :otherStatus,
        slot==="nonTrophy"
          ?"currently-rented"
          :otherStatus,
        game.status
      )
    };

    await commitActivity(
      "extension",
      selectedGameId,
      game,
      `${duration}: ${dateToText(oldDate)} → ${dateToText(newDate)}`,
      {action:"update",data:updates},
      label
    );

    closeModal("manageModal");

    await loadAdminGames();
    await psnSyncFromGames();
    await loadActivityHistory();

    jdrNotice(
      "✅ Rental extended successfully!\n\n"+
      label+" Slot\nNew Return Date: "+
      dateToText(newDate)
    );

  }catch(error){
    console.error(error);
    jdrNotice("Unable to save rental extension.");
  }finally{
    el.button.disabled=false;
  }
}

$("extendTrophy").addEventListener(
  "click",
  ()=>extendRental("trophy")
);

$("extendNonTrophy").addEventListener(
  "click",
  ()=>extendRental("nonTrophy")
);

for(const slot of ["trophy","nonTrophy"]){
  const el=extensionElements(slot);

  el.period.addEventListener(
    "change",
    ()=>updateExtensionPreview(slot)
  );

  el.date.addEventListener(
    "change",
    ()=>updateManageSlotUI(slot)
  );

  el.status.addEventListener(
    "change",
    ()=>updateManageSlotUI(slot)
  );
}

/* UPCOMING GAME CHECKBOX */

for(const prefix of ["newGameStatus","manageStatus"]){
  $(prefix+"Upcoming").addEventListener("change",()=>{
    $(prefix).value=
      $(prefix+"Upcoming").checked
        ?"upcoming"
        :"available";

    if(prefix==="manageStatus"){
      updateManageSlotUI("trophy");
      updateManageSlotUI("nonTrophy");
    }
  });
}

/* ADD NEW GAME */

$("addGameButton").addEventListener("click",()=>{
  fillMediaForm("new",{});
  // RENTPLAY PH uses the same game prices; no separate pricing form.
  coverData.new=null;
  $("newGameCover").value="";
  $("newGameCoverHint").textContent="Choose a photo. It will be resized automatically before saving.";
  showCover("new","");
  openModal("addGameModal");
});

$("saveNewGame").addEventListener("click",async()=>{
  const btn=$("saveNewGame");

  try{
    const title=$("newGameTitle").value.trim();
    const genre=$("newGameGenre").value.trim();
    if($("newGameCover").files.length && !coverData.new)
      throw Error("Please wait for the cover to finish processing.");
    const image=coverData.new||$("newGameImage").value.trim();

    if(!title||!genre||!image){
      throw Error(
        "Please enter title, genre, and image."
      );
    }

    const data={...formGameData("new"),...mediaFromForm("new")};

    const gameId=title.toLowerCase()
      .replace(/[^a-z0-9]+/g,"-")
      .replace(/^-|-$/g,"");

    if(!gameId){
      throw Error("Invalid game title.");
    }

    const existing=await getDocs(
      collection(db,"games")
    );

    if(existing.docs.some(d=>d.id===gameId)){
      throw Error(
        "A game with this title already exists."
      );
    }

    const game={
      title,
      name:title,
      genre,
      type:genre.toLowerCase(),
      image,
      meta:"PS5 • Digital rental",
      ...data
    };

    btn.disabled=true;

    await commitActivity(
      "game-added",
      gameId,
      game,
      "New game added",
      {action:"create",data:game}
    );

    closeModal("addGameModal");

    await loadAdminGames();
    await psnSyncFromGames();
    await loadActivityHistory();

    jdrNotice("New game added successfully! 🎮");

  }catch(error){
    console.error(error);
    jdrNotice(error.message||"Unable to add game.");
  }finally{
    btn.disabled=false;
  }
});

/* DELETE GAME */

$("deleteGame").addEventListener("click",async()=>{
  if(!selectedGameId)return;

  if(!await jdrConfirm("Delete this game permanently?")){
    return;
  }

  try{
    const oldGame=gameCache.get(selectedGameId);

    await commitActivity(
      "game-deleted",
      selectedGameId,
      oldGame,
      "Game removed from catalog",
      {action:"delete"}
    );

    selectedGameId=null;

    closeModal("manageModal");

    await loadAdminGames();
    await psnSyncFromGames();
    await loadActivityHistory();

    jdrNotice("Game deleted successfully.");

  }catch(error){
    console.error(error);
    jdrNotice("Unable to delete game.");
  }
});

/* WAITING LIST */

async function loadWaitingList(){
  const container=$("waitingListContainer");

  container.textContent="Loading reservations...";

  try{
    const snapshot=await getDocs(
      collection(db,"waitingList")
    );

    // Read-only waiting-list display. Never scan each record with getDoc on opening.
    const reservations=snapshot.docs.map(d=>({
      id:d.id,
      ...d.data()
    }));

    reservations.sort((a,b)=>
      (a.createdAt?.seconds||0)-
      (b.createdAt?.seconds||0)
    );

    if(!reservations.length){
      container.textContent=
        "No reservations yet. 🎮";
      return;
    }

    const groups={};

    for(const r of reservations){
      const name=
        r.gameName||
        r.gameId||
        "Unknown Game";

      if(!groups[name]){
        groups[name]={
          trophy:[],
          nonTrophy:[]
        };
      }

      const account=String(
        r.accountType||""
      ).toLowerCase().replace(/[\s-]/g,"");

      if(account.includes("non")){
        groups[name].nonTrophy.push(r);
      }else{
        groups[name].trophy.push(r);
      }
    }

    container.innerHTML="";

    for(const [name,lists] of Object.entries(groups)){
      const group=document.createElement("div");
      group.className="waiting-group";

      const toggle=document.createElement("button");
      toggle.className="waiting-toggle";

      toggle.textContent=
        `🎮 ${name} — ${
          lists.trophy.length+
          lists.nonTrophy.length
        } Waiting`;

      const panel=document.createElement("div");
      panel.className="waiting-panel";

      const columns=document.createElement("div");
      columns.className="waiting-columns";

      for(const [slot,items] of [
        ["🏆 TROPHY",lists.trophy],
        ["🎮 NON-TROPHY",lists.nonTrophy]
      ]){
        const column=document.createElement("div");
        const heading=document.createElement("h4");

        heading.textContent=
          `${slot} (${items.length})`;

        column.appendChild(heading);

        if(!items.length){
          const empty=document.createElement("p");
          empty.textContent="No reservations";
          column.appendChild(empty);
        }

        items.forEach((r,index)=>{
          const card=document.createElement("div");
          card.className="waiting-item";

          const date=r.createdAt?.toDate
            ?r.createdAt.toDate().toLocaleString("en-PH")
            :"Not available";

          const number=document.createElement("small");
          number.textContent=`WAITING #${index+1}`;

          const customer=document.createElement("strong");
          customer.textContent=
            r.customerName||"Unknown Customer";

          const details=document.createElement("div");
          details.textContent=
            `${r.rentalPeriod||"N/A"} • ${date}`;

          const source=document.createElement("div");
          source.style.cssText="display:inline-block;margin:7px 0;padding:5px 9px;border-radius:8px;background:#16345c;color:#c8e4ff;font-weight:700;font-size:11px";
          const brand=String(r.source||"").trim().toLowerCase();
          source.textContent=brand==="rentplay-ph"?"🌐 RENTPLAY PH":brand==="jdigitalsrental"?"🌐 JDIGITALSRENTAL":"🌐 Unverified Source";
          if(brand==="rentplay-ph"){source.style.background="#39245c";source.style.color="#e4caff";}
          else if(brand!=="jdigitalsrental"){source.style.background="#303846";source.style.color="#d0d5df";}

          const remove=document.createElement("button");
          remove.textContent="🗑 Delete";

          remove.addEventListener("click",async()=>{
            if(!await jdrConfirm(
              "Delete this waiting-list reservation?"
            ))return;

            try{
              remove.disabled=true;

              const batch=writeBatch(db);
              batch.delete(doc(db,"waitingList",r.id));
              batch.delete(doc(db,"publicWaitingList",r.id));
              await batch.commit();

              await loadWaitingList();
              await loadAdminGames();

            }catch(error){
              console.error(error);
              jdrNotice("Unable to delete reservation.");
              remove.disabled=false;
            }
          });

          card.append(
            number,
            customer,
            details,
            source,
            remove
          );

          column.appendChild(card);
        });

        columns.appendChild(column);
      }

      panel.appendChild(columns);

      toggle.addEventListener("click",()=>{
        panel.style.display=
          panel.style.display==="block"
            ?"none"
            :"block";
      });

      group.append(toggle,panel);
      container.appendChild(group);
    }

  }catch(error){
    console.error(error);
    container.textContent=
      "Unable to load reservations.";
  }
}

async function showWaitingList(){
  openModal("waitingListModal");
  await loadWaitingList();
}

$("waitingListCard").addEventListener(
  "click",
  showWaitingList
);

$("waitingListCard").addEventListener("keydown",e=>{
  if(e.key==="Enter"||e.key===" "){
    e.preventDefault();
    showWaitingList();
  }
});

/* Open compact customer management panels */
$("openReviewsPanel").addEventListener("click",()=>openModal("reviewsManagementModal"));
$("openBlacklistPanel").addEventListener("click",()=>openModal("blacklistManagementModal"));
/* MODALS AND AUTH */

for(const [button,modal] of [
  ["closeAddGameModal","addGameModal"],
  ["closeManageModal","manageModal"],
  ["closeWaitingListModal","waitingListModal"],
  ["closeReviewsPanel","reviewsManagementModal"],
  ["closeBlacklistPanel","blacklistManagementModal"]
]){
  $(button).addEventListener(
    "click",
    ()=>closeModal(modal)
  );

  $(modal).addEventListener("click",event=>{
    if(event.target===$(modal)){
      closeModal(modal);
    }
  });
}


/* V6.8: One bounded listener, no background collection polling. */
let jdrNotifyUnsubscribe=null;
let jdrNotifyDocs=[];
let jdrNotifyInitialized=false;
const jdrNotifySeenKey='jdr-waiting-notify-seen-v68';
function jdrNotifySeen(){try{return new Set(JSON.parse(localStorage.getItem(jdrNotifySeenKey)||'[]'));}catch{return new Set();}}
function jdrRenderNotifications(){
 const seen=jdrNotifySeen();const fresh=jdrNotifyDocs.filter(x=>!seen.has(x.id));
 document.getElementById('jdrNotifyCount').textContent=String(fresh.length);
 const box=document.getElementById('jdrNotifyItems');box.replaceChildren();
 if(!fresh.length){box.textContent='No unread requests.';return;}
 fresh.forEach(r=>{
  const el=document.createElement('div');el.className='jdr-notify-item';
  const heading=document.createElement('strong');heading.textContent='🎮 '+String(r.gameName||r.gameId||'Game request');
  const info=document.createElement('small');info.textContent='👤 '+String(r.name||r.customerName||r.renterName||'Customer')+' • '+String(r.accountType||'Account not specified')+' • '+String(r.period||r.rentalPeriod||'');
  el.append(heading,info);box.append(el);
 });
}
function jdrStartWaitingNotifications(){
 if(jdrNotifyUnsubscribe)return;
 document.getElementById('jdrNotifyDock').hidden=false;
 const button=document.getElementById('jdrNotifyButton');
 button.onclick=()=>document.getElementById('jdrNotifyPanel').classList.toggle('active');
 document.getElementById('jdrNotifyRead').onclick=()=>{
  const seen=jdrNotifySeen();jdrNotifyDocs.forEach(x=>seen.add(x.id));
  localStorage.setItem(jdrNotifySeenKey,JSON.stringify([...seen].slice(-500)));
  jdrRenderNotifications();
 };
 // Limit to 20 most recently created entries, avoiding a listener over the entire collection.
 jdrNotifyUnsubscribe=onSnapshot(query(collection(db,'waitingList'),orderBy('createdAt','desc'),limit(20)),snap=>{
  jdrNotifyDocs=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(!jdrNotifyInitialized){
   jdrNotifyInitialized=true;
   // First open establishes a baseline; only later arrivals count as new.
   const seen=jdrNotifySeen();jdrNotifyDocs.forEach(x=>seen.add(x.id));
   localStorage.setItem(jdrNotifySeenKey,JSON.stringify([...seen].slice(-500)));
  }
  jdrRenderNotifications();
 },error=>{document.getElementById('jdrNotifyItems').textContent='Unable to load notifications: '+error.message;});
}

/* LOGOUT */

$("logoutButton").addEventListener("click",async()=>{
  await signOut(auth);
  location.href="admin-login.html";
});


/* PHASE 3 — read-only business insights, no additional Firestore writes */
async function loadBusinessOverview(){
  const alertBox=$("bizAlerts"), popularBox=$("bizPopular");
  try{
    const [waitSnap,gameSnap,activitySnap]=await Promise.all([
      getDocs(collection(db,"waitingList")),
      getDocs(collection(db,"games")),
      getDocs(collection(db,"rentalActivity"))
    ]);
    const games=gameSnap.docs.map(d=>({id:d.id,...d.data()}));
    const waiting=waitSnap.docs.map(d=>({id:d.id,...d.data()}));
    const activity=activitySnap.docs.map(d=>d.data());
    const counts=new Map();
    const norm=x=>String(x||"").trim().toLowerCase();
    const accountSlot=x=>norm(x).replace(/[\s-]/g,"").includes("non")?"nonTrophy":"trophy";
    for(const r of waiting){
      const game=games.find(g=>r.gameId===g.id)||games.find(g=>norm(gameName(g))===norm(r.gameName));
      const key=game?.id||norm(r.gameId||r.gameName)||"unknown";
      if(!counts.has(key))counts.set(key,{game,gameLabel:game?gameName(game):String(r.gameName||r.gameId||"Unknown Game"),total:0,trophy:0,nonTrophy:0});
      const item=counts.get(key);
      item.total++;
      item[accountSlot(r.accountType)]++;
    }
    $("bizWaiting").textContent=waiting.length;
    $("bizDemandGames").textContent=counts.size;
    $("bizExtensions").textContent=activity.filter(a=>a.type==="extension").length;
    $("bizReturns").textContent=activity.filter(a=>a.type==="return").length;
    const ranked=[...counts.values()].sort((a,b)=>b.total-a.total||a.gameLabel.localeCompare(b.gameLabel));
    popularBox.replaceChildren();
    if(!ranked.length)popularBox.textContent="No waiting-list requests yet.";
    ranked.slice(0,10).forEach((r,i)=>{
      const row=document.createElement("div");row.className="business-row";
      const strong=document.createElement("strong");strong.textContent=`${i+1}. ${r.gameLabel} — ${r.total} request(s)`;
      const small=document.createElement("small");small.textContent=`🏆 Trophy: ${r.trophy} • 🎮 Non-Trophy: ${r.nonTrophy}`;
      row.append(strong,small);popularBox.append(row);
    });
    alertBox.replaceChildren();
    let alerts=0;
    for(const r of ranked){
      if(!r.game||r.game.status==="upcoming")continue;
      for(const slot of ["trophy","nonTrophy"]){
        if(!r[slot]||getSlotStatus(r.game,slot)!=="available")continue;
        alerts++;
        const row=document.createElement("div");row.className="business-row";
        const label=slot==="trophy"?"🏆 Trophy":"🎮 Non-Trophy";
        const strong=document.createElement("strong");strong.textContent=`🟢 ${r.gameLabel} — ${label} AVAILABLE`;
        const small=document.createElement("small");small.textContent=`${r[slot]} waiting request(s). Check queue order before contacting customers.`;
        const btn=document.createElement("button");btn.type="button";btn.textContent="📋 Open Waiting List";
        btn.addEventListener("click",()=>{openModal("waitingListModal");loadWaitingList().catch(console.error)});
        row.append(strong,small,btn);alertBox.append(row);
      }
    }
    if(!alerts)alertBox.textContent="✅ No available slots with waiting customers right now.";
  }catch(error){
    console.error("Business overview:",error);
    alertBox.textContent="Unable to load business alerts. Check Firestore permissions.";
    popularBox.textContent="Unable to load rankings.";
  }
}
$("bizRefresh").addEventListener("click",loadBusinessOverview);


/* PHASE 4 — FACEBOOK RECOMMENDATIONS ADMIN */
let reviewCache=new Map();
const reviewMessage=(msg)=>{$("reviewMessage").textContent=msg;};
function reviewReset(){
  $("reviewForm").reset();
  $("reviewEditId").value="";
  $("reviewSaveBtn").textContent="💾 Save Review";
}
function reviewSafeUrl(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  const url=new URL(raw);
  if(url.protocol!=="https:" || !/(^|\.)facebook\.com$/.test(url.hostname.toLowerCase()) &&
     !/(^|\.)fb\.com$/.test(url.hostname.toLowerCase()))
    throw Error("Use an HTTPS Facebook review or Page URL.");
  return url.href;
}
async function loadAdminReviews(){
  const list=$("reviewList");
  try{
    const snap=await getDocs(collection(db,"reviews"));
    const reviews=snap.docs.map(d=>({id:d.id,...d.data()}));
    reviewCache=new Map(reviews.map(r=>[r.id,r]));
    reviews.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    list.replaceChildren();
    if(!reviews.length){list.textContent="No reviews added yet.";return;}
    for(const r of reviews){
      const row=document.createElement("div");row.className="review-entry";
      const name=document.createElement("strong");name.textContent=r.customerName||"Unnamed";
      const status=document.createElement("span");status.className="review-badge";
      status.textContent=r.published?" · 🟢 Published":" · ⚪ Unpublished";
      const body=document.createElement("p");body.textContent=r.text||"";
      const actions=document.createElement("div");actions.className="review-actions";
      const edit=document.createElement("button");edit.textContent="✏️ Edit";
      edit.onclick=()=>{
        $("reviewEditId").value=r.id;
        $("reviewCustomerName").value=r.customerName||"";
        $("reviewText").value=r.text||"";
        $("reviewSourceUrl").value=r.sourceUrl||"";
        $("reviewPublished").checked=r.published===true;
        $("reviewSaveBtn").textContent="💾 Update Review";
        openModal("reviewsManagementModal");$("reviewManagement").scrollIntoView({behavior:"smooth"});
      };
      const toggle=document.createElement("button");
      toggle.textContent=r.published?"Unpublish":"Publish";
      toggle.onclick=async()=>{
        try{
          toggle.disabled=true;
          await updateDoc(doc(db,"reviews",r.id),{published:!r.published,updatedAt:serverTimestamp()});
          await loadAdminReviews();
        }catch(e){jdrNotice("Unable to update review: "+e.message);toggle.disabled=false;}
      };
      const del=document.createElement("button");del.className="danger";del.textContent="🗑️ Delete";
      del.onclick=async()=>{
        if(!await jdrConfirm("Permanently delete this review by "+(r.customerName||"customer")+"?"))return;
        try{del.disabled=true;await deleteDoc(doc(db,"reviews",r.id));reviewReset();await loadAdminReviews();}
        catch(e){jdrNotice("Unable to delete review: "+e.message);del.disabled=false;}
      };
      actions.append(edit,toggle,del);
      row.append(name,status,body,actions);
      if(r.sourceUrl){
        const link=document.createElement("a");link.href=r.sourceUrl;
        link.target="_blank";link.rel="noopener noreferrer";link.textContent="↗ View on Facebook";
        row.append(link);
      }
      list.append(row);
    }
  }catch(e){list.textContent="Unable to load reviews: "+e.message;}
}
$("reviewForm").addEventListener("submit",async(e)=>{
  e.preventDefault();
  const button=$("reviewSaveBtn");
  try{
    if(auth.currentUser?.uid!=="4APTlwgwMTNSsdpp76jWwDiEZxp1")throw Error("Admin sign-in required.");
    const customerName=$("reviewCustomerName").value.trim();
    const reviewText=$("reviewText").value.trim();
    if(!customerName||!reviewText)throw Error("Customer name and review text are required.");
    const data={
      customerName,text:reviewText,sourceUrl:reviewSafeUrl($("reviewSourceUrl").value),
      published:$("reviewPublished").checked,source:"Facebook Recommendation",
      updatedAt:serverTimestamp()
    };
    button.disabled=true;reviewMessage("Saving review…");
    const id=$("reviewEditId").value;
    if(id)await updateDoc(doc(db,"reviews",id),data);
    else await setDoc(doc(collection(db,"reviews")),{...data,createdAt:serverTimestamp()});
    reviewReset();reviewMessage("✅ Review saved successfully.");
    await loadAdminReviews();
  }catch(err){reviewMessage("❌ "+err.message);}
  finally{button.disabled=false;}
});
$("reviewCancelEdit").addEventListener("click",reviewReset);
$("reviewReload").addEventListener("click",loadAdminReviews);


/* CUSTOMER VERIFICATION — per waiting request + safety record; admin-only */
let safetyAlertLoading=false;
function verificationKey(waitId,safetyId){
  // A stable, collision-resistant Firestore document ID for this specific pair.
  return encodeURIComponent(waitId)+"__"+encodeURIComponent(safetyId);
}
function verificationTime(value){
  return value?.toDate?.()?.toLocaleString("en-PH",{timeZone:"Asia/Manila"})||"Pending";
}
async function setCustomerVerification(request,record,decision){
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin sign-in required.");
  const isConfirmed=decision==="confirmed";
  const promptText=isConfirmed
    ?"CONFIRMED MATCH: You have checked the Facebook profile or other reliable evidence and verified this is the same customer. Enter a brief verification reason:"
    :"DIFFERENT PERSON: You have verified this waiting-list renter is NOT the person in the safety record. Enter a brief verification reason:";
  const reason=prompt(promptText);
  if(reason===null)return;
  if(!reason.trim()||reason.trim().length<8){jdrNotice("Please enter a reason of at least 8 characters.");return;}
  if(!await jdrConfirm((isConfirmed?"Confirm identity match":"Mark as a different person")+" for this specific waiting-list request?\nThis will be recorded in private verification history."))return;
  const key=verificationKey(request.id,record.id);
  const ref=doc(db,"customerVerifications",key);
  const existing=await getDoc(ref);
  const batch=writeBatch(db);
  batch.set(ref,{
    waitingId:request.id,safetyId:record.id,
    customerName:String(request.customerName||""),
    safetyName:String(record.customerName||""),
    gameName:String(request.gameName||request.gameId||""),
    decision,reason:reason.trim().slice(0,1000),
    verifiedBy:auth.currentUser.uid,
    updatedAt:serverTimestamp(),
    ...(!existing.exists()?{createdAt:serverTimestamp()}:{})
  },{merge:true});
  batch.set(doc(collection(db,"customerVerificationHistory")),{
    waitingId:request.id,safetyId:record.id,
    customerName:String(request.customerName||""),
    decision,reason:reason.trim().slice(0,1000),
    verifiedBy:auth.currentUser.uid,createdAt:serverTimestamp()
  });
  await batch.commit();
  await refreshCustomerSafetyAlerts();
}
async function refreshCustomerSafetyAlerts(){
  if(safetyAlertLoading||auth.currentUser?.uid!==ADMIN_UID)return;
  safetyAlertLoading=true;
  const target=$("customerSafetyAlerts");
  try{
    const [safetySnap,waitingSnap,verificationSnap,historySnap]=await Promise.all([
      getDocs(collection(db,"customerSafety")),
      getDocs(collection(db,"waitingList")),
      getDocs(collection(db,"customerVerifications")),
      getDocs(collection(db,"customerVerificationHistory"))
    ]);
    const records=safetySnap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(r=>["warning","blacklisted"].includes(r.status));
    const waiting=waitingSnap.docs.map(d=>({id:d.id,...d.data()}));
    const decisions=new Map(verificationSnap.docs.map(d=>[d.id,d.data()]));
    const history=historySnap.docs.map(d=>d.data());
    const byName=new Map();
    for(const r of records){
      const key=normalizeCustomerName(r.customerName);
      if(!key)continue;
      if(!byName.has(key))byName.set(key,[]);
      byName.get(key).push(r);
    }
    const matches=[];
    for(const request of waiting){
      const name=String(request.customerName||"").trim();
      if(!name)continue;
      for(const record of byName.get(normalizeCustomerName(name))||[]){
        const key=verificationKey(request.id,record.id);
        const decision=decisions.get(key);
        // Re-verify if the request or safety-record name has changed.
        const current=decision&&normalizeCustomerName(decision.customerName)===normalizeCustomerName(name)
          &&normalizeCustomerName(decision.safetyName)===normalizeCustomerName(record.customerName);
        matches.push({request,record,name,decision:current?decision:null});
      }
    }
    matches.sort((a,b)=>{
      const rank=m=>m.decision?.decision==="confirmed"?0:m.decision?.decision==="different"?2:1;
      return rank(a)-rank(b)||(a.record.status==="blacklisted"?-1:1)-(b.record.status==="blacklisted"?-1:1);
    });
    target.replaceChildren();
    if(!matches.length){
      const p=document.createElement("p");p.className="priority-empty";
      p.textContent="🛡️ No exact-name warning/blacklist matches in the waiting list.";
      target.append(p);return;
    }
    const summary=document.createElement("p");summary.style.color="#ffda86";
    const pending=matches.filter(m=>!m.decision).length;
    const confirmed=matches.filter(m=>m.decision?.decision==="confirmed").length;
    const different=matches.filter(m=>m.decision?.decision==="different").length;
    summary.textContent=`🛡️ ${pending} unverified • ${confirmed} confirmed match(es) • ${different} verified different person(s).`;
    target.append(summary);
    for(const {request,record,name,decision} of matches){
      const row=document.createElement("div");row.className="priority-item";
      const info=document.createElement("div");
      const title=document.createElement("strong");
      const confirmedMatch=decision?.decision==="confirmed";
      const differentPerson=decision?.decision==="different";
      title.style.color=differentPerson?"#70ffb1":confirmedMatch?"#ff9292":record.status==="blacklisted"?"#ff9b9b":"#ffda86";
      title.textContent=(differentPerson?"🟢 VERIFIED DIFFERENT PERSON":confirmedMatch?"🔴 CONFIRMED CUSTOMER MATCH":record.status==="blacklisted"?"🔴 POSSIBLE BLACKLIST MATCH":"🟡 POSSIBLE WARNING MATCH")+" — "+name;
      const detail=document.createElement("small");
      detail.textContent="Requested game: "+String(request.gameName||request.gameId||"Not specified")+
        " • Slot: "+String(request.accountType||"Not specified")+
        " • Safety status: "+record.status+" • "+(differentPerson?"Verified as different individual.":confirmedMatch?"Identity confirmed by admin.":"Name match only; verify identity.");
      info.append(title,detail);
      if(decision){
        const meta=document.createElement("div");meta.className="verify-history";
        meta.textContent="Latest verification: "+verificationTime(decision.updatedAt)+" • Reason: "+(decision.reason||"");
        info.append(meta);
      }
      const actions=document.createElement("div");actions.className="verify-actions";
      const view=document.createElement("button");view.type="button";view.textContent="🔎 View Record";
      view.addEventListener("click",()=>{$("blacklistSearch").value=name;renderBlacklist();openModal("blacklistManagementModal");$("blacklistManagement").scrollIntoView({behavior:"smooth"});});
      const safe=document.createElement("button");safe.type="button";safe.className="verify-safe";safe.textContent="🟢 Different Person";
      const confirmBtn=document.createElement("button");confirmBtn.type="button";confirmBtn.className="verify-danger";confirmBtn.textContent="🔴 Confirm Match";
      for(const [button,value] of [[safe,"different"],[confirmBtn,"confirmed"]]){
        button.addEventListener("click",async()=>{
          safe.disabled=confirmBtn.disabled=true;
          try{await setCustomerVerification(request,record,value)}
          catch(e){jdrNotice("Unable to save verification: "+e.message)}
          finally{safe.disabled=confirmBtn.disabled=false}
        });
      }
      actions.append(view,safe,confirmBtn);
      row.append(info,actions);target.append(row);
    }
    const historyHeading=document.createElement("details");
    historyHeading.style.marginTop="12px";
    const summaryEl=document.createElement("summary");summaryEl.textContent="📋 Verification History (latest 30)";
    summaryEl.style.cursor="pointer";historyHeading.append(summaryEl);
    history.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if(!history.length){const empty=document.createElement("p");empty.textContent="No verification decisions yet.";historyHeading.append(empty)}
    for(const entry of history.slice(0,30)){
      const line=document.createElement("div");line.className="verify-history";
      line.textContent=verificationTime(entry.createdAt)+" • "+(entry.customerName||"Customer")+" • "+
        (entry.decision==="confirmed"?"Confirmed match":"Different person")+" • "+(entry.reason||"");
      historyHeading.append(line);
    }
    target.append(historyHeading);
  }catch(error){
    console.error("Customer safety verification check:",error);
    target.textContent="⚠️ Unable to load customer safety verification. Check Firestore permissions for customerVerifications and customerVerificationHistory. "+(error.code||"");
  }finally{safetyAlertLoading=false;}
}

/* CUSTOMER SAFETY — ADMIN ONLY; manual review, no public access */
let blacklistCache=[];
const normalizeCustomerName = v=>String(v||"").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g," ");
function safeBlacklistUrl(raw){
 const v=String(raw||"").trim();if(!v)return "";
 const u=new URL(v);
 if(u.protocol!=="https:")throw Error("Only HTTPS links are allowed.");
 return u.href;
}
function resetBlacklistForm(){
 $("blacklistForm").reset();$("blacklistEditId").value="";
 $("blacklistSave").textContent="💾 Save Customer Record";
}
const evidenceBlobs=new Set();
function evidenceShow(blob){const url=URL.createObjectURL(blob);evidenceBlobs.add(url);$("evidenceLightboxImage").src=url;$("evidenceLightbox").classList.add("active");}
$("evidenceLightboxClose").onclick=()=>{$("evidenceLightbox").classList.remove("active");$("evidenceLightboxImage").removeAttribute("src");for(const url of evidenceBlobs)URL.revokeObjectURL(url);evidenceBlobs.clear();};
async function loadEvidenceGallery(recordId,box){
 try{
  const snap=await getDocs(collection(db,"customerSafety",recordId,"evidence"));
  box.replaceChildren();
  if(snap.empty){const empty=document.createElement("small");empty.textContent="No screenshots yet.";box.append(empty);return;}
  for(const d of snap.docs){
   const e=d.data(),tile=document.createElement("div");tile.className="evidence-tile";
   const img=document.createElement("img");img.alt="Private evidence screenshot";img.loading="lazy";
   const label=document.createElement("small");label.textContent=(e.name||"Screenshot")+" • "+(e.createdAt?.toDate?.()?.toLocaleDateString("en-PH")||"Saved");
   const open=document.createElement("button");open.type="button";open.textContent="🔎 View";
   const remove=document.createElement("button");remove.type="button";remove.textContent="🗑️ Delete";
   let cached=null;
   const fetchImage=async()=>{if(!cached)cached=await getBlob(storageRef(evidenceStorage,e.path));return cached;};
   open.onclick=async()=>{try{evidenceShow(await fetchImage());}catch(err){jdrNotice("Cannot open evidence: "+err.message);}};
   remove.onclick=async()=>{if(!await jdrConfirm("Permanently delete this screenshot?"))return;try{remove.disabled=true;await deleteObject(storageRef(evidenceStorage,e.path));await deleteDoc(d.ref);await loadEvidenceGallery(recordId,box);}catch(err){jdrNotice("Delete failed: "+err.message);remove.disabled=false;}};
   tile.append(img,label,open,remove);box.append(tile);
   fetchImage().then(blob=>{if(img.isConnected){const url=URL.createObjectURL(blob);img.src=url;img.addEventListener("load",()=>URL.revokeObjectURL(url),{once:true});}}).catch(()=>{img.alt="Preview unavailable — tap View";});
  }
 }catch(err){box.textContent="⚠️ Evidence unavailable: "+err.message;}
}
async function uploadEvidenceFiles(recordId,files,button){
 const status=$("blacklistUploadStatus");button.disabled=true;
 try{
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin sign-in required.");
  for(let i=0;i<files.length;i++){
   const f=files[i];
   if(!["image/jpeg","image/png","image/webp"].includes(f.type))throw Error("Only JPG, PNG, and WebP screenshots are allowed.");
   if(f.size>5*1024*1024)throw Error(f.name+" is over 5 MB.");
   status.textContent=`Uploading ${i+1} of ${files.length}: ${f.name}`;
   const id=doc(collection(db,"customerSafety",recordId,"evidence")).id;
   const ext=f.type==="image/png"?"png":f.type==="image/webp"?"webp":"jpg";
   const path=`blacklistEvidence/${recordId}/${id}.${ext}`;
   await uploadBytes(storageRef(evidenceStorage,path),f,{contentType:f.type,customMetadata:{ownerUid:ADMIN_UID}});
   try{await setDoc(doc(db,"customerSafety",recordId,"evidence",id),{path,name:f.name.slice(0,120),size:f.size,createdAt:serverTimestamp()});}
   catch(err){await deleteObject(storageRef(evidenceStorage,path)).catch(()=>{});throw err;}
  }
  status.textContent=`✅ Uploaded ${files.length} screenshot(s) privately.`;$("blacklistFiles").value="";
  await loadBlacklist();
 }catch(err){status.textContent="❌ "+err.message;}finally{button.disabled=false;}
}
async function deleteAllEvidence(recordId){
 const snap=await getDocs(collection(db,"customerSafety",recordId,"evidence"));
 for(const d of snap.docs){const e=d.data();if(e.path)await deleteObject(storageRef(evidenceStorage,e.path));await deleteDoc(d.ref);}
}
function renderBlacklist(){
 const list=$("blacklistList");list.replaceChildren();
 const term=normalizeCustomerName($("blacklistSearch").value);
 const filtered=blacklistCache.filter(r=>!term||normalizeCustomerName(r.customerName).includes(term));
 const match=$("blacklistMatches");match.replaceChildren();
 if(term){
   const exact=blacklistCache.filter(r=>normalizeCustomerName(r.customerName)===term);
   const message=document.createElement("p");
   message.className=exact.some(r=>r.status==="blacklisted")?"blacklist-flag":"";
   message.textContent=exact.length
     ?`⚠️ ${exact.length} matching name record(s). Possible match only — verify Facebook profile and rental history.`
     :"No exact name match. This does not verify identity or guarantee good standing.";
   match.append(message);
 }
 if(!filtered.length){list.textContent="No matching customer records.";return;}
 for(const r of filtered){
   const row=document.createElement("article");row.className="blacklist-entry";
   const title=document.createElement("strong");
   title.className=r.status==="blacklisted"?"blacklist-flag":r.status==="warning"?"blacklist-warn":"";
   title.textContent=({blacklisted:"🔴 BLACKLISTED",warning:"🟡 WARNING",good:"🟢 GOOD STANDING"}[r.status]||"Record")+" — "+r.customerName;
   const info=document.createElement("small");info.textContent="Game: "+(r.gameName||"Not specified")+" • Reason: "+(r.reason||"Not specified");
   const date=document.createElement("small");date.textContent="Last updated: "+(r.updatedAt?.toDate?.()?.toLocaleString("en-PH")||"Pending");
   row.append(title,info,date);
   if(r.facebookUrl){const link=document.createElement("a");link.href=r.facebookUrl;link.textContent="↗ Facebook profile";link.target="_blank";link.rel="noopener noreferrer";row.append(link);}
   if(r.evidenceUrl){const link=document.createElement("a");link.href=r.evidenceUrl;link.textContent=" • ↗ Restricted evidence";link.target="_blank";link.rel="noopener noreferrer";row.append(link);}
   const gallery=document.createElement("div");gallery.className="evidence-gallery";
   const galleryHead=document.createElement("small");galleryHead.textContent="📸 Private Evidence Gallery";
   row.append(galleryHead,gallery);
   loadEvidenceGallery(r.id,gallery);
   const actions=document.createElement("div");actions.className="blacklist-actions";
   const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Edit";
   edit.onclick=()=>{
     $("blacklistEditId").value=r.id;$("blacklistName").value=r.customerName||"";
     $("blacklistFacebook").value=r.facebookUrl||"";$("blacklistGame").value=r.gameName||"";
     $("blacklistStatus").value=r.status||"warning";$("blacklistReason").value=r.reason||"";
     $("blacklistEvidence").value=r.evidenceUrl||"";
     $("blacklistSave").textContent="💾 Update Record";
     openModal("blacklistManagementModal");$("blacklistManagement").scrollIntoView({behavior:"smooth"});
   };
   const del=document.createElement("button");del.type="button";del.textContent="🗑️ Delete";
   del.onclick=async()=>{
     if(!await jdrConfirm("Permanently delete the private record for "+r.customerName+"?"))return;
     try{del.disabled=true;await deleteAllEvidence(r.id);await deleteDoc(doc(db,"customerSafety",r.id));await loadBlacklist();await refreshCustomerSafetyAlerts();}
     catch(e){jdrNotice("Delete failed: "+e.message);del.disabled=false;}
   };
   const upload=document.createElement("button");upload.type="button";upload.textContent="📸 Upload to Google Drive";
   upload.onclick=()=>{const base=GOOGLE_DRIVE_UPLOAD_URL;if(!base||base.includes("PASTE_YOUR")){jdrNotice("Set GOOGLE_DRIVE_UPLOAD_URL in admin.html after deploying your Apps Script web app.");return;}const url=new URL(base);url.searchParams.set("customer",r.customerName||"");window.open(url.toString(),"_blank","noopener,noreferrer");};
   actions.append(edit,upload,del);row.append(actions);list.append(row);
 }
}
async function loadBlacklist(){
 try{
   const snap=await getDocs(collection(db,"customerSafety"));
   blacklistCache=snap.docs.map(d=>({id:d.id,...d.data()}))
     .sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
   renderBlacklist();
 }catch(e){$("blacklistList").textContent="Unable to load private records: "+e.message;}
}
$("blacklistForm").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$("blacklistSave");
 try{
   if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin sign-in required.");
   const customerName=$("blacklistName").value.trim(),reason=$("blacklistReason").value.trim();
   if(!customerName||!reason)throw Error("Customer name and incident reason are required.");
   const data={customerName,normalizedName:normalizeCustomerName(customerName),
     facebookUrl:safeBlacklistUrl($("blacklistFacebook").value),
     gameName:$("blacklistGame").value.trim(),status:$("blacklistStatus").value,
     reason,evidenceUrl:safeBlacklistUrl($("blacklistEvidence").value),
     updatedAt:serverTimestamp()};
   const id=$("blacklistEditId").value;btn.disabled=true;
   if(id)await updateDoc(doc(db,"customerSafety",id),data);
   else await setDoc(doc(collection(db,"customerSafety")),{...data,createdAt:serverTimestamp()});
   resetBlacklistForm();$("blacklistMessage").textContent="✅ Customer record saved privately.";
   await loadBlacklist();
   await refreshCustomerSafetyAlerts();
 }catch(err){$("blacklistMessage").textContent="❌ "+err.message;}
 finally{btn.disabled=false;}
});
$("blacklistReset").addEventListener("click",resetBlacklistForm);
$("blacklistReload").addEventListener("click",loadBlacklist);
$("blacklistSearch").addEventListener("input",renderBlacklist);


/* PRIVATE PSN ACCOUNTS + RENTERS (MANUAL + GAME SLOT AUTO-SYNC) */
let psnAccounts=[],psnRentals=[],psnHistory=[];
const psnSlotLabel=s=>s==="trophy"?"🏆 Trophy":"🎮 Non-Trophy";
const psnGameTitle=id=>gameName(gameCache.get(id)||{name:"Unknown / deleted game"});
const psnOption=(value,label)=>{const o=document.createElement("option");o.value=value;o.textContent=label;return o;};
function psnMsg(id,msg){$(id).textContent=msg;}
function psnGameChoices(){
 const select=$("psnGames");const chosen=new Set([...select.selectedOptions].map(o=>o.value));select.replaceChildren();
 for(const [id,g] of [...gameCache].sort((a,b)=>gameName(a[1]).localeCompare(gameName(b[1])))){
  const o=psnOption(id,gameName(g));o.selected=chosen.has(id);select.append(o);
 }
}
function psnAccountChoices(){
 const s=$("psnRentalAccount"),previous=s.value;s.replaceChildren(psnOption("","Select PSN account"));
 for(const a of psnAccounts)s.append(psnOption(a.id,a.email+(a.region?" • "+a.region:"")));
 if(psnAccounts.some(a=>a.id===previous))s.value=previous;
 psnRentalGameChoices();
}
function psnRentalGameChoices(){
 const s=$("psnRentalGame"),previous=s.value,a=psnAccounts.find(a=>a.id===$("psnRentalAccount").value);
 s.replaceChildren(psnOption("","Select game"));
 for(const id of a?.gameIds||[])s.append(psnOption(id,psnGameTitle(id)));
 if((a?.gameIds||[]).includes(previous))s.value=previous;
}
function psnClearAccount(){
 $("psnAccountForm").reset();$("psnAccountEditId").value="";
 [...$("psnGames").options].forEach(o=>o.selected=false);$("psnAccountSave").textContent="💾 Save Account";
}
function psnClearRental(){
 $("psnRentalForm").reset();$("psnRentalEditId").value="";$("psnExtendAmount").value="";
 $("psnRentalSave").textContent="💾 Save Assignment";
 if(jdrRentalsMounted)jdrGameRentalFilter();
 else psnRentalGameChoices();
}
function psnLine(parent,tag,content){const e=document.createElement(tag);e.textContent=content;parent.append(e);return e;}
let psnLibraryView="table";
function psnLibraryEdit(accountId){
 closeModal("psnLibraryModal");openModal("psnManagementModal");
 const a=psnAccounts.find(x=>x.id===accountId);
 if(!a)return;
 $("psnAccountEditId").value=a.id;$("psnEmail").value=a.email;
 $("psnRegion").value=a.region||"";$("psnOnlineId").value=a.onlineId||"";
 $("psnNotes").value=a.notes||"";
 for(const o of $("psnGames").options)o.selected=(a.gameIds||[]).includes(o.value);
 $("psnAccountSave").textContent="💾 Update Account";
 $("psnAccountForm").scrollIntoView({block:"center"});
}
function psnLibraryRender(){
 const box=$("psnLibraryList");if(!box)return;box.replaceChildren();
 const q=$("psnLibrarySearch").value.trim().toLowerCase();
 const rows=psnAccounts.filter(a=>[a.email,a.region,a.onlineId,...(a.gameIds||[]).map(psnGameTitle)].join(" ").toLowerCase().includes(q));
 $("psnLibraryTable").setAttribute("aria-pressed",String(psnLibraryView==="table"));
 $("psnLibraryCards").setAttribute("aria-pressed",String(psnLibraryView==="cards"));
 $("psnLibrarySummary").textContent=`${rows.length} matching account(s) • ${psnAccounts.length} saved account(s) • ${new Set(psnAccounts.flatMap(a=>a.gameIds||[])).size} unique linked game(s)`;
 if(!rows.length){psnLine(box,"p","No saved PSN accounts match. Use Add Account to save one.");return;}
 const editButton=(a)=>{const b=document.createElement("button");b.type="button";b.className="library-action";b.textContent="✏️ Edit";b.onclick=()=>psnLibraryEdit(a.id);return b;};
 if(psnLibraryView==="cards"){
  const grid=document.createElement("div");grid.className="library-cards";
  for(const a of rows){
   const card=document.createElement("article");card.className="library-card";
   psnLine(card,"h3","📧 "+a.email);
   psnLine(card,"small","🌏 "+(a.region||"Region not set")+(a.onlineId?" • "+a.onlineId:""));
   psnLine(card,"small",`${(a.gameIds||[]).length} game(s) owned`);
   const games=document.createElement("div");games.className="library-games";
   if(!(a.gameIds||[]).length)psnLine(games,"span","No games linked");
   for(const id of a.gameIds||[])psnLine(games,"span",psnGameTitle(id));
   card.append(games,editButton(a));grid.append(card);
  }
  box.append(grid);return;
 }
 const wrap=document.createElement("div");wrap.className="library-table-wrap";
 const table=document.createElement("table");table.className="library-table";
 const head=document.createElement("thead"),hr=document.createElement("tr");
 for(const h of ["PSN Email","Region","Games Owned","Total","Action"])psnLine(hr,"th",h);
 head.append(hr);table.append(head);
 const body=document.createElement("tbody");
 for(const a of rows){const tr=document.createElement("tr");
  psnLine(tr,"td",a.email);psnLine(tr,"td",a.region||"—");
  psnLine(tr,"td",(a.gameIds||[]).map(psnGameTitle).join(", ")||"No games linked");
  psnLine(tr,"td",String((a.gameIds||[]).length));
  const td=document.createElement("td");td.append(editButton(a));tr.append(td);body.append(tr);
 }
 table.append(body);wrap.append(table);box.append(wrap);
}
$("openPsnLibrary").onclick=()=>{openModal("psnLibraryModal");psnLoad();};
$("closePsnLibrary").onclick=()=>closeModal("psnLibraryModal");
$("psnLibrarySearch").oninput=psnLibraryRender;
$("psnLibraryTable").onclick=()=>{psnLibraryView="table";psnLibraryRender();};
$("psnLibraryCards").onclick=()=>{psnLibraryView="cards";psnLibraryRender();};
$("psnLibraryRefresh").onclick=psnLoad;
$("psnLibraryAdd").onclick=()=>{closeModal("psnLibraryModal");psnClearAccount();openModal("psnManagementModal");$("psnAccountForm").scrollIntoView({block:"center"});};
function psnRender(){
 const box=$("psnAccountList");box.replaceChildren();
 const q=$("psnSearch").value.trim().toLowerCase();
 const mode=$("psnSearchMode").value;
 const matches=psnAccounts.filter(a=>{
  if(!q)return true;
  if(mode==="email")return (a.email||"").toLowerCase().includes(q);
  return (a.gameIds||[]).some(id=>psnGameTitle(id).toLowerCase().includes(q));
 });
 if(!matches.length)psnLine(box,"p","No matching PSN accounts. Add one above.");
 for(const a of matches){
  const card=document.createElement("div");card.className="psn-entry";
  psnLine(card,"strong","📧 "+a.email);psnLine(card,"small","🌏 "+(a.region||"Region not set")+(a.onlineId?" • PSN ID: "+a.onlineId:""));
  psnLine(card,"small","🎮 Games: "+(a.gameIds||[]).map(psnGameTitle).join(", "));
  if(a.notes)psnLine(card,"small","📝 "+a.notes);
  const actions=document.createElement("div");actions.className="psn-actions";
  const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Edit Account";
  edit.onclick=()=>{$("psnAccountEditId").value=a.id;$("psnEmail").value=a.email;$("psnRegion").value=a.region||"";$("psnOnlineId").value=a.onlineId||"";$("psnNotes").value=a.notes||"";for(const o of $("psnGames").options)o.selected=(a.gameIds||[]).includes(o.value);$("psnAccountSave").textContent="💾 Update Account";$("psnAccountForm").scrollIntoView({behavior:"smooth",block:"center"});};
  const del=document.createElement("button");del.type="button";del.className="psn-danger";del.textContent="🗑️ Delete Account";
  del.onclick=async()=>{if(psnRentals.some(r=>r.accountId===a.id&&r.status!=="returned")){jdrNotice("Return or reassign active renters first.");return;}if(!await jdrConfirm("Delete this PSN account? Rental history remains."))return;try{await deleteDoc(doc(db,"psnAccounts",a.id));await psnLoad();await Promise.all((a.gameIds||[]).map(gid=>jdrRefreshPublicSlotsForGame(gid)));}catch(e){jdrNotice(e.message);}};
  actions.append(edit,del);card.append(actions);box.append(card);
 }
 const rentalBox=$("rentalList");rentalBox.replaceChildren();
 const rentalQuery=$("rentalSearch").value.trim().toLowerCase();
 const rentals=psnRentals.filter(r=>{
  if(jdrRentalsMounted && (!jdrRentalScopeGameId || r.gameId!==jdrRentalScopeGameId))return false;
  const account=psnAccounts.find(a=>a.id===r.accountId);
  return [r.renterName,psnGameTitle(r.gameId),account?.email||"",r.slot,r.status].join(" ").toLowerCase().includes(rentalQuery);
 }).sort((a,b)=>(a.status==="returned")-(b.status==="returned") || (a.returnDate||"").localeCompare(b.returnDate||""));
 if(!rentals.length)psnLine(rentalBox,"p",jdrRentalsMounted?"No renters found for this game.":"No matching rental records.");
 for(const r of rentals){
  const account=psnAccounts.find(a=>a.id===r.accountId);
  const card=document.createElement("div");card.className="psn-entry";
  psnLine(card,"strong","👤 "+(r.renterName||"Unknown renter"));
  psnLine(card,"small","🎮 "+psnGameTitle(r.gameId)+" • "+psnSlotLabel(r.slot));
  psnLine(card,"small","📧 "+(account?.email||"Account unavailable"));
  psnLine(card,"small",(r.status==="returned"?"🟢 Returned":r.returnDate&&r.returnDate<todayISO()?"🔴 Overdue":"🔴 Currently Rented")+" • Start: "+(r.startDate||"Not set")+" • Return: "+(r.returnDate||"Not set"));
  const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Edit Renter";
  edit.onclick=()=>{ $("psnRentalEditId").value=r.id;$("psnRentalAccount").value=r.accountId;psnRentalGameChoices();$("psnRentalGame").value=r.gameId;$("psnRentalSlot").value=r.slot;$("psnRenterName").value=r.renterName;$("psnStartDate").value=r.startDate||"";$("psnReturnDate").value=r.returnDate||"";$("psnRentalStatus").value=r.status;$("psnRentalSave").textContent="💾 Update Assignment";$("psnRentalForm").scrollIntoView({behavior:"smooth",block:"center"});};
  card.append(edit);
  if(r.status==='rented'){
   psnLine(card,'small','Plan: '+(jdrSwapLabels[r.rentalPlan]||'Not configured')+' • Recorded swaps: '+(r.swapCount||0));
   const swap=document.createElement('button');swap.type='button';swap.textContent='🔄 Swap Game';swap.style.cssText='margin:8px;background:#12543d;border-color:#32a77b';swap.onclick=()=>jdrOpenSwap(r);card.append(swap);
  }
  rentalBox.append(card);
 }
 const history=$("psnRentalHistory");history.replaceChildren();
 if(!psnHistory.some(h=>!jdrRentalsMounted || (jdrRentalScopeGameId && h.gameId===jdrRentalScopeGameId)))psnLine(history,"p","No rental history for this game yet.");
 for(const h of psnHistory.filter(h=>!jdrRentalsMounted || (jdrRentalScopeGameId && h.gameId===jdrRentalScopeGameId)).slice(0,40)){const row=document.createElement("div");row.className="psn-entry";psnLine(row,"small",`${h.action||"Update"} • ${h.renterName||""} • ${h.gameName||""} • ${psnSlotLabel(h.slot)} • ${h.email||""}`);psnLine(row,"small",(h.createdAt?.toDate?.()?.toLocaleString("en-PH")||"Time pending")+(h.details?" • "+h.details:""));history.append(row);}
}
async function psnLog(action,r,details=""){
 await setDoc(doc(collection(db,"psnRentalHistory")),{action,accountId:r.accountId,gameId:r.gameId,gameName:psnGameTitle(r.gameId),slot:r.slot,renterName:r.renterName,email:psnAccounts.find(a=>a.id===r.accountId)?.email||"",details,createdAt:serverTimestamp()});
}
async function psnLoad(){
 if(auth.currentUser?.uid!==ADMIN_UID)return;
 try{
  const [a,r,h]=await Promise.all([getDocs(collection(db,"psnAccounts")),getDocs(collection(db,"psnRentals")),getDocs(collection(db,"psnRentalHistory"))]);
  psnAccounts=a.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.email.localeCompare(b.email));
  psnRentals=r.docs.map(d=>({id:d.id,...d.data()}));
  renderPsnExpiryAlerts();v4RenderCalendar();
  psnHistory=h.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  psnGameChoices();psnAccountChoices();psnRender();psnLibraryRender();
  if(jdrRentalsMounted)jdrGameRentalFilter();
 }catch(e){psnMsg("psnAccountMessage","❌ Unable to load PSN records: "+e.message);}
}
$("openPsnPanel").onclick=()=>{openModal("psnManagementModal");psnLoad();};
$("openRentalPanel").onclick=()=>{if(jdrRentalsMounted)jdrSwitchManageTab('game');openModal("rentalManagementModal");psnLoad();};
$("closeRentalPanel").onclick=()=>closeModal("rentalManagementModal");
$("rentalSearch").oninput=psnRender;
$("rentalRefresh").onclick=psnLoad;
$("closePsnPanel").onclick=()=>closeModal("psnManagementModal");
$("psnAccountClear").onclick=psnClearAccount;
$("psnRentalClear").onclick=psnClearRental;
$("psnRentalAccount").onchange=()=>{
 psnRentalGameChoices();
 if(jdrRentalsMounted && selectedGameId){
  const account=psnAccounts.find(a=>a.id===$("psnRentalAccount").value);
  if((account?.gameIds||[]).includes(selectedGameId))$("psnRentalGame").value=selectedGameId;
 }
};
$("psnSearch").oninput=psnRender;
$("psnSearchMode").onchange=()=>{
 const byGame=$("psnSearchMode").value==="game";
 $("psnSearch").value="";
 $("psnSearch").placeholder=byGame?"Type a game title (e.g. Phantom Blade Zero)":"Type a PSN email address";
 $("psnSearchHint").textContent=byGame?"Shows every PSN email that owns the matching game.":"Shows PSN accounts matching the email address.";
 psnRender();
};
$("psnRefresh").onclick=psnLoad;
$("psnAccountForm").onsubmit=async e=>{
 e.preventDefault();const btn=$("psnAccountSave");btn.disabled=true;
 try{
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin only");
  const email=$("psnEmail").value.trim().toLowerCase();const id=$("psnAccountEditId").value;
  if(psnAccounts.some(a=>a.email.toLowerCase()===email&&a.id!==id))throw Error("Email already exists. Edit its existing record.");
  const gameIds=[...$("psnGames").selectedOptions].map(o=>o.value);
  const previousGameIds=psnAccounts.find(a=>a.id===id)?.gameIds||[];
  const data={email,region:$("psnRegion").value.trim(),onlineId:$("psnOnlineId").value.trim(),notes:$("psnNotes").value.trim(),gameIds,updatedAt:serverTimestamp()};
  if(id){const active=psnRentals.filter(r=>r.accountId===id&&r.status==="rented");if(active.some(r=>!gameIds.includes(r.gameId)))throw Error("Cannot unlink a game with an active renter. Return/reassign first.");await updateDoc(doc(db,"psnAccounts",id),data);}
  else await setDoc(doc(collection(db,"psnAccounts")),{...data,createdAt:serverTimestamp()});
  psnClearAccount();await psnLoad();
  const affectedGames=[...new Set([...previousGameIds,...gameIds])];
  const syncResults=await Promise.allSettled(affectedGames.map(gid=>jdrRefreshPublicSlotsForGame(gid)));
  const syncFailed=syncResults.filter(r=>r.status==="rejected");
  psnMsg("psnAccountMessage",syncFailed.length?"⚠️ PSN account saved, but some public availability updates failed. Use Refresh Public Slots below.":"✅ PSN account saved. Customer availability refreshed.");
 }catch(err){psnMsg("psnAccountMessage","❌ "+err.message);}finally{btn.disabled=false;}
};
// PAID PSN EXTENSIONS — separate accounts, transactional finance, aggregate public availability.
let jdrPaidExtensionBusy=false;
function jdrAddPaidExtensionDate(iso,period){
 const [y,m,d]=iso.split('-').map(Number);
 const base=new Date(y,m-1,d,12);
 const [ty,tm,td]=todayISO().split('-').map(Number);
 const today=new Date(ty,tm-1,td,12);
 if(base<today)base.setTime(today.getTime());
 if(period==='month'){
  const day=base.getDate();base.setDate(1);base.setMonth(base.getMonth()+1);
  const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  base.setDate(Math.min(day,last));
 }else base.setDate(base.getDate()+7);
 return [base.getFullYear(),String(base.getMonth()+1).padStart(2,'0'),String(base.getDate()).padStart(2,'0')].join('-');
}
function jdrPublicSlotFromRentals(gameId,slot,accounts,rentals){
 const owners=accounts.filter(a=>(a.gameIds||[]).includes(gameId));
 const occupied=new Set(rentals.filter(r=>r.gameId===gameId&&r.slot===slot&&r.status==='rented').map(r=>r.accountId));
 const active=rentals.filter(r=>r.gameId===gameId&&r.slot===slot&&r.status==='rented'&&/^\d{4}-\d{2}-\d{2}$/.test(r.returnDate||''));
 // A PSN account owns one Trophy and one Non-Trophy slot for this game.
 // An unoccupied owned account makes the public slot available immediately.
 if(owners.length>0&&owners.some(a=>!occupied.has(a.id)))return {status:'available',date:'Available Now'};
 if(active.length){
  const earliest=active.map(r=>r.returnDate).sort()[0];
  return {status:'currently-rented',date:dateToText(earliest)};
 }
 // No reliable account capacity data: leave the existing public status untouched.
 return null;
}
$("psnExtendApply").onclick=async()=>{
 if(jdrPaidExtensionBusy)return;
 const btn=$("psnExtendApply"),message=$("psnExtendMessage");
 const rentalId=$("psnRentalEditId").value;
 const amount=Number($( "psnExtendAmount").value);
 const period=$("psnExtendPeriod").value;
 try{
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error('Admin sign-in required.');
  if(!rentalId)throw Error('Select a saved renter assignment first.');
  if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.round(amount*100)!==amount*100)throw Error('Enter actual payment received, up to 2 decimal places.');
  const rental=psnRentals.find(r=>r.id===rentalId);
  if(!rental||rental.status!=='rented')throw Error('Only active saved rentals can be extended.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(rental.returnDate||''))throw Error('Saved return date is invalid.');
  if($("psnRentalAccount").value!==rental.accountId||$("psnRentalGame").value!==rental.gameId||$("psnRentalSlot").value!==rental.slot)throw Error('Save any account, game or slot edits before extending.');
  if(!gameCache.has(rental.gameId))throw Error('Game no longer exists. No payment recorded.');
  const currentReturn=rental.returnDate;
  const newReturn=jdrAddPaidExtensionDate(currentReturn,period);
  const label=period==='month'?'1 Month':'1 Week';
  if(!await jdrConfirm(`Confirm payment received?\n\nRenter: ${rental.renterName}\nGame: ${psnGameTitle(rental.gameId)}\nAccount: ${psnAccounts.find(a=>a.id===rental.accountId)?.email||'Unknown'}\nSlot: ${psnSlotLabel(rental.slot)}\nExtension: ${label}\nReturn: ${currentReturn} → ${newReturn}\nPaid: ₱${amount.toFixed(2)}\n\nOther PSN renters will remain unchanged.`))return;
  jdrPaidExtensionBusy=true;btn.disabled=true;message.textContent='⏳ Verifying records and confirming payment…';
  // Load ALL account/rental records; aggregate across independent PSN accounts.
  const [accountList,rentalList]=await Promise.all([getDocs(collection(db,'psnAccounts')),getDocs(collection(db,'psnRentals'))]);
  const accounts=accountList.docs.map(d=>({id:d.id,...d.data()}));
  const rentals=rentalList.docs.map(d=>({id:d.id,...d.data()}));
  const sameSlot=rentals.filter(r=>r.gameId===rental.gameId&&r.slot===rental.slot);
  const activeOnSameAccount=sameSlot.filter(r=>r.status==='rented'&&r.accountId===rental.accountId&&r.id!==rentalId);
  if(activeOnSameAccount.length)throw Error('This PSN account has conflicting active assignments for this game/slot. Resolve these first.');
  const financeId=`extension_${rentalId}_${currentReturn.replace(/-/g,'')}_${newReturn.replace(/-/g,'')}`;
  const rentalRef=doc(db,'psnRentals',rentalId),gameRef=doc(db,'games',rental.gameId),financeRef=doc(db,'adminFinanceTransactions',financeId);
  const otherRefs=sameSlot.filter(r=>r.id!==rentalId).map(r=>doc(db,'psnRentals',r.id));
  const accountRefs=accounts.filter(a=>(a.gameIds||[]).includes(rental.gameId)).map(a=>doc(db,'psnAccounts',a.id));
  const result=await runTransaction(db,async tx=>{
   // All reads first; Firestore retries automatically on concurrent changes.
   const [rSnap,gSnap,fSnap,...rest]=await Promise.all([tx.get(rentalRef),tx.get(gameRef),tx.get(financeRef),...otherRefs.map(ref=>tx.get(ref)),...accountRefs.map(ref=>tx.get(ref))]);
   if(!rSnap.exists()||!gSnap.exists())throw Error('Rental or game was removed. Nothing saved.');
   if(fSnap.exists())throw Error('This exact extension was already recorded. Refresh before extending again.');
   const fresh=rSnap.data();
   if(fresh.status!=='rented'||fresh.returnDate!==currentReturn||fresh.accountId!==rental.accountId||fresh.gameId!==rental.gameId||fresh.slot!==rental.slot)throw Error('Rental changed in another tab. Refresh and retry.');
   const otherSnaps=rest.slice(0,otherRefs.length);
   const ownerSnaps=rest.slice(otherRefs.length);
   const freshOthers=otherSnaps.filter(s=>s.exists()).map(s=>({id:s.id,...s.data()}));
   const freshOwners=ownerSnaps.filter(s=>s.exists()).map(s=>({id:s.id,...s.data()}));
   if(freshOthers.some(r=>r.accountId===fresh.accountId&&r.status==='rented'))throw Error('Conflicting active renter on this PSN account.');
   const publicSlot=jdrPublicSlotFromRentals(fresh.gameId,fresh.slot,freshOwners,[...freshOthers,{id:rentalId,...fresh,returnDate:newReturn}]);
   tx.update(rentalRef,{returnDate:newReturn,updatedAt:serverTimestamp(),lastPaidExtensionId:financeId,...(Number.isFinite(fresh.estimatePaid)?{estimatePaid:fresh.estimatePaid+amount}:{})});
   if(fresh.memberUid)jdr85History(tx,fresh.memberUid,rentalId,{...fresh,returnDate:newReturn,...(Number.isFinite(fresh.estimatePaid)?{estimatePaid:fresh.estimatePaid+amount}:{})});
   if(publicSlot){
    const fields=slotFields(fresh.slot);
    tx.update(gameRef,{[fields.status]:publicSlot.status,[fields.date]:publicSlot.date,updatedAt:serverTimestamp()});
   }
   tx.set(financeRef,{
    type:'income',date:todayISO(),amount,category:'Rental extension',
    description:`${fresh.renterName} — ${psnGameTitle(fresh.gameId)} — ${psnSlotLabel(fresh.slot)} — ${label} paid extension`,
    reference:financeId,rentalId,gameId:fresh.gameId,slot:fresh.slot,accountId:fresh.accountId,
    previousReturnDate:currentReturn,newReturnDate:newReturn,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid
   });
   tx.set(doc(collection(db,'psnRentalHistory')),{action:'Paid Extension',accountId:fresh.accountId,gameId:fresh.gameId,
    gameName:psnGameTitle(fresh.gameId),slot:fresh.slot,renterName:fresh.renterName,
    email:freshOwners.find(a=>a.id===fresh.accountId)?.email||'',
    details:`${label}: ${currentReturn} → ${newReturn}; confirmed paid ₱${amount.toFixed(2)}; finance ref ${financeId}`,
    createdAt:serverTimestamp()});
   return publicSlot;
  });
  $("psnReturnDate").value=newReturn;$("psnExtendAmount").value='';
  await Promise.allSettled([psnLoad(),loadAdminGames(),v4LoadFinance()]);
  message.textContent=`✅ Paid ₱${amount.toFixed(2)} confirmed. Return: ${newReturn}. Calendar and Finances updated. ${result?'Public availability recalculated across PSN accounts.':'Public status unchanged (no verified PSN capacity).'} Other renters unchanged.`;
 }catch(err){message.textContent='❌ '+err.message;}
 finally{jdrPaidExtensionBusy=false;btn.disabled=false;}
};
// New rental payment and assignment are written atomically to prevent partial saves.
let jdrLastEditId=null;
function jdrToggleNewRentalPayment(){
 const editId=$("psnRentalEditId").value, fresh=!editId;
 const existing=psnRentals.find(r=>r.id===editId);
 if(jdrLastEditId!==editId){jdrLastEditId=editId;$('jdrSwapPlan').value=existing?.rentalPlan||'';$('jdrLegacyDates').value='';}
 $('jdrSwapPlan').disabled=!!existing?.rentalPlan;
 $('jdrLegacyHistory').hidden=fresh||!!existing?.rentalPlan;
 $("jdrNewRentalPaymentBox").style.display=fresh?"grid":"none";
 $("jdrNewRentalHelp").style.display=fresh?"block":"none";
 $("psnRentalSave").textContent=fresh?"💳 Confirm Payment & Save Rental":"💾 Update Assignment";
}
$("psnRentalEditId").addEventListener("change",jdrToggleNewRentalPayment);
new MutationObserver(jdrToggleNewRentalPayment).observe($("psnRentalEditId"),{attributes:true,attributeFilter:["value"]});
// Existing edit buttons set input.value programmatically; observe click flow as well.
document.addEventListener("click",()=>setTimeout(jdrToggleNewRentalPayment,0));
jdrToggleNewRentalPayment();
let jdrNewRentalSaving=false;
$("psnRentalForm").onsubmit=async e=>{
 e.preventDefault();if(jdrNewRentalSaving)return;
 const btn=$("psnRentalSave");btn.disabled=true;jdrNewRentalSaving=true;
 try{
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin only");
  const id=$("psnRentalEditId").value,accountId=$("psnRentalAccount").value,gameId=$("psnRentalGame").value,slot=$("psnRentalSlot").value;
  const renterName=$("psnRenterName").value.trim(),status=$("psnRentalStatus").value,returnDate=$("psnReturnDate").value,startDate=$("psnStartDate").value;
  if(!psnAccounts.find(a=>a.id===accountId)?.gameIds?.includes(gameId))throw Error("Select a game owned by this PSN account.");
  if(!gameCache.has(gameId))throw Error("Game no longer exists in Game Management.");
  if(!renterName||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(returnDate))throw Error("Renter name and valid return date required.");
  if(startDate&&returnDate<startDate)throw Error("Return date must not be before start date.");
  if(status==="rented"&&psnRentals.some(r=>r.id!==id&&r.accountId===accountId&&r.gameId===gameId&&r.slot===slot&&r.status==="rented"))throw Error("This PSN account/game/slot already has an active renter.");
  const data={accountId,gameId,slot,renterName,startDate,returnDate,status,updatedAt:serverTimestamp()};
  if(!id && $("jdr85Member").value) data.memberUid=$("jdr85Member").value;
  const old=psnRentals.find(r=>r.id===id);
  if(id){
   if(old?.status!=="returned" && status==="returned")throw Error("Use Mark Returned to verify return proof and credit rewards.");
   if(old?.status==="returned" && status!=="returned")throw Error("Create a new rental instead of reopening a completed rental.");
   if(old?.status==='rented'&&(old.gameId!==gameId||old.accountId!==accountId||old.slot!==slot))throw Error('Use Swap Game for active assignment changes.');
   // Existing rental edits never create initial-payment income.
   if(!old?.rentalPlan && $('jdrSwapPlan').value){
    const plan=$('jdrSwapPlan').value, dates=$('jdrLegacyDates').value.trim()?$('jdrLegacyDates').value.split(',').map(x=>x.trim()):[];
    if(!jdrSwapLabels[plan]||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||d>todayISO()||d<startDate)||new Set(dates).size!==dates.length)throw Error('Check plan and prior swap dates.');
    await runTransaction(db,async tx=>{const ref=doc(db,'psnRentals',id),snap=await tx.get(ref);if(!snap.exists()||snap.data().rentalPlan)throw Error('Rental changed. Refresh.');tx.update(ref,{...data,rentalPlan:plan,swapDates:dates,swapCount:dates.length});if(snap.data().memberUid)jdr85History(tx,snap.data().memberUid,id,{...snap.data(),...data});});
   }else await runTransaction(db,async tx=>{const ref=doc(db,"psnRentals",id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status!==old?.status)throw Error("Rental changed. Refresh.");tx.update(ref,data);if(snap.data().memberUid)jdr85History(tx,snap.data().memberUid,id,{...snap.data(),...data});});
   await jdrRefreshPublicSlotsForGame(gameId);
   if(old && (old.gameId!==gameId || old.slot!==slot))await jdrRefreshPublicSlotsForGame(old.gameId);
   try{await psnLog(status==="returned"?"Returned":"Assignment Updated",data,old?`Previous: ${old.status}, ${old.returnDate}`:"");}catch(err){console.error("PSN history:",err);}
   psnMsg("psnRentalMessage","✅ Assignment updated. No new payment added.");
  }else{
   const plan=$('jdrSwapPlan').value;
   if(!jdrSwapLabels[plan])throw Error('Select the rental plan.');
   Object.assign(data,{rentalPlan:plan,swapCount:0,swapDates:[]});
   if(status!=="rented")throw Error("New paid rental must be Currently Rented. Use edit to mark returned later.");
   const amount=Number($("jdrNewRentalAmount").value);
   if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.round(amount*100)!==amount*100)throw Error("Enter the actual confirmed payment (up to 2 decimals).");
   const note=$("jdrNewRentalNote").value.trim();
   if(!await jdrConfirm(`Confirm payment received and save NEW rental?\n\nRenter: ${renterName}\nGame: ${psnGameTitle(gameId)}\nPSN: ${psnAccounts.find(a=>a.id===accountId)?.email||''}\nSlot: ${psnSlotLabel(slot)}\nReturn: ${returnDate}\nPaid: ₱${amount.toFixed(2)}\n\nThis will create ONE rental and ONE income entry.`))return;
   // Use a single transaction for rental, finance, history and aggregate public availability.
   const [aList,rList]=await Promise.all([getDocs(collection(db,'psnAccounts')),getDocs(collection(db,'psnRentals'))]);
   const accounts=aList.docs.map(d=>({id:d.id,...d.data()}));
   const rentals=rList.docs.map(d=>({id:d.id,...d.data()}));
   const sameSlot=rentals.filter(r=>r.gameId===gameId&&r.slot===slot);
   const rentalRef=doc(collection(db,'psnRentals'));
   const financeRef=doc(db,'adminFinanceTransactions',`rental_${rentalRef.id}`);
   const gameRef=doc(db,'games',gameId);
   const otherRefs=sameSlot.map(r=>doc(db,'psnRentals',r.id));
   const ownerRefs=accounts.filter(a=>(a.gameIds||[]).includes(gameId)).map(a=>doc(db,'psnAccounts',a.id));
   await runTransaction(db,async tx=>{
    const [gameSnap,financeSnap,...rest]=await Promise.all([tx.get(gameRef),tx.get(financeRef),...otherRefs.map(r=>tx.get(r)),...ownerRefs.map(r=>tx.get(r))]);
    if(data.memberUid){const m=await tx.get(doc(db,"memberRewards",data.memberUid));if(!m.exists()||m.data().status!=="active")throw Error("Member is not active.");}
    if(!gameSnap.exists())throw Error('Game was removed. No payment recorded.');
    if(financeSnap.exists())throw Error('This rental payment already exists.');
    const otherRentals=rest.slice(0,otherRefs.length).filter(x=>x.exists()).map(x=>({id:x.id,...x.data()}));
    const owners=rest.slice(otherRefs.length).filter(x=>x.exists()).map(x=>({id:x.id,...x.data()}));
    if(!owners.some(a=>a.id===accountId&&(a.gameIds||[]).includes(gameId)))throw Error('PSN account no longer owns this game.');
    if(otherRentals.some(r=>r.accountId===accountId&&r.status==='rented'))throw Error('This PSN account/game/slot already has an active renter. Nothing charged.');
    const publicSlot=jdrPublicSlotFromRentals(gameId,slot,owners,[...otherRentals,{...data,id:rentalRef.id}]);
    tx.set(rentalRef,{...data,createdAt:serverTimestamp(),initialPaymentId:financeRef.id,estimatePaid:amount});
    if(data.memberUid)jdr85History(tx,data.memberUid,rentalRef.id,{...data,estimatePaid:amount});
    tx.set(financeRef,{type:'income',date:todayISO(),amount,category:'New rental',description:`${renterName} — ${psnGameTitle(gameId)} — ${psnSlotLabel(slot)}${note?' — '+note:''}`,reference:financeRef.id,rentalId:rentalRef.id,gameId,slot,accountId,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    tx.set(doc(collection(db,'psnRentalHistory')),{action:'New Rental + Payment',accountId,gameId,gameName:psnGameTitle(gameId),slot,renterName,details:`Return: ${returnDate}; confirmed paid ₱${amount.toFixed(2)}; finance ref ${financeRef.id}`,createdAt:serverTimestamp()});
    if(publicSlot){const fields=slotFields(slot);tx.update(gameRef,{[fields.status]:publicSlot.status,[fields.date]:publicSlot.date,updatedAt:serverTimestamp()});}
   });
   $("v4FinanceMonth").value=todayISO().slice(0,7);
   await Promise.allSettled([v4LoadFinance(),loadAdminGames()]);
   psnMsg("psnRentalMessage",`✅ Rental and ₱${amount.toFixed(2)} payment saved together. Financial Report updated.`);
  }
  $("jdr85Member").value="";psnClearRental();await psnLoad();jdrToggleNewRentalPayment();
 }catch(err){psnMsg("psnRentalMessage","❌ "+err.message);}finally{jdrNewRentalSaving=false;btn.disabled=false;jdrToggleNewRentalPayment();}
};
// V6.7 — Admin-only one-tap reconciliation for existing PSN account inventory.
(function(){
 const mount=document.getElementById("psnAccountForm");if(!mount)return;
 const button=document.createElement("button");button.type="button";
 button.textContent="🔄 Refresh Customer Slot Availability";
 button.style.cssText="display:block;width:100%;margin:12px 0;padding:14px;border:1px solid #59baff;border-radius:12px;background:#0d3b71;color:#fff;font-weight:800";
 mount.after(button);
 button.addEventListener("click",async()=>{
  if(auth.currentUser?.uid!==ADMIN_UID)return;
  button.disabled=true;button.textContent="⏳ Syncing all games...";
  try{
   const [gSnap,aSnap,rSnap]=await Promise.all([getDocs(collection(db,"games")),getDocs(collection(db,"psnAccounts")),getDocs(collection(db,"psnRentals"))]);
   const accounts=aSnap.docs.map(d=>({id:d.id,...d.data()}));
   const rentals=rSnap.docs.map(d=>({id:d.id,...d.data()}));
   const batch=writeBatch(db);let count=0;
   for(const gameDoc of gSnap.docs){
    const changes={};
    for(const slot of ["trophy","nonTrophy"]){
     const result=jdrPublicSlotFromRentals(gameDoc.id,slot,accounts,rentals);
     if(!result)continue;
     const fields=slotFields(slot);
     changes[fields.status]=result.status;changes[fields.date]=result.date;
    }
    if(Object.keys(changes).length){batch.update(gameDoc.ref,{...changes,updatedAt:serverTimestamp()});count++;}
   }
   if(count)await batch.commit();
   await loadAdminGames();
   button.textContent=`✅ ${count} game(s) synced to customer website`;
  }catch(e){console.error(e);button.textContent="❌ Sync failed — tap to retry";jdrNotice("Public availability sync failed: "+e.message);}
  finally{button.disabled=false;}
 });
})();
// MULTI-ACCOUNT SLOT SYNC V6.6 — PSN accounts are the capacity source.
// A rental is never released by date alone; only status="returned" releases it.
async function jdrRefreshPublicSlotsForGame(gameId){
 if(auth.currentUser?.uid!==ADMIN_UID||!gameId)return;
 const [aSnap,rSnap,gSnap]=await Promise.all([
  getDocs(collection(db,"psnAccounts")),
  getDocs(collection(db,"psnRentals")),
  getDoc(doc(db,"games",gameId))
 ]);
 if(!gSnap.exists())return;
 const accounts=aSnap.docs.map(d=>({id:d.id,...d.data()}));
 const rentals=rSnap.docs.map(d=>({id:d.id,...d.data()}));
 const changes={};
 for(const slot of ["trophy","nonTrophy"]){
  const result=jdrPublicSlotFromRentals(gameId,slot,accounts,rentals);
  if(!result)continue; // No verified capacity: preserve manual game status.
  const fields=slotFields(slot);
  changes[fields.status]=result.status;
  changes[fields.date]=result.date;
 }
 if(Object.keys(changes).length){
  await updateDoc(doc(db,"games",gameId),{...changes,updatedAt:serverTimestamp()});
  await loadAdminGames();
 }
}
async function jdrConfirmPsnReturn(rental){
 const rr=doc(db,"psnRentals",rental.id);
 const result=await jdr85Complete(rental.id,true);
 if(result)jdrNotice(result);
 try{await jdrRefreshPublicSlotsForGame(rental.gameId);}
 catch(err){console.error("Public availability sync failed:",err);jdrNotice("Return saved, but customer availability could not be refreshed. Please refresh and check Game Management: "+err.message);}
}
// Reconcile admin game slot updates with existing renter assignments.
// Does NOT invent renter identities or mark public slots rented from waiting-list requests.
let psnSyncBusy=false;
async function psnSyncFromGames(){
 // Public game availability is an aggregate of PSN accounts, not a return confirmation.
 // Never auto-return individual renters when one public slot becomes available.
 return;
}

/* PSN RENTAL ALERTS: admin dashboard only; no background push */
function renderPsnExpiryAlerts(){
 const box=$("psnExpiryList"),count=$("psnAlertCount");if(!box)return;
 box.replaceChildren();const today=new Date();today.setHours(0,0,0,0);
 const items=psnRentals.filter(r=>r.status==="rented"&&/^\d{4}-\d{2}-\d{2}$/.test(r.returnDate||""))
  .map(r=>{const [y,m,d]=r.returnDate.split("-").map(Number);const target=new Date(y,m-1,d);return {r,days:Math.round((target-today)/86400000)};})
  .filter(x=>x.days<=3).sort((a,b)=>a.days-b.days);
 count.textContent=items.length?`(${items.length})`:"(0)";
 if(!items.length){box.textContent="🟢 No PSN rentals expiring within the next 3 days.";return;}
 for(const {r,days} of items){
  const row=document.createElement("div");row.className="psn-alert-row";
  const title=document.createElement("strong");title.textContent=(days<0?"🚨 OVERDUE "+Math.abs(days)+" day(s)":days===0?"🔴 RETURN TODAY":days===1?"🟠 RETURN TOMORROW":"🟡 EXPIRING IN "+days+" DAYS")+" — "+(gameCache.has(r.gameId)?psnGameTitle(r.gameId):(r.gameName||"Game not linked"));
  const info=document.createElement("small");info.textContent=`👤 ${r.renterName} • ${psnSlotLabel(r.slot)} • 📧 ${psnAccounts.find(a=>a.id===r.accountId)?.email||"Unknown account"} • 📅 ${r.returnDate}`;
  const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Edit / Extend";
  edit.onclick=()=>{openModal("rentalManagementModal");$("psnRentalEditId").value=r.id;$("psnRentalAccount").value=r.accountId;psnRentalGameChoices();$("psnRentalGame").value=r.gameId;$("psnRentalSlot").value=r.slot;$("psnRenterName").value=r.renterName;$("psnStartDate").value=r.startDate||"";$("psnReturnDate").value=r.returnDate||"";$("psnRentalStatus").value=r.status;$("psnRentalSave").textContent="💾 Update Assignment";$("psnRentalForm").scrollIntoView({behavior:"smooth"});};
  const returned=document.createElement("button");returned.type="button";returned.textContent="✅ Mark Returned";
  returned.onclick=async()=>{if(!await jdrConfirm("Confirm that the PSN account was actually returned and disabled by "+r.renterName+"?"))return;returned.disabled=true;try{await jdrConfirmPsnReturn(r);await psnLog("Returned",r,"Confirmed by admin from PSN Rental Alert Center");await psnLoad();}catch(err){jdrNotice("Could not mark returned: "+err.message);returned.disabled=false;}};
  row.append(title,info,edit,returned);box.append(row);
 }
}

/* V4 - admin-only financial ledger and PSN calendar */
const v4Money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:0,maximumFractionDigits:2});
let v4Transactions=[],v4CalendarMonth=new Date();
function v4MonthISO(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function v4RenderFinance(){
 const month=$("v4FinanceMonth").value;
 const entries=v4Transactions.filter(x=>(x.date||"").startsWith(month)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 const revenue=entries.filter(x=>x.type==="income").reduce((sum,x)=>sum+Number(x.amount||0),0);
 const expenses=entries.filter(x=>x.type==="expense").reduce((sum,x)=>sum+Number(x.amount||0),0);
 $("v4Revenue").textContent=v4Money(revenue);$("v4Expenses").textContent=v4Money(expenses);
 $("v4Profit").textContent=v4Money(revenue-expenses);$("v4TxnCount").textContent=String(entries.length);
 const host=$("v4FinanceList");host.replaceChildren();
 if(!entries.length){psnLine(host,"p","No confirmed transactions recorded for this month.");return;}
 for(const t of entries){
  const row=document.createElement("div");row.className="v4-record";
  const left=document.createElement("div");
  psnLine(left,"strong",(t.type==="income"?"🟢 +":"🔴 −")+v4Money(t.amount)+" • "+(t.description||""));
  psnLine(left,"small",(t.date||"")+" • "+(t.category||"Other")+(t.reference?" • Ref: "+t.reference:""));
  const del=document.createElement("button");del.type="button";del.textContent="Delete";
  del.onclick=async()=>{
   if(!await jdrConfirm("Delete this financial transaction? This cannot be undone."))return;
   del.disabled=true;
   try{await deleteDoc(doc(db,"adminFinanceTransactions",t.id));await v4LoadFinance();}
   catch(e){$("v4FinanceStatus").textContent="❌ Delete failed: "+e.message;del.disabled=false;}
  };
  row.append(left,del);host.append(row);
 }
}
async function v4LoadFinance(){
 if(auth.currentUser?.uid!==ADMIN_UID)return;
 try{
  const snap=await getDocs(collection(db,"adminFinanceTransactions"));
  v4Transactions=snap.docs.map(d=>({id:d.id,...d.data()}));
  v4RenderFinance();$("v4FinanceStatus").textContent="✅ Financial records loaded.";
 }catch(e){$("v4FinanceStatus").textContent="❌ Could not load financial records: "+e.message+" (check Firestore admin rules).";}
}
$("v4FinanceForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const btn=$("v4FinanceSave");btn.disabled=true;
 try{
  if(auth.currentUser?.uid!==ADMIN_UID)throw Error("Admin access required.");
  const amount=Number($("v4TxnAmount").value);
  if(!Number.isFinite(amount)||amount<=0||amount>100000000)throw Error("Enter a valid amount.");
  const date=$("v4TxnDate").value,description=$("v4TxnDescription").value.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!description)throw Error("Date and description required.");
  await setDoc(doc(collection(db,"adminFinanceTransactions")),{
   type:$("v4TxnType").value,date,amount,category:$("v4TxnCategory").value,
   description,reference:$("v4TxnReference").value.trim(),createdAt:serverTimestamp(),
   createdBy:auth.currentUser.uid
  });
  $("v4FinanceForm").reset();$("v4TxnDate").value=todayISO();
  $("v4FinanceMonth").value=date.slice(0,7);
  await v4LoadFinance();$("v4FinanceStatus").textContent="✅ Payment / expense saved.";
 }catch(err){$("v4FinanceStatus").textContent="❌ "+err.message;}
 finally{btn.disabled=false;}
});
$("v4FinanceRefresh").onclick=v4LoadFinance;
$("v4FinanceMonth").onchange=v4RenderFinance;
function v42ShowRental(r){
 const modal=$("v42RentalModal"),host=$("v42RentalContent");
 host.replaceChildren();
 const g=gameCache.get(r.gameId);
 const account=psnAccounts.find(a=>a.id===r.accountId);
 const name=g?gameName(g):(r.gameName||"Game not linked");
 const today=todayISO();
 const status=r.returnDate<today?"🚨 OVERDUE":r.returnDate===today?"🔴 DUE TODAY":"🟡 UPCOMING";
 const fields=[
  ["Status",status],["Game",name],["Renter",r.renterName||"Not recorded"],
  ["Slot",psnSlotLabel(r.slot)],["PSN email",account?.email||"Account not linked"],
  ["Start date",r.startDate||"Not recorded"],["Expected return",r.returnDate||"Not recorded"]
 ];
 for(const [label,value] of fields){
  const row=document.createElement("div");row.className="v42-field";
  psnLine(row,"small",label);psnLine(row,"strong",value);host.append(row);
 }
 const actions=document.createElement("div");actions.className="v43-actions";
 const edit=document.createElement("button");edit.type="button";edit.textContent="✏️ Edit / Extend";
 edit.onclick=()=>{
  modal.hidden=true;
  if(jdrRentalsMounted)jdrSwitchManageTab("game");
  openModal("rentalManagementModal");
  $("psnRentalEditId").value=r.id;
  $("psnRentalAccount").value=r.accountId;
  psnRentalGameChoices();
  $("psnRentalGame").value=r.gameId;
  $("psnRentalSlot").value=r.slot;
  $("psnRenterName").value=r.renterName||"";
  $("psnStartDate").value=r.startDate||"";
  $("psnReturnDate").value=r.returnDate||"";
  $("psnRentalStatus").value=r.status;
  $("psnRentalSave").textContent="💾 Update Assignment";
  $("psnRentalForm").scrollIntoView({behavior:"smooth",block:"center"});
 };
 const returned=document.createElement("button");returned.type="button";returned.textContent="✅ Mark Returned";
 returned.onclick=async()=>{
  if(!await jdrConfirm("Confirm that "+(r.renterName||"this renter")+" has returned the PSN account and disabled console sharing? This will mark this rental as returned."))return;
  returned.disabled=true;edit.disabled=true;
  try{
   await jdrConfirmPsnReturn(r);
   await psnLog("Returned",r,"Confirmed by admin from Rental Calendar");
   modal.hidden=true;
   await psnLoad();
  }catch(err){jdrNotice("Could not complete return: "+err.message);returned.disabled=false;edit.disabled=false;}
 };
 actions.append(edit,returned);host.append(actions);
 modal.hidden=false;
 $("v42CloseRental").focus();
}
$("v42CloseRental").onclick=()=>{$("v42RentalModal").hidden=true;};
$("v42RentalModal").onclick=e=>{if(e.target===$("v42RentalModal"))$("v42RentalModal").hidden=true;};
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("v42RentalModal").hidden=true;});
function v4RenderCalendar(){
 const grid=$("v4CalendarGrid");grid.replaceChildren();
 const y=v4CalendarMonth.getFullYear(),m=v4CalendarMonth.getMonth();
 $("v4MonthLabel").textContent=v4CalendarMonth.toLocaleDateString("en-PH",{month:"long",year:"numeric"});
 for(const day of ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])psnLine(grid,"strong",day);
 const first=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate();
 for(let i=0;i<first;i++){const blank=document.createElement("div");blank.className="v4-day empty";grid.append(blank);}
 const today=todayISO();
 let total=0,unmatched=0;
 for(let d=1;d<=last;d++){
  const iso=y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
  const tile=document.createElement("div");tile.className="v4-day"+(iso===today?" today":"");
  psnLine(tile,"b",String(d));
  const returns=psnRentals.filter(r=>r.status==="rented"&&r.returnDate===iso);
  for(const r of returns){
   total++;
   const g=gameCache.get(r.gameId);
   const name=g?gameName(g):(r.gameName||"Game not linked");
   if(!g)unmatched++;
   const a=psnAccounts.find(a=>a.id===r.accountId);
   const status=iso<today?"🚨 OVERDUE":iso===today?"🔴 DUE TODAY":"🟡 UPCOMING";
   const item=document.createElement("div");item.className="v41-return";
   item.classList.add("v42-clickable");
   item.setAttribute("role","button");item.tabIndex=0;
   psnLine(item,"strong",status);
   psnLine(item,"span","🎮 "+name);
   psnLine(item,"span","👤 "+(r.renterName||"Renter not recorded"));
   item.title="Click for rental details";
   item.onclick=()=>v42ShowRental(r);
   item.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();v42ShowRental(r);}};
   tile.append(item);
  }
  grid.append(tile);
 }
 $("v4CalendarNote").textContent="Shows "+total+" active PSN rental return(s) this month."+(unmatched?" "+unmatched+" record(s) reference a game not found in Game Management; check the linked game IDs.":"")+" Calendar is an admin reminder; a slot stays rented until return is confirmed.";
}
$("v4PrevMonth").onclick=()=>{v4CalendarMonth=new Date(v4CalendarMonth.getFullYear(),v4CalendarMonth.getMonth()-1,1);v4RenderCalendar();};
$("v4NextMonth").onclick=()=>{v4CalendarMonth=new Date(v4CalendarMonth.getFullYear(),v4CalendarMonth.getMonth()+1,1);v4RenderCalendar();};
$("v4RefreshCalendar").onclick=async()=>{await psnLoad();v4RenderCalendar();};
for(const btn of document.querySelectorAll("[data-v4-target]"))btn.onclick=()=>{
 const id=btn.dataset.v4Target;
 document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
 if(id==="v4Finance")v4LoadFinance();
 if(id==="v4Calendar")v4RenderCalendar();
};
function v4FilterGames(){
 const q=$("v4GameSearch").value.trim().toLowerCase(),status=$("v4GameFilter").value;
 let shown=0;
 for(const card of $("gameGrid").children){
  const text=card.textContent.toLowerCase();
  const heading=card.querySelector("h3")?.textContent.toLowerCase()||"";
  const statusLabel=card.querySelector(".status")?.textContent.toLowerCase()||"";
  const ok=heading.includes(q)&&(status==="all"||statusLabel.includes(status));
  card.style.display=ok?"":"none";if(ok)shown++;
 }
 $("v4GameCount").textContent=shown+" game(s)";
}
$("v4GameSearch").oninput=v4FilterGames;
$("v4GameFilter").onchange=v4FilterGames;
new MutationObserver(v4FilterGames).observe($("gameGrid"),{childList:true});
$("v4FinanceMonth").value=v4MonthISO(new Date());
$("v4TxnDate").value=todayISO();


/* WEBSITE VISITOR ANALYTICS — ADMIN READ ONLY; V6.9 bounded, on demand */
async function jdrLoadVisitorAnalytics(){
 const status=document.getElementById("jdrVisitorStatus");
 if(auth.currentUser?.uid!==ADMIN_UID){status.textContent="Admin sign-in required.";return;}
 status.textContent="Loading visitor statistics…";
 try{
  const snapshot=await getDocs(query(collection(db,"websiteVisits"),limit(500)));
  const phFmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"});
  const phKey=date=>phFmt.format(date);
  const phToday=phKey(new Date());
  const currentMonth=phToday.slice(0,7);
  const unique=new Set(), dayCounts=new Map();
  let today=0,monthly=0,total=0;
  snapshot.forEach(item=>{
   const data=item.data();total++;
   if(typeof data.visitorId==="string"&&data.visitorId)unique.add(data.visitorId);
   const date=data.createdAt?.toDate?.();if(!date)return;
   const key=phKey(date);
   dayCounts.set(key,(dayCounts.get(key)||0)+1);
   if(key===phToday)today++;
   if(key.slice(0,7)===currentMonth)monthly++;
  });
  const metric=(id,n)=>document.getElementById(id).textContent=n.toLocaleString();
  metric("jdrTotalVisits",total);metric("jdrTodayVisits",today);
  metric("jdrUniqueVisitors",unique.size);metric("jdrMonthlyVisits",monthly);
  const chart=document.getElementById("jdrWeekChart");
  chart.replaceChildren();
  const days=[];
  for(let offset=6;offset>=0;offset--){
   const d=new Date(Date.now()-offset*86400000);
   const key=phKey(d);days.push({key,count:dayCounts.get(key)||0});
  }
  const max=Math.max(1,...days.map(x=>x.count));
  days.forEach(({key,count})=>{
   const col=document.createElement("div");
   col.style.cssText="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;min-width:0";
   const number=document.createElement("span");number.textContent=count;
   number.style.cssText="font-size:12px;color:#cde5ff";
   const bar=document.createElement("div");
   bar.style.cssText="width:75%;max-width:45px;border-radius:6px 6px 0 0;background:#168cff;min-height:4px";
   bar.style.height=Math.max(4,Math.round(count/max*95))+"px";
   const label=document.createElement("span");label.textContent=key.slice(5);
   label.style.cssText="font-size:10px;color:#a8bddc;white-space:nowrap";
   col.append(number,bar,label);chart.append(col);
  });
  // Read-only V2 metrics. If one collection is restricted, existing visit metrics still work.
  const top=document.getElementById("jdrTopViewed");
  const setText=(id,value)=>{document.getElementById(id).textContent=value;};
  const results=await Promise.allSettled([
    getDocs(query(collection(db,"visitorPresence"),limit(500))),
    getDocs(query(collection(db,"gameDetailViews"),limit(500))),
    getDocs(collection(db,"games"))
  ]);
  const presenceResult=results[0],viewsResult=results[1],gamesResult=results[2];
  const warnings=[];
  if(presenceResult.status==="fulfilled"){
    const active=new Set(),cutoff=Date.now()-120000;
    presenceResult.value.forEach(item=>{
      const d=item.data(),t=d.lastSeen?.toMillis?.();
      if(t&&t>=cutoff)active.add(d.sessionId||item.id);
    });
    setText("jdrOnlineNow",active.size.toLocaleString());
  }else{setText("jdrOnlineNow","—");warnings.push("presence: "+(presenceResult.reason?.code||"read error"));}
  if(viewsResult.status==="fulfilled"){
    const counts=new Map();let totalViews=0;
    viewsResult.value.forEach(item=>{
      totalViews++;
      const id=item.data().gameId;
      if(typeof id==="string"&&id.trim())counts.set(id,(counts.get(id)||0)+1);
    });
    setText("jdrGameViews",totalViews.toLocaleString());
    setText("jdrGamesViewed",counts.size.toLocaleString());
    const names=new Map();
    if(gamesResult.status==="fulfilled")gamesResult.value.forEach(item=>{
      const d=item.data();names.set(item.id,d.title||d.name||item.id);
    });
    top.replaceChildren();
    const ranking=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,5);
    if(!ranking.length)top.textContent="No game detail views recorded yet.";
    ranking.forEach(([id,count],index)=>{
      const line=document.createElement("div");line.className="business-row";
      const name=document.createElement("strong");name.textContent=(index+1)+". "+(names.get(id)||id);
      const number=document.createElement("small");number.textContent=count.toLocaleString()+" view(s)";
      line.append(name,number);top.append(line);
    });
  }else{
    setText("jdrGameViews","—");setText("jdrGamesViewed","—");
    top.textContent="Cannot load game detail views.";
    warnings.push("game views: "+(viewsResult.reason?.code||"read error"));
  }
  status.textContent=(snapshot.size>=500?"⚠️ Low-read mode: showing a sample of up to 500 visit records, not lifetime totals. ":"Low-read mode active. ")+(warnings.length?"Some analytics could not load ("+warnings.join("; ")+").":"Analytics loaded. Dates use Philippine time.");
  await jdrLoadV6Analytics();
 }catch(error){
  console.error("Visitor analytics:",error);
  status.textContent="Unable to read websiteVisits: "+(error.code||error.message||"Unknown error");
 }
}
document.getElementById("jdrRefreshVisitors").addEventListener("click",jdrLoadVisitorAnalytics);

/* V6 INTEREST DASHBOARD — READ ONLY */
async function jdrLoadV6Analytics(){
 const status=document.getElementById('jdrVisitorStatus');
 const put=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
 const ids=['jdrMobileSessions','jdrDesktopSessions','jdrRentClicks','jdrWaitingClicks','jdrClicksToday','jdrClicksMonth'];
 try{
  const snap=await getDocs(query(collection(db,'visitorAnalyticsEvents'),limit(500)));
  const phKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const today=phKey(new Date()),month=today.slice(0,7);
  const mobile=new Set(),desktop=new Set(),counts=new Map();let rent=0,waiting=0,day=0,monthly=0;
  snap.forEach(row=>{const d=row.data(),t=d.type,sid=d.sessionId||row.id;
   if(t==='device_mobile')mobile.add(sid);if(t==='device_desktop')desktop.add(sid);
   if(t!=='rent_click'&&t!=='waiting_click')return;
   if(t==='rent_click')rent++;else waiting++;
   if(d.gameId)counts.set(d.gameId,(counts.get(d.gameId)||0)+1);
   const when=d.createdAt?.toDate?.();if(when){const key=phKey(when);if(key===today)day++;if(key.slice(0,7)===month)monthly++}
  });
  [mobile.size,desktop.size,rent,waiting,day,monthly].forEach((v,i)=>put(ids[i],v.toLocaleString()));
  const target=document.getElementById('jdrTopInterest');target.replaceChildren();
  const ranking=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!ranking.length)target.textContent='No game-specific rental interest clicks yet. Some modal buttons may not identify a game.';
  ranking.forEach(([id,count],i)=>{const row=document.createElement('div');row.className='business-row';row.textContent=(i+1)+'. '+id+' — '+count+' click(s)';target.appendChild(row)});
 }catch(e){ids.forEach(id=>put(id,'—'));put('jdrTopInterest','V6 analytics unavailable: '+(e.code||e.message));status.textContent+=' V6 read access may need Firestore rules updated.';console.warn('V6 analytics',e)}
}

window.addEventListener('jdr:load-analytics',()=>{
  if(auth.currentUser?.uid===ADMIN_UID)jdrLoadVisitorAnalytics();
});

/* FIREBASE AUTHENTICATION */

const ADMIN_UID="4APTlwgwMTNSsdpp76jWwDiEZxp1";
onAuthStateChanged(auth,user=>{
  if(!user){
    location.href="admin-login.html";
    return;
  }
  if(user.uid!==ADMIN_UID){
    jdrNotice("This account is not authorized to access the admin dashboard.");
    signOut(auth).then(()=>location.href="admin-login.html");
    return;
  }

  jdrStartWaitingNotifications();
  // Low-read V6.9: visitor analytics only loads when Analytics tab is opened.
  // jdrLoadVisitorAnalytics();
  jdrStartUnliAdmin();
  loadAdminReviews();
  psnLoad().then(()=>loadAdminGames().then(()=>{v4RenderCalendar();renderPsnExpiryAlerts();return psnSyncFromGames();})).catch(console.error);
  loadBlacklist();
  refreshCustomerSafetyAlerts();
  v4LoadFinance().catch(console.error);
  v4RenderCalendar();
  loadActivityHistory();
  loadBusinessOverview();
  // Sync existing reservations once when admin opens dashboard.
  loadWaitingList().catch(error=>console.error("Counter sync:",error));

  // V6.9: game list already loads in the psnLoad() chain above; no duplicate startup scan.
});

/* V6.8: No automatic full-collection polling. Changes are refreshed after admin actions. */

/* Admin dashboard navigation (formerly inline classic script). */
{
/* Premium Admin V2: presentation/navigation only. Preserve Firebase IDs and handlers. */
document.addEventListener('DOMContentLoaded',function(){
  const main=document.querySelector('main.container');
  if(!main||document.getElementById('jdrCleanNav'))return;
  main.querySelector('nav.v4-nav')?.remove();
  const sections=[
    ['overview','🏠 Overview','Rental status and urgent items at a glance'],
    ['analytics','📊 Analytics','Visitor activity, device reports and game interest'],
    ['games','🎮 Games','Manage games, prices and availability'],
    ['psn','📧 PSN Accounts','Saved accounts and game ownership'],
    ['rentals','👤 Rentals','Assignments, history and UNLI settings'],
    ['calendar','📅 Calendar','Returns and upcoming expiries'],
    ['finances','💰 Finances','Recorded income and expenses'],
    ['customers','🛡️ Customers','Waiting list, reviews and safety records']
  ];
  const nav=document.createElement('nav');nav.id='jdrCleanNav';nav.className='jdr-clean-nav';nav.setAttribute('aria-label','Admin workspace navigation');
  const pages={};
  sections.forEach(([key,label,desc])=>{
    const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.page=key;btn.setAttribute('aria-selected',String(key==='overview'));nav.appendChild(btn);
    const page=document.createElement('section');page.id='jdrClean_'+key;page.className='jdr-clean-page';page.hidden=key!=='overview';page.setAttribute('aria-label',label);
    const heading=document.createElement('h2');heading.textContent=label;page.appendChild(heading);
    const intro=document.createElement('p');intro.className='jdr-clean-intro';intro.textContent=desc;page.appendChild(intro);
    pages[key]=page;
  });
  main.insertBefore(nav,main.firstElementChild);
  Object.values(pages).forEach(page=>main.appendChild(page));
  const byId=id=>document.getElementById(id);
  const move=(node,key)=>{if(node)pages[key].appendChild(node)};
  const quick=byId('v4Psn');
  if(quick){
    const psnActions=document.createElement('section');psnActions.className='management-shortcuts';
    const rentalActions=document.createElement('section');rentalActions.className='management-shortcuts';
    const customerActions=document.createElement('section');customerActions.className='management-shortcuts';
    ['openPsnLibrary','openPsnPanel'].forEach(id=>{if(byId(id))psnActions.appendChild(byId(id))});
    ['openRentalPanel'].forEach(id=>{if(byId(id))rentalActions.appendChild(byId(id))});
    ['openReviewsPanel','openBlacklistPanel','openMembersPanel'].forEach(id=>{if(byId(id))customerActions.appendChild(byId(id))});
    move(psnActions,'psn');move(rentalActions,'rentals');move(customerActions,'customers');
    quick.remove();
  }
  move(byId('jdrVisitorAnalytics'),'analytics');
  move(byId('v4Overview'),'overview');
  move(main.querySelector('h2.title'),'overview');
  move(main.querySelector('p.subtitle'),'overview');
  move(main.querySelector('section.stats'),'overview');
  const priority=Array.from(main.querySelectorAll('section.priority-panel')).find(el=>el.id!=='psnExpiryCenter');
  move(priority,'overview');
  move(main.querySelector('section.business-panel'),'overview');
  move(main.querySelector('section.history-panel'),'rentals');
  move(byId('psnExpiryCenter'),'calendar');
  move(byId('v4Calendar'),'calendar');
  move(byId('v4Finance'),'finances');
  move(byId('v4Games'),'games');
  move(main.querySelector('.v4-toolbar:has(#v4GameSearch)'),'games');
  move(byId('addGameButton'),'games');move(byId('gameGrid'),'games');
  const note=Array.from(main.children).find(el=>el.classList&&el.classList.contains('note'));move(note,'games');
  move(byId('jdrUnliAdmin'),'rentals');
  const waitingBtn=document.createElement('button');waitingBtn.type='button';waitingBtn.innerHTML='<strong>📋 Waiting List ↗</strong><small>View current waiting requests</small>';
  waitingBtn.addEventListener('click',()=>byId('waitingListCard')?.click());
  const customerActions=pages.customers.querySelector('.management-shortcuts');
  if(customerActions)customerActions.prepend(waitingBtn);
  const jump=document.createElement('div');jump.className='jdr-v2-quick';
  [['analytics','📊 Visitor Analytics'],['games','🎮 Manage Games'],['rentals','👤 Rental Records'],['customers','📋 Customer Tools']].forEach(([key,label])=>{
    const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>selectPage(key));jump.appendChild(b);
  });
  pages.overview.insertBefore(jump,pages.overview.children[2]||null);
  const business=pages.overview.querySelector('.business-panel');
  if(business){
    const details=document.createElement('details');details.className='jdr-v2-expand';
    const summary=document.createElement('summary');summary.textContent='🚀 Smart Business Reports — click to expand';
    business.parentNode.insertBefore(details,business);details.appendChild(summary);details.appendChild(business);
  }
  let jdrAnalyticsLastLoaded=0;
  function selectPage(key){
    if(!pages[key])return;
    Object.entries(pages).forEach(([id,page])=>{page.hidden=id!==key});
    // On-demand analytics: no Firestore visitor scans on every admin login.
    if(key==='analytics' && Date.now()-jdrAnalyticsLastLoaded>90000){
      jdrAnalyticsLastLoaded=Date.now();
      window.dispatchEvent(new Event('jdr:load-analytics'));
    }
    nav.querySelectorAll('button').forEach(btn=>btn.setAttribute('aria-selected',String(btn.dataset.page===key)));
    try{history.replaceState(null,'','#'+key)}catch(e){}
    window.scrollTo({top:0,behavior:'instant'});
  }
  nav.addEventListener('click',e=>{const btn=e.target.closest('button[data-page]');if(btn)selectPage(btn.dataset.page)});
  const hash=location.hash.slice(1);if(pages[hash])selectPage(hash);
});
}
// Shared pricing UI: retain existing HTML IDs without duplicate Firebase price fields.
(function setupSharedPricingUI() {
  function setup(prefix) {
    const trophy=document.getElementById(prefix+"MonthlyTrophy");
    const non=document.getElementById(prefix+"MonthlyNonTrophy");
    if(trophy&&non) {
      trophy.addEventListener("input",()=>{non.value=trophy.value;});
      non.readOnly=true;
      non.setAttribute("aria-label","Same as Trophy UNLI SWAP price");
      non.title="Automatically matches Trophy UNLI SWAP";
    }
    const keys=["WeeklyTrophy","WeeklyNonTrophy","TwoWeeksTrophy","TwoWeeksNonTrophy",
      "SingleMonthlyTrophy","SingleMonthlyNonTrophy","MonthlyTrophy","MonthlyNonTrophy"];
    for(const key of keys) {
      const input=document.getElementById(prefix+"Rentplay"+key);
      if(input) {
        input.disabled=true;
        const wrapper=input.closest(".price-field, .form-group, .field, label");
        input.style.display="none";
        const label=document.querySelector('label[for="'+input.id+'"]');
        if(label)label.style.display="none";
      }
    }
  }
  setup("new"); setup("manage");
})();
// V7.0 Smart Swap — same rental ID, no financial write.
const jdrSwapLabels={weekly:'1 Week',fortnight:'14 Days',single:'1 Month Single Game',unli:'1 Month UNLI SWAP'};
function jdrSwapWarning(r,day){
 if(r.status!=='rented'||!r.returnDate||r.returnDate<day)throw Error('Rental expired or not active.');
 if(!jdrSwapLabels[r.rentalPlan])throw Error('Configure rental plan first.');
 const dates=r.swapDates||[];
 if(r.rentalPlan==='single')return 'Single-game plan has no swaps.';
 if((r.rentalPlan==='weekly'&&dates.length>=1)||(r.rentalPlan==='fortnight'&&dates.length>=2))return 'Swap allowance used.';
 if(dates.some(d=>Date.parse(day)-Date.parse(d)<7*86400000))return 'Maximum one swap per rolling 7 days.';
 return '';
}
function jdrSwapFingerprint(r){return JSON.stringify([r.rentalPlan,r.swapDates||[],r.swapCount||0]);}
function jdrSwapApproval(warning){return new Promise(resolve=>{
 const d=document.createElement('dialog');d.className='jdr-premium-dialog';
 d.innerHTML='<div class="jdr-dialog-icon info">!</div><h2>Swap Limit Reached</h2><p></p><label>Reason for override (optional)<textarea rows="2" maxlength="500" style="width:100%;box-sizing:border-box"></textarea></label><label style="display:block;margin:12px 0"><input type="checkbox" style="width:auto"> I authorize this additional game swap.</label><div class="jdr-dialog-actions"><button type="button" class="jdr-dialog-cancel">Cancel</button><button type="button" disabled>Approve &amp; Continue Swap</button></div>';
 d.querySelector('p').textContent=warning+' Admin approval is required.';
 const check=d.querySelector('input'), buttons=d.querySelectorAll('button');let result=null;
 check.onchange=()=>buttons[1].disabled=!check.checked;
 buttons[0].onclick=()=>d.close();buttons[1].onclick=()=>{if(check.checked){result={reason:d.querySelector('textarea').value.trim()};d.close();}};
 document.body.append(d);d.addEventListener('close',()=>{d.remove();resolve(result);},{once:true});d.showModal();buttons[0].focus();
});}
async function jdrOpenSwap(r){
 if(auth.currentUser?.uid!==ADMIN_UID)return;
 if(!jdrSwapLabels[r.rentalPlan]){jdrNotice('Configure the rental plan and previous swap dates in Edit Renter first.');return;}
 let warning;try{warning=jdrSwapWarning(r,todayISO());}catch(e){jdrNotice(e.message);return;}
 const approval=warning?await jdrSwapApproval(warning):null;if(warning&&!approval)return;
 const approvedFingerprint=jdrSwapFingerprint(r);
 const dlg=document.createElement('dialog');dlg.style.cssText='width:min(92vw,480px);max-height:85vh;overflow:auto;background:#09172c;color:white;border:1px solid #31558d;border-radius:14px;padding:20px';
 dlg.innerHTML=`<div class="psn-panel"><h3>🔄 Smart Swap Game</h3><p id="jdrSwapInfo"></p><p id="jdrSwapSummary"></p><label>Available game and PSN account</label><select id="jdrSwapTarget"></select><label><input type="checkbox" id="jdrSwapProof" style="width:auto"> Verified return / disable proof and account access secured</label><p id="jdrSwapMessage" role="status"></p><button type="button" id="jdrSwapConfirm">Confirm swap</button> <button type="button" id="jdrSwapClose">Close</button></div>`;
 document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove());dlg.showModal();
 const q=id=>dlg.querySelector('#'+id),msg=q('jdrSwapMessage'),btn=q('jdrSwapConfirm'),close=q('jdrSwapClose');
 q('jdrSwapInfo').textContent=r.renterName+' • '+psnGameTitle(r.gameId)+' • '+psnSlotLabel(r.slot)+' • Expiry: '+r.returnDate;
 q('jdrSwapSummary').textContent=jdrSwapLabels[r.rentalPlan]+' • Recorded swaps: '+(r.swapCount||0)+(warning?' • Admin override approved':' • Eligible to swap');
 close.onclick=()=>dlg.close();dlg.addEventListener('cancel',e=>{if(btn.disabled&&close.disabled)e.preventDefault()});
 const targets=[];for(const a of psnAccounts)for(const gid of a.gameIds||[]){if(gid===r.gameId||!gameCache.has(gid)||gameCache.get(gid).status==='upcoming')continue;if(psnRentals.some(x=>x.status==='rented'&&x.accountId===a.id&&x.slot===r.slot))continue;targets.push({accountId:a.id,gameId:gid});const o=document.createElement('option');o.value=String(targets.length-1);o.textContent=psnGameTitle(gid)+' — '+a.email;q('jdrSwapTarget').append(o);}
 if(!targets.length)msg.textContent='No eligible free account slots. Refresh rentals and retry.';
 btn.onclick=async()=>{if(!q('jdrSwapProof').checked){msg.textContent='Verify return proof first.';return;}const target=targets[Number(q('jdrSwapTarget').value)];if(!target)return;btn.disabled=close.disabled=true;try{
 const day=todayISO();if(auth.currentUser?.uid!==ADMIN_UID)throw Error('Admin access required.');
 const [as,rs]=await Promise.all([getDocs(collection(db,'psnAccounts')),getDocs(collection(db,'psnRentals'))]);
 const gids=[r.gameId,target.gameId], ar=as.docs.filter(d=>(d.data().gameIds||[]).some(g=>gids.includes(g))).map(d=>d.ref), rr=rs.docs.filter(d=>d.id!==r.id&&(gids.includes(d.data().gameId)||d.data().accountId===target.accountId)).map(d=>d.ref);
 const ref=doc(db,'psnRentals',r.id),gr=gids.map(g=>doc(db,'games',g)),hr=doc(collection(db,'psnRentalHistory'));
 await runTransaction(db,async tx=>{const [current,g1,g2,...rest]=await Promise.all([tx.get(ref),...gr.map(x=>tx.get(x)),...ar.map(x=>tx.get(x)),...rr.map(x=>tx.get(x))]);if(!current.exists()||!g1.exists()||!g2.exists()||g2.data().status==='upcoming')throw Error('Rental or game unavailable.');const f=current.data();if(f.gameId!==r.gameId||f.accountId!==r.accountId||f.slot!==r.slot||f.returnDate!==r.returnDate)throw Error('Rental changed. Refresh.');const liveWarning=jdrSwapWarning(f,day);if(jdrSwapFingerprint(f)!==approvedFingerprint||liveWarning!==warning)throw Error('Swap eligibility changed. Close and reopen to review.');if(liveWarning&&!approval)throw Error('Admin approval required.');
 const accounts=rest.slice(0,ar.length).filter(x=>x.exists()).map(x=>({id:x.id,...x.data()})),others=rest.slice(ar.length).filter(x=>x.exists()).map(x=>({id:x.id,...x.data()}));
 if(!accounts.some(a=>a.id===target.accountId&&(a.gameIds||[]).includes(target.gameId))||others.some(x=>x.status==='rented'&&x.accountId===target.accountId&&x.slot===f.slot))throw Error('Target slot no longer available.');
 const dates=[...(f.swapDates||[]),day],next={...f,...target,swapDates:dates,swapCount:dates.length};
 for(let i=0;i<gids.length;i++){const pub=jdrPublicSlotFromRentals(gids[i],f.slot,accounts,[...others,{...next,id:r.id}]);if(!pub)throw Error('Cannot verify public slot capacity.');const fields=slotFields(f.slot);tx.update(gr[i],{[fields.status]:pub.status,[fields.date]:pub.date,updatedAt:serverTimestamp()});}
 tx.update(ref,{...target,gameName:psnGameTitle(target.gameId),swapDates:dates,swapCount:dates.length,updatedAt:serverTimestamp()});if(f.memberUid)jdr85History(tx,f.memberUid,r.id,next);tx.set(hr,{action:'Game Swap',rentalId:r.id,accountId:target.accountId,gameId:target.gameId,gameName:psnGameTitle(target.gameId),slot:f.slot,renterName:f.renterName,previousGameId:f.gameId,previousAccountId:f.accountId,adminOverride:!!liveWarning,overrideReason:liveWarning?(approval?.reason||''):'',overrideWarning:liveWarning,approvedBy:liveWarning?auth.currentUser.uid:'',details:psnGameTitle(f.gameId)+' → '+psnGameTitle(target.gameId)+'; expiry '+f.returnDate+'; no payment',createdAt:serverTimestamp()});});
 dlg.close();psnClearRental();await Promise.allSettled([loadAdminGames(),psnLoad()]);jdrNotice(psnGameTitle(r.gameId)+' → '+psnGameTitle(target.gameId)+'\nExpiry: '+r.returnDate+'\nAdditional charge: ₱0.00\nRecorded swaps: '+((r.swapDates||[]).length+1)+'\nOriginal expiry and payment retained.','Swap Successful!','success');
 }catch(e){msg.textContent=e.message;btn.disabled=close.disabled=false;}};
}

// V7.1 premium dialogs; confirmations remain explicitly awaited.
function jdrDialog(message,title,kind,ask=false){return new Promise(resolve=>{
 const d=document.createElement('dialog');d.className='jdr-premium-dialog';
 const icon=document.createElement('div');icon.className='jdr-dialog-icon '+kind;icon.textContent=kind==='success'?'✓':kind==='error'?'!':ask?'?':'i';
 const heading=document.createElement('h2');heading.textContent=title;
 const body=document.createElement('p');body.textContent=String(message);
 const actions=document.createElement('div');actions.className='jdr-dialog-actions';
 let result=false;const button=document.createElement('button');button.type='button';button.textContent=ask?'Confirm':'Done';button.onclick=()=>{result=true;d.close();};
 if(ask){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.className='jdr-dialog-cancel';cancel.onclick=()=>d.close();actions.append(cancel);}
 actions.append(button);d.append(icon,heading,body,actions);document.body.append(d);d.addEventListener('close',()=>{d.remove();resolve(result);},{once:true});d.showModal();if(ask)actions.firstChild.focus();else button.focus();
});}
let jdrNoticeQueue=Promise.resolve();
function jdrNotice(message,title,kind){const m=String(message);kind=kind||(/unable|failed|error|not authorized|cannot|invalid/i.test(m)?'error':/success|saved|updated|confirmed|deleted|cleared/i.test(m)?'success':'info');jdrNoticeQueue=jdrNoticeQueue.then(()=>jdrDialog(m,title||(kind==='success'?'Action Successful':kind==='error'?'Action Failed':'Admin Notice'),kind)).catch(console.error);}
function jdrConfirm(message){return jdrDialog(message,'Confirm Action','info',true);}

/* V8.2 Members management — on-demand reads, admin-only transactions */
{
 const host=$('jdrMembersList'), msg=$('jdrMembersMessage');
 let members=[], rewards=new Map(), busy=false;
 const rank=n=>n>=10000?'Legendary Gamer':n>=5000?'Platinum Gamer':n>=2500?'Gold Gamer':n>=1000?'Silver Gamer':'Bronze Gamer';
 const multiplier=n=>n>=10000?2:n>=5000?1.5:n>=2500?1.25:n>=1000?1.1:1;
 const guard=()=>{if(auth.currentUser?.uid!==ADMIN_UID)throw Error('Admin access required.');};
 const ref=u=>doc(db,'memberRewards',u);
 const ledger=(u,id)=>doc(db,'memberPointsHistory',u,'records',id);
 const base={points:0,lifetimePoints:0,completedRentals:0,status:'active',rank:'Bronze Gamer'};
 async function load(){guard();const [a,b]=await Promise.all([getDocs(collection(db,'members')),getDocs(collection(db,'memberRewards'))]);members=a.docs.map(d=>({...d.data(),uid:d.id}));rewards=new Map(b.docs.map(d=>[d.id,d.data()]));render();await redemptionQueue84();}
 async function action(fn){if(busy)return;busy=true;msg.textContent='Working…';try{guard();await fn();msg.textContent='Saved / completed.';}catch(e){msg.textContent=e.message;}finally{busy=false;}}
 function button(parent,label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>action(fn);parent.append(b);}
 async function change(u,kind,delta,reason,status){const id=doc(collection(db,'memberPointsHistory',u,'records')).id;await runTransaction(db,async tx=>{const s=await tx.get(ref(u));if(kind==='redeem'){const pending=await tx.get(doc(db,'memberRedemptionRequests',u));if(pending.exists()&&pending.data().status==='pending')throw Error('Process the pending redemption request instead.');}const r=s.exists()?s.data():base;if(kind==='activate'&&s.exists())throw Error('Already activated.');if(kind!=='activate'&&!s.exists())throw Error('Activate membership first.');if(kind==='redeem'&&r.status!=='active')throw Error('Membership is not active.');const points=Number(r.points||0)+delta,lifetime=Number(r.lifetimePoints||0)+(delta>0?delta:0);if(!Number.isSafeInteger(points)||points<0||!Number.isSafeInteger(lifetime))throw Error('Invalid or insufficient points.');tx.set(ref(u),{...r,points,lifetimePoints:lifetime,rank:rank(lifetime),status:status||r.status,updatedAt:serverTimestamp()});tx.set(ledger(u,id),{kind,delta,reason,createdAt:serverTimestamp(),actor:ADMIN_UID});if(status){tx.set(doc(db,'customerSafety','member_'+u),{customerName:members.find(m=>m.uid===u).fullName,normalizedName:normalizeCustomerName(members.find(m=>m.uid===u).fullName),memberUid:u,status:status==='blacklisted'||status==='suspended'?'blacklisted':status==='warning'?'warning':'good',reason,updatedAt:serverTimestamp()},{merge:true});}});await load();}
 async function chooseRental(u,returnedOnly=false){
 const snap=await getDocs(collection(db,'psnRentals'));
 const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>returnedOnly?r.memberUid===u&&r.status==='returned':!r.memberUid||r.memberUid===u);
 const dlg=document.createElement('dialog');dlg.className='jdr83-picker';
 const title=document.createElement('h3');title.textContent=returnedOnly?'Choose completed rental':'Choose rental to link';
 const search=document.createElement('input');search.placeholder='Search renter or game';const list=document.createElement('div');const cancel=document.createElement('button');cancel.textContent='Cancel';dlg.append(title,search,list,cancel);document.body.append(dlg);
 return new Promise(resolve=>{let chosen='';function draw(){list.replaceChildren();const q=search.value.toLowerCase();for(const r of rows.filter(r=>[r.renterName,psnGameTitle(r.gameId),r.id].join(' ').toLowerCase().includes(q))){const b=document.createElement('button');b.textContent=[r.renterName,psnGameTitle(r.gameId),r.slot,r.status,r.returnDate].join(' · ');b.onclick=()=>{chosen=r.id;dlg.close()};list.append(b);}if(!list.children.length)list.textContent='No matching rentals.';}search.oninput=draw;cancel.onclick=()=>dlg.close();dlg.addEventListener('close',()=>{dlg.remove();resolve(chosen)},{once:true});draw();dlg.showModal();});
 }
 async function link(u){const id=await chooseRental(u);if(!id)return;if(id.includes('/'))throw Error('Invalid rental ID.');const rr=doc(db,'psnRentals',id),s=await getDoc(rr);if(!s.exists())throw Error('Rental not found.');const r=s.data();if(!await jdrConfirm('Link '+r.renterName+' / '+psnGameTitle(r.gameId)+' to '+members.find(m=>m.uid===u).email+'? Verify identity first.'))return;await runTransaction(db,async tx=>{const [a,b]=await Promise.all([tx.get(rr),tx.get(ref(u))]);if(!a.exists()||!b.exists())throw Error('Rental or active profile missing.');const x=a.data();if(x.memberUid&&x.memberUid!==u)throw Error('Rental already linked to another member.');if(b.data().status!=='active')throw Error('Member is not active.');tx.update(rr,{memberUid:u});jdr85History(tx,u,id,x);});}
 async function award(u){const id=await chooseRental(u,true);if(!id)return;if(!await jdrConfirm('Confirm return proof and eligible payments?'))return;const result=await jdr85Complete(id,false,u);await load();if(result)jdrNotice(result);}
 function render(){host.replaceChildren();const q=$('jdrMembersSearch').value.toLowerCase();$('jdrMembersStats').textContent=`Members: ${members.length} | Active: ${[...rewards.values()].filter(r=>r.status==='active').length} | Restricted: ${[...rewards.values()].filter(r=>['blacklisted','suspended'].includes(r.status)).length} | Outstanding points: ${[...rewards.values()].reduce((s,r)=>s+Number(r.points||0),0)}`;for(const m of members.filter(m=>[m.uid,m.fullName,m.email].join(' ').toLowerCase().includes(q))){const r=rewards.get(m.uid),card=document.createElement('div');card.className='psn-entry';psnLine(card,'strong',m.fullName||'Member');psnLine(card,'small',`${m.email} | ${m.uid}`);psnLine(card,'p',r?`${rank(Number(r.lifetimePoints||0))} • ${r.status} • ${r.points} points • ${r.lifetimePoints} lifetime • ${r.completedRentals||0} rewarded rentals`:'Pending activation');if(!r)button(card,'Activate',()=>change(m.uid,'activate',0,'Initial activation'));else{button(card,'Adjust points',async()=>{const raw=prompt('Signed whole points (+ or -):');if(raw===null)return;const n=Number(raw),reason=prompt('Reason:')?.trim();if(!Number.isSafeInteger(n)||!n||!reason)throw Error('Valid points and reason required.');await change(m.uid,'adjust',n,reason);});button(card,'Redeem discount',async()=>{const n=Number(prompt('Points: 100 / 200 / 400 / 800'));if(![100,200,400,800].includes(n))return;if(await jdrConfirm(`Apply ₱${n/4} discount manually to customer payment?`))await change(m.uid,'redeem',-n,'Discount ₱'+n/4);});button(card,'VIP benefits',()=>jdr87Vip(m.uid));button(card,'Link rental',()=>link(m.uid));button(card,'Credit completed rental',()=>award(m.uid));button(card,'Change status / violation',async()=>{const s=prompt('active / warning / suspended / blacklisted')?.trim();if(!['active','warning','suspended','blacklisted'].includes(s))return;const reason=prompt('Reason / incident:')?.trim();if(!reason)return;if(await jdrConfirm('Set membership to '+s+'?'))await change(m.uid,'status',0,reason,s);});button(card,'Points / violation history',async()=>{const snap=await getDocs(query(collection(db,'memberPointsHistory',m.uid,'records'),orderBy('createdAt','desc'),limit(50)));const out=card.querySelector('pre')||document.createElement('pre');out.style.whiteSpace='pre-wrap';out.textContent=snap.docs.map(d=>{const x=d.data();return `${x.createdAt?.toDate?.().toLocaleString()||''} | ${x.kind} | ${x.delta} | ${x.reason||x.rentalId||''}`;}).join('\n')||'No history';card.append(out);});}host.append(card);}}

 const queue=document.createElement('div');queue.className='psn-entry';host.before(queue);
 async function redemptionQueue84(){
 guard();queue.replaceChildren();psnLine(queue,'strong','Pending reward requests');
 const snap=await getDocs(query(collection(db,'memberRedemptionRequests'),where('status','==','pending')));
 if(snap.empty)psnLine(queue,'p','No pending requests.');
 for(const d of snap.docs){const x=d.data(),u=d.id,card=document.createElement('div');card.className='psn-entry';queue.append(card);psnLine(card,'strong',members.find(m=>m.uid===u)?.fullName||u);psnLine(card,'p',`${x.points} points — ₱${x.points/4}`);
 for(const decision of ['approved','declined'])button(card,decision==='approved'?'Approve discount':'Decline request',async()=>{
 if(!await jdrConfirm(decision==='approved'?`Confirm ₱${x.points/4} discount for this member? Apply it to the agreed rental payment only once.`:'Decline this request without deducting points?'))return;
 await runTransaction(db,async tx=>{const rr=d.ref,lr=ledger(u,'request_'+x.requestId);const [s,b,l]=await Promise.all([tx.get(rr),tx.get(ref(u)),tx.get(lr)]);if(!s.exists()||s.data().status!=='pending'||s.data().requestId!==x.requestId||s.data().points!==x.points||l.exists())throw Error('Request already processed or changed. Refresh.');if(![100,200,400,800].includes(x.points))throw Error('Invalid request.');if(decision==='approved'){const v=b.data();if(!v||v.status!=='active'||!Number.isSafeInteger(v.points)||v.points<x.points)throw Error('Insufficient points or inactive membership.');tx.update(ref(u),{points:v.points-x.points,updatedAt:serverTimestamp()});tx.set(lr,{kind:'redeem',delta:-x.points,reason:'Approved discount ₱'+x.points/4,requestId:x.requestId,createdAt:serverTimestamp(),actor:ADMIN_UID});}tx.update(rr,{status:decision,decidedAt:serverTimestamp(),actor:ADMIN_UID});});await load();
 });}
 }
 $('openMembersPanel').onclick=()=>{openModal('jdrMembersModal');action(load);};$('closeMembersPanel').onclick=()=>closeModal('jdrMembersModal');$('jdrMembersRefresh').onclick=()=>action(load);$('jdrMembersSearch').oninput=render;
}
// V8.5 — optional verified member assignment and idempotent rewards.
function jdr85History(tx,u,id,r){tx.set(doc(db,'memberRentalHistory',u,'records',id),{rentalId:id,gameName:psnGameTitle(r.gameId),slot:r.slot,startDate:r.startDate||'',returnDate:r.returnDate||'',status:r.status,...(Number.isFinite(r.estimatePaid)?{estimatePaid:r.estimatePaid}:{}),updatedAt:serverTimestamp()});}
async function jdr85Complete(id,markReturned,expectedUid){
 if(auth.currentUser?.uid!==ADMIN_UID)throw Error('Admin only');
 const rr=doc(db,'psnRentals',id);
 const initial=await getDoc(rr);if(!initial.exists())throw Error('Rental missing');
 const uid=initial.data().memberUid;
 const payments=uid?await getDocs(query(collection(db,'adminFinanceTransactions'),where('rentalId','==',id))):null;
 return runTransaction(db,async tx=>{
 const snap=await tx.get(rr);if(!snap.exists())throw Error('Rental missing');const r=snap.data();
 if(r.memberUid!==uid||(expectedUid&&uid!==expectedUid))throw Error('Member link changed. Refresh and retry.');
 if(r.status!=='returned'&&(!markReturned||r.status!=='rented'))throw Error('Requires confirmed return.');
 let message='Return saved.';
 if(uid){
 const mr=doc(db,'memberRewards',uid),lr=doc(db,'memberPointsHistory',uid,'records','rental_'+id);
 const [m,l,...ps]=await Promise.all([tx.get(mr),tx.get(lr),...payments.docs.map(p=>tx.get(p.ref))]);
 const valid=ps.filter(p=>p.exists()&&p.data().type==='income'&&p.data().rentalId===id&&['New rental','Rental extension'].includes(p.data().category)&&Number.isFinite(Number(p.data().amount))&&Number(p.data().amount)>0);
 const base=valid.filter(p=>p.data().category==='New rental');
 const paid=valid.reduce((a,p)=>a+Math.round(Number(p.data().amount)*100),0)/100;
 if(l.exists())message='Rental already rewarded. No duplicate points.';
 else if(!m.exists()||m.data().status!=='active')message='Return saved; rewards skipped: membership not active.';
 else if(base.length!==1||!Number.isFinite(paid)||paid<=0||(r.initialPaymentId&&base[0].id!==r.initialPaymentId)||(r.lastPaidExtensionId&&!valid.some(p=>p.id===r.lastPaidExtensionId)))message='Return saved; rewards skipped: confirmed payment records incomplete. Review and use Credit completed rental.';
 else {const x=m.data(),life=Number(x.lifetimePoints||0),balance=Number(x.points||0),mult=life>=10000?2:life>=5000?1.5:life>=2500?1.25:life>=1000?1.1:1,delta=Math.floor(Math.floor(paid/10)*mult+1e-9),next=life+delta;
 if(!Number.isSafeInteger(next)||!Number.isSafeInteger(balance+delta)||balance<0||life<0)throw Error('Invalid member points.');
 tx.update(mr,{points:balance+delta,lifetimePoints:next,rank:next>=10000?'Legendary Gamer':next>=5000?'Platinum Gamer':next>=2500?'Gold Gamer':next>=1000?'Silver Gamer':'Bronze Gamer',completedRentals:Number(x.completedRentals||0)+1,updatedAt:serverTimestamp()});
 tx.set(lr,{kind:'rental',rentalId:id,paid,delta,createdAt:serverTimestamp(),actor:ADMIN_UID});message=`Rental completed: +${delta} reward points.`;}
 jdr85History(tx,uid,id,{...r,status:'returned'});
 }
 if(markReturned&&r.status!=='returned')tx.update(rr,{status:'returned',updatedAt:serverTimestamp()});
 return message;
 });
}
(function(){const input=$('psnRenterName');const wrap=document.createElement('div');wrap.style.cssText='margin:12px 0';const label=document.createElement('label');label.textContent='Member (optional — verify identity)';const select=document.createElement('select');select.id='jdr85Member';select.add(new Option('Guest / no member',''));const load=document.createElement('button');load.type='button';load.textContent='Load active members';wrap.append(label,select,load);input.parentElement.after(wrap);load.onclick=async()=>{load.disabled=true;try{if(auth.currentUser?.uid!==ADMIN_UID)throw Error('Admin only');const [a,b]=await Promise.all([getDocs(collection(db,'members')),getDocs(collection(db,'memberRewards'))]);const active=new Set(b.docs.filter(d=>d.data().status==='active').map(d=>d.id));select.replaceChildren(new Option('Guest / no member',''));for(const d of a.docs.filter(d=>active.has(d.id)))select.add(new Option(`${d.data().fullName||'Member'} — ${d.data().email||d.id}`,d.id));}catch(e){jdrNotice(e.message);}finally{load.disabled=false;}};let last='';document.addEventListener('click',()=>setTimeout(()=>{const id=$('psnRentalEditId').value;wrap.hidden=!!id;if(id!==last){select.value='';last=id;}},0));$('psnRentalForm').addEventListener('reset',()=>{select.value='';});})();

async function jdr87Vip(uid){
 const period=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const year=period.find(x=>x.type==='year').value,month=period.find(x=>x.type==='month').value;
 const rr=doc(db,'memberRewards',uid);
 const [rs,bs,ss]=await Promise.all([getDoc(rr),getDoc(doc(db,'memberVouchers',uid,'records','birthday_'+year)),getDoc(doc(db,'memberVouchers',uid,'records','bonus_'+year+'_'+month))]);
 const r=rs.data(),v=bs.data(),used=Number(ss.data()?.used||0),n=Number(r?.lifetimePoints||0),tier=n>=10000?4:n>=5000?3:n>=2500?2:n>=1000?1:0,max=tier===4?2:tier===3?1:0,active=r?.status==='active';
 const result=await new Promise(resolve=>{
 const d=document.createElement('dialog');d.style.cssText='width:min(480px,92vw);max-height:85vh;overflow:auto;background:#101e32;color:#edf6ff;border:1px solid #39638c;border-radius:18px;padding:22px;z-index:2147483647';
 const line=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;d.append(e);return e;};
 line('h2','VIP Benefits Management · V8.7.1');line('p',['Bronze','Silver','Gold','Platinum','Legendary'][tier]+' Gamer · '+(r?.status||'inactive')+' · '+n+' lifetime points');
 const date=line('input','');date.type='date';date.min=year+'-'+month+'-01';date.max=year+'-'+month+'-'+String(new Date(Number(year),Number(month),0).getDate()).padStart(2,'0');date.setAttribute('aria-label','Verified birthday (current month)');date.disabled=!active||!tier||bs.exists();
 const note=line('textarea','');note.placeholder='Reference / verification note (no sensitive ID details)';note.style.cssText='display:block;width:100%;margin:12px 0;min-height:65px';
 const msg=line('p','');const finish=x=>{d.close();d.remove();resolve(x);};
 const add=(label,choice,enabled)=>{const b=line('button',label);b.type='button';b.disabled=!enabled;b.style.cssText='display:block;width:100%;margin:8px 0;padding:10px;border-radius:9px;background:#153657;color:white;border:1px solid #49749c;opacity:'+(enabled?1:.45);b.onclick=()=>{if(choice==='birthday'&&(!date.value||!date.checkValidity())){msg.textContent='Choose a verified birthday in the current month.';return;}if(!note.value.trim()){msg.textContent='Enter a reference or verification note.';return;}finish({choice,birthday:date.value.slice(5),reason:note.value.trim()});};};
 line('p','Birthday voucher: '+(tier?'₱'+[0,25,50,75,100][tier]:'Unlocks at Silver')+' · '+(v?.status||'Not issued'));
 add('Issue Birthday Voucher','birthday',active&&tier>0&&!bs.exists());add('Redeem Voucher','redeem',active&&v?.kind==='birthday'&&v?.status==='issued');
 line('p','Monthly bonus swaps: '+used+' / '+max+' · '+(max?'Remaining: '+Math.max(0,max-used):'Unlocks at Platinum'));
 add('Record Completed Bonus Swap','swap',active&&used<max);const cancel=line('button','Close');cancel.type='button';cancel.onclick=()=>finish(null);d.addEventListener('cancel',e=>{e.preventDefault();finish(null);});document.body.append(d);d.showModal();
 });if(!result)return;const {choice,birthday,reason}=result;
 if(choice==='birthday'&&(!birthday||!/^\d{2}-\d{2}$/.test(birthday)||birthday.slice(0,2)!==month||Number(birthday.slice(3))<1||Number(birthday.slice(3))>new Date(Number(year),Number(month),0).getDate()))throw Error('Enter a verified birthday in the current Philippine calendar month.');
 if(!await jdrConfirm('Confirm '+choice+' for this member? For swaps, record only an already completed approved swap; for redemption, apply the discount only once.'))return;
 const vr=doc(db,'memberVouchers',uid,'records',choice==='swap'?'bonus_'+year+'_'+month:'birthday_'+year);
 await runTransaction(db,async tx=>{const [rs,vs]=await Promise.all([tx.get(rr),tx.get(vr)]);const r=rs.data(),v=vs.data();if(r?.status!=='active')throw Error('Active membership required.');const n=Number(r.lifetimePoints||0),tier=n>=10000?4:n>=5000?3:n>=2500?2:n>=1000?1:0;
 if(choice==='birthday'){if(!tier||vs.exists())throw Error('Not eligible or birthday voucher already issued this year.');tx.set(vr,{kind:'birthday',year,amount:[0,25,50,75,100][tier],status:'issued',reason,createdAt:serverTimestamp()});}
 else if(choice==='redeem'){if(v?.status!=='issued'||v.kind!=='birthday')throw Error('No unused birthday voucher this year.');tx.update(vr,{status:'redeemed',redeemedAt:serverTimestamp(),redemptionNote:reason});}
 else{const max=tier===4?2:tier===3?1:0,used=Number(v?.used||0);if(used>=max)throw Error('Monthly bonus swap limit reached or not eligible.');if((v?.references||[]).includes(reason))throw Error('Reference already recorded.');tx.set(vr,{kind:'bonusSwap',year,month,used:used+1,references:[...(v?.references||[]),reason],updatedAt:serverTimestamp()});}
 });jdrNotice('VIP record saved successfully.');
}
// V8.8 member notification center

function jdr88Center(host,scope,fetchItems){
 const root=document.createElement('section');root.className='jdr881-panel';root.style.cssText='box-sizing:border-box;width:100%;background:linear-gradient(150deg,#10243d,#091525);color:#e7f2ff;border:1px solid #315b83;border-radius:18px;padding:16px;margin:10px 0;text-align:left;box-shadow:0 12px 30px #0005;';root.hidden=true;
 const make=(tag,t,parent=root)=>{const n=document.createElement(tag);n.textContent=t;parent.append(n);return n;};
 const bell=make('button','🔔 Member notifications',host);bell.type='button';bell.style.cssText='background:#12365b;color:white;border:1px solid #4988bd;border-radius:10px;padding:10px;margin:5px;';host.append(root);
 const heading=make('h3','Notifications · V8.8.2');heading.style.cssText='font-size:19px;margin:0 0 6px;color:#f1f7ff';const note=make('p','Open or refresh to check recent activity. Read status is saved on this browser.');const refresh=make('button','Refresh'),all=make('button','Mark all as read'),close=make('button','Close');for(const b of [refresh,all,close]){b.type='button';b.style.cssText='background:#173b60;color:white;border:1px solid #497ba8;border-radius:8px;padding:8px;margin:3px;';}note.style.cssText='font-size:12px;color:#a8c4e0;margin:8px 0 12px';const list=make('div','');list.style.cssText='max-height: min(42vh,420px);overflow:auto;overscroll-behavior:contain;margin-top:10px';let items=[],owner='',serial=0,loaded=false;
 const key=()=> 'jdr88-seen-'+owner;const seen=()=>{try{return new Set(JSON.parse(localStorage.getItem(key())||'[]'));}catch{return new Set();}};let fallback=new Set();
 function save(ids){const s=new Set([...seen(),...fallback,...ids]);fallback=s;try{localStorage.setItem(key(),JSON.stringify([...s].slice(-1000)));}catch{}paint();}
 function paint(){const s=new Set([...seen(),...fallback]);const unread=items.filter(x=>!s.has(x.id)).length;bell.textContent='🔔 Member notifications'+(loaded?' ('+unread+')':'');bell.setAttribute('aria-expanded',String(!root.hidden));list.replaceChildren();if(!items.length)make('p','No recent notifications.',list);for(const x of items){const read=s.has(x.id),due=x.title.startsWith('Rental due')||x.title==='Rental overdue';const card=make('div','',list);card.style.cssText='display:flex;gap:10px;align-items:flex-start;padding:12px;margin:7px 0;border:1px solid '+(read?'#29445e':'#407eae')+';border-radius:13px;background:'+(read?'#101e30':'#143451');const symbol=due?'⏰':/declined/.test(x.title)?'✕':/rank/.test(x.title.toLowerCase())?'🏆':/member registered/i.test(x.title)?'👤':'🎁';const icon=make('span',symbol,card);icon.style.cssText='flex:0 0 34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#234765;color:#a9d9ff;font-size:18px';const body=make('div','',card);body.style.cssText='flex:1;min-width:0;overflow-wrap:anywhere';const title=make('strong',(read?'':'● ')+x.title,body);title.style.cssText='font-size:14px;color:#f0f7ff';const detail=make('p',x.detail,body);detail.style.cssText='font-size:13px;color:#c5d8ec;margin:5px 0';if(x.time){const date=make('small',(due?'Rental record updated: ':'')+new Date(x.time).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'})+' PHT',body);date.style.cssText='display:block;color:#a1b9d2;font-size:11px';}if(!read){const b=make('button','✓ Mark as read',body);b.type='button';b.style.cssText='display:inline-block;background:#102b48;color:#a8d9ff;border:1px solid #4279a5;border-radius:8px;padding:7px 10px;margin:8px 0 0;font-size:12px;cursor:pointer';b.onclick=()=>save([x.id]);}}}
 function reset(){serial++;items=[];owner='';fallback=new Set();loaded=false;root.hidden=true;bell.textContent='🔔 Member notifications';list.replaceChildren();note.textContent='Open or refresh to check recent activity.';refresh.disabled=false;}
 async function load(){const uid=scope();if(!uid){reset();return;}if(owner!==uid){items=[];fallback=new Set();owner=uid;loaded=false;}const v=++serial;refresh.disabled=true;note.textContent='Checking recent activity…';try{const result=await fetchItems(uid);if(v!==serial||scope()!==uid)return;items=[...new Map(result.items.map(x=>[x.id,x])).values()].sort((a,b)=>b.time-a.time);loaded=true;paint();note.textContent=(result.errors.length?'Some sources unavailable: '+result.errors.join(', ')+'. ':'')+'Recent records only · read status on this browser.';}catch(e){if(v===serial)note.textContent='Unable to refresh. Try again.';}finally{if(v===serial)refresh.disabled=false;}}
 bell.onclick=()=>{root.hidden=!root.hidden;bell.setAttribute('aria-expanded',String(!root.hidden));if(!root.hidden&&(!loaded||owner!==scope()))load();};refresh.onclick=load;all.onclick=()=>save(items.map(x=>x.id));close.onclick=()=>{root.hidden=true;bell.setAttribute('aria-expanded','false');bell.focus();};return {reset,bell};
}
function jdr88Time(v){return v?.toMillis?.()||0;}
function jdr88Due(r){if(r.status!=='rented'||!/^\d{4}-\d{2}-\d{2}$/.test(r.returnDate||''))return null;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const days=(Date.parse(r.returnDate)-Date.parse(today))/86400000;return days<=1?(days<0?'Rental overdue':days===0?'Rental due today':'Rental due tomorrow'):null;}
function jdr88Rank(n){return n>=10000?4:n>=5000?3:n>=2500?2:n>=1000?1:0;}
function jdr88RankNotice(uid,r,items){if(!r)return;const k='jdr88-rank-'+uid;const tier=jdr88Rank(Number(r.lifetimePoints||0));try{const raw=localStorage.getItem(k);let state=raw?JSON.parse(raw):{tier};if(tier>state.tier)state={tier,event:{id:'rank:'+tier,title:'Rank upgraded',detail:['Bronze','Silver','Gold','Platinum','Legendary'][tier]+' Gamer benefits unlocked.',time:jdr88Time(r.updatedAt)||Date.now()}};else if(tier<state.tier)state={tier};localStorage.setItem(k,JSON.stringify(state));if(state.event)items.push(state.event);}catch{}}

(function(){const host=document.createElement('div');host.style.cssText='display:inline-block;vertical-align:middle;max-width:100%;text-align:right;';const dock=document.getElementById('jdrNotifyDock'),waiting=document.getElementById('jdrNotifyButton');if(dock&&waiting){dock.insertBefore(host,waiting);}else{host.style.cssText='position:fixed;top:90px;right:16px;z-index:9000;max-width:calc(100vw - 32px)';document.body.append(host);}host.hidden=true;
 const center=jdr88Center(host,()=>auth.currentUser?.uid===ADMIN_UID?ADMIN_UID:'',async uid=>{
 const items=[],errors=[];const add=(id,title,detail,time=0)=>items.push({id,title,detail,time});
 const jobs=[['members',getDocs(query(collection(db,'members'),orderBy('createdAt','desc'),limit(20)))],['requests',getDocs(query(collection(db,'memberRedemptionRequests'),where('status','==','pending'),limit(50)))],['ranks',getDocs(query(collection(db,'memberRewards'),orderBy('updatedAt','desc'),limit(20)))]];
 const results=await Promise.allSettled(jobs.map(x=>x[1]));if(auth.currentUser?.uid!==uid)return {items,errors};const names=new Map();results.forEach((res,i)=>{const kind=jobs[i][0];if(res.status==='rejected'){errors.push(kind);return;}for(const d of res.value.docs){const r=d.data();if(kind==='members'){names.set(d.id,r.fullName||r.email||d.id);add('member:'+d.id,'Member registered',r.fullName||r.email||d.id,jdr88Time(r.createdAt));}if(kind==='requests')add('request:'+d.id+':'+r.requestId,'Pending reward request',(names.get(d.id)||d.id)+' · ₱'+Number(r.points||0)/4,jdr88Time(r.createdAt));if(kind==='ranks'){const temp=[];jdr88RankNotice('admin-'+d.id,r,temp);for(const x of temp)add('rank:'+d.id+':'+x.id,'Member rank upgraded',(names.get(d.id)||d.id)+' · '+x.detail,x.time);}}});for(const r of psnRentals){const due=jdr88Due(r);if(due)add('due:'+r.id+':'+r.returnDate+':'+due,due,(r.renterName||'Renter')+' · '+psnGameTitle(r.gameId)+' · '+r.returnDate,jdr88Time(r.updatedAt));}return {items,errors};
 });const panel=host.querySelector('.jdr881-panel');panel.style.position='absolute';panel.style.right='0';panel.style.top='100%';panel.style.width='min(440px,calc(100vw - 40px))';panel.style.zIndex='60';
 // V8.8.2: raise the entire dock stacking context above sticky navigation.
 if(dock&&waiting){dock.style.zIndex='60';}
 panel.style.maxWidth='calc(100vw - 40px)';
 panel.style.maxHeight='min(70vh, 560px)';panel.style.overflowY='auto';
 panel.style.overscrollBehavior='contain';
 onAuthStateChanged(auth,u=>{center.reset();host.hidden=u?.uid!==ADMIN_UID;host.style.display=host.hidden?'none':'inline-block';});})();
