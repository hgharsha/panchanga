// Panchanga astronomical engine — single source of truth.
// Loaded by index.html via <script src="astro.js"> and by sw.js via
// importScripts('astro.js'), so the page and the service worker's push
// handler always compute identical results. Do not duplicate this logic
// elsewhere (see CLAUDE.md).
(function (root) {
'use strict';

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

function ayanamsaLahiri(jd){
  const yrs = (jd-2451545.0)/365.25;
  return 23.8561 + 0.0139952*yrs;
}

function sunLongAt(ms){ return sunTrueLongitude((julianDay(ms)-2451545.0)/36525); }
function moonLongAt(ms){ return moonTrueLongitude((julianDay(ms)-2451545.0)/36525); }
function ayanAt(ms){ return ayanamsaLahiri(julianDay(ms)); }

function tithiDiffAt(ms){ return norm360(moonLongAt(ms)-sunLongAt(ms)); }
function moonSidAt(ms){ return norm360(moonLongAt(ms)-ayanAt(ms)); }
function sunSidAt(ms){ return norm360(sunLongAt(ms)-ayanAt(ms)); }
function yogaSumAt(ms){ return norm360(moonSidAt(ms)+sunSidAt(ms)); }

// Generic forward crossing finder: next time valueFn crosses a multiple of `period`
function findNextCrossing(startMs, valueFn, period, maxDays){
  maxDays = maxDays || 3;
  const base = valueFn(startMs);
  const targetMod = norm360((Math.floor(base/period)+1)*period);
  function shifted(ms){
    let v = valueFn(ms) - targetMod;
    v = ((v % 360)+540)%360 - 180;
    return v;
  }
  const stepMs = 20*60*1000;
  let lo = startMs, vLo = shifted(lo);
  let hi = lo;
  const limit = startMs + maxDays*86400000;
  while(hi < limit){
    hi += stepMs;
    const vHi = shifted(hi);
    if(vLo <= 0 && vHi > 0){
      let a=lo, b=hi;
      for(let i=0;i<40;i++){
        const mid=(a+b)/2;
        if(shifted(mid) <= 0){ a=mid; } else { b=mid; }
      }
      return (a+b)/2;
    }
    lo = hi; vLo = vHi;
  }
  return null;
}

// Find the next new moon (tithi diff crossing a multiple of 360) at or after startMs.
// The Chandramana masa is named after the sidereal rashi the Sun occupies at the END
// of the lunar month (the following new moon) — this correctly captures the solar
// sankranti that falls inside the month, rather than the rashi at the month's start.
function findNextNewMoon(startMs){
  return findNextCrossing(startMs, tithiDiffAt, 360, 40);
}

const NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
const YOGAS = ["Vishkambha","Priti","Ayushman","Saubhagya","Shobhana","Atiganda","Sukarma","Dhriti","Shula","Ganda","Vriddhi","Dhruva","Vyaghata","Harshana","Vajra","Siddhi","Vyatipata","Variyana","Parigha","Shiva","Siddha","Sadhya","Shubha","Shukla","Brahma","Indra","Vaidhriti"];
const TITHI_NAMES = ["Prathama","Dwitiya","Tritiya","Chaturthi","Panchami","Shashthi","Saptami","Ashtami","Navami","Dashami","Ekadashi","Dwadashi","Trayodashi","Chaturdashi"];
const VARA_NAMES = ["Bhanu vara","Indu vara","Bhauma vara","Saumya vara","Guru vara","Bhrigu vara","Sthira vara"]; // Sun..Sat
const MASA_NAMES = ["Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadrapada","Ashwin","Kartika","Margashira","Pausha","Magha","Phalguna"];
const RITU_NAMES = ["Vasanta","Greeshma","Varsha","Sharad","Hemanta","Shishira"];
const SAMVATSARA = ["Prabhava","Vibhava","Shukla","Pramoda","Prajapati","Angirasa","Shrimukha","Bhava","Yuva","Dhatu","Ishvara","Bahudhanya","Pramathi","Vikrama","Vrisha","Chitrabhanu","Subhanu","Tarana","Parthiva","Vyaya","Sarvajit","Sarvadhari","Virodhi","Vikriti","Khara","Nandana","Vijaya","Jaya","Manmatha","Durmukhi","Hemalamba","Vilamba","Vikari","Sharvari","Plava","Shubhakrit","Shobhakrit","Krodhi","Vishvavasu","Parabhava","Plavanga","Kilaka","Saumya","Sadharana","Virodhikrit","Paridhavi","Pramadicha","Ananda","Rakshasa","Nala","Pingala","Kalayukti","Siddharthi","Raudri","Durmati","Dundubhi","Rudhirodgari","Raktakshi","Krodhana","Kshaya"];
const KARANA_CYCLE = ["Bava","Balava","Kaulava","Taitila","Gara","Vanija","Vishti"];

function karanaName(idx){
  if(idx===0) return "Kimstughna";
  if(idx>=57) return ["Shakuni","Chatushpada","Naga"][idx-57];
  return KARANA_CYCLE[(idx-1)%7];
}
function tithiInfo(diff){
  const num = Math.floor(diff/12)+1; // 1..30
  const paksha = num<=15 ? "Shukla Paksha" : "Krishna Paksha";
  const local = num<=15 ? num : num-15;
  const name = local===15 ? (num<=15 ? "Purnima" : "Amavasya") : TITHI_NAMES[local-1];
  return {num, paksha, name};
}

// ---------- Sunrise / Sunset (NOAA algorithm) ----------
function dayOfYear(y,m,d){
  const start = Date.UTC(y,0,1);
  const cur = Date.UTC(y,m-1,d);
  return Math.round((cur-start)/86400000)+1;
}
function sunTimesUTCMinutes(y,m,d,lat,lon){
  const N = dayOfYear(y,m,d);
  const gamma = 2*Math.PI/365*(N-1+ (12-12)/24);
  const eqtime = 229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const decl = 0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
  const zenith = d2r(90.833);
  const latR = d2r(lat);
  let cosHA = (Math.cos(zenith)/(Math.cos(latR)*Math.cos(decl))) - Math.tan(latR)*Math.tan(decl);
  cosHA = Math.max(-1,Math.min(1,cosHA));
  const ha = Math.acos(cosHA)*180/Math.PI;
  const solarNoon = 720 - 4*lon - eqtime;
  return { sunrise: solarNoon - ha*4, sunset: solarNoon + ha*4 };
}
function minutesToUTCms(y,m,d,minutes){
  return Date.UTC(y,m-1,d,0,0,0,0) + Math.round(minutes*60000);
}

function todayCivilInTz(tz){
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const o={}; parts.forEach(p=>o[p.type]=p.value);
  return {y:+o.year, m:+o.month, d:+o.day};
}
function weekdayName(y,m,d){
  const dt = new Date(Date.UTC(y,m-1,d,12,0,0));
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long'}).format(dt);
}
function weekdayIndex(y,m,d){
  return new Date(Date.UTC(y,m-1,d,12,0,0)).getUTCDay(); // 0=Sun
}

// ---------- Core panchanga computation for a civil date+location ----------
function computePanchanga(y,m,d,lat,lon,tz){
  const sun = sunTimesUTCMinutes(y,m,d,lat,lon);
  const sunriseMs = minutesToUTCms(y,m,d,sun.sunrise);
  const sunsetMs = minutesToUTCms(y,m,d,sun.sunset);

  const diffAtSunrise = tithiDiffAt(sunriseMs);
  const tInfo = tithiInfo(diffAtSunrise);
  const tithiEndMs = findNextCrossing(sunriseMs, tithiDiffAt, 12, 3);

  const moonSidRise = moonSidAt(sunriseMs);
  const nakIdx = Math.floor(moonSidRise/(360/27));
  const nakEndMs = findNextCrossing(sunriseMs, moonSidAt, 360/27, 3);

  const yogaSumRise = yogaSumAt(sunriseMs);
  const yogaIdx = Math.floor(yogaSumRise/(360/27));
  const yogaEndMs = findNextCrossing(sunriseMs, yogaSumAt, 360/27, 3);

  const karanaIdx = Math.floor(diffAtSunrise/6);
  const karanaEndMs = findNextCrossing(sunriseMs, tithiDiffAt, 6, 2);

  // Ayana
  const sunSidRise = sunSidAt(sunriseMs);
  const ayana = (sunSidRise>=90 && sunSidRise<270) ? "Dakshinayana" : "Uttarayana";

  // Masa via the Sun's sidereal rashi at the end of the current lunar month (next new moon)
  const nm = findNextNewMoon(sunriseMs);
  let masaIdx = null, rituIdx = null;
  if(nm){
    const sunAtNM = norm360(sunLongAt(nm) - ayanAt(nm));
    masaIdx = Math.floor(sunAtNM/30) % 12;
    rituIdx = Math.floor(masaIdx/2);
  }

  // Samvatsara (Shaka-year based, 60-year cycle; approximate Ugadi boundary using masa)
  let shakaYear;
  if(m<=1) shakaYear = y-79;
  else if(m===2) shakaYear = (masaIdx===11) ? y-79 : y-78; // Feb -> before Ugadi
  else if(m===3) shakaYear = (masaIdx===11) ? y-79 : y-78;
  else shakaYear = y-78;
  const samvIdx = ((shakaYear+11)%60+60)%60;

  const wIdx = weekdayIndex(y,m,d);

  return {
    vara: VARA_NAMES[wIdx],
    weekdayEnglish: weekdayName(y,m,d),
    samvatsara: SAMVATSARA[samvIdx],
    ayana,
    ritu: rituIdx!==null ? RITU_NAMES[rituIdx] : "—",
    masa: masaIdx!==null ? MASA_NAMES[masaIdx] : "—",
    paksha: tInfo.paksha,
    tithi: tInfo.name,
    tithiNum: tInfo.num,
    tithiEndMs, tithiFracDone: null,
    nakshatra: NAKSHATRAS[nakIdx], nakEndMs,
    yoga: YOGAS[yogaIdx], yogaEndMs,
    karana: karanaName(karanaIdx), karanaEndMs,
    sunriseMs, sunsetMs,
    diffAtSunrise
  };
}

// ---------- Watchlist matching (used by sw.js on push) ----------
// entry: {label, type:'fixed'|'nakshatra'|'tithi', ...type-specific fields, masa?}
// masa is optional on lunar types: present = yearly (recurs once/year in that masa),
// absent = recurs every lunar month.
function matchWatchlist(p, civilDate, watchlist){
  const matches = [];
  if(watchlist.ekadashi && (p.tithiNum===11 || p.tithiNum===26)){
    matches.push(`Ekadashi (${p.paksha})`);
  }
  (watchlist.personal || []).forEach(entry => {
    if(entry.type === 'fixed'){
      if(entry.month === civilDate.m && entry.day === civilDate.d) matches.push(entry.label);
    } else if(entry.type === 'nakshatra'){
      const nakOk = entry.nakshatra === p.nakshatra;
      const masaOk = !entry.masa || entry.masa === p.masa;
      if(nakOk && masaOk) matches.push(entry.label);
    } else if(entry.type === 'tithi'){
      const wantPaksha = entry.paksha === 'Krishna' ? 'Krishna Paksha' : 'Shukla Paksha';
      const masaOk = !entry.masa || entry.masa === p.masa;
      if(entry.tithi === p.tithiNum - (p.paksha==='Krishna Paksha'?15:0) && p.paksha===wantPaksha && masaOk){
        matches.push(entry.label);
      }
    }
  });
  return matches;
}

// ---------- Days until next Ekadashi (for in-page countdown/banner) ----------
function daysToNextEkadashi(y, m, d, lat, lon, tz, maxDays = 16){
  for(let i = 0; i <= maxDays; i++){
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + i);
    const p = computePanchanga(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), lat, lon, tz);
    if(p.tithiNum === 11 || p.tithiNum === 26){
      return { days: i, paksha: p.paksha, year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
    }
  }
  return null;
}

const PanchangaAstro = {
  norm360, d2r, julianDay,
  sunLongAt, moonLongAt, ayanAt,
  tithiDiffAt, moonSidAt, sunSidAt, yogaSumAt,
  findNextCrossing, findNextNewMoon,
  karanaName, tithiInfo,
  dayOfYear, sunTimesUTCMinutes, minutesToUTCms,
  todayCivilInTz, weekdayName, weekdayIndex,
  computePanchanga, matchWatchlist, daysToNextEkadashi,
  NAKSHATRAS, YOGAS, TITHI_NAMES, VARA_NAMES, MASA_NAMES, RITU_NAMES, SAMVATSARA, KARANA_CYCLE
};

root.PanchangaAstro = PanchangaAstro;

})(typeof self !== 'undefined' ? self : this);
