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
    if(bad.length)add("work","fail",bad.join(". "));
    else if(pay!==null&&hours!==null)add("work","pass",`월 급여 ${won(pay)}만원, 주 ${hours}시간으로 조건 충족 (입력 기준)`);
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
    if(ck.annualize_year){const fm=/^(\d{4})[-./]?(\d{1,2})/.exec(String(c.founded||""));if(fm&&+fm[1]===ck.annualize_year)v=v/(13-(+fm[2]))*12}   /* 그 해에 개업했으면 월평균을 12개월로 환산 */
    return t==="sales_lt"?v<ck.manwon:v<=ck.manwon}
  if(t==="small_biz")return num(c.insured)===null?null:isSmallBiz(c);
  if(t==="insured_gte"){const n=num(c.insured);return n===null?null:n>=ck.n}
  if(t==="founded_by"){const m=/^(\d{4})[-./]?(\d{1,2})/.exec(String(c.founded||""));return m?(m[1]+"-"+String(+m[2]).padStart(2,"0"))<=ck.ym:null}
  return null;
}
function matchNotices(c,notices,needsDef,limit){
  const sectors=RULES.notice_sectors||[],expKw=RULES.export_keywords||[],expTrait=RULES.export_trait||"",ksics=ksicsOf(c);
  const wantsExport=(c.needs||[]).includes("수출")||(c.traits||[]).includes(expTrait);
  const excludes=RULES.notice_excludes||{},local=RULES.local_title||null,facts=RULES.notice_facts||[];
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
    /* 수출·해외 공고: 수출 관심도 수출 특성도 없는 회사에는 감점 */
    if(!wantsExport&&(it.field==="수출"||expKw.some(k=>title.includes(k)))){score-=4;flags.push("수출 기업 대상일 수 있음")}
    /* 창업 공고: 창업기업은 사업 개시 후 7년이 지나지 않은 기업 (중소기업창업 지원법 제2조 제3호) */
    const months=monthsSince(c.founded);
    if(months!==null&&(it.field==="창업"||title.includes("창업"))){
      if(title.includes("예비창업")){score-=3;flags.push("예비창업자 대상일 수 있음")}
      else if(months>=84){score-=3;flags.push("창업 7년이 지나 대상이 아닐 수 있음")}
    }
    /* 제목에 [시도] 표시 없이 시·군 이름만 적힌 공고: 회사 시군구와 다르면 감점하고 표시 (다른 지역 사람을 부르는 관광객 유치 사업은 그대로) */
    if(local&&!(it.sido||[]).length&&!(local.skip_if_title_has||[]).some(w=>title.includes(w))){
      const lm=/(?:^|\s)([가-힣]{2,4}(?:시|군))(?=\s)/.exec(title.slice(0,30));
      if(lm&&!(local.skip_names||[]).includes(lm[1])&&!(local.skip_suffix&&lm[1].endsWith(local.skip_suffix))){
        if((c.sigungu||"").includes(lm[1])){score+=local.bonus||0;const rest=reasons.filter(r=>r!=="지역: 전국");reasons.length=0;reasons.push("지역: "+lm[1],...rest)}
        else{score-=local.penalty||0;flags.push(lm[1]+" 지역 사업일 수 있음")}
      }
    }
    /* 공고문을 직접 읽고 옮겨 둔 요건(rules/notice_facts.json)이 있는 공고: 회사의 매출, 직원 수, 개업 연월과 맞춰 본다. 모르는 값은 말하지 않는다 */
    const fact=facts.find(f=>(f.ids||[]).includes(it.id)||((f.title_all||[]).length&&f.title_all.every(w=>title.includes(w))))||null;
    let factOut=null;
    if(fact){
      const passed=[],failed=[],unknown=[];
      for(const ck of fact.checks||[]){const res=factCheck(ck,c);(res===true?passed:res===false?failed:unknown).push(ck.text)}
      score+=3*passed.length-8*failed.length;
      if(passed.length&&!failed.length)reasons.push(`요건 맞음: ${passed.length}가지`);
      if(failed.length)flags.push("요건에 안 맞아 대상이 아닐 수 있음");
      factOut={name:fact.name,benefit:fact.benefit||null,how:fact.how||null,notes:fact.notes||[],verified:fact.verified||null,passed,failed,unknown};
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
    const easyKey=(caution?0:100000)+Math.trunc(ease.score===undefined?50:ease.score)*100+Math.max(0,Math.min(99,Math.trunc(score)));
    out.push({id:it.id,ease:it.ease||null,caution,easy_key:easyKey,facts:factOut,title,field:it.field,org:it.org,period:it.period,end:it.end,days_left:dl,posted:it.posted,url:it.url,apply_url:it.apply_url||"",how:it.how||"",contact:it.contact||"",summary:it.summary||"",needs:hit,reasons,flags,score});
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
