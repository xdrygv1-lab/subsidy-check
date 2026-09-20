/* 지원제도 판정과 기업마당 공고 매칭 (matcher.py 와 같은 규칙)
   링크 화면(artifact)과 공개 웹페이지(site)가 함께 쓴다. rules.js, data.js 다음에 불러온다. */
(function(){
"use strict";
const RULES=window.RULES||{programs:[],needs:[]}, DATA=window.BIZINFO_DATA||{items:[],count:0,collected_at:null};
const SMALL10=new Set(["B","C","F","H"]), EXCLUDED_WORDS=["유흥","단란","무도","사행","카지노"], INDIRECT_WORDS=["인력공급","파견","경비","경호","시설관리"];
const TRAITS=RULES.traits||[];
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
/* 날짜(YYYY-MM-DD)에 개월 수를 더한다. 말일을 넘으면 그 달 말일로 맞춘다 */
function addMonths(iso,months){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||""));if(!m)return null;
  const y=+m[1],mo=+m[2]-1+months,d=+m[3],ty=y+Math.floor(mo/12),tm=((mo%12)+12)%12,last=new Date(Date.UTC(ty,tm+1,0)).getUTCDate();
  return ty+"-"+String(tm+1).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0");
}
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
  /* 지침 별표2 에 적힌 분류로는 지식서비스산업이라 단정할 수 없는 업종(전자상거래 소매업 등)은 «맞음» 대신 «확인 필요» */
  const unsureCodes=((prog.knowledge_service_uncertain||{}).codes)||{},ks=ksicsOf(c);
  const unsure=knowledge?(Object.keys(unsureCodes).filter(k=>ks.some(x=>x.startsWith(k))).map(k=>unsureCodes[k])[0]||null):null;
  const chosen=(flags.exceptions||[]).filter(k=>excLabels[k]).map(k=>excLabels[k]);
  const lowN=num(c.insured_low),highN=num(c.insured_high);
  /* 직원 수를 세는 자료(원천세 인원, 사원 목록)에 따라 5명 경계가 갈리는 곳은 단정하지 않는다 */
  if((n>=p.min_insured&&lowN!==null&&lowN<p.min_insured)||(n<p.min_insured&&highN!==null&&highN>=p.min_insured))
    add("insured","check",`${n}명으로 셌지만 다른 자료로는 ${n>=p.min_insured?lowN:highN}명이라 ${p.min_insured}명 경계가 갈림. 고용보험 가입자 수를 확인`);
  else if(n>=p.min_insured)add("insured","pass",`고용보험 가입자 ${n}명 (지침의 기준은 신청 직전 달부터 1년간 평균이라 그 값으로는 달라질 수 있음)`);
  else if(n>=p.min_insured_exception){
    if(unsure)add("insured","check",`${n}명. ${unsure}이라 지식서비스산업 예외에 드는지 운영기관에 확인해야 함. 든다면 5명 미만이어도 가능`);
    else if(knowledge)add("insured","pass",`${n}명이지만 지식서비스산업(${knowledge}) 예외로 보임. 표준산업분류 기준 추정이며 운영기관이 최종 확인`);
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
  else if(sales>=need)add("sales","pass",`매출 ${won(sales)}만원 >= 기준 ${won(need)}만원 (2024년과 2025년 중 유리한 해로 낼 수 있음)`);
  else add("sales","fail",`직전연도 매출 ${won(sales)}만원 < 기준 ${won(need)}만원`);

  const text=c.industry_text||"",liquor=iflags.includes("L"),indirect=iflags.includes("I")||INDIRECT_WORDS.some(w=>text.includes(w));
  if(iflags.includes("X")||EXCLUDED_WORDS.some(w=>text.includes(w)))add("industry","fail",`지원 제외 업종으로 보임 (${text})`);
  else if(liquor)add("industry","check","소비·향락업(기타 주점업, 무도장, 사행시설 등)은 지원 제외 업종일 수 있음. 운영지침 확인 필요");
  else if(indirect)add("industry","check","인력공급·경비·시설관리업은 간접고용 형태 채용자가 제외됨");
  else add("industry","pass","제외 업종 아님 (입력 기준)");

  const plan=c.hire_plan||"없음",hireN=Math.floor(num(c.hire_count,0)||0);let hireReady=false;
  /* 명시적 null 은 «모름» 이다(사무실 자료에서 아직 확인하지 못한 값). 실패로 읽지 않고 확인 필요로 낸다. 빈 칸과 false 는 «아님» 그대로 */
  const youthUnknown=c.hire_youth===null,regularUnknown=c.hire_regular===null;
  if(plan==="없음")add("hire","check","현재 채용 계획 없음. 청년 채용 전에 참여 신청을 해두면 됨");
  else if(!c.hire_youth&&!youthUnknown)add("hire","fail",`만 ${p.youth_age_min}~${p.youth_age_max}세 청년 채용이 아님`);
  else if(!c.hire_regular&&!regularUnknown)add("hire","fail","정규직 채용이 아님 (3개월 이하 계약직 후 정규직 전환은 가능)");
  else if(capital&&c.hire_hard==="no")add("hire","fail","수도권은 취업애로청년 채용만 지원");
  else{
    hireReady=true;const msgs=[];
    const limit=plan==="최근3개월"?addMonths(c.hire_date,p.hire_before_apply_months):null;
    if(limit){
      const left=daysLeft(limit);
      if(left<0){hireReady=false;add("hire","fail",`채용일(${c.hire_date})로부터 ${p.hire_before_apply_months}개월이 지나 이 채용 건은 참여 신청 기한(${limit})이 끝남`)}
      else msgs.push(`참여 신청 기한은 ${limit} (D-${left}). 채용일로부터 ${p.hire_before_apply_months}개월 안에 신청해야 함`);
    }else if(plan==="최근3개월")msgs.push(`이미 채용했다면 채용일로부터 ${p.hire_before_apply_months}개월 안에 참여 신청해야 함`);
    else if(c.hire_date)msgs.push(`채용 예정일 ${c.hire_date}. 그 전에 참여 신청을 해 두어야 함`);
    if(hireReady){
      let needCheck=false;
      const unknown=[[`만 ${p.youth_age_min}~${p.youth_age_max}세 청년인지`,youthUnknown],["정규직인지",regularUnknown]].filter(x=>x[1]).map(x=>x[0]);
      if(unknown.length){msgs.push("채용한 직원이 "+unknown.join(", ")+" 확인 필요");needCheck=true}
      if(capital&&c.hire_hard!=="yes"){msgs.push("수도권은 취업애로청년 요건(10개 중 1개) 확인 필요");needCheck=true}
      add("hire",needCheck?"check":"pass",msgs.join(". ")||"청년 정규직 채용 예정");
    }
  }
  const pay=num(c.hire_pay_manwon),hours=num(c.hire_hours),workBase=`주 ${p.weekly_hours_min}시간 이상, 평균 월 급여 ${p.avg_monthly_pay_max_manwon}만원 이하, 고용보험 가입`;
  if(plan==="없음"||(pay===null&&hours===null))add("work","info",workBase);
  else{
    const bad=[];
    if(pay!==null&&pay>p.avg_monthly_pay_max_manwon)bad.push(`월 급여 ${won(pay)}만원이 기준 ${p.avg_monthly_pay_max_manwon}만원을 넘음`);
    if(hours!==null&&hours<p.weekly_hours_min)bad.push(`주 ${hours}시간은 기준 ${p.weekly_hours_min}시간에 못 미침`);
    /* 지침 30쪽: 최저임금 이상이면서 평균 월 급여 450만원 이하. 월급 하한 숫자는 없어 그 사람의 주 소정근로시간 기준 최저임금 월 환산(주휴 포함, 만원)과 견준다. 주 15시간 미만은 주휴가 없다 */
    const mw=p.min_wage_hourly_won,floorManwon=h=>{const hh=Math.min(h,40);return (hh+(hh>=15?hh/40*8:0))*365/7/12*mw/10000};
    if(bad.length)add("work","fail",bad.join(". "));
    else if(pay!==null&&hours!==null){
      /* 못 미쳐 보여도 수습 감액, 산입 범위, 최저임금법 제7조 적용제외가 있어 탈락이라 단정하지 않는다 */
      if(mw&&pay<floorManwon(hours)-1)add("work","check",`월 급여 ${won(pay)}만원이 주 ${hours}시간 기준 최저임금 월 환산 약 ${won(Math.floor(floorManwon(hours)+0.5))}만원에 못 미쳐 보임. 수습 감액, 임금에 넣는 범위, 최저임금 적용제외 여부를 확인`);
      else add("work","pass",`월 급여 ${won(pay)}만원, 주 ${hours}시간으로 조건 충족 (입력 기준)`);
    }
    else if(pay!==null&&mw&&pay<floorManwon(p.weekly_hours_min)-1)add("work","check",`월 급여 ${won(pay)}만원은 최저임금으로 주 ${p.weekly_hours_min}시간을 일할 때의 월급 약 ${won(Math.floor(floorManwon(p.weekly_hours_min)+0.5))}만원보다 낮아 주 ${p.weekly_hours_min}시간 미만일 수 있음. 주 소정근로시간을 확인`);
    else add("work","info",workBase);
  }
  add("layoff",flags.layoff?"fail":"pass",flags.layoff?"최근 고용조정 이직이 있는 것으로 입력됨. 해당 기간 채용자는 지원 제외":"고용조정 이직 없음 (입력 기준)");
  add("arrears",flags.arrears?"fail":"pass",flags.arrears?"임금체불 명단공개 등 제외 사유로 입력됨":"제외 사유 없음 (입력 기준)");

  const companyKeys=["insured","priority","sales","industry","layoff","arrears"];
  const companyFail=results.some(r=>companyKeys.includes(r.key)&&r.status==="fail");
  const hireFail=results.some(r=>(r.key==="hire"||r.key==="work")&&r.status==="fail");
  const checks=results.filter(r=>r.status==="check"&&(r.key!=="hire"||hireReady));
  let verdict,level;
  if(companyFail){verdict="대상이 아닐 가능성 높음";level="no"}
  else if(hireFail){verdict="이번 채용은 대상이 아닐 가능성 높음";level="no"}
  else if(hireReady&&!checks.length){verdict="대상일 가능성 높음";level="yes"}
  else if(hireReady){verdict="대상일 가능성 있음 (확인 항목 있음)";level="maybe"}
  else{verdict="청년 채용 시 활용 가능";level="maybe"}

  const cap=Math.max(1,Math.ceil(n*p.cap_ratio));let estimate=null;   /* 지침 42쪽: 기준 피보험자 수에 50%를 곱하고 소수점 이하는 올림(9명 -> 5명) */
  if(level!=="no"){
    const heads=hireN?Math.min(hireN,cap):1;
    estimate={heads,cap,company_manwon:heads*p.company_subsidy_manwon,
      note:`청년 1인당 최대 ${p.company_subsidy_manwon}만원, 지원한도 약 ${cap}명(기준 피보험자 수의 ${Math.round(p.cap_ratio*100)}%, 소수점 올림). 기준 피보험자 수는 신청 직전 달부터 1년간 평균이라 지금 직원 수와 다를 수 있고, 한도 세부 산정은 운영기관이 확인한다`};
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

/* 회사의 표준산업분류 코드 목록: 고른 종목의 코드가 있으면 그것, 없으면 업종코드로 조회 */
function ksicsOf(c){
  const lst=c.industry_ksic?[c.industry_ksic]:((infoOf(c)||{}).k||[]);
  return lst.map(k=>String(k).replace(/\D/g,"")).filter(k=>k);
}
/* 손으로 옮긴 요건 하나를 회사 값과 견준다. true 맞음, false 안 맞음, null 회사 값을 몰라 말하지 않음 */
function factCheck(ck,c){
  const t=ck.type,sales=num(c.sales_manwon);
  if(t==="sales_gt0")return sales===null?null:sales>0;
  if(t==="sales_lt"||t==="sales_lte"){if(sales===null)return null;let v=ck.vat_included?sales*1.1:sales;
    const months=num(c.sales_months);let partial=false;   /* 매출이 몇 달치인지(사무실 자료). 12개월치가 아니면 환산값은 어림이라 단정하지 않는다 */
    if(months!==null&&months>0&&months<12){v=v/months*12;partial=true}
    else if(ck.annualize_year){const fm=/^(\d{4})[-./]?(\d{1,2})/.exec(String(c.founded||""));if(fm&&+fm[1]===ck.annualize_year){v=v/(13-(+fm[2]))*12;partial=true}}   /* 그 해에 개업했으면 월평균을 12개월로 환산 */
    if(partial)return {k:"partial",v};
    if(ck.near&&Math.abs(v-ck.manwon)<=ck.manwon*ck.near)return {k:"near",v};   /* 기준선 가까이: 신고 매출의 기준이 조금만 달라도 뒤집힌다 */
    return t==="sales_lt"?v<ck.manwon:v<=ck.manwon}
  if(t==="small_biz"){
    let n=num(c.insured);if(n===null)return null;
    const n0=n;
    if(ck.exclude_hired_since){const cnt=(c.hire_dates_on||[]).filter(d=>String(d)>=ck.exclude_hired_since).length;n-=ck.exclude_max?Math.min(cnt,ck.exclude_max):cnt}   /* 공고문이 «지원 대상 새 직원은 상시근로자 수에서 뺀다» 고 한 경우. 지원 대상이 되는 수까지만 뺀다 */
    const lim=SMALL10.has(sectionOf(c))?10:5;
    for(const alt of [num(c.insured_low),num(c.insured_high)]){   /* 직원 수를 달리 세면 나오는 더 작은 값과 더 큰 값(사원 목록과 원천세 인원이 다른 곳 등). 그 값으로는 결과가 달라지면 단정하지 않는다 */
      if(alt!==null&&((alt-(n0-n))<lim)!==(n<lim))return null;
    }
    return n<lim;
  }
  if(t==="hired_since"){   /* 그 날짜(부터 until 까지)에 새로 뽑아 지금도 일하는 직원이 있는가. hire_dates_on 이 없으면 입력한 채용일 1건으로 보고, 그것도 없으면 모름 */
    const until=ck.until||"9999-12-31",inRange=x=>ck.date<=String(x)&&String(x)<=until;
    if(c.hire_dates_on===undefined||c.hire_dates_on===null){
      const d=String(c.hire_date||"");
      if(c.hire_plan==="최근3개월"&&/^\d{4}-\d{2}-\d{2}$/.test(d))return inRange(d)?true:null;
      return null;
    }
    return c.hire_dates_on.some(inRange);
  }
  if(t==="insured_gte"){
    if((ck.unless_traits||[]).some(x=>(c.traits||[]).includes(x)))return true;   /* 인원 요건의 예외(벤처·이노비즈·사회적기업 등)로 입력된 회사 */
    const n=num(c.insured),low=num(c.insured_low),high=num(c.insured_high);
    if(n!==null&&n>=ck.n)return (low!==null&&low<ck.n)?null:true;   /* 달리 세면 경계 아래로 내려가는 곳은 단정하지 않는다 */
    if(n!==null&&high!==null&&high>=ck.n)return null;   /* 달리 세면 경계 위로 올라가는 곳(원천세 인원은 4명인데 사원 목록은 5명 등)도 단정하지 않는다 */
    if((ck.unless_industry_flags||[]).some(f=>flagsOf(c).includes(f)))return {k:"maybe",v:null};   /* 업종 표시(K 지식서비스산업 등)는 참고용 어림이라 예외에 든다고 단정하지 않는다: «확인할 것» */
    return n===null?null:false;
  }
  if(t==="sigungu_has"){const sg=String(c.sigungu||"").trim();return sg?sg.includes(ck.value):null}   /* 회사 시군구에 그 이름이 들어 있는가(제목에 구 이름이 없는 구청 사업) */
  if(t==="founded_by"){const m=/^(\d{4})[-./]?(\d{1,2})/.exec(String(c.founded||""));return m?(m[1]+"-"+String(+m[2]).padStart(2,"0"))<=ck.ym:null}
  if(t==="months_lt"){const ms=monthsSince(c.founded);return ms===null?null:ms<ck.n}   /* 업력(개업한 달부터 이번 달까지)이 n개월 미만 */
  if(t==="ceo_age_lte"){   /* 대표자 나이가 n세 이하. 출생연도(연 나이라 경계 한 살은 모름으로 둔다) > 사무실 나이 표시 > 회사 특성 순 */
    const by=num(c.ceo_birth_year);
    if(by!==null){const age=new Date().getFullYear()-by;return age<=ck.n?true:(age===ck.n+1?null:false)}
    if(c.ceo_age_band==="le34")return ck.n>=34?true:null;
    if(c.ceo_age_band==="35to39")return ck.n>=39?true:(ck.n<35?false:null);
    if((c.traits||[]).some(x=>String(x).includes("39세 이하")))return ck.n>=39?true:null;
    return null;
  }
  if(t==="section_in"){const sec=sectionOf(c);return sec?ck.sections.includes(sec):null}   /* 업종 대분류(C 제조업 등) */
  if(t==="youth_hire_1y"){   /* 최근 1년 안에 뽑아 지금도 일하는 청년 직원이 있는가. 청년 표시는 34세 이하로 센 것이라, 청년 표시가 없는 채용만 있으면 모름(35~39세일 수 있다) */
    const td=todayISO(),since=(+td.slice(0,4)-1)+td.slice(4),youth=c.youth_hire_dates_on,allh=c.hire_dates_on;
    if(youth===undefined||youth===null||allh===undefined||allh===null)return null;
    if(youth.some(d=>String(d)>=since))return true;
    return allh.some(d=>String(d)>=since)?null:false;
  }
  if(t==="sales_half_drop"){   /* 상반기 매출 x 2 가 전년 매출의 ratio 이하(어림값). 같은 기간끼리 견준 것이 아니라 확정하지 않는다 */
    const s=num(c.sales_manwon),h=num(c[ck.half_field]);
    if(s===null||h===null||s<=0)return null;
    const months=num(c.sales_months),fy=/^(\d{4})/.exec(String(c.founded||""));
    if((months!==null&&months<12)||(fy&&+fy[1]>=+todayISO().slice(0,4)-1))return null;   /* 전년 매출이 12개월치가 아니면(지난해나 올해 개업 포함) 견줄 수 없다 */
    const empty=num(c.sales_1to6_empty_months);
    if(empty!==null&&empty>=(ck.max_empty_months===undefined?4:ck.max_empty_months))return {k:"sparse",v:null};   /* 전표를 한 달에 몰아 적은 곳: 매출이 줄었다고 보지 않는다 */
    if(c.sales_1to6_vat_checked!==undefined&&c.sales_1to6_vat_checked!==true)return {k:"unverified",v:null};   /* 부가세 신고서와 대조되지 않은 상반기 매출 */
    return h*2/s<=ck.ratio;
  }
  if(t==="trait")return (c.traits||[]).includes(ck.label)?true:null;
  if(t==="months_gte"){const ms=monthsSince(c.founded);return ms===null?null:ms>=ck.n}   /* 업력이 n개월 이상 */
  if(t==="insured_lt"){const n2=num(c.insured);return n2===null?null:n2<ck.n}   /* 직원 수가 n명 미만인가 */
  if(t==="youth_majority"){   /* 지금 일하는 직원의 과반수가 청년인가. 우리 표시는 34세 이하라 과반이면 39세 이하도 과반(맞음), 아니면 모름 */
    const on=c.hire_dates_on,youth=c.youth_hire_dates_on;
    if(on===undefined||on===null||youth===undefined||youth===null||!on.length)return null;
    return youth.length*2>on.length?true:null;
  }
  if(t==="graduate_candidate"){   /* 소상공인 졸업후보기업: 평균매출액이 업종별 소기업 기준의 30% 이상이고, 상시근로자가 소상공인 상한보다 최대 2명 적은 곳 */
    const n=num(c.insured),sales2=num(c.sales_manwon),lim=SMALL10.has(sectionOf(c))?10:5;
    const eok=ck.small_company_sales_eok||{},ks=ksicsOf(c);
    const key=Object.keys(eok).sort((a,b)=>b.length-a.length).find(k=>ks.some(x=>x.startsWith(k)));
    if(n===null||sales2===null||key===undefined)return null;
    return (sales2>=eok[key]*10000*(ck.ratio===undefined?0.3:ck.ratio))&&(lim-2<=n&&n<lim);
  }
  if(t==="own_product"){const v=String(c.own_product||"");return v==="yes"?true:(v==="no"?false:null)}   /* 온라인으로 팔 수 있는 자기 상품이 있는지(거래처 설문의 답). 답이 없거나 «잘 모르겠다» 면 모름 */
  if(t==="not"){const r=factCheck(ck.check,c);return typeof r==="boolean"?!r:null}   /* 안의 요건을 뒤집는다(모르거나 단정할 수 없으면 그대로 모름) */
  if(t==="ksic_not"){   /* 회사 업종이 그 분류로 시작하면 안 맞음. 업종을 모르면 모름 */
    const ks=ksicsOf(c);if(!ks.length)return null;
    const hit=ks.some(k=>ck.ksic.some(px=>k.startsWith(px)));
    if(hit&&ck.uncertain)return {k:"maybe",v:null};   /* 업종으로 직종을 어림한 경우처럼 단정할 수 없을 때는 «확인할 것» */
    return !hit;
  }
  if(t==="any_of"||t==="all_of"){
    const rs=(ck.checks||[]).map(x=>factCheck(x,c));
    if(t==="any_of")return rs.some(r=>r===true)?true:(rs.length&&rs.every(r=>r===false)?false:null);
    return rs.some(r=>r===false)?false:(rs.length&&rs.every(r=>r===true)?true:null);
  }
  return null;   /* need_data 를 비롯해 모르는 종류는 늘 «확인할 것» */
}
function evNum(v){return v===null||v===undefined?"":Math.floor(v+0.5).toLocaleString("en-US")}
/* 요건 하나에 대고 «우리 회사 값» 한 줄을 만든다. 판정이 아니라 무엇을 보고 그렇게 봤는지 보여 주는 글이다 */
function factEvidence(ck,c){
  const t=(ck||{}).type,sales=num(c.sales_manwon);
  if(t==="sales_gt0"||t==="sales_lt"||t==="sales_lte"){
    if(sales===null)return "우리 매출: 모름";
    const v=ck.vat_included?sales*1.1:sales;
    let s="우리 매출 "+evNum(sales)+"만원";
    if(ck.vat_included)s+=" (부가세 포함 "+evNum(v)+"만원)";
    const months=num(c.sales_months);
    if(months!==null&&months>0&&months<12)s+=", "+Math.trunc(months)+"개월치라 12개월로 환산하면 "+evNum(v/months*12)+"만원";
    if(t!=="sales_gt0"&&ck.manwon!==undefined&&ck.manwon!==null)s+=" / 기준 "+evNum(ck.manwon)+"만원";
    return s;
  }
  if(t==="small_biz"||t==="insured_lt"||t==="insured_gte"){
    const n=num(c.insured),low=num(c.insured_low),high=num(c.insured_high);
    let s=n===null?"우리 직원 수: 모름":"우리 직원 "+Math.trunc(n)+"명";
    if(low!==null&&(n===null||Math.trunc(low)!==Math.trunc(n)))s+=", 작게 세면 "+Math.trunc(low)+"명";
    if(high!==null&&(n===null||Math.trunc(high)!==Math.trunc(n)))s+=", 크게 세면 "+Math.trunc(high)+"명";
    if(t==="small_biz"){
      const lim=SMALL10.has(sectionOf(c))?10:5;
      if(ck.exclude_hired_since)s+=" (새로 뽑은 "+(c.hire_dates_on||[]).filter(d=>String(d)>=ck.exclude_hired_since).length+"명은 빼고 셈)";
      s+=" / 기준 "+lim+"명 미만";
    }else if(ck.n!==undefined&&ck.n!==null)s+=" / 기준 "+ck.n+"명 "+(t==="insured_gte"?"이상":"미만");
    return s;
  }
  if(t==="hired_since"){
    if(c.hire_dates_on===undefined||c.hire_dates_on===null){
      const d=String(c.hire_date||"");
      return d?"입력한 채용일 "+d:"우리 채용일 자료: 없음";
    }
    const until=ck.until||"9999-12-31";
    const hit=c.hire_dates_on.map(String).filter(x=>ck.date<=x&&x<=until).sort();
    return "지금 일하는 직원의 채용일 "+c.hire_dates_on.length+"건 가운데 "+ck.date+" 뒤 "+hit.length+"건"+(hit.length?" (가장 최근 "+hit[hit.length-1]+")":"");
  }
  if(t==="sigungu_has"){const sg=String(c.sigungu||"").trim();return (sg?"우리 시군구 "+sg:"우리 시군구: 모름")+" / 기준 "+ck.value}
  if(t==="founded_by"||t==="months_lt"||t==="months_gte"){
    const fd=String(c.founded||"");
    if(!fd)return "우리 개업 연월: 모름";
    const ms=monthsSince(c.founded);
    let s="우리 개업 "+fd.slice(0,7);
    if(ms!==null)s+=" (업력 "+ms+"개월, 약 "+Math.floor(ms/12)+"년)";
    if(t==="founded_by")return s+" / 기준 "+ck.ym+" 이전";
    return s+" / 기준 "+ck.n+"개월 "+(t==="months_lt"?"미만":"이상");
  }
  if(t==="ceo_age_lte"){
    const tail=" / 기준 "+ck.n+"세 이하",by=num(c.ceo_birth_year);
    if(by!==null)return "우리 대표 "+Math.trunc(by)+"년생 (연 나이 "+(+todayISO().slice(0,4)-Math.trunc(by))+"세)"+tail;
    if(c.ceo_age_band==="le34")return "우리 대표 34세 이하 표시"+tail;
    if(c.ceo_age_band==="35to39")return "우리 대표 35~39세 표시"+tail;
    return "우리 대표 나이: 모름"+tail;
  }
  if(t==="section_in"){const sec=sectionOf(c);return (sec?"우리 업종 대분류 "+sec:"우리 업종: 모름")+" / 기준 "+(ck.sections||[]).join(", ")}
  if(t==="youth_hire_1y"){
    const td=todayISO(),since=(+td.slice(0,4)-1)+td.slice(4),youth=c.youth_hire_dates_on,allh=c.hire_dates_on;
    if(youth===undefined||youth===null||allh===undefined||allh===null)return "우리 채용 자료: 없음";
    return "최근 1년 채용 "+allh.filter(d=>String(d)>=since).length+"건, 그 가운데 청년(34세 이하) 표시 "+youth.filter(d=>String(d)>=since).length+"건";
  }
  if(t==="sales_half_drop"){
    const h=num(c[ck.half_field]);
    if(sales===null||h===null||sales<=0)return "우리 상반기 매출이나 전년 매출: 모름";
    return "우리 상반기 "+evNum(h)+"만원, 두 배 하면 전년 "+evNum(sales)+"만원의 "+(h*2/sales).toFixed(2)+"배 / 기준 "+ck.ratio+"배 이하";
  }
  if(t==="trait")return "우리 회사 특성에 «"+ck.label+"» "+((c.traits||[]).includes(ck.label)?"있음":"없음(아직 입력 안 했을 수도 있음)");
  if(t==="youth_majority"){
    const on=c.hire_dates_on,youth=c.youth_hire_dates_on;
    if(on===undefined||on===null||youth===undefined||youth===null)return "우리 직원 자료: 없음";
    return "지금 일하는 직원 "+on.length+"명 가운데 청년(34세 이하) 표시 "+youth.length+"명";
  }
  if(t==="graduate_candidate"){
    const n=num(c.insured),lim=SMALL10.has(sectionOf(c))?10:5,ks=ksicsOf(c);
    const eok=ck.small_company_sales_eok||{},ratio=ck.ratio===undefined?0.3:ck.ratio;
    const key=Object.keys(eok).sort((a,b)=>b.length-a.length).find(k=>ks.some(x=>x.startsWith(k)));
    let s=sales===null?"우리 매출: 모름":"우리 매출 "+evNum(sales)+"만원";
    if(key!==undefined)s+=" / 업종 소기업 기준 "+eok[key]+"억원의 "+Math.floor(ratio*100)+"%인 "+evNum(eok[key]*10000*ratio)+"만원 이상";
    return s+" / 우리 직원 "+(n===null?"모름":Math.trunc(n)+"명")+", "+(lim-2)+"~"+(lim-1)+"명이어야 함";
  }
  if(t==="own_product"){const v=String(c.own_product||"");return "설문 답: "+(v==="yes"?"자기 상품 있음":v==="no"?"자기 상품 없음":"아직 답 없음")}
  if(t==="ksic_not"){const ks=ksicsOf(c);return (ks.length?"우리 업종코드 "+ks.slice(0,3).join(", "):"우리 업종: 모름")+" / 제외 "+(ck.ksic||[]).join(", ")}
  if(t==="not")return factEvidence(ck.check||{},c);
  if(t==="any_of"||t==="all_of")return (ck.checks||[]).map(x=>factEvidence(x,c)).filter(x=>x).join(" · ");
  return "";   /* need_data 처럼 회사 값으로 가릴 수 없는 요건: 사람이 확인할 것 */
}
/* 요건 묶음을 돌려 맞음, 안 맞음, 확인할 것, 이렇게 하면 글 목록을 낸다. evidence 는 요건마다 «우리 회사 값» 을 붙인 것 */
function runChecks(checks,c){
  const passed=[],failed=[],unknown=[],todo=[],softHits=[],evidence=[];
  const note=(text,result,ck)=>evidence.push({text,result,value:factEvidence(ck,c)});
  for(const ck of checks||[]){
    const res=factCheck(ck,c);
    if(res&&typeof res==="object"){   /* 단정할 수 없는 까닭이 있는 경우(예외 업종일 수 있음, 부분연도, 기준선 근처 등): 까닭을 글에 붙여 «확인할 것» 으로 */
      const base=ck[res.k+"_text"]||(ck.text+((RULES.notice_fact_texts||{})[res.k]||""));
      const text=base.split("{v}").join(res.v===null||res.v===undefined?"":Math.floor(res.v+0.5).toLocaleString("en-US"));
      unknown.push(text);note(text,"check",ck);continue}
    if(res===false&&ck.soft){const text=ck.soft_text||ck.text;todo.push(text);note(text,"todo",ck);if(ck.soft_flag)softHits.push([ck.soft_flag,ck.soft_penalty||0])}   /* 안 맞아도 탈락이 아닌 요건: «하면 받을 수 있는 것» 으로 두고, 표시와 감점이 적혀 있으면 모은다 */
    else {(res===true?passed:res===false?failed:unknown).push(ck.text);note(ck.text,res===true?"yes":res===false?"no":"check",ck)}
  }
  return {passed,failed,unknown,todo,softHits,evidence};
}
function matchNotices(c,notices,needsDef,limit){
  const sectors=RULES.notice_sectors||[],expKw=RULES.export_keywords||[],expTrait=RULES.export_trait||"",ksics=ksicsOf(c);
  const wantsExport=(c.needs||[]).includes("수출")||(c.traits||[]).includes(expTrait);
  const excludes=RULES.notice_excludes||{},local=RULES.local_title||null,facts=RULES.notice_facts||[];
  const tech=RULES.tech_startup||null;
  const sidoRe=(local&&(local.sido_names||[]).length)?new RegExp("(?:^|[\\s(\\[\\-ㆍ·,])("+local.sido_names.join("|")+")(?=[\\s)\\],ㆍ·]|광역시|특별|시\\s|도\\s|권\\s|지역|$)"):null;
  const today=todayISO(),wanted=(c.needs&&c.needs.length)?c.needs:needsDef.map(n=>n.key);
  const needs=needsDef.filter(n=>wanted.includes(n.key)),sido=c.sido||"",small=isSmallBiz(c);
  const words=(c.industry_text||"").split(/[\s,\/·ㆍ]+/).filter(w=>w.length>=2&&!GENERIC.has(w)),out=[];
  for(const it of notices){
    if(!isOpen(it,today)||!sameSido(sido,it.sido))continue;
    const st=sigunguState(c,it.sigungu);if(st==="other")continue;
    const title=it.title,tags=it.tags||[],body=(it.summary||"")+" "+tags.join(" ");
    let score=0;const reasons=[],hit=[],needScores=[];
    for(const nd of needs){
      let s=nd.fields.includes(it.field)?3:0;
      const kt=nd.keywords.filter(k=>title.includes(k)),kb=nd.keywords.filter(k=>!kt.includes(k)&&body.includes(k));
      s+=2*Math.min(kt.length,2)+Math.min(kb.length,2);
      if(s>=2){needScores.push(s);hit.push(nd.label);if(kt.length||kb.length)reasons.push("키워드: "+kt.concat(kb).slice(0,3).join(", "))}
    }
    /* 관심 분야를 고르지 않았으면 가장 높은 한 분야만 친다. 전부 더하면 여러 분야에 걸친 통합 공고가 누구에게나 맨 위로 온다 */
    if(needScores.length)score+=(c.needs&&c.needs.length)?needScores.reduce((a,b)=>a+b,0):Math.max(...needScores);
    /* 회사 특성(청년·여성 대표, 인증, 수출 등)에 맞는 우대 공고 */
    const traitHit=[];let traitTitle=false;
    for(const t of TRAITS){
      if(!(c.traits||[]).includes(t.label))continue;
      if(t.keywords.some(k=>title.includes(k))){score+=3;traitTitle=true;traitHit.push(t.label)}
      else if(t.keywords.some(k=>body.includes(k))){score+=1;traitHit.push(t.label)}
    }
    if(!hit.length&&!traitTitle)continue;
    if(!hit.length)hit.push("우대 조건");
    if(traitHit.length)reasons.push("우대: "+[...new Set(traitHit)].slice(0,2).join(", "));
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
    /* 업종을 이름에 밝힌 공고: 회사 업종을 아는데 그 업종이 아니면 감점, 그 업종이면 가점 */
    const named=sectors.filter(sc=>sc.keywords.some(k=>title.includes(k)));
    if(named.length&&ksics.length){
      if(named.some(sc=>sc.ksic.some(px=>ksics.some(k=>k.startsWith(px))))){score+=2;reasons.push("업종: "+named[0].name)}
      else{score-=4;flags.push(named[0].name+" 업종 대상일 수 있음")}
    }
    /* 제목에 특정 기업 유형(사회적경제기업, 여성기업, 장애인기업)을 밝힌 공고: 그 특성이 없는 회사에는 감점하고 표시 */
    for(const of of RULES.only_for||[]){
      if(of.keywords.some(k=>title.includes(k))&&!of.traits.some(t=>(c.traits||[]).includes(t))){score-=RULES.only_for_penalty||0;flags.push(of.flag)}
    }
    /* 수출·해외 공고: 수출 관심도 수출 특성도 없는 회사에는 감점 */
    if(!wantsExport&&(it.field==="수출"||expKw.some(k=>title.includes(k)))){score-=4;flags.push("수출 기업 대상일 수 있음")}
    /* 창업 공고: 창업기업은 사업 개시 후 7년이 지나지 않은 기업 (중소기업창업 지원법 제2조 제3호) */
    const months=monthsSince(c.founded);
    if(months!==null&&(it.field==="창업"||title.includes("창업"))){
      if(title.includes("예비창업")){score-=3;flags.push("예비창업자 대상일 수 있음")}
      else if(months>=84){score-=3;flags.push("창업 7년이 지나 대상이 아닐 수 있음")}
    }
    /* 기술 창업(투자 유치형) 공고: 회사 업종을 아는데 기술 업종이 아니고 벤처·이노비즈·연구소 특성도 없으면 감점하고 표시 */
    if(tech&&ksics.length){
      let t2=title;(tech.strip||[]).forEach(w=>{t2=t2.split(w).join("")});
      if(tech.keywords.some(k=>t2.includes(k))&&!ksics.some(k=>tech.ksic_ok.some(px=>k.startsWith(px)))&&!(c.traits||[]).some(t=>tech.traits_ok.includes(t))){score-=tech.penalty||0;flags.push(tech.flag)}
    }
    /* 제목에 [시도] 표시 없이 시·군 이름만 적힌 공고: 회사 시군구와 다르면 감점하고 표시 (다른 지역 사람을 부르는 관광객 유치 사업은 그대로) */
    if(local&&!(it.sido||[]).length&&!(local.skip_if_title_has||[]).some(w=>title.includes(w))){
      const lm=/(?:^|\s)([가-힣]{2,4}(?:시|군))(?=\s)/.exec(title.slice(0,30));
      const sm=sidoRe?sidoRe.exec(title):null;
      /* 제목에 시도 이름만 적힌 공고(«창업-BuS at 경북», «소담스퀘어 in 전남»): 회사 시도를 모르면 말하지 않는다 */
      if(sm){
        if(sm[1]===(c.sido||"")){score+=local.bonus||0;const rest=reasons.filter(r=>r!=="지역: 전국");reasons.length=0;reasons.push("지역: "+sm[1],...rest)}
        else if(c.sido){score-=local.penalty||0;flags.push(sm[1]+" 지역 사업일 수 있음")}
      }
      else if(lm&&!(local.skip_names||[]).includes(lm[1])&&!(local.skip_suffix&&lm[1].endsWith(local.skip_suffix))){
        if((c.sigungu||"").includes(lm[1])){score+=local.bonus||0;const rest=reasons.filter(r=>r!=="지역: 전국");reasons.length=0;reasons.push("지역: "+lm[1],...rest)}
        else{score-=local.penalty||0;flags.push(lm[1]+" 지역 사업일 수 있음")}
      }
    }
    /* 공고문을 직접 읽고 옮겨 둔 요건(rules/notice_facts.json)이 있는 공고: 회사의 매출, 직원 수, 개업 연월과 맞춰 본다. 모르는 값은 말하지 않는다 */
    const fact=facts.find(f=>(f.ids||[]).includes(it.id)||((f.title_all||[]).length&&f.title_all.every(w=>title.includes(w))&&!(f.title_none||[]).some(w=>title.includes(w))))||null;
    let factOut=null;
    if(fact){
      const {passed,failed,unknown,todo,softHits,evidence}=runChecks(fact.checks,c);
      if(fact.flag){score-=fact.flag_penalty||0;flags.push(fact.flag)}   /* 받은 곳만 신청할 수 있는 사업처럼 공고 자체에 붙는 표시 */
      for(const [flagText,pen] of softHits){score-=pen;flags.push(flagText)}   /* 예외에 들 때만 되는 요건(직원 10명 이상 등): 탈락이라 단정하지 않되 표시를 달고 뒤로 보낸다 */
      /* 한 공고 안의 세부 사업(자금)마다 따로 가린다. 점수에는 넣지 않고 보여 주기만 한다 */
      const sub=(fact.sub||[]).map(sp=>{const r=runChecks(sp.checks,c);
        return {name:sp.name,benefit:sp.benefit||null,status:!(r.passed.length||r.failed.length||r.unknown.length||r.todo.length)?"info":(r.failed.length?"no":(r.unknown.length?"check":(r.todo.length?"todo":"yes"))),passed:r.passed,failed:r.failed,unknown:r.unknown,todo:r.todo,evidence:r.evidence}});
      score+=3*passed.length-8*failed.length;
      if(passed.length&&!failed.length)reasons.push(`요건 맞음: ${passed.length}가지`);
      if(failed.length)flags.push("요건에 안 맞아 대상이 아닐 수 있음");
      /* evidence = 요건 한 줄마다 «우리 회사 값» 을 붙인 목록. 사람이 근거를 바로 짚기 위한 것이라 점수에는 넣지 않는다 */
      factOut={name:fact.name,benefit:fact.benefit||null,how:fact.how||null,notes:fact.notes||[],verified:fact.verified||null,passed,failed,unknown,todo,sub,evidence,
        /* 받는 쪽이 목록 길이로 짐작하지 않게 판정기가 직접 매긴다. info = 맞춰 본 요건이 없어 지원 내용만 보여 주는 공고 */
        status:(!(passed.length||failed.length||unknown.length||todo.length))?"info":failed.length?"no":unknown.length?"check":todo.length?"todo":"yes"};
    }
    /* 공고문에 적힌 제외 대상: 회사 업종이 그 업종이면 감점하고 표시 (예: 체인화 편의점은 프랜차이즈 가맹점 제외 공고에서 빠진다) */
    const ease=it.ease||{};
    for(const key of ease.excl||[]){
      const cfg=excludes[key];
      if(cfg&&cfg.ksic.some(px=>ksics.some(k=>k.startsWith(px)))&&!(cfg.ksic_ok||[]).some(px=>ksics.some(k=>k.startsWith(px)))){score-=5;flags.push(cfg.label)}
    }
    let dl=null;if(it.end){dl=daysLeft(it.end);if(dl<=7)flags.push("마감 임박")}
    /* 받기 쉬운 순으로 늘어놓을 때 쓰는 값: «대상이 아닐 수 있음» 류 표시가 없는 공고가 먼저, 다음은 받기 쉬운 점수, 같으면 맞는 점수 */
    const caution=flags.some(f=>f.endsWith("수 있음"));
    /* 받기 쉬운 점수 x 맞는 점수(0~30). 쉬운 점수를 먼저 보던 때에는 맞는 점수가 낮은 전국 공고가 쉽다는 까닭만으로 누구에게나 맨 위에 왔다 */
    const easyKey=(caution?0:100000)+Math.trunc(ease.score===undefined?50:ease.score)*Math.max(0,Math.min(30,Math.trunc(score)));
    out.push({id:it.id,ease:it.ease||null,caution,easy_key:easyKey,facts:factOut,title,field:it.field,org:it.org,period:it.period,end:it.end,days_left:dl,posted:it.posted,url:it.url,apply_url:it.apply_url||"",how:it.how||"",contact:it.contact||"",summary:it.summary||"",needs:hit,reasons,flags,score});
  }
  out.sort((a,b)=>b.score-a.score||(a.end||"9999").localeCompare(b.end||"9999")||(a.posted||"").localeCompare(b.posted||""));
  /* 같은 사업의 공고가 운영기관마다 따로 올라온 경우(시니어 인턴십, 일경험, 도약장려금): 점수가 가장 높은 1건만 남기고 나머지는 그 공고에 접어 넣는다 */
  const merged=[],seen={};
  for(const r of out){
    const name=r.facts&&r.facts.name;
    if(name&&seen[name]){seen[name].same_program.push({title:r.title,url:r.url});continue}
    if(name){r.same_program=[];seen[name]=r}
    merged.push(r);
  }
  return merged.slice(0,limit||80);
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
