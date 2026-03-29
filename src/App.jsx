import { useState, useMemo, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
// ═══════════════════════════════════════════════════════════════
// VOLKAN EXE BRIDGE
// ═══════════════════════════════════════════════════════════════
async function hesaplaRadyasyon(girdi) {
  try {
    const res = await fetch("http://localhost:7474", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(girdi)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  } catch {
    return null;
  }
}

function volkanToRadEnvOverride(vData, missionYears, sM) {
  if (!vData) return null;

  // Volkan total mission fluence veriyor, biz yıllık krad istiyoruz
  // kP: proton fluence → krad(Si) @ 10 MeV, tipik doz faktörü ~1e-8 krad·cm²
  const kP = 1e-8;
  const kE = 1e-9;

  const pTY = (vData["p_trapped_fluence_10.0MeV"] ?? 0) * kP / missionYears;
  const eTY = (vData.e_fluence_nominal ?? 0) * kE / missionYears;
  const gTY = (vData["p_gcr_fluence_10.0MeV"] ?? 0) * kP / missionYears;
  const eWC = (vData.e_fluence_worst_case ?? 0) * kE / missionYears;
  const eMarginFactor = vData.e_uncertainty_margin_factor ?? 1;
  const saaMult = vData.saa_multiplier > 0 ? 1 + vData.saa_multiplier : sM;

  return { pTY, eTY, gTY, eWC, eMarginFactor, saaMult, raw: vData };
}
// ═══════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════
const DARK = {
  name:"dark", bg:"#080c14", bgP:"#0d1421", bgC:"#111827", bgI:"#0d1421", bgH:"#1a2236",
  bd:"#1e2d45", bdL:"#162030", tx:"#e2e8f0", txM:"#64748b", txD:"#94a3b8",
  ac:"#38bdf8", acG:"rgba(56,189,248,0.15)", ok:"#34d399", wn:"#fbbf24", dn:"#f87171",
  co:"#fb923c", pu:"#a78bfa", tl:"#2dd4bf"
};
const LIGHT = {
  name:"light", bg:"#f0f4f8", bgP:"#ffffff", bgC:"#ffffff", bgI:"#ffffff", bgH:"#f8fafc",
  bd:"#dde3ed", bdL:"#e8edf5", tx:"#1e293b", txM:"#64748b", txD:"#94a3b8",
  ac:"#0284c7", acG:"rgba(2,132,199,0.1)", ok:"#059669", wn:"#d97706", dn:"#dc2626",
  co:"#ea580c", pu:"#7c3aed", tl:"#0d9488"
};

// ═══════════════════════════════════════════════════════════════
// MATERIAL DATABASE — Z-Band classification
// Z1: ultra-low Z (<5)   — proton stopper, H-rich
// Z2: low Z (5–14)       — lightweight structural
// Z3: mid Z (14–40)      — bremsstrahlung absorber
// Z4: high Z (40–75)     — electron stopper
// Z5: ultra-high Z (75+) — maximum stopping
// ═══════════════════════════════════════════════════════════════
const R_E = 6371;

const MAT = {
  PE:  { n:"Polietilen",   Z:2.7,  A:4.7,   d:0.94,  zB:"Z1", pc:0.022, ec:0.50, xa:0.20, by:0.001, ck:2,   sq:8,  mt:10,  hf:0.143, mf:5, lw:4,  og:false, nc:false, c:"#34d399", cl:"#059669" },
  B4C: { n:"Bor Karbür",   Z:5.2,  A:8.7,   d:2.52,  zB:"Z1", pc:0.019, ec:0.48, xa:0.25, by:0.003, ck:50,  sq:25, mt:5,  hf:0,     mf:2, lw:16, og:false, nc:true,  c:"#6ee7b7", cl:"#10b981" },
  CFRP:{ n:"Karbon Fiber",  Z:6,    A:12,    d:1.6,   zB:"Z2", pc:0.020, ec:0.47, xa:0.22, by:0.004, ck:30,  sq:10, mt:10, hf:0,     mf:3, lw:8,  og:true,  nc:false, c:"#38bdf8", cl:"#0284c7" },
  FG:  { n:"Cam Elyaf",    Z:10,   A:20,    d:2.0,   zB:"Z2", pc:0.017, ec:0.45, xa:0.28, by:0.010, ck:8,   sq:6,  mt:8,  hf:0,     mf:4, lw:6,  og:false, nc:false, c:"#67e8f9", cl:"#06b6d4" },
  AL:  { n:"Alüminyum",    Z:13,   A:27,    d:2.70,  zB:"Z2", pc:0.016, ec:0.43, xa:0.37, by:0.017, ck:5,   sq:5,  mt:15, hf:0,     mf:5, lw:4,  og:false, nc:false, c:"#60a5fa", cl:"#2563eb" },
  TI:  { n:"Titanyum",     Z:22,   A:48,    d:4.51,  zB:"Z3", pc:0.014, ec:0.38, xa:1.8,  by:0.048, ck:25,  sq:8,  mt:10,  hf:0,     mf:3, lw:10, og:false, nc:false, c:"#818cf8", cl:"#4f46e5" },
  CU:  { n:"Bakır",        Z:29,   A:63.5,  d:8.96,  zB:"Z3", pc:0.012, ec:0.35, xa:3.5,  by:0.084, ck:10,  sq:5,  mt:8,  hf:0,     mf:4, lw:6,  og:false, nc:false, c:"#a78bfa", cl:"#7c3aed" },
  TA:  { n:"Tantalum",     Z:73,   A:181,   d:16.65, zB:"Z4", pc:0.008, ec:0.25, xa:8.5,  by:0.533, ck:200, sq:20, mt:4,  hf:0,     mf:2, lw:20, og:false, nc:false, c:"#e879f9", cl:"#c026d3" },
  W:   { n:"Tungsten",     Z:74,   A:184,   d:19.25, zB:"Z4", pc:0.007, ec:0.24, xa:9.0,  by:0.548, ck:40,  sq:15, mt:2,  hf:0,     mf:2, lw:14, og:false, nc:false, c:"#c084fc", cl:"#9333ea" },
  PB:  { n:"Kurşun",       Z:82,   A:207,   d:11.34, zB:"Z5", pc:0.009, ec:0.26, xa:7.0,  by:0.672, ck:3,   sq:10, mt:3,  hf:0,     mf:4, lw:6,  og:false, nc:false, c:"#94a3b8", cl:"#64748b" },
};

const PRP = { PE:{a:5,p:1.75}, B4C:{a:5.5,p:1.74}, CFRP:{a:5.2,p:1.75}, FG:{a:5.8,p:1.73}, AL:{a:6.5,p:1.72}, TI:{a:7.5,p:1.70}, CU:{a:8,p:1.69}, TA:{a:10,p:1.65}, W:{a:10.5,p:1.64}, PB:{a:9.5,p:1.66} };

// ═══════════════════════════════════════════════════════════════
// LOOKUP TABLES (unchanged from algorithm document)
// ═══════════════════════════════════════════════════════════════
const AK = [400,600,800,1e3,1500,2e3,4e3,8e3,12e3,2e4,35786,5e4,1e5];
const IK = [0,28,51,90];
const PF = [[1e7,5e7,2e8,3e8],[5e7,3e8,8e8,1.2e9],[2e8,1.5e9,5e9,8e9],[8e8,5e9,1.5e10,2e10],[5e9,2e10,5e10,6e10],[1e10,3e10,6e10,7e10],[5e9,1.5e10,3e10,4e10],[1e9,3e9,5e9,6e9],[1e8,5e8,1e9,2e9],[1e7,5e7,1e8,2e8],[5e6,1e7,2e7,5e7],[2e6,5e6,1e7,2e7],[1e6,2e6,5e6,1e7]];
const ELF = [[5e9,2e10,5e10,8e10],[2e10,1e11,3e11,5e11],[8e10,5e11,1e12,2e12],[3e11,1e12,3e12,5e12],[1e12,5e12,1e13,2e13],[3e12,1e13,2e13,3e13],[5e12,1.5e13,3e13,4e13],[8e12,2e13,4e13,5e13],[1e13,3e13,5e13,6e13],[5e12,1.5e13,3e13,4e13],[1e12,3e12,5e12,8e12],[5e11,1.5e12,3e12,5e12],[2e11,5e11,1e12,2e12]];
const GD = [[.5,2,4],[1,3.5,6],[2,5,8],[3,6,9],[4,8,12],[5,9,13],[7,11,15],[9,13,17],[10,14,18],[11,15,19],[12,16,20],[14,18,22],[15,20,25]];
const GIK = [0,51,90];
const TD = { direct:{l:"Doğrudan enjeksiyon",d:0}, hLM:{l:"Hohmann LEO→MEO",d:3}, hGTO:{l:"Hohmann GTO",d:5}, dHG:{l:"Çift Hohmann→GEO",d:10}, sLM:{l:"SEP LEO→MEO",d:60}, sLG:{l:"SEP LEO→GEO",d:250}, ssync:{l:"Süpersenkron",d:14}, lfly:{l:"Lunar flyby",d:10} };
const SPES = { typical:{f:1e9,l:"Tipik"}, severe:{f:1e10,l:"Şiddetli (2003)"}, extreme:{f:5e10,l:"Aşırı (1972)"}, carrington:{f:2e11,l:"Carrington (1859)"} };
const SC = [{n:25,tMin:2019.9,tMax:2025.5,tEnd:2030.5,sm:180},{n:26,tMin:2030.5,tMax:2036,tEnd:2041.5,sm:150},{n:27,tMin:2041.5,tMax:2047,tEnd:2052.5,sm:140},{n:28,tMin:2052.5,tMax:2058,tEnd:2063.5,sm:130}];
const WD = {2:[0.35,0.65], 3:[0.20,0.35,0.45], 4:[0.15,0.25,0.30,0.30], 5:[0.10,0.15,0.25,0.25,0.25]};

// ═══════════════════════════════════════════════════════════════
// Z-BAND TEMPLATE SYSTEM — 25 templates
// Each template: array of Z-band codes [outer → inner]
// Areal target ranges [min, nominal, max] in g/cm²
// ═══════════════════════════════════════════════════════════════
const Z_TEMPLATES = {
  // LEO family
  LEO_VLOW:      { bands:["Z2","Z3","Z1"],           ar:[0.3,0.8,2.0],   desc:"LEO <500km düşük ink" },
  LEO_ISS:       { bands:["Z1","Z2","Z3","Z1"],      ar:[0.8,2.0,4.0],   desc:"LEO ISS tipi (400-600km)" },
  LEO_SSO:       { bands:["Z1","Z2","Z3","Z1"],      ar:[1.0,2.0,4.0],   desc:"LEO SSO (600-800km polar)" },
  LEO_HIGH:      { bands:["Z1","Z3","Z4","Z2","Z1"], ar:[1.5,2.5,5.0],   desc:"LEO yüksek (800-1200km)" },
  LEO_TRANS:     { bands:["Z1","Z3","Z4","Z2","Z1"], ar:[2.0,4.0,7.0],   desc:"LEO-MEO geçiş (1200-2000km)" },
  LEO_POLAR:     { bands:["Z1","Z2","Z3","Z1"],      ar:[0.8,1.5,3.5],   desc:"LEO polar yüksek (>70°)" },
  // MEO family
  MEO_INNER:     { bands:["Z1","Z3","Z4","Z3","Z1"], ar:[5.0,8.0,12.0],  desc:"MEO iç (2000-4000km)" },
  MEO_SLOT:      { bands:["Z1","Z4","Z3","Z1"],      ar:[4.0,6.5,10.0],  desc:"MEO slot (4000-8000km)" },
  MEO_OUTER:     { bands:["Z2","Z4","Z3","Z1"],      ar:[3.0,5.5,8.0],   desc:"MEO dış (8000-12000km)" },
  MEO_PEAK_E:    { bands:["Z2","Z4","Z3","Z2"],      ar:[3.5,6.0,9.0],   desc:"MEO elektron peak (12-20Mm)" },
  MEO_HIGH:      { bands:["Z4","Z3","Z2","Z1"],      ar:[2.5,4.5,7.0],   desc:"MEO yüksek (20-30Mm)" },
  MEO_NAV:       { bands:["Z2","Z4","Z3","Z1"],      ar:[3.0,5.0,8.0],   desc:"MEO navigasyon (GPS ~20Mm)" },
  MEO_GCR:       { bands:["Z1","Z2","Z3","Z1"],      ar:[2.0,4.0,7.0],   desc:"MEO yüksek ink GCR" },
  // GEO family
  GEO_STD:       { bands:["Z4","Z3","Z2","Z1"],      ar:[2.0,3.0,5.0],   desc:"GEO standart" },
  GEO_HEAVY:     { bands:["Z4","Z3","Z3","Z2","Z1"], ar:[3.0,4.5,7.0],   desc:"GEO ağır TID" },
  GEO_LIGHT:     { bands:["Z4","Z3","Z1"],           ar:[1.5,2.5,4.0],   desc:"GEO hafif" },
  GEO_STORM:     { bands:["Z4","Z3","Z2","Z1"],      ar:[2.5,3.5,5.5],   desc:"GEO fırtına ağırlıklı" },
  GEO_COMMS:     { bands:["Z3","Z4","Z3","Z1"],      ar:[2.0,3.0,5.0],   desc:"GEO ticari comsat" },
  // HEO family
  HEO_MOLNIYA:   { bands:["Z1","Z3","Z4","Z3","Z1"], ar:[4.0,7.0,11.0],  desc:"HEO Molniya tipi" },
  HEO_TUNDRA:    { bands:["Z2","Z4","Z3","Z1"],      ar:[3.0,5.0,8.0],   desc:"HEO Tundra" },
  HEO_GTO:       { bands:["Z1","Z4","Z3","Z2"],      ar:[2.0,4.0,7.0],   desc:"HEO GTO transfer" },
  HEO_LUNAR:     { bands:["Z4","Z3","Z2","Z1"],      ar:[3.0,5.0,8.0],   desc:"Cislunar / derin uzay" },
  // Special purpose
  ULTRA_LIGHT:   { bands:["Z2","Z1"],                ar:[0.3,0.5,1.0],   desc:"Ultra hafif minimal" },
  NEUTRON_SENS:  { bands:["Z1","Z2","Z3","Z1"],      ar:[1.5,3.0,6.0],   desc:"Nötron hassas (B4C zorunlu)" },
  MAX_PROTECT:   { bands:["Z1","Z3","Z4","Z3","Z1"], ar:[5.0,8.0,15.0],  desc:"Maksimum koruma" },
};

// ═══════════════════════════════════════════════════════════════
// COMPUTATION ENGINE
// ═══════════════════════════════════════════════════════════════

function findBracket(v, k) {
  for (let i = 0; i < k.length - 1; i++) if (v <= k[i + 1]) return [i, i + 1];
  return [k.length - 2, k.length - 1];
}

function bilinearLogInterp(alt, inc, tb, aKeys, iKeys) {
  const cA = Math.max(aKeys[0], Math.min(alt, aKeys[aKeys.length - 1]));
  const cI = Math.max(iKeys[0], Math.min(inc, iKeys[iKeys.length - 1]));
  const lA = Math.log10(cA), lAK = aKeys.map(a => Math.log10(a));
  const [iL, iH] = findBracket(lA, lAK), [jL, jH] = findBracket(cI, iKeys);
  const tA = lAK[iH] === lAK[iL] ? 0 : (lA - lAK[iL]) / (lAK[iH] - lAK[iL]);
  const tI = iKeys[jH] === iKeys[jL] ? 0 : (cI - iKeys[jL]) / (iKeys[jH] - iKeys[jL]);
  const q11 = Math.log10(tb[iL][jL]), q12 = Math.log10(tb[iL][jH]);
  const q21 = Math.log10(tb[iH][jL]), q22 = Math.log10(tb[iH][jH]);
  return Math.pow(10, q11*(1-tA)*(1-tI) + q21*tA*(1-tI) + q12*(1-tA)*tI + q22*tA*tI);
}

function classifyOrbit(a) { return a < 2000 ? "LEO" : a < 35000 ? "MEO" : "GEO"; }
function computeEcc(a, p) { return (a - p) / (a + p + 2 * R_E); }
function segCount(e) { return e < 0.1 ? 20 : e < 0.5 ? 36 : 72; }

function eccCorrFluence(ap, pe, inc, tb, aKeys, iKeys) {
  const a = (ap + pe + 2*R_E) / 2, e = computeEcc(ap, pe);
  if (e < 0.001) return bilinearLogInterp((ap+pe)/2, inc, tb, aKeys, iKeys);
  const N = segCount(e);
  let tF = 0, tW = 0;
  for (let i = 0; i < N; i++) {
    const th = 2*Math.PI*i/N, r = a*(1-e*e)/(1+e*Math.cos(th)), alt = r - R_E;
    if (alt < 200) continue;
    const dw = Math.pow(r/a, 2);
    tF += bilinearLogInterp(Math.max(200, alt), inc, tb, aKeys, iKeys) * dw;
    tW += dw;
  }
  return tW > 0 ? tF / tW : 0;
}

function saaM(inc, alt) {
  if (alt > 2000 || alt < 200) return 1;
  let f = inc<20 ? 0.05 : inc<35 ? 0.15 : inc<55 ? 0.20 : inc<70 ? 0.12 : 0.08;
  return 1 + f * (3 + 8 * Math.exp(-Math.pow(alt-500, 2) / (2*Math.pow(200, 2))));
}

// Solar cycle
function getSolarPhase(d) {
  let c = SC.find(x => d >= x.tMin && d < x.tEnd) || SC[SC.length-1];
  const f = (d - c.tMin) / (c.tEnd - c.tMin);
  const s = c.sm * Math.pow(Math.sin(Math.PI * f), 2), r = s / c.sm;
  return { phase: r<0.2 ? "minimum" : r<0.5 && d<c.tMax ? "ascending" : r>=0.5 ? "maximum" : "descending", ssn: s, r, cycle: c.n };
}

function missionModulation(ld, yrs) {
  const y = [];
  for (let i = 0; i < yrs; i++) {
    const t = ld + i + 0.5, s = getSolarPhase(t), s1 = getSolarPhase(t-1), s2 = getSolarPhase(t-2);
    y.push({
      year: i+1, date: t, phase: s.phase, ssn: Math.round(s.ssn), cn: s.cycle,
      mod: { tp:1.3-0.6*s.r, te:0.6+0.7*s1.r, gcr:1.5-0.9*s1.r, spe:0.1+1.4*Math.max(s.r, s2.r) }
    });
  }
  return y;
}

function stormRisk(yrs, tE, cl) {
  const pS = 1 - Math.pow(1 - 0.08*tE/yrs, yrs), pX = 1 - Math.pow(1 - 0.01*tE/yrs, yrs);
  const w = {50:0.3,90:0.5,95:1.0,99:2.0}[cl] || 1;
  return 1e10*1.6e-11*pS + 5e10*1.6e-11*pX*w;
}

// ── Radiation environment ──
function computeRadEnv(inp, volkanOverride = null) {
  const { apogee, perigee, inclination, launchYear, launchMonth, missionYears, speCL, transferType } = inp;
  const avg = (apogee+perigee)/2, oc = classifyOrbit(avg), e = computeEcc(apogee, perigee);
  const ld = launchYear + (launchMonth-1)/12;
  const sM_base = oc==="LEO" ? saaM(inclination, avg) : 1;

  let pTY, eTY, gTY, eWC, eMarginFactor, sM;

  if (volkanOverride) {
    pTY           = volkanOverride.pTY;
    eTY           = volkanOverride.eTY;
    gTY           = volkanOverride.gTY;
    eWC           = volkanOverride.eWC;
    eMarginFactor = volkanOverride.eMarginFactor;
    sM            = volkanOverride.saaMult;
  } else {
    const pFl = eccCorrFluence(apogee,perigee,inclination,PF,AK,IK);
    const eFl = eccCorrFluence(apogee,perigee,inclination,ELF,AK,IK);
    const gB  = bilinearLogInterp(avg, inclination, GD, AK, GIK);
    // kP: p/cm²/yr → krad(Si), AP-8 >10MeV integral, 1mm Al referans
    // kE: e/cm²/yr → krad(Si), AE-8 >1MeV integral, 1mm Al referans
    const kP = 1.6e-10, kE = 1.3e-12;
    const pDF = avg < 600 ? 0.5 : avg < 1200 ? 0.8 : avg < 2000 ? 1.2 : avg < 8000 ? 2.0 : avg < 20000 ? 1.2 : 0.6;
    const eDF = avg < 600 ? 0.2 : avg < 1200 ? 0.5 : avg < 2000 ? 1.0 : avg < 8000 ? 2.5 : avg < 20000 ? 3.0 : 0.8;    pTY = pFl * kP * sM_base * pDF;
    eTY = eFl * kE * eDF;
    gTY = gB;
    eWC = null; eMarginFactor = 1; sM = sM_base;
  }

  const yr = missionModulation(ld, missionYears);
  const ds = yr.filter(y => y.phase==="maximum").length / yr.length >= 0.3 ? "DESIGN_FOR_MAX" : "WEIGHTED_AVG";
  let tE = 0; yr.forEach(y => tE += y.mod.spe);
  const cF = {50:1,90:5,95:10,99:50}[speCL] || 10;
  const kP2 = 1.6e-11;
  const sT = cF * 1e9 * Math.sqrt(tE) * kP2 * 10;
  const stD = stormRisk(missionYears, tE, speCL);
  const trD = TD[transferType]?.d || 0;
  let tUY = 0;
  const yD = yr.map(y => {
    const p = pTY * 1, el = eTY * y.mod.te, g = gTY * y.mod.gcr;
    const s = (sT / missionYears) * y.mod.spe;
    const st = (stD / missionYears) * y.mod.spe;
    const tot = p + el + g + s + st;
    tUY += tot;
    return { ...y, proton:p, electron:el, gcr:g, spe:s, storm:st, total:tot };
  });
  const grand = tUY || 1;
  const totalP = yD.reduce((s,y) => s + y.proton, 0);
  const totalE = yD.reduce((s,y) => s + y.electron, 0);
  const totalG = yD.reduce((s,y) => s + y.gcr, 0);
  const totalS = yD.reduce((s,y) => s + y.spe + y.storm, 0);
  const dom = {
    proton: totalP / grand,
    electron: totalE / grand,
    gcr: totalG / grand,
    spe: totalS / grand
  };
  return {
    orbitClass:oc, avgAlt:avg, ecc:e, saaMult:sM,
    pTY, eTY, gTY, speTid:sT, stormDose:stD, transferDose:trD,
    totalUnshielded: tUY + trD, yearlyDoses:yD, designStrategy:ds, yearly:yr,
    dom, launchDate:ld,
    volkanSource: !!volkanOverride,
    eWC: eWC ?? null,
    eMarginFactor: eMarginFactor ?? 1,
  };
}
// ═══════════════════════════════════════════════════════════════
// TEMPLATE SELECTION
// ═══════════════════════════════════════════════════════════════
function selectTemplate(inp, radEnv) {
  const { apogee, perigee } = inp;
  const { avgAlt, ecc, orbitClass, dom } = radEnv;
  const inc = inp.inclination;
  const severity = radEnv.totalUnshielded / (inp.maxTid / inp.rdm);

  // HEO check
  if (ecc > 0.3) {
    if (apogee > 50000) return "HEO_LUNAR";
    if (apogee >= 35000) return "HEO_GTO";
    if (perigee < 1000 && apogee > 20000) return "HEO_MOLNIYA";
    return "HEO_TUNDRA";
  }

  if (orbitClass === "LEO") {
    if (avgAlt < 500 && inc < 30) return "LEO_VLOW";
    if (inc > 70 && avgAlt > 800) return "LEO_POLAR";
    if (avgAlt < 600) return "LEO_ISS";
    if (avgAlt < 800) return "LEO_SSO";
    if (avgAlt < 1200) return "LEO_HIGH";
    return "LEO_TRANS";
  }

  if (orbitClass === "MEO") {
    if (avgAlt < 4000) return "MEO_INNER";
    if (avgAlt < 8000) return "MEO_SLOT";
    if (avgAlt < 12000) return "MEO_OUTER";
    if (avgAlt < 35000) return "MEO_PEAK_E";
    if (inc > 60) return "MEO_GCR";
    if (Math.abs(avgAlt - 20200) < 2000) return "MEO_NAV";
    return "MEO_HIGH";
  }

  // GEO
  if (severity > 30) return "GEO_HEAVY";
  if (severity < 3) return "GEO_LIGHT";
  if (dom.spe > 0.25) return "GEO_STORM";
  return "GEO_STD";
}

// Slider override: hafiflik yüksekse daha az katmanlı şablona düş
function applySliderOverride(tplKey, weights) {
  const wTotal = weights.protection + weights.mass + weights.cost || 100;
  const massR = weights.mass / wTotal;
  const protR = weights.protection / wTotal;
  const costR = weights.cost / wTotal;
  const tpl = Z_TEMPLATES[tplKey];
  if (!tpl) return tplKey;
  const nBands = tpl.bands.length;

  // Hafiflik veya maliyet ağırlıklıysa katman azalt
  if ((massR > 0.5 || costR > 0.5) && nBands >= 4) {
    // Aynı aileden daha az katmanlı şablon bul
    const family = tplKey.split("_")[0];
    const lighter = Object.entries(Z_TEMPLATES)
      .filter(([k,v]) => k.startsWith(family) && v.bands.length < nBands && v.bands.length >= 2)
      .sort((a,b) => a[1].bands.length - b[1].bands.length);
    if (lighter.length > 0) return lighter[0][0];
  }

  // Koruma ağırlıklıysa katman artır
  if (protR > 0.6 && nBands <= 3) {
    const family = tplKey.split("_")[0];
    const heavier = Object.entries(Z_TEMPLATES)
      .filter(([k,v]) => k.startsWith(family) && v.bands.length > nBands && v.bands.length <= 5)
      .sort((a,b) => b[1].bands.length - a[1].bands.length);
    if (heavier.length > 0) return heavier[0][0];
  }

  return tplKey;
}

// ═══════════════════════════════════════════════════════════════
// MATERIAL SELECTION per Z-band (weighted scoring)
// ═══════════════════════════════════════════════════════════════
function normalize(arr, key, higherBetter) {
  const vals = arr.map(c => c[key] || 0);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx === mn) return arr.map(() => 0.5);
  return arr.map(c => higherBetter ? (c[key]-mn)/(mx-mn) : (mx-c[key])/(mx-mn));
}

function selectMatForBand(zBand, weights, used, radEnv) {
  const pool = Object.entries(MAT)
    .filter(([k, m]) => m.zB === zBand && !used.includes(k))
    .map(([k, m]) => ({ key:k, ...m }));
  // Fallback: allow reuse if no candidates
  const candidates = pool.length > 0 ? pool :
    Object.entries(MAT).filter(([k,m]) => m.zB === zBand).map(([k,m]) => ({key:k,...m}));
  if (candidates.length === 0) return { key:"AL", ...MAT.AL };
  if (candidates.length === 1) return candidates[0];

  // Protection score: depends on band
  let protScores;
  if (zBand === "Z1") {
    const hS = normalize(candidates, "hf", true);
    const pS = normalize(candidates, "pc", true);
    protScores = candidates.map((_, i) => 0.6*hS[i] + 0.4*pS[i]);
  } else if (zBand === "Z4" || zBand === "Z5") {
    protScores = normalize(candidates, "xa", true);
  } else if (zBand === "Z2") {
    const xS = normalize(candidates, "xa", true);
    const pS = normalize(candidates, "pc", true);
    const isMEO = radEnv?.orbitClass === "MEO";
    const isGEO = radEnv?.orbitClass === "GEO";
    const xW = (isMEO || isGEO) ? 0.75 : 0.35;
    protScores = candidates.map((_, i) => xW*xS[i] + (1-xW)*pS[i]);
  } else {
    const xS = normalize(candidates, "xa", true);
    const pS = normalize(candidates, "pc", true);
    protScores = candidates.map((_, i) => 0.5*xS[i] + 0.5*pS[i]);
  }
  const massScores = normalize(candidates, "d", false);
  const costRaw = candidates.map(c => c.ck * c.sq);
  const cMn = Math.min(...costRaw), cMx = Math.max(...costRaw);
  const costScores = costRaw.map(v => cMx===cMn ? 0.5 : (cMx-v)/(cMx-cMn));
  const mfgPen = candidates.map(c => c.mf <= 2 ? 0.15 : 0);

  const scored = candidates.map((c, i) => ({
    ...c,
    score: weights.protection * protScores[i] + weights.mass * massScores[i] + weights.cost * costScores[i] - mfgPen[i]
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ═══════════════════════════════════════════════════════════════
// SHIELD DESIGN
// ═══════════════════════════════════════════════════════════════
function designShield(radEnv, inp) {
  const rawTplKey = selectTemplate(inp, radEnv);
  const tplKey = applySliderOverride(rawTplKey, inp.weights);
  const tpl = Z_TEMPLATES[tplKey];
  const wTotal = inp.weights.protection + inp.weights.mass + inp.weights.cost || 100;
  const w = { protection: inp.weights.protection/wTotal, mass: inp.weights.mass/wTotal, cost: inp.weights.cost/wTotal };

  const used = [];
  let layers = tpl.bands.map((band, i) => {
    const m = selectMatForBand(band, w, used, radEnv);
    used.push(m.key);
    return { idx: i, mk: m.key, m, band };
  });

  // B4C injection for neutron-sensitive
  if (radEnv.dom.gcr > 0.25 && layers.length >= 3 && !layers.find(l => l.mk === "B4C")) {
    const injectIdx = Math.max(1, layers.length - 2);
    if (layers[injectIdx].band === "Z1" || layers[injectIdx].band === "Z2") {
      layers[injectIdx].mk = "B4C";
      layers[injectIdx].m = { key:"B4C", ...MAT.B4C };
    }
  }

  // Target areal: use template range, clamped by maxAreal
  const severity = radEnv.totalUnshielded / (inp.maxTid / inp.rdm);
  // Interpolate within template range based on severity
  const sevFrac = Math.min(1, Math.max(0, (severity - 1) / 20));
  const nominalAreal = tpl.ar[0] + (tpl.ar[2] - tpl.ar[0]) * sevFrac;
  const protW = w.protection, massW = w.mass, costW = w.cost;
  const arealMult = 0.4 + 1.2 * protW - 0.35 * massW - 0.25 * costW;
  const targetAreal = Math.min(Math.max(nominalAreal * arealMult, tpl.ar[0]), inp.maxAreal);

  // Distribute thickness
  const dist = WD[layers.length] || WD[3];
  let surplus = 0;
  layers.forEach((l, i) => {
    let budget = targetAreal * dist[i] + surplus;
    surplus = 0;
    let tmm = (budget / l.m.d) * 10;
    const maxMm = l.m.mt;
    if (tmm > maxMm) { surplus = budget - (maxMm/10 * l.m.d); tmm = maxMm; }
    if (tmm < 0.1 && layers.length > 3) { surplus += budget; tmm = 0; }
    l.tmm = tmm;
    l.ad = tmm / 10 * l.m.d;
  });

  layers = layers.filter(l => l.tmm >= 0.1);
  if (surplus > 0 && layers.length > 0) {
    const extra = surplus / layers.length;
    layers.forEach(l => {
      l.tmm = Math.min(l.tmm + (extra / l.m.d) * 10, l.m.mt);
      l.ad = l.tmm / 10 * l.m.d;
    });
  }
  layers.forEach((l, i) => l.idx = i);

  return { layers, tplKey, tplDesc: tpl.desc, severity, nLayers: layers.length, targetAreal, domRaw: radEnv.dom };
}

// ═══════════════════════════════════════════════════════════════
// DOSE THROUGH SHIELD
// ═══════════════════════════════════════════════════════════════
function protonTr(layers, tid) {
  let tr = 1;
  layers.forEach(l => {
    const rp = PRP[l.mk]; if (!rp) return;
    const rng = Math.pow(100 / rp.a, 1/rp.p);
    const t1 = Math.exp(-l.ad / (rng * 0.3));
    const sigma = 45e-27 * Math.pow(l.m.A, 1/3);
    const t2 = Math.exp(-sigma * l.ad * 6.022e23 / l.m.A);
    // Her katman en fazla 4 OOM zayıflatabilir (fiziksel limit)
    tr *= Math.max(t1 * t2, 1e-4);
  });
  // Toplam geçirgenlik en az 1e-6 (tüm kalkan için)
  return tid * Math.max(tr, 1e-6);
}

function electronTr(layers, tid) {
  let eT = 1, bF = 0;
  layers.forEach(l => {
    const Re = l.m.ec * 5;
    if (Re <= l.ad) {
      const Y = l.m.Z * 2 / (800 + l.m.Z * 2);
      bF += eT * Y; eT = 0;
    } else {
      const f = l.ad / Re;
      const Y = l.m.Z * 2 / (800 + l.m.Z * 2);
      bF += eT * f * Y; eT *= (1 - f);
    }
    if (bF > 0) bF *= Math.exp(-l.m.xa * l.ad);
  });
  return { eD: tid * Math.max(eT, 0), bD: tid * bF };
}

function gcrTr(layers, dose) {
  let eA = 0;
  layers.forEach(l => eA += l.ad * (l.m.Z < 8 ? 1.3 : l.m.Z < 30 ? 1.0 : 0.6));
  return dose * Math.max(1 - 0.75 * (1 - Math.exp(-eA / 15)), 0.25);
}

function calcShieldedDose(layers, rE, inp) {
  const ss = inp.structuralShield || 0;
  const eLayers = ss > 0
    ? [{ mk:"AL", m:{ ...MAT.AL, key:"AL" }, ad:ss, tmm:ss/MAT.AL.d*10 }, ...layers]
    : [...layers];

  const yS = rE.yearlyDoses.map(yr => {
    const p = protonTr(eLayers, yr.proton);
    const eR = electronTr(eLayers, yr.electron);
    const g = gcrTr(eLayers, yr.gcr);
    const sp = protonTr(eLayers, yr.spe);
    const st = protonTr(eLayers, yr.storm);
    return { ...yr, sh:{ p, e:eR.eD, b:eR.bD, g, sp, st, t:p+eR.eD+eR.bD+g+sp+st } };
  });

  const trS = protonTr(eLayers, rE.transferDose);
  const lT = yS.reduce((s,y) => s + y.sh.t, 0) + trS;
  const lTR = lT * inp.rdm;
  const tA = layers.reduce((s,l) => s + l.ad, 0);

  const uP = rE.yearlyDoses.reduce((s,y)=>s+y.proton,0);
  const uE = rE.yearlyDoses.reduce((s,y)=>s+y.electron,0);
  const uG = rE.yearlyDoses.reduce((s,y)=>s+y.gcr,0);
  const sP = yS.reduce((s,y)=>s+y.sh.p,0), sE = yS.reduce((s,y)=>s+y.sh.e,0);
  const sB = yS.reduce((s,y)=>s+y.sh.b,0), sG = yS.reduce((s,y)=>s+y.sh.g,0);

  const tr = {
    p: uP>0 ? sP/uP*100 : 0,  e: uE>0 ? sE/uE*100 : 0,
    b: rE.totalUnshielded>0 ? sB/rE.totalUnshielded*100 : 0,
    g: uG>0 ? sG/uG*100 : 0,  t: rE.totalUnshielded>0 ? lT/rE.totalUnshielded*100 : 0
  };

  const aS = lT / inp.missionYears;
  const eLifeRaw = aS > 0 ? (inp.maxTid / inp.rdm) / aS : 999;
const eLife = isFinite(eLifeRaw) ? Math.min(eLifeRaw, 999) : 999;

  // SEE risk: GCR/SEP kaynaklı yüksek-LET parçacıklar TID'den bağımsız
  // Yüksek-Z malzeme sekonder parçacık üretir → SEE'ye karşı Z1/Z2 öne çıkar
  let sR, mL;
  const hasHighZ = layers.some(l => l.m.Z > 40);
const hasLowZ  = layers.some(l => l.m.Z < 8);
const seeTa = layers.reduce((s,l) => s + l.ad * (l.m.Z < 8 ? 1.4 : l.m.Z < 20 ? 1.0 : l.m.Z < 40 ? 0.7 : 0.4), 0);
if (seeTa < 0.5) { sR="YÜKSEK"; mL=80; }
else if (seeTa < 1.5) { sR="YÜKSEK"; mL=70; }
else if (seeTa < 3.0) { sR="ORTA"; mL=hasHighZ?60:55; }
else if (seeTa < 6.0) { sR=hasLowZ?"DÜŞÜK-ORTA":"ORTA"; mL=hasLowZ?45:50; }
else if (seeTa < 12.0) { sR="DÜŞÜK-ORTA"; mL=40; }
else if (seeTa < 20.0) { sR="DÜŞÜK"; mL=30; }
else { sR="DÜŞÜK"; mL=25; }

  const stSv = {};
  Object.entries(SPES).forEach(([k, sc]) => {
    const d = protonTr(eLayers, sc.f * 1.6e-11 * 30);
    stSv[k] = { dose: d, ok: d < inp.maxTid * 0.5, l: sc.l };
  });

  return { yS, lT, lTR, tA, tr, eLife, sR, mL, stSv, ok: lTR<=inp.maxTid, margin: inp.maxTid>0 ? (inp.maxTid-lTR)/inp.maxTid*100 : 0 };
}

function calcCost(layers) {
  let c = 0;
  layers.forEach(l => c += (l.tmm/10) * l.m.d / 1000 * l.m.ck * l.m.sq);
  return c + ({2:5,3:15,4:30,5:50}[layers.length] || 15) + 2;
}

// ═══════════════════════════════════════════════════════════════
// ITERATIVE DESIGN
// ═══════════════════════════════════════════════════════════════
function iterateDesign(rE, inp) {
  let sh = designShield(rE, inp);
  let res = calcShieldedDose(sh.layers, rE, inp);
  let it = 0, pT = -1, sc = 0;
  const w = [];
  // Slider-adjusted convergence target
  const wTotal = inp.weights.protection + inp.weights.mass + inp.weights.cost || 100;
  const protR = inp.weights.protection / wTotal;
  const massR = inp.weights.mass / wTotal;
  const costR = inp.weights.cost / wTotal;
  // Koruma↑: hedefin %70'ine yakınsa (büyük marjin bırak)
  // Hafiflik↑: hedefin %120'sine kadar kabul et (negatif marjin tolere)
  // Maliyet↑: hedefin %110'una kadar kabul et
  const tidTarget = inp.maxTid * (0.85 + 0.35 * massR + 0.15 * costR - 0.4 * protR);

  while (it < 150) {
    const tid = res.lTR, tgt = tidTarget;
    const relErr = (tid - tgt) / tgt;
    if (Math.abs(relErr) < 0.04) break;
    if (pT > 0 && Math.abs(tid - pT) / pT < 0.005) { sc++; if (sc >= 4) break; } else sc = 0;
    pT = tid;

    if (relErr > 0) {
      const tA = sh.layers.reduce((s,l) => s+l.ad, 0);
      if (tA >= inp.maxAreal * 0.95) {
        w.push("Kütle limiti aşılıyor. Spot shielding veya GaN bazlı bileşenler önerilir.");
        break;
      }
      const step = Math.min(0.60, Math.max(0.10, relErr * 0.8));
      let remaining = 0;
      sh.layers.forEach(l => {
        const maxAd = l.m.mt / 10 * l.m.d;
        const want = l.ad * step;
        const can = maxAd - l.ad;
        if (can > 1e-4) {
          const inc = Math.min(want, can);
          l.ad += inc; l.tmm = l.ad / l.m.d * 10;
          remaining += want - inc;
        } else { remaining += want; }
      });
      const open = sh.layers.filter(l => l.ad < l.m.mt/10*l.m.d);
      if (open.length > 0 && remaining > 0) {
        const each = remaining / open.length;
        open.forEach(l => {
          const maxAd = l.m.mt/10*l.m.d;
          const add = Math.min(each, maxAd - l.ad);
          l.ad += add; l.tmm = l.ad / l.m.d * 10;
        });
      }
    } else if (relErr < -0.10) {
      const shrink = Math.min(0.20, Math.abs(relErr) * 0.4);
      sh.layers.forEach(l => { l.ad *= (1-shrink); l.tmm = l.ad / l.m.d * 10; });
      sh.layers = sh.layers.filter(l => l.tmm >= 0.1);
    }
    res = calcShieldedDose(sh.layers, rE, inp);
    it++;
  }

  // Warnings
  sh.layers.forEach(l => {
    if (l.m.zB === "Z4" && l.ad > 2.0) w.push(`${l.m.n}: areal ${l.ad.toFixed(2)} g/cm² — bremsstrahlung riski`);
    if (l.mk === "AL" && l.tmm > 10) w.push("Al > 10mm: sekonder parçacık riski");
    if (l.m.og) w.push(`${l.m.n}: Outgassing — ASTM E595 uyumlu reçine gerektirir`);
    if (l.m.mf <= 2) w.push(`${l.m.n}: Zor tedarik (${l.m.lw} hafta)`);
  });

  return { sh, res, it, w, cost: calcCost(sh.layers) };
}

// Dose-depth curve
function doseDepthCurve(rE, inp) {
  const pts = [];
  for (let a = 0; a <= Math.min(inp.maxAreal * 2, 20); a += 0.25) {
    const al = [{ mk:"AL", m:{...MAT.AL,key:"AL"}, ad:a, tmm:a/MAT.AL.d*10 }];
    const tP = rE.yearlyDoses.reduce((s,y)=>s+y.proton,0);
    const tEl = rE.yearlyDoses.reduce((s,y)=>s+y.electron,0);
    const tG = rE.yearlyDoses.reduce((s,y)=>s+y.gcr,0);
    const tS = rE.yearlyDoses.reduce((s,y)=>s+y.spe+y.storm,0);
    const pD = protonTr(al,tP), eR = electronTr(al,tEl), gDv = gcrTr(al,tG), sD = protonTr(al,tS);
    pts.push({ areal:+a.toFixed(2), total:+(pD+eR.eD+eR.bD+gDv+sD).toFixed(2), proton:+pD.toFixed(2), electron:+(eR.eD+eR.bD).toFixed(2), gcr:+gDv.toFixed(2) });
  }
  return pts;
}

// CSV export
function genCSV(d, rE, inp) {
  let c = "RADYASYON KALKANI TASARIM RAPORU\n\nYÖRÜNGE\n";
  c += `Apogee (km),${inp.apogee}\nPerigee (km),${inp.perigee}\nİnklinasyon (°),${inp.inclination}\nYörünge Sınıfı,${rE.orbitClass}\nOrt. İrtifa (km),${rE.avgAlt.toFixed(0)}\ne,${rE.ecc.toFixed(4)}\n`;
  c += `\nGÖREV\nFırlatma,${inp.launchMonth}/${inp.launchYear}\nÖmür (yıl),${inp.missionYears}\nMax TID (krad),${inp.maxTid}\nRDM,${inp.rdm}\nŞablon,${d.sh.tplKey} (${d.sh.tplDesc})\n`;
  c += `\nRADYASYON ORTAMI\nKalkansız TID (krad),${rE.totalUnshielded.toFixed(1)}\nSAA Çarpanı,${rE.saaMult.toFixed(2)}\nTransfer Dozu (krad),${rE.transferDose}\n`;
  c += `Baskınlık,p⁺ ${(rE.dom.proton*100).toFixed(0)}% | e⁻ ${(rE.dom.electron*100).toFixed(0)}% | GCR ${(rE.dom.gcr*100).toFixed(0)}%\n`;
  c += `\nKATMANLAR\nNo,Malzeme,Z-Bant,Kalınlık (mm),Areal (g/cm²)\n`;
  d.sh.layers.forEach((l,i) => c += `${i+1},${l.m.n},${l.band},${l.tmm.toFixed(2)},${l.ad.toFixed(3)}\n`);
  c += `\nToplam Areal (g/cm²),${d.res.tA.toFixed(3)}\nMaliyet ($/cm²),${d.cost.toFixed(2)}\n`;
  c += `\nSONUÇLAR\nÖmür Boyu TID (krad),${d.res.lT.toFixed(2)}\nTID × RDM (krad),${d.res.lTR.toFixed(2)}\nGüvenlik Marjı (%),${d.res.margin.toFixed(1)}\nTahmini Ömür (yıl),${d.res.eLife.toFixed(1)}\nSEE Risk,${d.res.sR} (LET < ${d.res.mL})\n`;
  c += `\nGEÇİRGENLİK\nProton (%),${d.res.tr.p.toFixed(2)}\nElektron (%),${d.res.tr.e.toFixed(2)}\nX-ray/Brem (%),${d.res.tr.b.toFixed(2)}\nGCR (%),${d.res.tr.g.toFixed(2)}\n`;
  c += `\nFIRTINA DAYANIKLILIK\n`;
  Object.entries(d.res.stSv).forEach(([k,v]) => c += `${v.l},${v.dose.toFixed(1)} krad,${v.ok?"Dayanır":"Risk"}\n`);
  if (d.w.length > 0) { c += `\nUYARILAR\n`; d.w.forEach(uw => c += `${uw}\n`); }
  return c;
}

function dlFile(c,f,t) { const b=new Blob([c],{type:t}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=f;a.click();URL.revokeObjectURL(u); }

// ═══════════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function MC({ label, value, unit, color, t }) {
  return (
    <div style={{ background:t.bgC, border:`1px solid ${t.bd}`, borderRadius:10, padding:"12px 14px", minWidth:0, boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
      <div style={{ fontSize:10, color:t.txM, marginBottom:4, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color:color||t.tx, fontVariantNumeric:"tabular-nums" }}>
        {value}<span style={{ fontSize:12, fontWeight:400, marginLeft:4, color:t.txD }}>{unit}</span>
      </div>
    </div>
  );
}

function IG({ label, children, t }) {
  return (
    <div style={{ background:t.bgC, border:`1px solid ${t.bd}`, borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
      <div style={{ fontSize:11, fontWeight:700, color:t.ac, marginBottom:10, borderBottom:`1px solid ${t.bdL}`, paddingBottom:8, letterSpacing:"0.1em", textTransform:"uppercase" }}>{label}</div>
      {children}
    </div>
  );
}

function FL({ label, children, t }) {
  return (<div><label style={{ display:"block", fontSize:11, color:t.txM, marginBottom:4, fontWeight:500 }}>{label}</label>{children}</div>);
}

function PBar({ value, color, label, t }) {
  const pct = Math.min(value, 100);
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4, color:t.txD }}>
        <span>{label}</span><span style={{ fontWeight:700, color:t.tx, fontVariantNumeric:"tabular-nums" }}>%{value.toFixed(1)}</span>
      </div>
      <div style={{ height:5, background:t.bd, borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${Math.max(pct,0.5)}%`, height:"100%", background:color, borderRadius:3, transition:"width 0.5s", boxShadow:`0 0 6px ${color}80` }} />
      </div>
    </div>
  );
}

function LayerDiag({ layers, t }) {
  if (!layers?.length) return null;
  const tA = layers.reduce((s,l) => s+l.ad, 0);
  let y = 28;
  const dk = t.name==="dark";
  const rects = layers.map(l => { const h = Math.max(24, (l.ad/tA)*160); const r = {y,h,...l}; y+=h+3; return r; });
  return (
    <svg viewBox={`0 0 130 ${y+28}`} style={{ width:"100%", maxHeight:280 }}>
      <defs><linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity="0.25"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient></defs>
      <text x="65" y="14" textAnchor="middle" fontSize="9" fill={t.txM}>uzay ↓</text>
      <line x1="10" y1="22" x2="120" y2="22" stroke={t.bd} strokeDasharray="3,3"/>
      {rects.map((r,i) => (
        <g key={i}>
          <rect x="10" y={r.y} width="110" height={r.h} rx="4" fill={dk?r.m.c:r.m.cl} opacity="0.9"/>
          <rect x="10" y={r.y} width="110" height={r.h} rx="4" fill="url(#gl)" opacity="0.15"/>
          <text x="65" y={r.y+r.h/2+4} textAnchor="middle" fontSize="8" fill="#fff" fontWeight="600">{r.m.n} ({r.tmm.toFixed(1)}mm)</text>
        </g>
      ))}
      <line x1="10" y1={y} x2="120" y2={y} stroke={t.bd} strokeDasharray="3,3"/>
      <text x="65" y={y+14} textAnchor="middle" fontSize="9" fill={t.txM}>↑ bileşen</text>
    </svg>
  );
}

function StormTbl({ sv, t }) {
  if (!sv) return null;
  return (<div style={{fontSize:12}}>{Object.entries(sv).map(([k,v])=>(
    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${t.bdL}`,color:t.txD}}>
      <span>{v.l}</span>
      <span style={{fontWeight:700,color:v.ok?t.ok:t.dn}}>{v.dose.toFixed(1)} krad — {v.ok?"✓ Dayanır":"✗ Risk"}</span>
    </div>
  ))}</div>);
}

function PrioritySliders({ weights, setWeights, t }) {
  const items = [
    { key:"protection", label:"Koruma", color:t.ok, icon:"🛡" },
    { key:"mass", label:"Hafiflik", color:t.ac, icon:"⚖" },
    { key:"cost", label:"Maliyet", color:t.wn, icon:"💰" },
  ];
  const total = weights.protection + weights.mass + weights.cost;
  const handleChange = (key, newVal) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    const others = items.filter(i => i.key !== key);
    const otherTot = others.reduce((s,i) => s + weights[i.key], 0);
    const rem = 100 - clamped;
    let nw = { ...weights, [key]: clamped };
    if (otherTot === 0) { others.forEach(i => nw[i.key] = Math.round(rem/others.length)); }
    else { others.forEach(i => nw[i.key] = Math.round((weights[i.key]/otherTot)*rem)); }
    const sum = nw.protection + nw.mass + nw.cost;
    if (sum !== 100) { const fo = others.find(i => nw[i.key] + 100 - sum >= 0); if (fo) nw[fo.key] += 100 - sum; }
    setWeights(nw);
  };
  const dominant = items.reduce((a,b) => weights[a.key] >= weights[b.key] ? a : b);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <label style={{fontSize:11,color:t.txM,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"}}>Optimizasyon ağırlıkları</label>
        <span style={{fontSize:11,color:total===100?t.ok:t.dn,fontWeight:700}}>{total}% {total===100?"✓":"⚠"}</span>
      </div>
      {items.map(item => (
        <div key={item.key} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,color:t.txD}}>{item.icon} {item.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:item.color,fontVariantNumeric:"tabular-nums"}}>%{weights[item.key]}</span>
          </div>
          <input type="range" min="0" max="100" value={weights[item.key]}
            onChange={e => handleChange(item.key, parseInt(e.target.value))}
            style={{width:"100%",accentColor:item.color,cursor:"pointer",height:4}} />
        </div>
      ))}
      <div style={{marginTop:4,padding:"4px 10px",background:t.acG,borderRadius:6,fontSize:11,color:t.txM,textAlign:"center"}}>
        Aktif: <strong style={{color:t.ac}}>{dominant.label}</strong>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PDF REPORT
// ═══════════════════════════════════════════════════════════════
function exportPDF(d, rE, inp) {
  const R = d.res, S = d.sh;
  const layerRows = S.layers.map((l,i) =>
    `<tr><td>${i+1}</td><td><span style="display:inline-block;width:10px;height:10px;background:${l.m.cl};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${l.m.n}</td><td>${l.band}</td><td>${l.tmm.toFixed(2)} mm</td><td>${l.ad.toFixed(3)} g/cm²</td></tr>`
  ).join("");
  const stormRows = Object.entries(R.stSv).map(([k,v]) =>
    `<tr><td>${v.l}</td><td>${v.dose.toFixed(1)} krad</td><td style="color:${v.ok?"#059669":"#dc2626"};font-weight:700">${v.ok?"✓ Dayanır":"✗ Risk"}</td></tr>`
  ).join("");
  const warnHtml = d.w.length > 0 ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin:16px 0"><h3 style="color:#92400e;margin:0 0 8px">Uyarılar</h3>${d.w.map(w=>`<p style="color:#78350f;margin:4px 0;font-size:12px">⚠ ${w}</p>`).join("")}</div>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Radyasyon Kalkanı Raporu</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#1e293b;padding:40px;max-width:800px;margin:0 auto;font-size:13px;line-height:1.6}
  h1{font-size:22px;color:#0c4a6e;border-bottom:3px solid #0284c7;padding-bottom:8px;margin-bottom:20px}
  h2{font-size:16px;color:#0369a1;margin:24px 0 10px;border-left:4px solid #0284c7;padding-left:10px}
  h3{font-size:14px;color:#075985;margin:16px 0 8px}
  table{width:100%;border-collapse:collapse;margin:8px 0 16px}
  th{background:#f0f9ff;color:#0c4a6e;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #bae6fd}
  td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
  .metric{display:inline-block;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 16px;margin:4px;text-align:center;min-width:140px}
  .metric .label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em}
  .metric .value{font-size:20px;font-weight:700;color:#0c4a6e;margin-top:2px}
  .metric .unit{font-size:11px;color:#94a3b8;margin-left:2px}
  .ok{color:#059669} .bad{color:#dc2626}
  .info{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;margin:8px 0;font-size:12px;color:#0c4a6e}
  @media print{body{padding:20px}}
</style></head><body>
<h1>🛰 Radyasyon Kalkanı Tasarım Raporu</h1>
<p style="color:#64748b;margin-bottom:20px">Oluşturulma: ${new Date().toLocaleDateString("tr-TR")} | Şablon: ${S.tplKey} (${S.tplDesc})</p>

<h2>Yörünge & Görev</h2>
<table>
  <tr><td><strong>Yörünge</strong></td><td>${rE.orbitClass} — ort. ${rE.avgAlt.toFixed(0)} km</td><td><strong>İnklinasyon</strong></td><td>${inp.inclination}°</td></tr>
  <tr><td><strong>Apogee / Perigee</strong></td><td>${inp.apogee} / ${inp.perigee} km</td><td><strong>Eksantriklik</strong></td><td>${rE.ecc.toFixed(4)}</td></tr>
  <tr><td><strong>Fırlatma</strong></td><td>${inp.launchMonth}/${inp.launchYear}</td><td><strong>Görev ömrü</strong></td><td>${inp.missionYears} yıl</td></tr>
  <tr><td><strong>Max TID</strong></td><td>${inp.maxTid} krad</td><td><strong>RDM</strong></td><td>${inp.rdm}×</td></tr>
</table>

<div class="info">Radyasyon baskınlığı: p⁺ <strong>${(rE.dom.proton*100).toFixed(0)}%</strong> | e⁻ <strong>${(rE.dom.electron*100).toFixed(0)}%</strong> | GCR <strong>${(rE.dom.gcr*100).toFixed(0)}%</strong> | SPE <strong>${(rE.dom.spe*100).toFixed(0)}%</strong> — Kalkansız TID: <strong>${rE.totalUnshielded.toFixed(1)} krad</strong></div>

<h2>Sonuçlar</h2>
<div style="margin:12px 0">
  <div class="metric"><div class="label">Toplam Kütle</div><div class="value">${R.tA.toFixed(2)}<span class="unit">g/cm²</span></div></div>
  <div class="metric"><div class="label">Ömür Boyu TID</div><div class="value ${R.ok?"ok":"bad"}">${R.lTR.toFixed(1)}<span class="unit">krad</span></div></div>
  <div class="metric"><div class="label">Güvenlik Marjı</div><div class="value ${R.margin>=0?"ok":"bad"}">${R.margin>=0?"+":""}${R.margin.toFixed(1)}<span class="unit">%</span></div></div>
  <div class="metric"><div class="label">Tahmini Ömür</div><div class="value">${R.eLife.toFixed(1)}<span class="unit">yıl</span></div></div>
</div>

<h2>Kalkan Katmanları</h2>
<table><thead><tr><th>#</th><th>Malzeme</th><th>Z-Bant</th><th>Kalınlık</th><th>Areal</th></tr></thead><tbody>
${layerRows}
<tr style="font-weight:700;border-top:2px solid #bae6fd"><td colspan="4">Toplam</td><td>${R.tA.toFixed(3)} g/cm²</td></tr>
</tbody></table>
<p style="color:#64748b;font-size:12px">Yaklaşık maliyet: <strong>$${d.cost.toFixed(2)}/cm²</strong> | SEE risk: <strong>${R.sR}</strong> (LET &lt; ${R.mL})</p>

<h2>Radyasyon Geçirgenliği</h2>
<table><thead><tr><th>Parçacık</th><th>Geçirgenlik</th></tr></thead><tbody>
<tr><td>Proton</td><td>${R.tr.p.toFixed(2)}%</td></tr>
<tr><td>Elektron</td><td>${R.tr.e.toFixed(2)}%</td></tr>
<tr><td>X-ray / Bremsstrahlung</td><td>${R.tr.b.toFixed(2)}%</td></tr>
<tr><td>GCR</td><td>${R.tr.g.toFixed(2)}%</td></tr>
</tbody></table>

<h2>Güneş Fırtınası Dayanıklılığı</h2>
<table><thead><tr><th>Senaryo</th><th>Kalkan Arkası Doz</th><th>Durum</th></tr></thead><tbody>${stormRows}</tbody></table>

${warnHtml}

<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center">
  Graded-Z Radyasyon Kalkanı Tasarım Sistemi v1.0 — Bu rapor yaklaşık hesaplamalara dayanmaktadır.
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function RadiationShieldDesigner() {
  const [dark, setDark] = useState(true);
  const t = dark ? DARK : LIGHT;

  const [inputs, setInputs] = useState({
    inclination:51.6, apogee:420, perigee:410,
    launchMonth:6, launchYear:2026, missionYears:5,
    maxTid:30, maxNiel:"", letThreshold:40, maxAreal:3, structuralShield:0,
    rdm:2.0, transferType:"direct", speCL:95
  });
  const [weights, setWeights] = useState({ protection:60, mass:20, cost:20 });
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("design");
  const [comps, setComps] = useState([]);
  const [busy, setBusy] = useState(false);

  const u = (f, v) => setInputs(p => ({...p, [f]: v}));
  const n = f => e => u(f, e.target.value);
  const nb = f => e => { const v = parseFloat(e.target.value); u(f, isNaN(v) ? 0 : v); };

  const avgAlt = useMemo(() => { const a=parseFloat(inputs.apogee)||0,p=parseFloat(inputs.perigee)||0; return (a+p)/2; }, [inputs.apogee,inputs.perigee]);
  const oc = classifyOrbit(avgAlt);
  const ec = computeEcc(parseFloat(inputs.apogee)||0, parseFloat(inputs.perigee)||0);

  const [volkanErr, setVolkanErr] = useState(null);

const run = useCallback(() => {
  setBusy(true);
  setVolkanErr(null);
  setTimeout(() => {
    const pi = { ...inputs, inclination:parseFloat(inputs.inclination)||0, apogee:parseFloat(inputs.apogee)||400, perigee:parseFloat(inputs.perigee)||400, launchMonth:parseFloat(inputs.launchMonth)||1, launchYear:parseFloat(inputs.launchYear)||2026, missionYears:parseFloat(inputs.missionYears)||1, maxTid:parseFloat(inputs.maxTid)||30, letThreshold:parseFloat(inputs.letThreshold)||40, maxAreal:parseFloat(inputs.maxAreal)||3, structuralShield:parseFloat(inputs.structuralShield)||0, rdm:parseFloat(inputs.rdm)||2, weights };
    const girdi = {
      altitude_km:            (pi.apogee + pi.perigee) / 2,
      inclination_deg:        pi.inclination,
      eccentricity:           computeEcc(pi.apogee, pi.perigee),
      mission_duration_years: pi.missionYears,
      solar_max_fraction:     0.5,
    };
    // Volkan'ı çağır, sonra hesapla
    hesaplaRadyasyon(girdi).then(vData => {
      let volkanOverride = null;
      if (vData) {
        const sM_base = classifyOrbit((pi.apogee+pi.perigee)/2) === "LEO"
          ? saaM(pi.inclination, (pi.apogee+pi.perigee)/2) : 1;
        volkanOverride = volkanToRadEnvOverride(vData, pi.missionYears, sM_base);
      } else {
        setVolkanErr("not_found");
      }
      try {
        const rE = computeRadEnv(pi, volkanOverride);
        const d = iterateDesign(rE, pi);
        const dd = doseDepthCurve(rE, pi);
        setResult({ rE, d, dd }); setTab("design");
      } catch(err) { console.error(err); }
      setBusy(false);
    }).catch(err => {
      setVolkanErr(err.message || "crashed");
      try {
        const rE = computeRadEnv(pi, null);
        const d = iterateDesign(rE, pi);
        const dd = doseDepthCurve(rE, pi);
        setResult({ rE, d, dd }); setTab("design");
      } catch(e) { console.error(e); }
      setBusy(false);
    });
  }, 50);
}, [inputs, weights]);

  const addComp = () => { if(result) { const dm = weights.protection>=weights.mass&&weights.protection>=weights.cost?"koruma":weights.mass>=weights.cost?"hafiflik":"maliyet"; setComps(p=>[...p,{id:Date.now(),label:`${oc}/${dm}`,tA:result.d.res.tA,tid:result.d.res.lTR,cost:result.d.cost,margin:result.d.res.margin,life:result.d.res.eLife,nL:result.d.sh.layers.length}]); }};

  const is = { width:"100%",boxSizing:"border-box",fontSize:13,padding:"8px 10px",border:`1px solid ${t.bd}`,borderRadius:7,background:t.bgI,color:t.tx,outline:"none",transition:"border-color 0.2s",fontFamily:"inherit" };
  const ss = { ...is, appearance:"auto" };
  const R = result?.d?.res, S = result?.d?.sh, W = result?.d?.w || [];
  const cGrid = dark ? "#1e2d45" : "#e2e8f0";
  const cTT = { fontSize:12, background:t.bgC, border:`1px solid ${t.bd}`, color:t.tx };

  return (
    <div style={{ fontFamily:"'IBM Plex Sans','Segoe UI',system-ui,sans-serif", minHeight:"100vh", background:t.bg, color:t.tx, transition:"background 0.3s,color 0.3s" }}>
      {dark && <div style={{ position:"fixed",inset:0,pointerEvents:"none",zIndex:0, background:"radial-gradient(ellipse at 20% 50%,rgba(56,189,248,0.04) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(167,139,250,0.04) 0%,transparent 60%)" }} />}

      {/* Header */}
      <div style={{ position:"relative",zIndex:10, background:dark?"linear-gradient(135deg,#0a1628,#0d1f3c,#0a1628)":"linear-gradient(135deg,#0c4a6e,#0369a1,#0c4a6e)", borderBottom:`1px solid ${t.bd}`, padding:"0 20px", display:"flex",alignItems:"center",justifyContent:"space-between", height:56, boxShadow:dark?"0 1px 20px rgba(56,189,248,0.1)":"0 1px 8px rgba(0,0,0,0.2)" }}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{ width:32,height:32,borderRadius:"50%", background:"radial-gradient(circle at 35% 35%,#60a5fa,#1d4ed8,#0f172a)", boxShadow:"0 0 12px rgba(96,165,250,0.5)", display:"flex",alignItems:"center",justifyContent:"center", fontSize:14,flexShrink:0 }}>🛰</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,letterSpacing:"0.02em",color:"#f0f9ff"}}>Radyasyon Kalkanı Tasarım Sistemi</div>
            <div style={{fontSize:10,opacity:0.6,color:"#bae6fd",letterSpacing:"0.1em"}}>GRADED-Z OPTİMİZASYONLU UYDU ZIRH TASARIMI</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,0.35)",fontWeight:600}}>v1.1</span>
          <button onClick={()=>setDark(d=>!d)} style={{ display:"flex",alignItems:"center",gap:8, background:t.bgH,border:`1px solid ${t.bd}`, borderRadius:20,padding:"5px 12px", cursor:"pointer",color:t.tx,fontSize:12,fontWeight:600 }}>
            <span style={{fontSize:15}}>{dark?"☀️":"🌑"}</span>{dark?"Aydınlık":"Karanlık"}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ position:"relative",zIndex:1, display:"grid",gridTemplateColumns:"340px minmax(0,1fr)", gap:0,minHeight:"calc(100vh - 56px)" }}>

        {/* LEFT */}
        <div style={{ background:t.bgP,borderRight:`1px solid ${t.bd}`,padding:14,overflowY:"auto",maxHeight:"calc(100vh - 56px)" }}>
          <IG label="Yörünge" t={t}>
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
              <FL label="İnklinasyon (°)" t={t}><input type="number" value={inputs.inclination} onChange={n("inclination")} onBlur={nb("inclination")} style={is} min="0" max="90" step="0.1"/></FL>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <FL label="Apogee (km)" t={t}><input type="number" value={inputs.apogee} onChange={n("apogee")} onBlur={nb("apogee")} style={is} min="200"/></FL>
                <FL label="Perigee (km)" t={t}><input type="number" value={inputs.perigee} onChange={n("perigee")} onBlur={nb("perigee")} style={is} min="200"/></FL>
              </div>
            </div>
            <div style={{ marginTop:8,padding:"7px 10px",background:t.acG,borderRadius:8,border:`1px solid ${t.bd}`, display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
              <span style={{ display:"inline-block",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:t.acG,color:t.ac,border:`1px solid ${t.ac}`,letterSpacing:"0.05em" }}>{oc}</span>
              <span style={{fontSize:11,color:t.txD}}>ort. {avgAlt.toFixed(0)} km</span>
              <span style={{fontSize:11,color:t.txM}}>e={ec.toFixed(4)}</span>
            </div>
          </IG>

          <IG label="Görev" t={t}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <FL label="Fırlatma ayı" t={t}><input type="number" value={inputs.launchMonth} onChange={n("launchMonth")} onBlur={nb("launchMonth")} style={is} min="1" max="12"/></FL>
              <FL label="Fırlatma yılı" t={t}><input type="number" value={inputs.launchYear} onChange={n("launchYear")} onBlur={nb("launchYear")} style={is} min="2024" max="2060"/></FL>
              <FL label="Görev ömrü (yıl)" t={t}><input type="number" value={inputs.missionYears} onChange={n("missionYears")} onBlur={nb("missionYears")} style={is} min="1" max="30"/></FL>
              <FL label="SPE güven (%)" t={t}><select value={inputs.speCL} onChange={e=>u("speCL",parseInt(e.target.value))} style={ss}><option value={50}>%50</option><option value={90}>%90</option><option value={95}>%95</option><option value={99}>%99</option></select></FL>
            </div>
            <FL label="Transfer türü" t={t}><select value={inputs.transferType} onChange={e=>u("transferType",e.target.value)} style={{...ss,marginTop:8}}>{Object.entries(TD).map(([k,v])=><option key={k} value={k}>{v.l} ({v.d} krad)</option>)}</select></FL>
          </IG>

          <IG label="Toleranslar" t={t}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <FL label="Max TID (krad)" t={t}><input type="number" value={inputs.maxTid} onChange={n("maxTid")} onBlur={nb("maxTid")} style={is} min="1"/></FL>
              <FL label="Max NIEL (MeV/g)" t={t}><input type="number" value={inputs.maxNiel} onChange={e=>u("maxNiel",e.target.value)} placeholder="opsiyonel" style={is}/></FL>
              <FL label="LET eşiği (MeV·cm²/mg)" t={t}><input type="number" value={inputs.letThreshold} onChange={n("letThreshold")} onBlur={nb("letThreshold")} style={is}/></FL>
              <FL label="Max kütle (g/cm²)" t={t}><input type="number" value={inputs.maxAreal} onChange={n("maxAreal")} onBlur={nb("maxAreal")} style={is} min="0.1" step="0.1"/></FL>
            </div>
          </IG>

          <IG label="Tasarım" t={t}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <FL label="RDM faktörü" t={t}><input type="number" value={inputs.rdm} onChange={n("rdm")} onBlur={nb("rdm")} style={is} min="1" max="5" step="0.1"/></FL>
              <FL label="Yapısal zırh (g/cm²)" t={t}><input type="number" value={inputs.structuralShield} onChange={n("structuralShield")} onBlur={nb("structuralShield")} style={is} min="0" step="0.1"/></FL>
            </div>
            <PrioritySliders weights={weights} setWeights={setWeights} t={t}/>
          </IG>

          <button onClick={run} disabled={busy} style={{ width:"100%",padding:13,marginTop:4, background:busy?t.bd:`linear-gradient(135deg,${t.ac},#0369a1)`, color:busy?t.txM:"#fff", border:"none",borderRadius:10,fontSize:14,fontWeight:700, cursor:busy?"wait":"pointer",letterSpacing:"0.03em", boxShadow:busy?"none":`0 0 20px ${t.acG}` }}>
            {busy ? "⏳ Hesaplanıyor..." : "⚡ Zırh Tasarla"}
          </button>
        </div>

        {/* RIGHT */}
        <div style={{ padding:16,overflowY:"auto",maxHeight:"calc(100vh - 56px)" }}>
          {!result ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:12}}>
              <div style={{fontSize:48,opacity:0.15}}>🛰</div>
              <div style={{color:t.txM,fontSize:14}}>Parametreleri girin ve <strong style={{color:t.ac}}>"Zırh Tasarla"</strong> butonuna basın</div>
            </div>
          ) : (<>
            {/* Tabs */}
            <div style={{display:"flex",gap:0,borderBottom:`1px solid ${t.bd}`,marginBottom:16}}>
              {[["design","Tasarım"],["env","Radyasyon Ortamı"],["dd","Dose-Depth"],["cmp","Karşılaştırma"]].map(([k,v])=>(
                <button key={k} onClick={()=>setTab(k)} style={{ padding:"10px 18px",fontSize:12,fontWeight:tab===k?700:500, border:"none",background:"transparent",color:tab===k?t.ac:t.txM, cursor:"pointer",borderBottom:tab===k?`2px solid ${t.ac}`:"2px solid transparent", marginBottom:-1,letterSpacing:"0.04em" }}>{v}</button>
              ))}
            </div>

            {/* DESIGN */}
            {tab==="design"&&R&&(<>
            {volkanErr && (
  <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,
    border:"1px solid rgba(248,113,113,0.4)",background:"rgba(248,113,113,0.07)",
    display:"flex",alignItems:"center",gap:10,fontSize:12}}>
    <span style={{fontSize:18}}>⚠️</span>
    <div>
      <div style={{fontWeight:700,color:"#f87171"}}>
        {volkanErr === "not_found" ? "hesaplayici.exe bulunamadı" : `Volkan hatası: ${volkanErr}`}
      </div>
      <div style={{color:t.txM,marginTop:2}}>
        Sonuçlar dahili lookup tablosuna göre hesaplandı.
      </div>
    </div>
    <button onClick={()=>setVolkanErr(null)}
      style={{marginLeft:"auto",background:"none",border:"none",color:t.txM,cursor:"pointer",fontSize:18}}>✕</button>
  </div>
)}
{result?.rE?.volkanSource && (
  <div style={{marginBottom:12,padding:"8px 14px",borderRadius:8,
    border:"1px solid rgba(52,211,153,0.3)",background:"rgba(52,211,153,0.07)",
    display:"flex",alignItems:"center",gap:8,fontSize:12}}>
    <span>⚡</span>
    <span style={{color:"#34d399",fontWeight:700}}>Volkan ML modeli aktif</span>
    {result.rE.eMarginFactor > 1 &&
      <span style={{marginLeft:"auto",color:t.wn,fontSize:11}}>e⁻ marjı: ×{result.rE.eMarginFactor.toFixed(2)}</span>}
  </div>
)}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:16}}>
                <MC t={t} label="Toplam kütle" value={R.tA.toFixed(2)} unit="g/cm²"/>
                <MC t={t} label="Ömür boyu TID" value={R.lTR.toFixed(1)} unit="krad" color={R.ok?t.ok:t.dn}/>
                <MC t={t} label="Güvenlik marjı" value={`${R.margin>=0?"+":""}${R.margin.toFixed(1)}`} unit="%" color={R.margin>=0?t.ok:t.dn}/>
                <MC t={t} label="Tahmini ömür" value={R.eLife.toFixed(1)} unit="yıl"/>
              </div>

              {/* Dominance strip */}
              {S.domRaw && (
                <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap", padding:"8px 12px",background:t.acG,border:`1px solid ${t.bd}`,borderRadius:10,fontSize:12 }}>
                  <span style={{color:t.txM}}>Şablon:</span><strong style={{color:t.ac}}>{S.tplKey}</strong>
                  <span style={{color:t.bdL}}>|</span>
                  <span style={{color:t.txM}}>
                    p⁺ <strong style={{color:t.co}}>{(S.domRaw.proton*100).toFixed(0)}%</strong>
                    {" "}e⁻ <strong style={{color:t.ac}}>{(S.domRaw.electron*100).toFixed(0)}%</strong>
                    {" "}GCR <strong style={{color:t.wn}}>{(S.domRaw.gcr*100).toFixed(0)}%</strong>
                    {" "}SPE <strong style={{color:t.dn}}>{(S.domRaw.spe*100).toFixed(0)}%</strong>
                  </span>
                  <span style={{color:t.bdL}}>|</span>
                  <span style={{color:t.txM}}>Şiddet: <strong style={{color:t.tx}}>{S.severity.toFixed(1)}×</strong></span>
                  <span style={{color:t.txM}}>İter: <strong style={{color:t.tx}}>{result.d.it}</strong></span>
                </div>
              )}

              <div style={{display:"grid",gridTemplateColumns:"160px minmax(0,1fr)",gap:12,marginBottom:14}}>
                <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:t.txM,marginBottom:8,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Katman kesiti</div>
                  <LayerDiag layers={S.layers} t={t}/>
                </div>
                <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:12}}>
                  <div style={{fontSize:10,color:t.txM,marginBottom:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Katman detayları</div>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:`1px solid ${t.bd}`}}>
                      {["#","Malzeme","Z-Bant","Kalınlık","g/cm²"].map((h,i)=>(
                        <th key={i} style={{textAlign:i<2?"left":"right",padding:"4px 8px",fontSize:10,color:t.txM,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{S.layers.map((l,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${t.bdL}`}}>
                        <td style={{padding:"7px 8px",color:t.txM}}>{i+1}</td>
                        <td style={{padding:"7px 8px"}}><span style={{display:"inline-block",width:9,height:9,background:dark?l.m.c:l.m.cl,borderRadius:2,marginRight:6,verticalAlign:"middle",boxShadow:`0 0 4px ${dark?l.m.c:l.m.cl}`}}/>{l.m.n}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontSize:11,color:t.txM}}>{l.band}</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{l.tmm.toFixed(2)} mm</td>
                        <td style={{padding:"7px 8px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{l.ad.toFixed(3)}</td>
                      </tr>
                    ))}</tbody>
                    <tfoot><tr style={{borderTop:`1px solid ${t.bd}`,fontWeight:700}}>
                      <td colSpan={4} style={{padding:"7px 8px",color:t.txD}}>Toplam</td>
                      <td style={{padding:"7px 8px",textAlign:"right"}}>{R.tA.toFixed(3)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12,marginBottom:14}}>
                <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14}}>
                  <div style={{fontSize:10,color:t.txM,marginBottom:12,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Radyasyon geçirgenliği</div>
                  <PBar t={t} value={R.tr.p} color={t.co} label="Proton"/>
                  <PBar t={t} value={R.tr.e} color={t.ac} label="Elektron"/>
                  <PBar t={t} value={R.tr.b} color={t.pu} label="X-ray / brem."/>
                  <PBar t={t} value={R.tr.g} color={t.wn} label="GCR"/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:"12px 14px",flex:1}}>
                    <div style={{fontSize:10,color:t.txM,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Maliyet</div>
                    <div style={{fontSize:22,fontWeight:700,marginTop:4}}>${result.d.cost.toFixed(2)} <span style={{fontSize:12,fontWeight:400,color:t.txM}}>/cm²</span></div>
                  </div>
                  <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:"12px 14px",flex:1}}>
                    <div style={{fontSize:10,color:t.txM,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Güneş döngüsü</div>
                    <div style={{fontSize:13,fontWeight:600,marginTop:4,color:t.wn}}>Döngü {result.rE.yearly[0]?.cn} — {result.rE.designStrategy==="DESIGN_FOR_MAX"?"max'a göre":"ağırlıklı ort."}</div>
                  </div>
                  <div style={{ background:`${R.sR==="DÜŞÜK"||R.sR==="DÜŞÜK-ORTA"?t.ok:t.dn}15`, border:`1px solid ${R.sR==="DÜŞÜK"||R.sR==="DÜŞÜK-ORTA"?t.ok:t.dn}40`, borderRadius:12,padding:"12px 14px",flex:1 }}>
                    <div style={{fontSize:10,color:t.txM,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>SEE risk</div>
                    <div style={{fontSize:14,fontWeight:700,marginTop:4,color:R.sR==="DÜŞÜK"||R.sR==="DÜŞÜK-ORTA"?t.ok:t.dn}}>{R.sR} (LET &lt; {R.mL})</div>
                  </div>
                </div>
              </div>

              <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{fontSize:10,color:t.txM,marginBottom:10,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Güneş fırtınası dayanıklılığı</div>
                <StormTbl sv={R.stSv} t={t}/>
              </div>

              {W.length>0&&<div style={{background:`${t.wn}15`,border:`1px solid ${t.wn}40`,borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:t.wn,marginBottom:8,letterSpacing:"0.08em"}}>⚠ UYARILAR</div>
                {W.map((w,i)=><div key={i} style={{fontSize:12,color:t.txD,marginBottom:5}}>• {w}</div>)}
              </div>}

              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>dlFile(genCSV(result.d,result.rE,inputs),"kalkan_tasarim.csv","text/csv")} style={{padding:"8px 16px",fontSize:12,border:`1px solid ${t.bd}`,borderRadius:8,background:t.bgH,color:t.txD,cursor:"pointer",fontWeight:500}}>CSV indir</button>
                <button onClick={()=>exportPDF(result.d,result.rE,inputs)} style={{padding:"8px 16px",fontSize:12,border:`1px solid ${t.bd}`,borderRadius:8,background:t.bgH,color:t.txD,cursor:"pointer",fontWeight:500}}>PDF rapor</button>
                <button onClick={addComp} style={{padding:"8px 16px",fontSize:12,border:`1px solid ${t.ac}`,borderRadius:8,background:t.acG,color:t.ac,cursor:"pointer",fontWeight:700}}>+ Karşılaştır</button>
              </div>
            </>)}

            {/* ENVIRONMENT */}
            {tab==="env"&&result&&(<div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:16}}>
                <MC t={t} label="Kalkansız TID" value={result.rE.totalUnshielded.toFixed(1)} unit="krad" color={t.dn}/>
                <MC t={t} label="SAA çarpanı" value={result.rE.saaMult.toFixed(1)} unit="×" color={t.wn}/>
                <MC t={t} label="Transfer dozu" value={result.rE.transferDose.toFixed(1)} unit="krad" color={t.pu}/>
              </div>
              <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:12,color:t.txD}}>Yıllık radyasyon profili (kalkansız)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={result.rE.yearlyDoses.map(y=>({year:`Y${y.year}`,proton:+y.proton.toFixed(1),electron:+y.electron.toFixed(1),gcr:+y.gcr.toFixed(1),spe:+(y.spe+y.storm).toFixed(1)}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cGrid}/><XAxis dataKey="year" fontSize={11} tick={{fill:t.txM}}/><YAxis fontSize={11} tick={{fill:t.txM}} label={{value:"krad",angle:-90,position:"insideLeft",fontSize:11,fill:t.txM}}/>
                    <Tooltip contentStyle={cTT}/><Legend wrapperStyle={{fontSize:11,color:t.txD}}/>
                    <Bar dataKey="proton" stackId="a" fill={t.co} name="Proton"/><Bar dataKey="electron" stackId="a" fill={t.ac} name="Elektron"/>
                    <Bar dataKey="gcr" stackId="a" fill={t.wn} name="GCR"/><Bar dataKey="spe" stackId="a" fill={t.dn} name="SPE+Fırtına"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:12,color:t.txD}}>Güneş döngüsü</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={result.rE.yearly.map(y=>({date:y.date.toFixed(1),ssn:y.ssn}))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cGrid}/><XAxis dataKey="date" fontSize={11} tick={{fill:t.txM}}/><YAxis fontSize={11} tick={{fill:t.txM}} label={{value:"SSN",angle:-90,position:"insideLeft",fontSize:11,fill:t.txM}}/>
                    <Tooltip contentStyle={cTT}/><Line type="monotone" dataKey="ssn" stroke={t.wn} strokeWidth={2} dot={{r:3,fill:t.wn}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>)}

            {/* DOSE-DEPTH */}
            {tab==="dd"&&result&&(<div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Dose-depth eğrisi (Al referans)</div>
              <div style={{fontSize:11,color:t.txM,marginBottom:14}}>Al kalınlığına karşı ömür boyu doz</div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={result.dd}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cGrid}/><XAxis dataKey="areal" fontSize={11} tick={{fill:t.txM}} label={{value:"g/cm²",position:"bottom",fontSize:11,fill:t.txM}}/><YAxis fontSize={11} tick={{fill:t.txM}} scale="log" domain={["auto","auto"]} label={{value:"TID (krad)",angle:-90,position:"insideLeft",fontSize:11,fill:t.txM}}/>
                  <Tooltip contentStyle={cTT}/><Legend wrapperStyle={{fontSize:11,color:t.txD}}/>
                  <Line type="monotone" dataKey="total" stroke={t.ac} strokeWidth={2} name="Toplam" dot={false}/>
                  <Line type="monotone" dataKey="proton" stroke={t.co} strokeWidth={1.5} name="Proton" dot={false} strokeDasharray="4 2"/>
                  <Line type="monotone" dataKey="electron" stroke={t.pu} strokeWidth={1.5} name="Elektron+Brem" dot={false} strokeDasharray="4 2"/>
                  <Line type="monotone" dataKey="gcr" stroke={t.wn} strokeWidth={1.5} name="GCR" dot={false} strokeDasharray="4 2"/>
                </LineChart>
              </ResponsiveContainer>
              {R&&<div style={{marginTop:14,padding:"10px 14px",background:t.acG,border:`1px solid ${t.bd}`,borderRadius:8,fontSize:12,color:t.txD}}>
                Mevcut tasarım: <strong style={{color:t.tx}}>{R.tA.toFixed(2)} g/cm²</strong> → <strong style={{color:t.ac}}>{R.lTR.toFixed(1)} krad</strong> (RDM dahil)
              </div>}
            </div>)}

            {/* COMPARISON */}
            {tab==="cmp"&&(<div>
              {comps.length===0 ? (
                <div style={{textAlign:"center",color:t.txM,padding:60,fontSize:13}}>
                  <div style={{fontSize:36,marginBottom:12,opacity:0.3}}>⚖</div>
                  Henüz karşılaştırma yok.<br/><strong style={{color:t.ac}}>"Karşılaştır"</strong> butonunu kullanın.
                </div>
              ) : (<>
                <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14,marginBottom:14}}>
                  <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                    <thead><tr style={{borderBottom:`1px solid ${t.bd}`}}>
                      {["Tasarım","Kütle","TID","$","Marj","Ömür","N",""].map((h,i)=>(
                        <th key={i} style={{textAlign:i?"right":"left",padding:8,color:t.txM,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{comps.map(c=>(
                      <tr key={c.id} style={{borderBottom:`1px solid ${t.bdL}`}}>
                        <td style={{padding:8,fontWeight:600}}>{c.label}</td>
                        <td style={{padding:8,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{c.tA.toFixed(2)}</td>
                        <td style={{padding:8,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{c.tid.toFixed(1)}</td>
                        <td style={{padding:8,textAlign:"right"}}>${c.cost.toFixed(0)}</td>
                        <td style={{padding:8,textAlign:"right",color:c.margin>=0?t.ok:t.dn,fontWeight:700}}>{c.margin.toFixed(1)}%</td>
                        <td style={{padding:8,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{c.life.toFixed(1)}</td>
                        <td style={{padding:8,textAlign:"right"}}>{c.nL}</td>
                        <td style={{padding:8}}><button onClick={()=>setComps(p=>p.filter(x=>x.id!==c.id))} style={{fontSize:12,color:t.dn,border:"none",background:"none",cursor:"pointer"}}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div style={{background:t.bgC,border:`1px solid ${t.bd}`,borderRadius:12,padding:14}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:12,color:t.txD}}>Karşılaştırma grafiği</div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={comps.map(c=>({name:c.label,kütle:+c.tA.toFixed(2),tid:+c.tid.toFixed(1)}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={cGrid}/><XAxis dataKey="name" fontSize={11} tick={{fill:t.txM}}/><YAxis fontSize={11} tick={{fill:t.txM}}/>
                      <Tooltip contentStyle={cTT}/><Legend wrapperStyle={{fontSize:11,color:t.txD}}/>
                      <Bar dataKey="kütle" fill={t.ac} name="Kütle (g/cm²)"/><Bar dataKey="tid" fill={t.co} name="TID (krad)"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>)}
            </div>)}
          </>)}
        </div>
      </div>
    </div>
  );
}
