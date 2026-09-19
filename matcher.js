/* 지원제도 판정과 기업마당 공고 매칭 (matcher.py 와 같은 규칙)
   링크 화면(artifact)과 공개 웹페이지(site)가 함께 쓴다. rules.js, data.js 다음에 불러온다. */
(function(){
"use strict";
const RULES=window.RULES||{programs:[],needs:[]}, DATA=window.BIZINFO_DATA||{items:[],count:0,collected_at:null};
const SMALL10=new Set(["B","C","F","H"]), EXCLUDED_WORDS=["유흥","단란","무도","사행","카지노"], INDIRECT_WORDS=["인력공급","파견","경비","경호","시설관리"];
const IND=window.INDUSTRY||{groups:[],by_code:{}};      // 국세청 업종코드-표준산업분류 연계표 (industry.js)
const GENERIC=new Set(["개발","서비스","판매","기타","관련","일반","지원","사업"]);
const won=n=>Math.round(n).toLocaleString("ko-KR");
const num=(v,d=null)=>{if(v===null||v===undefined||v==="")return d;const x=parseFloat(String(v).replace(/,/g,""));return isNaN(x)?d:x};
/* 업종: 드롭다운에서 고른 종목의 속성(industry_hint)이 있으면 그것을, 없으면 업종코드로 연계표를 조회한다 */
const hintOf=c=>c.industry_hint||{};
const codeOf=c=>String(c.industry_code||"").replace(/\D/g,"");
const infoOf=c=>IND.by_code[codeOf(c)]||null;
const flagsOf=c=>hintOf(c).f!==undefined?String(hintOf(c).f||""):((infoOf(c)||{}).f||"");
function sectionOf(c){return hintOf(c).section||(infoOf(c)||{}).s||""}
const prefixHit=(code,table)=>{if(!code)return null;for(const k of Object.keys(table))if(code.startsWith(k))return k+" "+table[k];return null};
function todayISO(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function daysLeft(end){const a=end.split("-").map(Number),t=todayISO().split("-").map(Number);return Math.round((Date.UTC(a[0],a[1]-1,a[2])-Date.UTC(t[0],t[1]-1,t[2]))/86400000)}
function monthsSince(ym){const m=/^(\d{4})[-./]?(\d{1,2})/.exec(String(ym||""));if(!m)return null;const d=new Date();return (d.getFullYear()-+m[1])*12+d.getMonth()+1-+m[2]}
const isSmallBiz=c=>num(c.insured,0)<(SMALL10.has(sectionOf(c))?10:5);
const sameSido=(s,list)=>!list||!list.length||list.includes(s);
function sigunguState(c,list){if(!list||!list.length)return "match";const where=((c.sigungu||"")+" "+(c.address||"")).trim();if(!where)return "unknown";return list.some(s=>where.includes(s))?"match":"other"}
const isOpen=(it,today)=>!it.end||it.end>=today;

function evalYouthLeap(prog,c,notices){
  const p=prog.params,n=num(c.insured,0),sido=c.sido||"",capital=p.capital_region.includes(sido);
  const ptype=prog.types.find(t=>t.key===(capital?"수도권":"비수도권")),flags=c.flags||{},code=codeOf(c);
  const labels=Object.fromEntries(prog.conditions.map(x=>[x.key,x])),results=[];
  const add=(key,status,message)=>results.push({key,label:labels[key].label,status,message,detail:labels[key].detail,source:labels[key].source});
  /* 예외 항목은 key 또는 짧은 이름(short)으로 들어온다. "해당 없음"은 예외가 없다는 뜻 */
  const excLabels={};prog.under5_exceptions.forEach(e=>{excLabels[e.key]=e.short||e.label;if(e.short)excLabels[e.short]=e.short});
  const noneLabel=prog.under5_none_label||"해당 없음",excNone=!!flags.exceptions_none||(flags.exceptions||[]).includes(noneLabel);
  const iflags=flagsOf(c),knowledge=iflags.includes("K")?(c.industry_text||(infoOf(c)||{}).n||"선택한 종목"):null;
  const chosen=(flags.exceptions||[]).filter(k=>excLabels[k]).map(k=>excLabels[k]);
  if(n>=p.min_insured)add("insured","pass",`고용보험 가입자 ${n}명`);
  else if(n>=p.min_insured_exception){
    if(knowledge)add("insured","pass",`${n}명이지만 지식서비스산업(${knowledge}) 예외로 보임. 표준산업분류 기준 추정이며 운영기관이 최종 확인`);
    else if(chosen.length)add("insured","pass",`${n}명이지만 예외 대상(${chosen.join(", ")})으로 입력됨. 증빙 확인 필요`);
    else if(excNone)add("insured","fail",`${n}명이고 5인 미만 예외에 해당하지 않는 것으로 입력됨. 5인 미만은 지식서비스·문화콘텐츠·신재생에너지 산업, 미래유망기업, 청년창업기업 등만 가능`);
    else add("insured","check",`${n}명. 5인 미만은 예외 업종·기업만 가능. 5인 미만 예외에서 해당 항목을 고르고, 없으면 해당 없음을 선택`);
  }else add("insured","fail","고용보험 가입자가 없음");

  const limits=prog.priority_company_limits,limit=limits[sectionOf(c)]||limits.default;
  if(n<=limit)add("priority","pass",`상시근로자 ${limit}명 이하 업종 기준 충족`);
  else if(!capital&&flags.mid_size_in_complex)add("priority","pass","비수도권 산업단지 입주 중견기업으로 입력됨");
  else add("priority","check",`업종 기준(${limit}명) 초과. 중소기업기본법상 중소기업이면 가능`);

  const sales=num(c.sales_manwon),need=n*p.sales_per_insured_manwon,age=monthsSince(c.founded);
  if(age!==null&&age<12)add("sales","pass","업력 1년 미만으로 매출액 심사 제외");
  else if(sales===null)add("sales","check",`직전연도 매출이 ${won(need)}만원 이상인지 확인 (가입자 ${n}명 x ${won(p.sales_per_insured_manwon)}만원)`);
  else if(sales>=need)add("sales","pass",`직전연도 매출 ${won(sales)}만원 >= 기준 ${won(need)}만원`);
  else add("sales","fail",`직전연도 매출 ${won(sales)}만원 < 기준 ${won(need)}만원`);

  const text=c.industry_text||"",liquor=iflags.includes("L"),indirect=iflags.includes("I")||INDIRECT_WORDS.some(w=>text.includes(w));
  if(iflags.includes("X")||EXCLUDED_WORDS.some(w=>text.includes(w)))add("industry","fail",`지원 제외 업종으로 보임 (${text})`);
  else if(liquor)add("industry","check","소비·향락업(기타 주점업, 무도장, 사행시설 등)은 지원 제외 업종일 수 있음. 운영지침 확인 필요");
  else if(indirect)add("industry","check","인력공급·경비·시설관리업은 간접고용 형태 채용자가 제외됨");
  else add("industry","pass","제외 업종 아님 (입력 기준)");

  const plan=c.hire_plan||"없음",hireN=Math.floor(num(c.hire_count,0)||0);let hireReady=false;
  if(plan==="없음")add("hire","check","현재 채용 계획 없음. 청년 채용 전에 참여 신청을 해두면 됨");
  else if(!c.hire_youth)add("hire","fail",`만 ${p.youth_age_min}~${p.youth_age_max}세 청년 채용이 아님`);
  else if(!c.hire_regular)add("hire","fail","정규직 채용이 아님 (3개월 이하 계약직 후 정규직 전환은 가능)");
  else if(capital&&c.hire_hard==="no")add("hire","fail","수도권은 취업애로청년 채용만 지원");
  else{
    hireReady=true;const msgs=[];
    if(plan==="최근3개월")msgs.push(`이미 채용했다면 채용일로부터 ${p.hire_before_apply_months}개월 안에 참여 신청해야 함`);
    if(capital&&c.hire_hard!=="yes"){msgs.push("수도권은 취업애로청년 요건(10개 중 1개) 확인 필요");add("hire","check",msgs.join(". "))}
    else add("hire","pass",msgs.join(". ")||"청년 정규직 채용 예정");
  }
  add("work","info",`주 ${p.weekly_hours_min}시간 이상, 평균 월 급여 ${p.avg_monthly_pay_max_manwon}만원 이하, 고용보험 가입`);
  add("layoff",flags.layoff?"fail":"pass",flags.layoff?"최근 고용조정 이직이 있는 것으로 입력됨. 해당 기간 채용자는 지원 제외":"고용조정 이직 없음 (입력 기준)");
  add("arrears",flags.arrears?"fail":"pass",flags.arrears?"임금체불 명단공개 등 제외 사유로 입력됨":"제외 사유 없음 (입력 기준)");

  const companyKeys=["insured","priority","sales","industry","layoff","arrears"];
  const companyFail=results.some(r=>companyKeys.includes(r.key)&&r.status==="fail");
  const hireFail=results.some(r=>r.key==="hire"&&r.status==="fail");
  const checks=results.filter(r=>r.status==="check"&&(r.key!=="hire"||hireReady));
  let verdict,level;
  if(companyFail){verdict="대상 아님";level="no"}
  else if(hireFail){verdict="이번 채용은 대상 아님";level="no"}
  else if(hireReady&&!checks.length){verdict="신청 권장";level="yes"}
  else if(hireReady){verdict="신청 검토 (확인 항목 있음)";level="maybe"}
  else{verdict="청년 채용 시 활용 가능";level="maybe"}

  const cap=Math.max(1,Math.floor(n*p.cap_ratio));let estimate=null;
  if(level!=="no"){
    const heads=hireN?Math.min(hireN,cap):1;
    estimate={heads,cap,company_manwon:heads*p.company_subsidy_manwon,
      note:`청년 1인당 최대 ${p.company_subsidy_manwon}만원, 지원한도 약 ${cap}명(기준 피보험자 수의 ${Math.round(p.cap_ratio*100)}%). 한도 세부 산정은 운영기관 확인`};
    if(!capital)estimate.youth_note="채용된 청년 본인에게도 2년간 480만~720만원 근속 인센티브 (지역 구분에 따라 다름)";
  }
  const today=todayISO(),mine=(c.sigungu||"").split(/\s+/).filter(w=>w.length>=2),related=[];
  for(const it of notices){
    if(!isOpen(it,today)||!prog.notice_keywords.some(k=>it.title.includes(k)))continue;
    if(!sameSido(sido,it.sido))continue;
    const st=sigunguState(c,it.sigungu);if(st==="other")continue;
    const inBody=mine.some(w=>(it.summary||"").includes(w));
    const hasSg=it.sigungu&&it.sigungu.length;
    const scope=(hasSg&&st==="match")||inBody?"관할 일치":(!hasSg?"전국·광역 단위 (관할 확인)":"관할 확인 필요");
    related.push({title:it.title,agency:it.agency,period:it.period,url:it.url,apply_url:it.apply_url||"",contact:it.contact,scope});
  }
  related.sort((a,b)=>(a.scope==="관할 일치"?0:1)-(b.scope==="관할 일치"?0:1));
  return {id:prog.id,need:prog.need,name:`${prog.name} (${prog.year})`,ministry:prog.ministry,type:ptype,verdict,level,conditions:results,estimate,
    apply:prog.apply,related,hard:capital?prog.hard_to_employ_youth:[],excludedYouth:prog.excluded_youth,sources:prog.sources,caution:prog.caution,easy:prog.easy||null};
}
const EVALUATORS={"youth-leap-2026":evalYouthLeap};

function matchNotices(c,notices,needsDef,limit){
  const today=todayISO(),wanted=(c.needs&&c.needs.length)?c.needs:needsDef.map(n=>n.key);
  const needs=needsDef.filter(n=>wanted.includes(n.key)),sido=c.sido||"",small=isSmallBiz(c);
  const words=(c.industry_text||"").split(/[\s,\/·ㆍ]+/).filter(w=>w.length>=2&&!GENERIC.has(w)),out=[];
  for(const it of notices){
    if(!isOpen(it,today)||!sameSido(sido,it.sido))continue;
    const st=sigunguState(c,it.sigungu);if(st==="other")continue;
    const title=it.title,tags=it.tags||[],body=(it.summary||"")+" "+tags.join(" ");
    let score=0;const reasons=[],hit=[];
    for(const nd of needs){
      let s=nd.fields.includes(it.field)?3:0;
      const kt=nd.keywords.filter(k=>title.includes(k)),kb=nd.keywords.filter(k=>!kt.includes(k)&&body.includes(k));
      s+=2*Math.min(kt.length,2)+Math.min(kb.length,2);
      if(s>=2){score+=s;hit.push(nd.label);if(kt.length||kb.length)reasons.push("키워드: "+kt.concat(kb).slice(0,3).join(", "))}
    }
    if(!hit.length)continue;
    const hasSg=it.sigungu&&it.sigungu.length;
    if(it.sido&&it.sido.length){
      score+=1;if(hasSg&&st==="match")score+=2;
      reasons.unshift("지역: "+it.sido.join("·")+(hasSg?" "+it.sigungu.join("·"):"")+(st==="unknown"?" (주소 확인 필요)":""));
    }else reasons.unshift("지역: 전국");
    const ind=words.filter(w=>title.includes(w)||body.includes(w));
    if(ind.length){score+=2;reasons.push("업종: "+ind.slice(0,2).join(", "))}
    const flags=[];
    if(title.includes("소상공인")||tags.includes("소상공인")){
      if(small){score+=1;flags.push("소상공인 대상")}
      else if(title.includes("소상공인")){score-=3;flags.push("소상공인 전용일 수 있음")}
    }
    let dl=null;if(it.end){dl=daysLeft(it.end);if(dl<=7)flags.push("마감 임박")}
    out.push({title,field:it.field,org:it.org,period:it.period,end:it.end,days_left:dl,posted:it.posted,url:it.url,apply_url:it.apply_url||"",how:it.how||"",contact:it.contact||"",summary:it.summary||"",needs:hit,reasons,flags,score});
  }
  out.sort((a,b)=>b.score-a.score||(a.end||"9999").localeCompare(b.end||"9999")||(a.posted||"").localeCompare(b.posted||""));
  return out.slice(0,limit||80);
}
function evaluate(c){
  const programs=RULES.programs.filter(p=>EVALUATORS[p.id]).map(p=>EVALUATORS[p.id](p,c,DATA.items));
  const wanted=c.needs||[];if(wanted.length)programs.sort((a,b)=>(wanted.includes(a.need)?0:1)-(wanted.includes(b.need)?0:1));
  return {programs,notices:matchNotices(c,DATA.items,RULES.needs,80)};
}

/* 기업마당 사업개요(한 줄로 이어진 글)를 개요 / 지원 대상 / 지원 내용으로 나눈다 */
function parseSummary(s){
  if(!s)return {intro:"",blocks:[]};
  const parts=String(s).split("☞").map(x=>x.trim()),intro=parts.shift()||"";
  const blocks=parts.filter(Boolean).map(p=>{
    const segs=p.split("※").map(x=>x.trim()).filter(Boolean),main=segs.shift()||"";
    const hint=segs.join(" ");
    const notes=segs.filter(x=>!/^자세한 .{0,12}공고문 ?참조\.?$/.test(x));
    const lines=main.replace(/([\uAC00-\uD7A3\)\.\]])\s?-\s+(?=\S)/g,"$1\n").split("\n").map(x=>x.trim()).filter(Boolean);
    let label=null;
    if(/지원대상|신청자격|참여대상|모집대상/.test(hint))label="지원 대상";
    else if(/지원내용|지원사항|지원규모/.test(hint))label="지원 내용";
    return {label,lines,notes};
  });
  const n=blocks.length;
  blocks.forEach((b,i)=>{if(!b.label)b.label=n===1?"주요 내용":i===0?"지원 대상":i===1?"지원 내용":"기타 안내"});
  return {intro,blocks};
}

/* 만원 단위 숫자를 읽기 쉬운 말로: 8000 -> 8천만원, 85000 -> 8억 5천만원 */
function moneyText(v){
  const n=Math.floor(Number(String(v==null?"":v).replace(/,/g,"")));
  if(!isFinite(n)||n<=0)return "";
  const eok=Math.floor(n/10000),rest=n%10000,parts=[];
  if(eok)parts.push(eok.toLocaleString("ko-KR")+"억");
  if(rest)parts.push(rest%1000===0?(rest/1000)+"천만":rest.toLocaleString("ko-KR")+"만");
  return parts.join(" ")+"원";
}
/* 전화번호를 000-0000-0000 형식으로 */
function formatPhone(v){
  const d=String(v||"").replace(/\D/g,"").slice(0,11);
  if(d.startsWith("02")){
    if(d.length<=2)return d;if(d.length<=5)return d.slice(0,2)+"-"+d.slice(2);
    if(d.length<=9)return d.slice(0,2)+"-"+d.slice(2,5)+"-"+d.slice(5);
    return d.slice(0,2)+"-"+d.slice(2,6)+"-"+d.slice(6,10);
  }
  if(d.length<=3)return d;if(d.length<=7)return d.slice(0,3)+"-"+d.slice(3);
  if(d.length<=10)return d.slice(0,3)+"-"+d.slice(3,6)+"-"+d.slice(6);
  return d.slice(0,3)+"-"+d.slice(3,7)+"-"+d.slice(7);
}
const validPhone=v=>{const d=String(v||"").replace(/\D/g,"");return /^01[016789]\d{7,8}$/.test(d)||/^0(2|[3-6]\d)\d{7,8}$/.test(d)||/^0(70|50\d?)\d{7,8}$/.test(d)};

window.Matcher={evaluate,todayISO,daysLeft,parseSummary,moneyText,formatPhone,validPhone,won,RULES,DATA,INDUSTRY:IND};
})();
