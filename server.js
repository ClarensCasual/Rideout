// Rideout backend: zero dependencies, Node 18+. Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),UP=path.join(DIR,'uploads'),F=path.join(DIR,'db.json');
const TYPES=["Sport","Naked","Cruiser","Adventure","Touring","Scrambler / Off-road"];
fs.mkdirSync(UP,{recursive:true});
let db={users:[],rides:[],photos:[],sessions:{}};
try{db=JSON.parse(fs.readFileSync(F,'utf8'))}catch(e){}
let timer;const save=()=>{clearTimeout(timer);timer=setTimeout(()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(db));fs.renameSync(F+'.tmp',F)},200)};
const rid=()=>crypto.randomBytes(8).toString('hex'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hash=(pw,salt)=>crypto.scryptSync(pw,salt,32).toString('hex');
const cl=(s,n)=>String(s==null?'':s).trim().slice(0,n);
const send=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let n=0,c=[];req.on('data',d=>{n+=d.length;if(n>3e6){no(new Error('big'));req.destroy()}else c.push(d)});
 req.on('end',()=>{try{ok(JSON.parse(Buffer.concat(c).toString()||'{}'))}catch(e){no(e)}})});
const tries={};const limited=ip=>{const n=Date.now(),a=(tries[ip]||[]).filter(t=>n-t<6e5);a.push(n);tries[ip]=a;return a.length>20};
const login=(res,u)=>{const t=crypto.randomBytes(24).toString('hex');db.sessions[sha(t)]=u.id;save();send(res,200,{token:t})};
const pub=u=>({id:u.id,name:u.name,type:u.type,area:u.area});
const toggle=(a,v)=>a.includes(v)?a.filter(x=>x!==v):[...a,v];
const MIME={'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};

http.createServer(async(req,res)=>{
 const url=req.url.split('?')[0],ip=req.socket.remoteAddress;
 try{
  if(req.method==='GET'&&url==='/'){let page;try{page=fs.readFileSync(path.join(__dirname,'public','index.html'))}catch(e){console.error('Missing public/index.html next to server.js:',e.message);return send(res,500,{error:'App files missing: public/index.html was not found next to server.js.'})}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'"});
   return res.end(page)}
  let m=/^\/uploads\/([a-f0-9]{16}\.(jpg|png|webp))$/.exec(url);
  if(req.method==='GET'&&m){const f=path.join(UP,m[1]);if(!fs.existsSync(f))return send(res,404,{error:'Not found'});
   res.writeHead(200,{'Content-Type':MIME['.'+m[2]],'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=31536000,immutable'});return res.end(fs.readFileSync(f))}
  if(!url.startsWith('/api/'))return send(res,404,{error:'Not found'});
  const b=req.method==='GET'?{}:await body(req);
  if(req.method==='POST'&&(url==='/api/register'||url==='/api/login')){
   if(limited(ip))return send(res,429,{error:'Too many attempts. Wait a few minutes and try again.'});
   const name=cl(b.name,24),pw=String(b.password||'');
   if(url==='/api/login'){const u=db.users.find(x=>x.name.toLowerCase()===name.toLowerCase());
    if(!u||!crypto.timingSafeEqual(Buffer.from(hash(pw,u.salt)),Buffer.from(u.hash)))return send(res,401,{error:'Wrong name or password.'});return login(res,u)}
   const type=b.type,area=cl(b.area,30);
   if(name.length<2||!area||!TYPES.includes(type))return send(res,400,{error:'Enter a name, bike type and area.'});
   if(pw.length<6)return send(res,400,{error:'Password must be at least 6 characters.'});
   if(db.users.some(x=>x.name.toLowerCase()===name.toLowerCase()))return send(res,409,{error:'That rider name is taken.'});
   const salt=rid(),u={id:rid(),name,type,area,salt,hash:hash(pw,salt)};db.users.push(u);return login(res,u)}
  const uid=db.sessions[sha((req.headers.authorization||'').replace('Bearer ',''))],me=db.users.find(u=>u.id===uid);
  if(!me)return send(res,401,{error:'Sign in required.'});
  if(req.method==='GET'&&url==='/api/state')return send(res,200,{me:pub(me),riders:db.users.map(pub),rides:db.rides,
   photos:db.photos.slice(-100).reverse()});
  if(req.method==='PUT'&&url==='/api/me'){const area=cl(b.area,30);if(!area||!TYPES.includes(b.type))return send(res,400,{error:'Invalid bike type or area.'});
   me.type=b.type;me.area=area;save();return send(res,200,{ok:true})}
  if(req.method==='POST'&&url==='/api/rides'){const date=cl(b.date,10),time=cl(b.time,5);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return send(res,400,{error:'Enter a valid day and time.'});
   db.rides.push({id:rid(),host:me.id,type:me.type,area:me.area,date,time,spot:cl(b.spot,60)||'Meeting spot to be confirmed',going:[me.id]});
   const cut=new Date(Date.now()-7*864e5).toISOString().slice(0,10);db.rides=db.rides.filter(r=>r.date>=cut);save();return send(res,200,{ok:true})}
  if(req.method==='POST'&&(m=/^\/api\/rides\/(\w+)\/join$/.exec(url))){const r=db.rides.find(x=>x.id===m[1]);
   if(!r)return send(res,404,{error:'Ride not found.'});r.going=toggle(r.going,me.id);save();return send(res,200,{ok:true})}
  if(req.method==='DELETE'&&(m=/^\/api\/rides\/(\w+)$/.exec(url))){const r=db.rides.find(x=>x.id===m[1]);
   if(!r||r.host!==me.id)return send(res,403,{error:'Only
