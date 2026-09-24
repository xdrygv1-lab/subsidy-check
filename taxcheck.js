/* 세금 환급(경정청구) 가능성 1차 선별. taxcheck.py 와 같은 규칙의 두 구현이다. 한쪽을 고치면 다른 쪽도 같이 고친다.
   금액과 업종 범위는 rules/tax_credits.json (window.TAX_RULES) 에서만 고친다. 결과는 '가능성' 표시이고 확정은 세무사 검토로 한다. */
(function(){
"use strict";
const won=n=>Math.floor(Number(n)+0.5).toLocaleString("ko-KR");
/* 만원 단위 금액을 읽기 쉽게: 8700 -> 8,700만, 13050 -> 1억 3,050만, 10000 -> 1억 (뒤에 '원'은 부르는 쪽에서 붙인다) */
function man(n){
  const v=Math.floor(Number(n)+0.5),eok=Math.floor(v/10000),rest=v%10000,parts=[];
  if(eok)parts.push(eok.toLocaleString("ko-KR")+"억");
  if(rest||!eok)parts.push(rest.toLocaleString("ko-KR")+"만");
  return parts.join(" ");
}
function num(v){if(v===null||v===undefined||v==="")return null;const x=parseFloat(String(v).replace(/,/g,""));return isNaN(x)?null:x}
function hit(ksic,table){
  let best=null;
  for(const k of Object.keys(table||{}))if(ksic.startsWith(k)&&(best===null||k.length>best.length))best=k;
  return best===null?null:table[best];
}
/* 회사의 표준산업분류 코드 목록: 고른 종목의 코드가 있으면 그것, 없으면 업종코드로 조회 */
function ksicList(c,IND){
  let list=[];
  if(c.industry_ksic)list=[String(c.industry_ksic)];
  else{
    const code=String(c.industry_code||"").replace(/\D/g,""),row=IND&&IND.by_code?IND.by_code[code]:null;
    if(row&&row.k)list=row.k.slice();
  }
  return list.map(k=>String(k).replace(/\D/g,"")).filter(k=>k);
}
function classifyOne(ksic,spec){
  const ex=hit(ksic,spec.ksic_exclude);if(ex!==null)return ["no",ex];
  const ck=hit(ksic,spec.ksic_check);if(ck!==null)return ["check",ck];
  const inc=hit(ksic,spec.ksic_include);if(inc!==null)return ["yes",inc];
  return ["no",""];
}
function classify(ksics,spec){
  if(!ksics.length)return {state:"unknown",name:""};
  const rs=ksics.map(k=>classifyOne(k,spec)),states=rs.map(r=>r[0]);
  if(states.every(s=>s==="yes"))return {state:"yes",name:rs[0][1]};
  if(states.every(s=>s==="no"))return {state:"no",name:(rs.find(r=>r[1])||["",""])[1]};
  const ck=rs.find(r=>r[0]==="check");
  return {state:"check",name:ck?ck[1]:"업종코드 하나에 여러 업종이 묶여 있어 실제 사업 내용 확인이 필요합니다"};
}
/* 지역: 수도권 여부, 과밀억제권역(yes / no / partial / unknown), 수도권 인구감소지역 여부 */
function regionInfo(c,R){
  const sido=c.sido||"",sg=c.sigungu||"",capital=R.capital.includes(sido),has=list=>list.some(x=>sg.includes(x));
  let over="no",note="";
  if(sido==="서울")over="yes";
  else if(sido==="인천"){
    if(has(R.incheon_not_overcrowded))over="no";
    else{over="yes";note="인천은 대부분 과밀억제권역이지만 경제자유구역, 남동국가산업단지 등 일부 지역은 빠집니다"}
  }else if(sido==="경기"){
    if(has(R.overcrowded_full))over="yes";
    else if(has(R.overcrowded_partial)){over="partial";note="남양주시와 시흥시는 동네에 따라 과밀억제권역 여부가 갈립니다"}
    else if(!sg){over="unknown";note="경기도는 시·군에 따라 과밀억제권역 여부가 갈립니다. 시·군·구를 넣으면 더 정확해집니다"}
  }
  return {capital,over,note,depop:capital&&has(R.capital_depopulation)};
}
/* 창업감면율 [청년 아님, 청년, 매출 소액 특례]. 지역이 불확실하면 null */
/* 매출이 몇 년 귀속인지: 입력한 sales_year, 없으면 매출 출처 글의 연도, 그것도 없으면 작년 */
function salesYear(c){const y=num(c.sales_year);if(y)return Math.trunc(y);const m=/(20\d{2})년/.exec(String(c.sales_basis||""));return m?+m[1]:new Date().getFullYear()-1}
/* 창업감면 6조⑥ 소규모 특례의 그 해 수입금액 기준(만원). 기준은 해마다 달랐다 */
function smallLimit(S,year){const tbl=(S.small_revenue_by_year||[]).slice().sort((a,b)=>a.from-b.from);if(!tbl.length)return S.small_revenue_manwon;let lim=tbl[0].manwon;for(const t of tbl)if(year>=t.from)lim=t.manwon;return lim}
/* «2022~2025년 8,000만원, 2026년부터 1억 400만원» 처럼 since 해부터의 기준을 한 줄로 */
function smallDesc(S,since){const tbl=(S.small_revenue_by_year||[]).slice().sort((a,b)=>a.from-b.from),out=[];
  tbl.forEach((t,i)=>{const nxt=i+1<tbl.length?tbl[i+1].from:null;if(nxt!==null&&nxt-1<since)return;const a=Math.max(t.from,since);out.push(nxt!==null?(a===nxt-1?a+"년":a+"~"+(nxt-1)+"년")+" "+man(t.manwon)+"원":a+"년부터 "+man(t.manwon)+"원")});return out.join(", ")}
function startupRates(reg,after2026){
  if(reg.over==="partial"||reg.over==="unknown")return null;
  if(!after2026)return reg.over==="no"?[50,100,100]:[0,50,50];
  if(!reg.capital||reg.depop)return [50,100,100];
  return reg.over==="no"?[25,75,75]:[0,50,50];
}

function employment(c,T,ksics,reg,reliefs,taxAmt){
  const E=T.employment,item={key:"employment",title:E.title,level:"check",headline:"",estimate:"",points:[],basis:E.basis||"조세특례제한법 제29조의7, 제29조의8"};
  const exs=ksics.map(k=>hit(k,E.excluded_ksic)),allEx=ksics.length>0&&exs.every(x=>x!==null);
  const taken=reliefs.includes("employment")?"yes":(reliefs.includes("none")?"no":"unknown");
  const old=E.periods[0],p=E.periods[E.periods.length-1],r=reg.capital?p.capital:p.non_capital,ro=reg.capital?old.capital:old.non_capital;
  const n=Math.max(1,Math.floor(num(c.emp_increase_count)||1));
  if(allEx){item.level="none";item.headline="공제에서 빠지는 업종으로 보입니다 ("+exs[0]+")";return item}
  if(c.emp_increase==="yes"){
    if(taken==="yes"){
      item.level="done";item.headline="이미 공제를 받으셨다면 직원 수 유지가 중요합니다";
      item.points.push("공제를 받은 뒤 2년 안에 직원 수가 줄면 받은 공제를 다시 내야 할 수 있습니다");
      item.points.push("빠진 연도가 없는지, 청년 등 우대 금액이 제대로 들어갔는지는 신고서로 확인할 수 있습니다");
      return item;
    }
    item.level="high";
    item.headline=taken==="no"?"받지 않은 고용 세액공제를 돌려받을 가능성이 있습니다":"고용 세액공제 대상일 가능성이 있습니다";
    /* 우리 거래처(source 가 client)의 공제 금액은 이 방에서 계산하지 않는다. 금액은 전수검사로 검증한 계산기 결과와 위하고 신고액 한 곳에서만 정한다.
       공개 페이지에서 들어온 회사에는 법정 단가에 늘어난 인원을 곱한 어림 범위만 보여 준다. */
    const isClient=c.source==="client";
    item.estimate=isClient?"금액 미확정: 검증한 계산기 결과나 위하고 신고액이 들어오면 표시합니다":"늘어난 직원 "+n+"명 기준 1년에 약 "+man(n*r[0])+"~"+man(n*r[1])+"원, 3년간 유지하면 최대 "+man(n*r[1]*E.apply_years)+"원";
    item.points.push("직원이 1명 늘 때마다 "+man(r[0])+"원(청년, 60세 이상, 장애인 등은 "+man(r[1])+"원)을 세금에서 빼 주고, 늘어난 인원을 유지하면 최대 "+E.apply_years+"년간 받습니다 ("+p.years[0]+"~"+p.years[p.years.length-1]+"년 기준)");
    item.points.push(old.years[0]+"~"+old.years[old.years.length-1]+"년에 늘어난 직원은 "+old.name+"로 1명당 "+man(ro[0])+"~"+man(ro[1])+"원이 적용됩니다");
    item.points.push("공제액은 그해 낸 세금 범위 안에서 돌려받고, 남는 금액은 10년간 넘겨서 쓸 수 있습니다");
    (E.period_notes||[]).forEach(x=>item.points.push(x));
    item.points.push("고용증대, 통합고용 공제액의 20%는 농어촌특별세로 내야 해 실제 혜택은 그만큼 줄어듭니다");
    if(!isClient&&taxAmt!==null&&taxAmt>0&&n*r[0]>taxAmt)item.points.push("작년에 낸 세금이 약 "+man(taxAmt)+"원이라면 한 해에 돌려받는 금액은 그 범위 안입니다");
    if(taken==="unknown")item.points.push("이미 신고에 반영되어 있다면 더 돌려받을 금액은 없습니다. 신고서를 보면 바로 확인됩니다");
    if(exs.some(x=>x!==null))item.points.push("업종 확인 필요: "+exs.find(x=>x!==null)+"은 공제에서 빠집니다");
  }else if(c.emp_increase==="no"){
    item.level="none";item.headline="최근 5년간 직원이 늘지 않았다면 돌려받을 공제는 없습니다";
    item.points.push("앞으로 직원을 늘리면 그해부터 통합고용세액공제를 받을 수 있습니다");
    return item;
  }else{
    item.level="check";item.headline="직원이 늘어난 해가 있었는지 자료로 확인해 볼 필요가 있습니다";
  }
  item.points.push(E.headcount_note);
  return item;
}

function startup(c,T,ksics,reg,reliefs,taxAmt){
  const S=T.startup,item={key:"startup",title:S.title,level:"check",headline:"",estimate:"",points:[],basis:"조세특례제한법 제6조"};
  const taxName=c.biz_type==="법인"?"법인세":(c.biz_type==="개인"?"소득세":"소득세·법인세");
  if(reliefs.includes("startup")){
    item.level="done";item.headline="이미 적용 중이라면 감면 기간("+S.period_years+"년)이 끝나는 해를 챙기면 됩니다";
    item.points.push("감면 기간에 직원이 늘면 추가 감면을 받을 수 있는지도 함께 확인합니다");
    return item;
  }
  const m=/^(\d{4})/.exec(String(c.founded||"")),fy=m?+m[1]:null;
  if(fy===null){item.headline="개업 연월을 넣으면 창업감면 대상인지 살펴봅니다";return item}
  const lastYear=fy+S.period_years-1;
  if(lastYear<T.refund_years[0]){
    item.level="none";item.headline=fy+"년 창업은 감면 기간("+S.period_years+"년)이 끝났고 돌려받을 수 있는 기한도 대부분 지났습니다";
    return item;
  }
  const cls=classify(ksics,S);
  if(cls.state==="no"){
    item.level="none";item.headline="창업감면 대상 업종이 아닌 것으로 보입니다"+(cls.name?" ("+cls.name+")":"");
    item.points.push("대상 업종은 제조, 건설, 음식점, 통신판매, 정보통신, 전문·과학기술 서비스, 이용·미용, 수리업 등입니다. 도소매, 부동산, 일반 학원, 병·의원, 전문직은 빠집니다");
    return item;
  }
  if(["takeover","conversion","reopen"].includes(c.startup_type)){
    item.level="none";item.headline="사업 인수, 법인 전환, 폐업 후 같은 업종 재개는 세법상 창업으로 보지 않아 대상이 아닐 가능성이 큽니다";
    item.points.push("넘겨받은 사업용 자산(토지·감가상각 자산)이 새 사업 자산의 30% 이하면 창업으로 볼 수 있어 따로 검토합니다(조특령 5조⑳)");
    return item;
  }
  const by=num(c.ceo_birth_year),age=by===null?null:fy-by;
  let youth=age===null?"unknown":(age<(S.youth_age_min===undefined?15:S.youth_age_min)?"no":(age<=S.youth_age_max?"yes":(age<=S.youth_age_max+S.military_years_max+1?"maybe":"no")));   /* 조특령 5조① «창업 당시 15세 이상» */
  /* 출생연도가 없고 사무실 자료의 나이 표시만 있을 때: le34 = 표시를 만든 날에 만 34세 이하, 35to39 = 만 35~39세 (만 나이, 연 나이 아님).
     지금 34세 이하면 창업 당시에도 34세 이하다. 35~39세면 개업한 달부터 표시를 만든 달까지 꽉 찬 햇수만큼만 나이를 거슬러,
     창업 때 가장 많았을 나이가 34세 이하일 때만 청년으로 보고 나머지는 확인이 필요하다. 개업일의 날짜는 모르므로 한 달을 더 빼 보수적으로 센다 */
  let usedBand=false;
  if(age===null&&c.ceo_age_band){
    const re2=/^(\d{4})[-./]?(\d{1,2})?/,bm=re2.exec(String(c.ceo_age_band_ym||c.ceo_age_band_year||"")),fm=re2.exec(String(c.founded||""));
    const bandMonths=bm?(+bm[1])*12+(+(bm[2]||1)):null;                 /* 달을 모르면 1월로 보아 거스르는 햇수를 줄인다 */
    const foundMonths=fy*12+(+((fm&&fm[2])||12));                       /* 개업한 달을 모르면 12월로 본다 */
    const fullYears=bandMonths===null?0:Math.max(0,Math.floor((bandMonths-foundMonths-1)/12));
    if(c.ceo_age_band==="le34"){youth="yes";usedBand=true}
    else if(c.ceo_age_band==="35to39"){youth=(39-fullYears<=S.youth_age_max)?"yes":"maybe";usedBand=true}
  }
  const rates=startupRates(reg,fy>=2026),sales=num(c.sales_manwon),sy=salesYear(c),lim=smallLimit(S,sy),small=sales!==null&&sales<=lim;
  let rate=null,usedSmall=false;
  if(rates){
    rate=youth==="yes"?rates[1]:(youth==="no"?rates[0]:null);
    if(small&&youth!=="yes"&&(rate===null||rates[2]>rate)){rate=rates[2];usedSmall=true}
  }
  if(rate===0){
    item.level="none";item.headline="과밀억제권역 안에서 청년이 아닌 대표가 창업한 경우는 감면이 없습니다";
    item.points.push("그 해 매출이 기준("+smallDesc(S,T.refund_years[0])+") 이하인 해는 "+rates[2]+"% 감면 특례가 있습니다");
    return item;
  }
  item.level=(cls.state==="yes"&&rate!==null&&c.startup_type==="new")?"high":"check";
  if(rate!==null)item.headline=taxName+"의 "+rate+"%를 "+S.period_years+"년간 감면받을 가능성이 있습니다";
  else if(rates)item.headline=rates[0]===0?"청년창업(창업 당시 만 "+S.youth_age_max+"세 이하)이면 "+taxName+"의 "+rates[1]+"%를 감면받을 수 있습니다":"대표자 나이에 따라 "+taxName+"의 "+rates[0]+"~"+rates[1]+"%를 감면받을 가능성이 있습니다";
  else item.headline="사업장 위치와 대표자 나이에 따라 "+taxName+"의 50~100%를 감면받을 가능성이 있습니다";
  if(rate!==null&&taxAmt!==null&&taxAmt>0)item.estimate="작년에 낸 세금이 "+man(taxAmt)+"원이라면 1년에 약 "+man(taxAmt*rate/100)+"원";
  item.points.push("감면은 처음 소득이 생긴 해부터 "+S.period_years+"년입니다. 창업한 해부터라면 "+fy+"~"+lastYear+"년이고, 지난 연도분은 경정청구로 돌려받을 수 있습니다");
  if(usedSmall)item.points.push(sy+"년 매출이 그 해 기준 "+man(lim)+"원 이하라 창업 특례("+rate+"%)를 적용했습니다. 기준은 해마다 다릅니다("+smallDesc(S,T.refund_years[0])+")");
  else if(rates&&sales!==null&&youth!=="yes"&&sales>lim&&rates[2]>(rate||0)&&sales<=smallLimit(S,9999)&&sy<Math.max(...(S.small_revenue_by_year||[{from:0}]).map(t=>t.from)))
    item.points.push(sy+"년 매출은 그 해 기준 "+man(lim)+"원을 넘지만, 기준이 "+smallDesc(S,sy+1)+"으로 올라 그 안인 해는 창업 특례("+rates[2]+"%)가 될 수 있습니다");
  if(cls.state==="check")item.points.push("업종 확인 필요: "+cls.name);
  if(cls.state==="unknown")item.points.push("종목을 고르면 대상 업종인지 함께 판정합니다");
  if(usedBand)item.points.push("대표자 나이는 출생연도가 아니라 사무실 자료의 나이 표시(만 "+(c.ceo_age_band==="le34"?"34세 이하":"35~39세")+")로 판정했습니다");
  if(youth==="unknown")item.points.push("대표자 출생연도를 넣으면 청년창업(창업 당시 만 "+S.youth_age_max+"세 이하) 여부를 판정합니다");
  if(youth==="maybe")item.points.push("창업 당시 나이가 기준 근처입니다. 생일이 지났는지와 군 복무 기간(최대 "+S.military_years_max+"년을 나이에서 뺌)에 따라 청년창업 여부가 달라집니다");
  if(youth==="yes"&&c.biz_type==="법인")item.points.push("법인은 청년인 대표자가 최대주주여야 청년창업으로 인정됩니다");
  if(youth==="yes"&&c.biz_type!=="법인")item.points.push("공동사업이면 손익분배비율이 가장 큰 사업자가 청년이어야 합니다");
  if(youth==="yes")item.points.push("감면 기간 중에 청년 대표가 최대주주(법인)나 손익분배비율이 가장 큰 사업자(공동사업)가 아니게 되면 그 해부터 남은 기간은 청년이 아닌 비율로 내려갑니다");
  if(c.startup_type!=="new")item.points.push("새로 시작한 사업인지(인수, 법인 전환, 재개업이 아닌지) 확인이 필요합니다");
  if(String(c.industry_code||"").startsWith("94"))item.points.push("사업자등록 없이 일하는 프리랜서(인적용역)는 대상 여부를 따로 확인해야 합니다");
  if(reg.note)item.points.push(reg.note);
  if(!reliefs.includes("none"))item.points.push("이미 신고에 반영되어 있다면 더 돌려받을 금액은 없습니다. 신고서를 보면 바로 확인됩니다");
  return item;
}

function smeSpecial(c,T,ksics,reg,reliefs,taxAmt){
  const P=T.sme_special,item={key:"sme_special",title:P.title,level:"check",headline:"",estimate:"",points:[],basis:"조세특례제한법 제7조"};
  const taxName=c.biz_type==="법인"?"법인세":(c.biz_type==="개인"?"소득세":"소득세·법인세");
  if(reliefs.includes("sme")){item.level="done";item.headline="이미 적용 중입니다. 해마다 빠짐없이 들어가는지만 확인하면 됩니다";return item}
  const cls=classify(ksics,P);
  if(cls.state==="unknown"){item.headline="종목을 고르면 감면 대상 업종인지 살펴봅니다";return item}
  if(cls.state==="no"){
    item.level="none";item.headline="감면 대상 업종이 아닌 것으로 보입니다"+(cls.name?" ("+cls.name+")":"");
    item.points.push("음식점, 숙박, 부동산 임대, 전문직(변호사·세무사 등), 일반 학원, 이용·미용업 등은 대상이 아닙니다");
    return item;
  }
  const wr=ksics.some(k=>P.wholesale_retail_medical_ksic.some(x=>k.startsWith(x)));
  let rate=wr?P.rates.wholesale_retail_medical:(reg.capital?P.rates.capital:P.rates.non_capital);
  if(!wr&&ksics.some(k=>(P.half_rate_ksic||[]).some(x=>k.startsWith(x))))rate=rate/2;   /* 통관 대리 및 관련 서비스업: 감면율 x 100분의 50 (7조①2호 단서) */
  const sales=num(c.sales_manwon),smallSure=sales!==null&&sales<=P.small_company_safe_sales_manwon;
  item.level=(cls.state==="yes"&&smallSure)?"high":"check";
  item.headline=taxName+"의 "+rate+"%를 해마다 감면받을 가능성이 있습니다 (한도 연 "+man(P.cap_manwon)+"원)";
  if(taxAmt!==null&&taxAmt>0)item.estimate="작년에 낸 세금이 "+man(taxAmt)+"원이라면 1년에 약 "+man(Math.min(taxAmt*rate/100,P.cap_manwon))+"원";
  item.points.push("소기업 감면율은 도소매·의료업 "+P.rates.wholesale_retail_medical+"%, 그 밖의 업종은 수도권 "+P.rates.capital+"%, 수도권 밖 "+P.rates.non_capital+"%입니다");
  if(!smallSure){
    const thr=hit(ksics[0]||"",P.small_company_sales_eok);
    if(sales!==null&&thr!==null&&sales<=thr*10000)item.points.push("지금 기준으로 이 업종의 소기업 매출 기준("+thr+"억원) 안에 있습니다. 과거 연도는 기준이 달라 해마다 확인합니다");
    else if(sales!==null&&thr!==null)item.points.push("매출이 지금의 소기업 기준("+thr+"억원)을 넘어 중기업일 수 있습니다. 중기업은 감면율이 낮고 수도권에서는 대부분 대상이 아닙니다");
    else item.points.push("매출이 "+man(P.small_company_safe_sales_manwon)+"원을 넘으면 업종별 소기업 기준을 따로 봐야 하고, 기준을 넘으면 감면율이 낮아지거나 대상에서 빠질 수 있습니다");
  }
  if(cls.state==="check")item.points.push("업종 확인 필요: "+cls.name);
  const fm=/^(\d{4})/.exec(String(c.founded||"")),lr=P.long_run_years===undefined?10:P.long_run_years;
  if(fm&&c.biz_type!=="법인"&&salesYear(c)-(+fm[1])>=lr)item.points.push("같은 업종을 "+lr+"년 넘게 해 왔고 종합소득금액 1억원 이하·성실사업자 요건을 갖추면 감면율에 "+(P.long_run_bonus_pct===undefined?110:P.long_run_bonus_pct)+"%를 곱합니다(조특법 7조②, 예: 30% → 33%)");
  item.points.push("직원 수가 전년보다 줄면 한도가 "+man(P.cap_manwon)+"원에서 줄어든 1명당 "+man(P.cap_cut_per_person_manwon===undefined?500:P.cap_cut_per_person_manwon)+"원씩 내려갑니다");
  item.points.push("창업중소기업 세액감면과는 함께 받을 수 없어 둘 중 유리한 쪽을 고릅니다");
  item.points.push("대부분의 세무대리인이 기본으로 적용하지만 직접 신고했거나 업종이 바뀐 해에는 빠지는 일이 있습니다");
  return item;
}

function diagnose(c,T,IND){
  T=T||window.TAX_RULES;IND=IND||window.INDUSTRY;c=c||{};
  const ksics=ksicList(c,IND),reg=regionInfo(c,T.regions),reliefs=c.reliefs_taken||[],taxAmt=num(c.tax_amount_manwon);
  const items=[employment(c,T,ksics,reg,reliefs,taxAmt),startup(c,T,ksics,reg,reliefs,taxAmt),smeSpecial(c,T,ksics,reg,reliefs,taxAmt)];
  const high=items.filter(x=>x.level==="high").length,check=items.filter(x=>x.level==="check").length;
  let summary;
  if(high)summary="돌려받을 가능성이 있는 항목 "+high+"건"+(check?", 확인이 필요한 항목 "+check+"건":"");
  else if(check)summary="확인이 필요한 항목 "+check+"건";
  else summary="지금 입력으로는 돌려받을 항목이 보이지 않습니다";
  const ys=T.refund_years;
  return {items,high,check,summary,refund_years:ys,docs:T.review_docs||[],
    notice:"세금을 더 냈다면 신고기한이 지난 뒤 5년 안에 돌려 달라고 청구할 수 있습니다(경정청구, 지금은 "+ys[0]+"~"+ys[ys.length-1]+"년분). 이 결과는 가능성을 미리 살펴본 것이고, 실제 환급 여부와 금액은 신고서와 직원 자료를 검토해야 정해집니다."};
}
const LEVEL_LABEL={high:"가능성 높음",check:"확인 필요",none:"해당 없음",done:"이미 적용"};
const api={diagnose,regionInfo,LEVEL_LABEL};
if(typeof window!=="undefined")window.TaxCheck=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
