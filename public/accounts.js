let registrationDraft=null;
let attendeeUser=null,attendeeUnread=0,attendeeAuthMode='login',attendeePending=null,attendeeLoading=true,accountPanelVersion=0,accountPasses=new Map();
const account$=id=>document.getElementById(id);
const accountEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const accountDate=v=>new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
function accountError(id,message){const el=account$(id);if(el){el.textContent=message;el.hidden=!message}}
function setAttendee(user,count=attendeeUnread){attendeeUser=user;window.attendeeUser=user;attendeeUnread=user?count:0;renderAttendeeMenu()}
function renderAttendeeMenu(){
 const panel=account$('attendeeMenu');if(!panel)return;
 panel.innerHTML=attendeeUser?`<div class="hmpeMenuIdentity"><span>YOUR HMPE ACCOUNT</span><strong>${accountEscape(attendeeUser.name)}</strong><small>${accountEscape(attendeeUser.email)}</small></div><button onclick="openAccount('profile')">My profile <span>↗</span></button><button onclick="openAccount('passes')">My passes <span>↗</span></button><button onclick="openAccount('notifications')">Notifications ${attendeeUnread?`<b class="hmpeUnread">${attendeeUnread}</b>`:''}</button><button class="hmpeSignOut" onclick="signOutAttendee()">Sign out</button>`:`<div class="hmpeMenuIdentity"><span>YOUR HMPE ACCOUNT</span><strong>Keep your expo connected.</strong></div><button onclick="openAttendeeAuth('login')">Sign in <span>↗</span></button>`;
 const dot=account$('attendeeMenuDot');if(dot)dot.hidden=!attendeeUnread;
}
async function attendeeApi(path,body){
 const r=await fetch(path,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 let value;try{value=await r.json()}catch{throw Error(r.status===429?'Too many attempts. Please try again later.':'Unable to connect. Please try again.')}
 if(!r.ok){if(r.status===401&&!path.endsWith('/login')){setAttendee(null,0);account$('attendeeAccount').close();openAttendeeAuth('login')}throw Error(value.error||'Unable to continue. Please try again.')}
 return value;
}
async function refreshAttendeeSession(){try{const r=await fetch('/api/account/session',{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();setAttendee(d.user,d.unreadCount);return d.user}catch{return null}finally{attendeeLoading=false}}
function closeAttendeeMenu(){const menu=account$('megaNav');menu.hidden=true;const trigger=account$('megaToggle');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Open menu');trigger.classList.remove('is-open')}
function ensureAttendee(action,mode='login'){
 if(attendeeUser){account$('attendeeAccount').close();return true}
 attendeePending=action;
 if(attendeeLoading){window.attendeeReady.then(()=>{if(attendeeUser){const next=attendeePending;attendeePending=null;if(next)next()}else openAttendeeAuth(mode)});return false}
 openAttendeeAuth(mode);return false;
}
function openAttendeeAuth(mode='login'){
 closeAttendeeMenu();closeForm();account$('attendeeAccount').close();setAttendeeAuthMode('login');accountError('attendeeAuthError','');
 if(!account$('attendeeAuth').open)account$('attendeeAuth').showModal();
 account$('attendeeEmail').focus();
}
function closeAttendeeAuth(){attendeePending=null;account$('attendeeAuth').close()}
function setAttendeeAuthMode(){
 attendeeAuthMode='login';account$('attendeeAuthTitle').textContent='Welcome back';account$('attendeeAuthIntro').textContent='Sign in to see your passes and event updates.';account$('attendeeAuthSubmit').textContent='Sign in →';accountError('attendeeAuthError','');
}
account$('attendeeReveal').addEventListener('click',()=>{const input=account$('attendeePassword'),show=input.type==='password';input.type=show?'text':'password';account$('attendeeReveal').textContent=show?'Hide':'Show';account$('attendeeReveal').setAttribute('aria-label',show?'Hide password':'Show password')});
account$('attendeeAuthForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=account$('attendeeAuthSubmit');button.disabled=true;button.textContent='Please wait…';accountError('attendeeAuthError','');
 try{
  const payload={identifier:account$('attendeeEmail').value,password:account$('attendeePassword').value};
  const d=await attendeeApi('/api/account/login',payload);setAttendee(d.user,d.unreadCount);account$('attendeePassword').value='';const next=attendeePending;attendeePending=null;account$('attendeeAuth').close();if(next)next();else openAccount('passes');
 }catch(error){accountError('attendeeAuthError',error.message)}finally{button.disabled=false;button.textContent='Sign in →'}
});
async function signOutAttendee(){try{await attendeeApi('/api/account/logout',{});setAttendee(null,0);attendeePending=null;closeAttendeeMenu();closeForm();account$('attendeeAccount').close();account$('attendeeAuth').close()}catch(error){openAccount('profile');accountError('profileError',error.message)}}
async function openAccount(tab='profile'){
 if(!ensureAttendee(()=>openAccount(tab),'login'))return;
 closeAttendeeMenu();closeForm();const dialog=account$('attendeeAccount');if(!dialog.open)dialog.showModal();
 const version=++accountPanelVersion;for(const el of document.querySelectorAll('[data-account-tab]'))el.setAttribute('aria-pressed',String(el.dataset.accountTab===tab));
 account$('attendeeAccountTitle').textContent={profile:'My profile',passes:'My passes',notifications:'Notifications'}[tab]||'My profile';
 const panel=account$('attendeeAccountBody');panel.innerHTML='<p class="hmpeAccountEmpty">Loading…</p>';
 try{
  if(tab==='profile'){
   const u=attendeeUser;panel.innerHTML=`<p class="hmpeAccountIntro">Your details, ready for your next expo registration.</p><form id="attendeeProfileForm"><label for="profileName">Full name</label><input id="profileName" value="${accountEscape(u.name)}" required maxlength="150" autocomplete="name"><label for="profileEmail">Email address</label><input id="profileEmail" value="${accountEscape(u.email)}" type="email" readonly><p class="hmpeFieldHint">Your sign-in email is used to link your passes.</p><label for="profilePhone">Mobile number</label><input id="profilePhone" value="${accountEscape(u.phone)}" type="tel" required autocomplete="tel" pattern="[0-9+\\x20\\x28\\x29\\x2D]{8,18}"><label class="hmpeCheckbox"><input id="profileUpdates" type="checkbox" ${u.emailUpdates?'checked':''}>Allow event updates by email</label><p id="profileError" class="hmpeAccountError" role="alert" hidden></p><p id="profileSaved" class="hmpeAccountSuccess" role="status" hidden></p><button class="hmpeAccountPrimary" type="submit">Save profile</button></form>`;
   account$('attendeeProfileForm').addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;accountError('profileError','');account$('profileSaved').hidden=true;try{const d=await attendeeApi('/api/account/profile',{name:account$('profileName').value,phone:account$('profilePhone').value,emailUpdates:account$('profileUpdates').checked});setAttendee(d.user);account$('profileSaved').textContent='Your profile is saved.';account$('profileSaved').hidden=false}catch(error){accountError('profileError',error.message)}finally{button.disabled=false}});
  }else if(tab==='passes'){
   const d=await attendeeApi('/api/account/passes');if(version!==accountPanelVersion)return;accountPasses=new Map(d.passes.map(r=>[r.id,r]));
   panel.innerHTML=`<p class="hmpeAccountIntro">Your saved expo passes and applications. Approval and payment details update here.</p><div class="hmpeSavedPasses">${d.passes.length?d.passes.map(r=>`<article class="hmpeSavedPass"><div class="hmpePassTop"><span>${accountEscape(r.category)}</span><b class="hmpePassStatus ${r.status==='Approved'?'approved':''}">${accountEscape(r.status)}</b></div><h3>${accountEscape(r.name)}</h3><p class="hmpeSavedId">${accountEscape(r.shortCode||r.id)}</p><dl><div><dt>Event dates</dt><dd data-pass-dates>${accountEscape(window.expoEventDates||'Dates to be announced')}</dd></div><div><dt>Payment</dt><dd>${accountEscape(r.payment)}</dd></div><div><dt>Quotation</dt><dd>₹${Number(r.amount).toLocaleString('en-IN')}</dd></div><div><dt>Entry</dt><dd>${r.checkedIn?'Checked in':'Not checked in'}</dd></div></dl><button type="button" class="hmpeAccountSecondary" data-open-pass="${accountEscape(r.id)}">View QR pass →</button></article>`).join(''):'<div class="hmpeAccountEmpty"><h3>No passes yet</h3><p>Complete an expo registration and your pass will appear here.</p><button type="button" class="hmpeAccountSecondary" onclick="openForm(\'visitor\')">Register as a visitor →</button></div>'}</div><details class="hmpeClaimPass"><summary>Already registered? Add an existing pass</summary><p class="hmpeFieldHint">Use the 8-character pass code or original pass ID. Its registration email must match your account email.</p><form id="claimPassForm"><label for="claimPassId">Pass code or original ID</label><input id="claimPassId" placeholder="8-character pass code" required maxlength="40" autocomplete="off"><p id="claimPassError" class="hmpeAccountError" role="alert" hidden></p><button class="hmpeAccountSecondary" type="submit">Add to My passes</button></form></details><p id="savedPassError" class="hmpeAccountError" role="alert" hidden></p>`;
   for(const button of panel.querySelectorAll('[data-open-pass]'))button.addEventListener('click',()=>showSavedPass(button.dataset.openPass));
   account$('claimPassForm').addEventListener('submit',async e=>{e.preventDefault();e.submitter.disabled=true;try{await attendeeApi('/api/account/claim-pass',{id:account$('claimPassId').value});await refreshAttendeeSession();openAccount('passes')}catch(error){accountError('claimPassError',error.message);e.submitter.disabled=false}});
  }else{
   const d=await attendeeApi('/api/account/notifications');if(version!==accountPanelVersion)return;attendeeUnread=d.unreadCount;renderAttendeeMenu();
   panel.innerHTML=`<div class="hmpeNotificationTools"><p class="hmpeAccountIntro">Pass updates and messages from the organizer.</p>${d.unreadCount?'<button type="button" id="markNotificationsRead" class="hmpeTextButton">Mark all as read</button>':''}</div>${d.notifications.length?d.notifications.map(n=>`<article class="hmpeNotification ${n.readAt?'':'is-unread'}"><div><h3>${accountEscape(n.title)}</h3>${!n.readAt?'<span class="hmpeNew">New</span>':''}</div><p>${accountEscape(n.body)}</p><time>${accountEscape(accountDate(n.createdAt))}</time></article>`).join(''):'<div class="hmpeAccountEmpty"><h3>You’re all caught up</h3><p>Event updates will appear here.</p></div>'}<p id="notificationError" class="hmpeAccountError" role="alert" hidden></p>`;
   account$('markNotificationsRead')?.addEventListener('click',async()=>{try{await attendeeApi('/api/account/read-notifications',{});attendeeUnread=0;renderAttendeeMenu();openAccount('notifications')}catch(error){accountError('notificationError',error.message)}});
  }
 }catch(error){if(version===accountPanelVersion)panel.innerHTML=`<p class="hmpeAccountError" role="alert">${accountEscape(error.message)}</p>`}
}
async function showSavedPass(id){try{const r=await attendeeApi('/api/public/expo?id='+encodeURIComponent(id));account$('attendeeAccount').close();showPass(r)}catch(error){if(!account$('savedPassError')&&attendeeUser)await openAccount('passes');accountError('savedPassError',error.message)}}
function prepareRegistrationAccess(){
 const signedIn=!!attendeeUser;account$('registrationIdentity').hidden=!signedIn;
 for(const name of ['name','email','phone']){const input=document.querySelector('#registrationForm [name="'+name+'"]');if(input&&signedIn){input.value=attendeeUser[name];input.readOnly=true}}
 account$('registrationAccess').innerHTML=signedIn?'':`<div class="field"><label for="registrationPassword">Set password *</label><input id="registrationPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="At least 10 characters"><p class="hmpeFieldHint">Use this email and password to return to My passes.</p></div><label class="hmpeCheckbox"><input id="registrationUpdates" type="checkbox">Allow event updates by email</label><p class="hmpeIdentityNote">Already registered? <button type="button" onclick="signInForRegistration()">Sign in</button></p>`;
 account$('formNotice').textContent=signedIn?'Your registration will be saved to My passes in your account.':'Register once. Your details and pass will be saved so you can sign in again.';
}
function signInForRegistration(){
 const type=current;registrationDraft=Object.fromEntries(new FormData(account$('registrationForm')));
 attendeePending=()=>{openForm(type);for(const [name,value]of Object.entries(registrationDraft||{})){const input=document.querySelector('#registrationForm [name="'+name+'"]');if(input&&!input.readOnly)input.value=value}registrationDraft=null};
 openAttendeeAuth('login');account$('attendeeEmail').value=registrationDraft.email||'';
}
async function saveRegistrationAccount(){
 if(attendeeUser)return;
 if(attendeeLoading)await window.attendeeReady;
 if(attendeeUser){prepareRegistrationAccess();return}
 const data=Object.fromEntries(new FormData(account$('registrationForm')));
 const password=account$('registrationPassword').value;
 const d=await attendeeApi('/api/account/signup',{name:data.name,email:data.email,phone:data.phone,password,emailUpdates:account$('registrationUpdates').checked});
 setAttendee(d.user,d.unreadCount);prepareRegistrationAccess();
}
function attendeeSessionExpired(action){setAttendee(null,0);attendeePending=action;openAttendeeAuth('login')}
account$('attendeeAuth').addEventListener('cancel',()=>attendeePending=null);
renderAttendeeMenu();window.attendeeReady=refreshAttendeeSession();
const requestedPass=new URLSearchParams(location.search).get('pass');
if(requestedPass)window.attendeeReady.then(async()=>{try{const r=await fetch('/api/public/expo?id='+encodeURIComponent(requestedPass));if(r.status===401){attendeePending=()=>showSavedPass(requestedPass);openAttendeeAuth('login');return}const pass=await r.json();if(!r.ok)throw Error(pass.error||'Pass not found');showPass(pass)}catch(error){openAccount('passes');setTimeout(()=>accountError('savedPassError',error.message),0)}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAttendeeSession()});setInterval(()=>{if(!document.hidden&&attendeeUser)refreshAttendeeSession()},60000);
