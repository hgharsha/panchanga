// Runs once a day via GitHub Actions. Computes today's panchanga for the saved
// location, checks it against the watchlist (Ekadashi + personal days), and
// sends a Web Push notification if anything matches.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

// ---------- Astronomical core (same formulas as the app itself) ----------
function norm360(x){ x = x % 360; if(x<0) x+=360; return x; }
function d2r(d){ return d*Math.PI/180; }
function julianDay(utcMs){ return utcMs/86400000 + 2440587.5; }

function sunTrueLongitude(T){
  const L0 = norm360(280.46646 + 36000.76983*T + 0.0003032*T*T);
  const M  = norm360(357.52911 + 35999.05029*T - 0.0001537*T*T);
  const Mr = d2r(M);
  const C = (1.914602 - 0.004817*T - 0.000014*T*T)*Math.sin(Mr)
          + (0.019993 - 0.000101*T)*Math.sin(2*Mr)
          + 0.000289*Math.sin(3*Mr);
  let trueLong = L0 + C;
  const omega = 125.04 - 1934.136*T;
  return norm360(trueLong - 0.00569 - 0.00478*Math.sin(d2r(omega)));
}
function moonTrueLongitude(T){
  const Lp = norm360(218.3164477 + 481267.88123421*T - 0.0015786*T*T + T*T*T/538841 - T*T*T*T/65194000);
  const D  = norm360(297.8501921 + 445267.1114034*T - 0.0018819*T*T + T*T*T/545868 - T*T*T*T/113065000);
  const M  = norm360(357.5291092 + 35999.0502909*T - 0.0001536*T*T + T*T*T/24490000);
  const Mp = norm360(134.9633964 + 477198.8675055*T + 0.0087414*T*T + T*T*T/69699 - T*T*T*T/14712000);
  const F  = norm360(93.2720950 + 483202.0175233*T - 0.0036539*T*T - T*T*T/3526000 + T*T*T*T/863310000);
  const Dr=d2r(D), Mr=d2r(M), Mpr=d2r(Mp), Fr=d2r(F);
  const dL = 6.288774*Math.sin(Mpr)+1.274027*Math.sin(2*Dr-Mpr)+0.658314*Math.sin(2*Dr)
    +0.213618*Math.sin(2*Mpr)-0.185116*Math.sin(Mr)-0.114332*Math.sin(2*Fr)
    +0.058793*Math.sin(2*Dr-2*Mpr)+0.057066*Math.sin(2*Dr-Mr-Mpr)+0.053322*Math.sin(2*Dr+Mpr)
    +0.045758*Math.sin(2*Dr-Mr)-0.040923*Math.sin(Mr-Mpr)-0.034720*Math.sin(Dr)
    -0.030383*Math.sin(Mr+Mpr)+0.015327*Math.sin(2*Dr-2*Fr)-0.012528*Math.sin(Mpr+2*Fr)
    +0.010980*Math.sin(Mpr-2*Fr)+0.010675*Math.sin(4*Dr-Mpr)+0.010034*Math.sin(3*Mpr)
    +0.008548*Math.sin(4*Dr-2*Mpr)-0.007888*Math.sin(2*Dr+Mr-Mpr)-0.006766*Math.sin(2*Dr+Mr);
  return norm360(Lp+dL);
}
function ayanamsaLahiri(jd){ const yrs=(jd-2451545.0)/365.25; return 23.8561+0.0139952*yrs; }
function sunLongAt(ms){ return sunTrueLongitude((julianDay(ms)-2451545.0)/36525); }
function moonLongAt(ms){ return moonTrueLongitude((julianDay(ms)-2451545.0)/36525); }
function ayanAt(ms){ return ayanamsaLahiri(julianDay(ms)); }
function tithiDiffAt(ms){ return norm360(moonLongAt(ms)-sunLongAt(ms)); }
function moonSidAt(ms){ return norm360(moonLongAt(ms)-ayanAt(ms)); }

function findNextCrossing(startMs, valueFn, period, maxDays){
  maxDays = maxDays || 3;
  const base = valueFn(startMs);
  const targetMod = norm360((Math.floor(base/period)+1)*period);
  function shifted(ms){ let v = valueFn(ms) - targetMod; v = ((v % 360)+540)%360 - 180; return v; }
  const stepMs = 20*60*1000;
  let lo = startMs, vLo = shifted(lo), hi = lo;
  const limit = startMs + maxDays*86400000;
  while(hi < limit){
    hi += stepMs;
    const vHi = shifted(hi);
    if(vLo <= 0 && vHi > 0){
      let a=lo, b=hi;
      for(let i=0;i<40;i++){ const mid=(a+b)/2; if(shifted(mid) <= 0){ a=mid; } else { b=mid; } }
      return (a+b)/2;
    }
    lo = hi; vLo = vHi;
  }
  return null;
}
function findNextNewMoon(startMs){ return findNextCrossing(startMs, tithiDiffAt, 360, 40); }

