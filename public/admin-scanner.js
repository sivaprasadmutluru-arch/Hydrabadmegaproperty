// Decode locally: camera frames and QR images never leave the browser.
(function(){
 let stream=null,timer=null,epoch=0,imageBusy=false;
 const el=id=>document.getElementById(id);
 function status(message,error=false){el('scannerStatus').textContent=message;el('scannerStatus').dataset.error=String(error)}
 function passIdFromQr(value){
  const raw=String(value||'').trim();let id=raw;const code=raw.replace(/[ -]/g,'').toUpperCase();if(/^[A-F0-9]{8}$/.test(code))return code;
  if(!/^HMPE27-/i.test(raw)){
   try{const u=new URL(raw);if(u.origin!==location.origin||!['/expo.html','/expo','/'].includes(u.pathname))return null;id=u.searchParams.get('pass')||''}catch{return null}
  }
  id=id.toUpperCase();return /^HMPE27-(VIS|DEL|EXH|SPO)-(?:[A-F0-9]{8}|[A-F0-9]{24})$/.test(id)?id:null;
 }
 window.passIdFromQr=passIdFromQr;
 function stopPassScanner(message){epoch++;clearTimeout(timer);timer=null;stream?.getTracks().forEach(t=>t.stop());stream=null;const v=el('scannerVideo');if(v){v.pause();v.srcObject=null;el('scannerPreview').hidden=true;el('startScanner').disabled=false;el('stopScanner').hidden=true}if(message)status(message)}
 window.stopPassScanner=stopPassScanner;
 async function accept(value){const id=passIdFromQr(value);if(!id){status('This is not a valid QR pass for this website. Try the attendee’s HMPE pass.',true);return false}stopPassScanner();el('verifyId').value=id;status('QR scanned. Review the pass below before confirming check-in.');await window.verify();return true}
 function decode(source,width,height){const scale=Math.min(1,1280/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data}
 async function start(){
  stopPassScanner();const run=epoch;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('Camera access requires HTTPS and a supported browser. Use Scan QR image or enter the pass ID below.',true);return}
  el('startScanner').disabled=true;el('stopScanner').hidden=false;status('Allow camera access to scan a pass.');
  try{
   const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
   if(run!==epoch){camera.getTracks().forEach(t=>t.stop());return}
   stream=camera;const video=el('scannerVideo');video.srcObject=camera;el('scannerPreview').hidden=false;await video.play();if(run!==epoch)return;status('Camera ready. Hold the QR code steady inside the preview.');
   async function scan(){if(run!==epoch)return;try{if(video.readyState>=2&&video.videoWidth){const value=decode(video,video.videoWidth,video.videoHeight);if(value&&await accept(value))return}}catch{stopPassScanner();status('Unable to read the camera. Try Scan QR image or enter the pass ID.',true);return}if(run===epoch)timer=setTimeout(scan,200)}
   scan();
  }catch(error){if(run!==epoch)return;stopPassScanner();const messages={NotAllowedError:'Camera permission was denied. Allow camera access in your browser settings, or use Scan QR image.',NotFoundError:'No camera was found. Use Scan QR image or enter the pass ID.',NotReadableError:'The camera is busy. Close other camera apps and try again.'};status(messages[error.name]||'Unable to open the camera. Try Scan QR image or enter the pass ID.',true)}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  el('startScanner').addEventListener('click',start);el('stopScanner').addEventListener('click',()=>stopPassScanner('Camera stopped.'));
  el('verifyForm').addEventListener('submit',e=>{e.preventDefault();stopPassScanner();window.verify()});
  el('scanImage').addEventListener('change',async e=>{
   const file=e.target.files[0];if(!file||imageBusy)return;stopPassScanner();imageBusy=true;status('Reading QR image…');let bitmap;
   try{if(file.size>15*1024*1024)throw Error('Choose an image smaller than 15 MB.');bitmap=await createImageBitmap(file);const value=decode(bitmap,bitmap.width,bitmap.height);if(!value)throw Error('No QR code found. Choose a clear photo or screenshot of the pass.');await accept(value)}catch(error){status(error.message||'Unable to read this image. Try a PNG or JPEG screenshot.',true)}finally{bitmap?.close();imageBusy=false;e.target.value=''}
  });
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPassScanner('Camera stopped. Tap Scan QR with camera to resume.')});window.addEventListener('pagehide',()=>stopPassScanner());
})();