function dayOfYear(y,m,d){ const start=Date.UTC(y,0,1); const cur=Date.UTC(y,m-1,d); return Math.round((cur-start)/86400000)+1; }
function sunTimesUTCMinutes(y,m,d,lat,lon){
  const N = dayOfYear(y,m,d);
  const gamma = 2*Math.PI/365*(N-1);
  const eqtime = 229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const decl = 0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
  const zenith = d2r(90.833); const latR = d2r(lat);
  let cosHA = (Math.cos(zenith)/(Math.cos(latR)*Math.cos(decl))) - Math.tan(latR)*Math.tan(decl);
  cosHA = Math.max(-1,Math.min(1,cosHA));
  const ha = Math.acos(cosHA)*180/Math.PI;
  const solarNoon = 720 - 4*lon - eqtime;
  return { sunrise: solarNoon - ha*4 };
}
function minutesToUTCms(y,m,d,minutes){ return Date.UTC(y,m-1,d,0,0,0,0) + Math.round(minutes*60000); }

const NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
const MASA_NAMES = ["Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadrapada","Ashwin","Kartika","Margashira","Pausha","Magha","Phalguna"];

function todayCivilInTz(tz){
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const o={}; parts.forEach(p=>o[p.type]=p.value);
  return {y:+o.year, m:+o.month, d:+o.day};
}

function computeTodayPanchanga(lat, lon, tz){
  const {y,m,d} = todayCivilInTz(tz);
  const sun = sunTimesUTCMinutes(y,m,d,lat,lon);
  const sunriseMs = minutesToUTCms(y,m,d,sun.sunrise);
  const diff = tithiDiffAt(sunriseMs);
  const tithiNum = Math.floor(diff/12)+1; // 1..30
  const paksha = tithiNum<=15 ? 'Shukla' : 'Krishna';
  const nakIdx = Math.floor(moonSidAt(sunriseMs)/(360/27));
  const nm = findNextNewMoon(sunriseMs);
  let masaIdx = null;
  if(nm){ masaIdx = Math.floor(norm360(sunLongAt(nm)-ayanAt(nm))/30)%12; }
  return {
    y, m, d,
    tithiNum, paksha,
    nakshatra: NAKSHATRAS[nakIdx],
    masa: masaIdx!==null ? MASA_NAMES[masaIdx] : null
  };
}

// ---------- Watchlist matching ----------
function findMatches(p, watchlist){
  const matches = [];
  if(watchlist.ekadashi && (p.tithiNum===11 || p.tithiNum===26)){
    matches.push(`Ekadashi (${p.paksha} Paksha)`);
  }
  (watchlist.personal || []).forEach(entry => {
    if(entry.type === 'fixed'){
      if(entry.month === p.m && entry.day === p.d) matches.push(entry.label);
    } else if(entry.type === 'nakshatra'){
      const nakOk = entry.nakshatra === p.nakshatra;
      const masaOk = !entry.masa || entry.masa === p.masa;
      if(nakOk && masaOk) matches.push(entry.label);
    } else if(entry.type === 'tithi'){
      const wantNum = entry.paksha === 'Krishna' ? entry.tithi + 15 : entry.tithi;
      const tithiOk = wantNum === p.tithiNum;
      const masaOk = !entry.masa || entry.masa === p.masa;
      if(tithiOk && masaOk) matches.push(entry.label);
    }
  });
  return matches;
}

async function main(){
  const dir = __dirname;
  const readJSON = (f, fallback) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch(e){ return fallback; }
  };
  const location = readJSON('location.json', {lat:41.7508, lon:-88.1535, tz:'America/Chicago', label:'Naperville, IL'});
  const watchlist = readJSON('watchlist.json', {ekadashi:true, personal:[]});
  const subscription = readJSON('subscription.json', null);

  const p = computeTodayPanchanga(location.lat, location.lon, location.tz);
  const matches = findMatches(p, watchlist);
  console.log('Today:', p, 'Matches:', matches);

  if(matches.length === 0){ console.log('No matches today — no notification sent.'); return; }
  if(!subscription){ console.log('Matches found but no subscription.json yet — cannot send.'); return; }

  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_SUBJECT_EMAIL || 'example@example.com'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: 'Panchanga',
    body: matches.join(' • ')
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('Push sent successfully.');
  } catch(e) {
    console.error('Push send failed:', e.statusCode, e.body);
  }
}

main();
