/* 세 화면(공개 페이지, 내부용 링크, PC 화면)이 함께 쓰는 입력 도우미.
   업태·종목 드롭다운, 5인 미만 선택, 회사 특성 체크, 금액·전화번호 표시를 한곳에서 관리한다.
   원본은 artifact/formkit.js 이고 export_artifact.py 가 site 폴더로 복사한다. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

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

/* ---------- 업태·종목 드롭다운 ----------
   업태 = 국세청 업종코드표의 대분류, 종목 = 세세분류. 종목을 고르면 업종코드가 자동으로 들어간다.
   업태를 고르지 않아도 "종목 찾기"에 입력하면 전체 업태에서 찾는다. 필요한 칸: #upte #jmSearch #jongmok #industry_code #codeHint */
function initIndustry(groups,yearLabel,onPick){
  const upte=$("#upte"),search=$("#jmSearch"),sel=$("#jongmok"),code=$("#industry_code"),hint=$("#codeHint");
  const MAX=400,BASE_HINT="업태와 종목을 고르면 업종코드가 자동으로 들어갑니다. 업태를 몰라도 종목 찾기에 바로 입력하면 됩니다.";
  upte.innerHTML='<option value="">업태 선택</option>'+groups.map(g=>`<option>${esc(g.upte)}</option>`).join("");
  search.disabled=false;
  const gIndex=()=>groups.findIndex(g=>g.upte===upte.value);
  function item(){
    const m=/^(\d+):(\d+)$/.exec(sel.value||"");
    if(m)return {g:groups[+m[1]],it:groups[+m[1]].items[+m[2]]};
    const gi=gIndex();return {g:gi>=0?groups[gi]:null,it:null};
  }
  function fill(){
    const q=search.value.trim(),gi=gIndex(),keep=sel.value;
    const pool=gi>=0?[gi]:(q?groups.map((g,i)=>i):[]);
    if(!pool.length){sel.innerHTML='<option value="">업태를 고르거나 종목 찾기에 입력하세요</option>';sel.disabled=true;return}
    sel.disabled=false;
    let n=0,html="";
    for(const i of pool){
      const g=groups[i],byMid=new Map();
      g.items.forEach((x,ii)=>{
        if(q&&!(x.n+" "+(x.d||"")+" "+x.c).includes(q))return;
        if(!byMid.has(x.m))byMid.set(x.m,[]);byMid.get(x.m).push([ii,x]);
      });
      for(const [mid,list] of byMid){
        if(n>=MAX)break;
        html+=`<optgroup label="${esc(gi>=0?mid:g.upte+" · "+mid)}">`+list.map(([ii,x])=>{n++;return `<option value="${i}:${ii}">${esc(x.n)}${x.d?" · "+esc(x.d):""} (${esc(x.c)})</option>`}).join("")+"</optgroup>";
      }
    }
    sel.innerHTML=`<option value="">${n?`종목 선택 (${n>=MAX?n+"개 이상, 더 입력해 좁히세요":n+"개"})`:"찾는 종목이 없습니다"}</option>`+html;
    if(keep&&sel.querySelector(`option[value="${keep}"]`))sel.value=keep;
  }
  function showHint(){
    const {it}=item();
    hint.textContent=it?"국세청 업종코드표("+(yearLabel||"최신")+")에서 자동으로 넣었습니다. 사업자등록증과 다르면 고쳐 주세요.":BASE_HINT;
  }
  function onUpte(){sel.value="";search.value="";fill();code.value="";showHint();if(onPick)onPick()}
  function onJongmok(){
    const {g,it}=item();
    if(it){
      if(upte.value!==g.upte){const v=sel.value;upte.value=g.upte;fill();sel.value=v}   // 찾기로 골랐으면 업태도 맞춰 준다
      code.value=it.c;
    }
    showHint();if(onPick)onPick();
  }
  upte.addEventListener("change",onUpte);
  sel.addEventListener("change",onJongmok);
  search.addEventListener("input",()=>{fill();showHint()});
  fill();showHint();
  return {
    item,
    text(){const {g,it}=item();return g?(g.upte+(it?" / "+it.n:"")):""},
    /* 판정에 쓰는 업종 속성. 코드를 직접 고쳤으면 빈 값을 돌려줘 그 코드로 다시 조회하게 한다 */
    hint(){
      const {g,it}=item();if(!g)return {};
      const typed=(code.value||"").trim();
      if(it&&typed&&typed!==it.c)return {};
      return it?{section:g.section,f:it.f||""}:{section:g.section};
    },
    fields(){
      const {g,it}=item();
      const typed=(code.value||"").trim();
      return {industry_upte:g?g.upte:"",industry_name:it?it.n:"",industry_desc:it&&it.d?it.d:"",
        industry_code:typed,industry_text:this.text(),industry_hint:this.hint(),
        industry_ksic:it&&(!typed||typed===it.c)?(it.k||""):""};       // 표준산업분류 코드(세금 감면 업종 판정용). 코드를 직접 고쳤으면 비워 코드로 다시 조회한다
    },
    /* 저장해 둔 회사의 업태·종목을 되살린다. 코드만 있으면 코드로 업태를 찾는다 */
    restore(c){
      c=c||{};
      const cd=String(c.industry_code||"").replace(/\D/g,"");
      let gi=groups.findIndex(g=>g.upte===c.industry_upte);
      if(gi<0&&cd)gi=groups.findIndex(g=>g.items.some(x=>x.c===cd));
      upte.value=gi>=0?groups[gi].upte:"";search.value="";sel.value="";fill();
      if(gi>=0&&cd){
        let ii=groups[gi].items.findIndex(x=>x.c===cd&&x.n===c.industry_name&&(x.d||"")===(c.industry_desc||""));
        if(ii<0)ii=groups[gi].items.findIndex(x=>x.c===cd);
        if(ii>=0)sel.value=gi+":"+ii;
      }
      showHint();code.value=cd;
    }
  };
}

/* ---------- 5인 미만 예외: 하나 이상 고르거나 "해당 없음"을 고른다 ----------
   필요한 칸: #excBox #exceptions #excHint. getFlags() 는 고른 종목의 표시(K 가 있으면 지식서비스산업) */
function initUnder5(list,noneLabel,getFlags){
  const box=$("#excBox"),wrap=$("#exceptions"),hint=$("#excHint");
  const BASE='5명 미만 회사는 아래에 해당할 때만 지원 대상입니다. 해당하는 것이 없으면 "'+noneLabel+'"을 고르세요.';
  wrap.innerHTML=list.map(e=>`<label><input type="checkbox" id="exc_${esc(e.key)}" value="${esc(e.short||e.key)}">${esc(e.label)}</label>`).join("")
    +`<label><input type="checkbox" id="exc_none" value="${esc(noneLabel)}">${esc(noneLabel)}</label>`;
  const none=()=>$("#exc_none"),visible=()=>!box.hidden;
  wrap.addEventListener("change",e=>{
    const t=e.target;if(!t||t.type!=="checkbox")return;
    if(t.id==="exc_none"&&t.checked)wrap.querySelectorAll("input").forEach(i=>{if(i!==t)i.checked=false});
    else if(t.checked)none().checked=false;
  });
  return {
    visible,
    setVisible(on){box.hidden=!on;box.style.display=on?"":"none"},
    anyChecked:()=>!!wrap.querySelector("input:checked"),
    read(){
      if(!visible())return {exceptions:[],exceptions_none:false};
      return {exceptions:[...wrap.querySelectorAll("input:checked")].map(i=>i.value),exceptions_none:none().checked};
    },
    restore(flags){
      flags=flags||{};
      wrap.querySelectorAll("input").forEach(i=>i.checked=(flags.exceptions||[]).includes(i.value)||(i.id==="exc_none"&&!!flags.exceptions_none));
    },
    /* 고른 종목이 지식서비스산업이면 그 칸을 자동으로 체크해 준다 */
    sync(){
      const k=$("#exc_knowledge");if(!k||!visible())return;
      const isK=String(getFlags()||"").includes("K");
      if(isK&&!k.checked){k.checked=true;none().checked=false}
      hint.textContent=isK?"고른 종목이 지식서비스산업에 해당해 자동으로 체크했습니다. 다른 항목도 해당하면 함께 고르세요.":BASE;
    }
  };
}

/* ---------- 회사 특성 체크 (우대 조건 매칭용). 필요한 칸: #traits ---------- */
function initTraits(list){
  const wrap=$("#traits");
  wrap.innerHTML=list.map((t,i)=>`<label><input type="checkbox" id="trait_${i}" value="${esc(t.label)}">${esc(t.label)}</label>`).join("");
  return {
    read:()=>[...wrap.querySelectorAll("input:checked")].map(i=>i.value),
    restore(arr){wrap.querySelectorAll("input").forEach(i=>i.checked=(arr||[]).includes(i.value))}
  };
}

/* 사업자등록번호를 000-00-00000 형식으로. 비어 있으면 통과, 넣었으면 10자리와 검증번호를 본다 */
function formatBizNo(v){
  const d=String(v||"").replace(/\D/g,"").slice(0,10);
  if(d.length<=3)return d;if(d.length<=5)return d.slice(0,3)+"-"+d.slice(3);
  return d.slice(0,3)+"-"+d.slice(3,5)+"-"+d.slice(5);
}
function validBizNo(v){
  const d=String(v||"").replace(/\D/g,"");if(!d)return true;if(d.length!==10||new Set(d).size===1)return false;   // 0000000000 같은 자리표시값은 검증식을 그냥 통과하므로 따로 막는다
  const w=[1,3,7,1,3,7,1,3,5];let s=0;for(let i=0;i<9;i++)s+=(+d[i])*w[i];
  s+=Math.floor((+d[8])*5/10);
  return (10-s%10)%10===+d[9];
}

/* ---------- 세금 환급 가능성 확인용 입력 (taxcheck.js 가 읽는 값). 필요한 칸: #taxBox ----------
   askAgent 가 true 면 "세무 신고를 어떻게 하고 있는지"도 묻는다(공개 페이지용) */
const TAX_START=[["","선택"],["new","새로 창업했다"],["takeover","다른 사람의 사업을 넘겨받았다"],["conversion","개인사업을 법인으로 바꿨다"],["reopen","폐업한 뒤 같은 업종으로 다시 시작했다"],["unknown","잘 모르겠다"]];
const TAX_INC=[["unknown","잘 모르겠다"],["yes","늘어난 해가 있다"],["no","늘지 않았다"]];
const TAX_RELIEFS=[["startup","창업 감면"],["sme","중소기업 특별세액감면"],["employment","고용 세액공제 (고용증대, 통합고용)"],["none","받은 적 없다"],["unknown","잘 모르겠다"]];
const TAX_AGENT=["","세무사 사무실에 맡기고 있다","직접 신고한다","아직 신고해 본 적이 없다"];
function initTax(opts){
  opts=opts||{};
  const box=$("#taxBox"),opt=list=>list.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join("");
  box.innerHTML=`
    <div class="two row">
      <div class="fld"><label for="ceo_birth_year">대표자 출생연도</label><input type="number" id="ceo_birth_year" min="1920" max="2015" placeholder="예: 1988"></div>
      <div class="fld"><label for="startup_type">사업을 시작한 방법</label><select id="startup_type">${opt(TAX_START)}</select></div>
    </div>
    <div class="two row">
      <div class="fld"><label for="emp_increase">최근 5년 사이 직원 수</label><select id="emp_increase">${opt(TAX_INC)}</select></div>
      <div class="fld" id="empCountBox"><label for="emp_increase_count">가장 많이 늘어난 해에 몇 명쯤</label><input type="number" id="emp_increase_count" min="1" max="1000" placeholder="명"></div>
    </div>
    <div class="fld"><label>지금까지 받은 세금 혜택</label>
      <div class="checks one" id="reliefs">${TAX_RELIEFS.map(x=>`<label><input type="checkbox" id="relief_${x[0]}" value="${x[0]}">${esc(x[1])}</label>`).join("")}</div>
    </div>
    <div class="fld"><label for="tax_amount_manwon">작년에 낸 ${opts.taxLabel||"소득세·법인세"} (만원)<span class="amt" id="taxAmtText"></span></label><input type="number" id="tax_amount_manwon" min="0" placeholder="모르면 비워 두세요"></div>
    ${opts.askAgent?`<div class="fld"><label for="has_tax_agent">세금 신고는 어떻게 하고 계신가요</label><select id="has_tax_agent">${TAX_AGENT.map(x=>`<option value="${esc(x)}">${esc(x||"선택")}</option>`).join("")}</select></div>`:""}
    <p class="hint">모르는 칸은 비워 두어도 됩니다. 아는 만큼만 넣어도 돌려받을 가능성이 있는 세금을 살펴봅니다.</p>`;
  const rel=$("#reliefs"),inc=$("#emp_increase"),cnt=$("#empCountBox"),amt=$("#tax_amount_manwon");
  const sync=()=>{cnt.style.visibility=inc.value==="yes"?"":"hidden";$("#taxAmtText").textContent=moneyText(amt.value)};
  rel.addEventListener("change",e=>{
    const t=e.target;if(!t||t.type!=="checkbox"||!t.checked)return;
    const solo=t.value==="none"||t.value==="unknown";
    rel.querySelectorAll("input").forEach(i=>{if(i!==t&&(solo||i.value==="none"||i.value==="unknown"))i.checked=false});
  });
  inc.addEventListener("change",sync);amt.addEventListener("input",sync);sync();
  const v=id=>{const e=$("#"+id);return e?(e.value||"").trim():""};
  return {
    read:()=>({ceo_birth_year:v("ceo_birth_year"),startup_type:v("startup_type"),emp_increase:v("emp_increase"),
      emp_increase_count:inc.value==="yes"?v("emp_increase_count"):"",reliefs_taken:[...rel.querySelectorAll("input:checked")].map(i=>i.value),
      tax_amount_manwon:v("tax_amount_manwon"),has_tax_agent:v("has_tax_agent")}),
    restore(c){
      c=c||{};
      const set=(id,val)=>{const e=$("#"+id);if(e)e.value=val==null?"":val};
      set("ceo_birth_year",c.ceo_birth_year);set("startup_type",c.startup_type||"");set("emp_increase",c.emp_increase||"unknown");
      set("emp_increase_count",c.emp_increase_count);set("tax_amount_manwon",c.tax_amount_manwon);set("has_tax_agent",c.has_tax_agent||"");
      rel.querySelectorAll("input").forEach(i=>i.checked=(c.reliefs_taken||[]).includes(i.value));sync();
    },
    /* 시트나 목록에 한 줄로 남길 때 쓰는 입력 요약 */
    text(){
      const r=this.read(),pick=(list,k)=>(list.find(x=>x[0]===k)||["",""])[1],t=[];
      if(r.ceo_birth_year)t.push("대표자 "+r.ceo_birth_year+"년생");
      if(r.startup_type)t.push("시작: "+pick(TAX_START,r.startup_type));
      t.push("직원: "+pick(TAX_INC,r.emp_increase)+(r.emp_increase_count?" ("+r.emp_increase_count+"명)":""));
      if(r.reliefs_taken.length)t.push("받은 혜택: "+r.reliefs_taken.map(k=>pick(TAX_RELIEFS,k)).join(", "));
      if(r.tax_amount_manwon)t.push("작년 세금 "+r.tax_amount_manwon+"만원");
      if(r.has_tax_agent)t.push(r.has_tax_agent);
      return t.join(" | ");
    }
  };
}

/* ---------- 세금 환급 가능성 결과 화면 (세 화면 공통). d = TaxCheck.diagnose() 결과 ---------- */
const TAX_LEVEL={high:"가능성 높음",check:"확인 필요",none:"해당 없음",done:"이미 적용"};
function taxStyle(){
  if(document.getElementById("txStyle"))return;
  const st=document.createElement("style");st.id="txStyle";
  st.textContent=`.tx-head{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between}
.tx-head h2{margin:0;font-size:19px}
.tx-sum,.tx-lv{background:var(--info-bg,#EAEEF6);color:var(--info,#42506B);font-weight:700}
.tx-sum{display:inline-block;padding:4px 12px;border-radius:999px;font-size:13px}
.tx-sum.high,.tx-lv.high{background:var(--ok-bg,#E3F4EC);color:var(--ok,#0B7A53)}
.tx-sum.check,.tx-lv.check{background:var(--warn-bg,#FCF1D6);color:var(--warn,#8A5A00)}
.tx-note{font-size:12.5px;color:var(--sub,#56627A);margin:6px 0 0}
.tx-list{list-style:none;margin:12px 0 0;padding:0}
.tx-list>li{display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid var(--line,#DCE1EC)}
.tx-lv{font-size:12px;border-radius:5px;text-align:center;padding:3px 0;align-self:start}
.tx-t{font-weight:700}
.tx-h{font-size:14px}
.tx-e{font-size:14px;font-weight:700;color:var(--accent,#2B5BD7);margin-top:2px}
.tx-list details{border-top:0;margin-top:4px;padding-top:0}
.tx-list summary{font-size:13px;font-weight:500;color:var(--accent,#2B5BD7)}
@media (max-width:520px){.tx-list>li{grid-template-columns:minmax(0,1fr);gap:6px}.tx-lv{justify-self:start;padding:3px 10px}}`;
  document.head.appendChild(st);
}
function taxHTML(d,extra){
  taxStyle();
  const cls=d.high?"high":(d.check?"check":"");
  return `<div class="tx-head"><h2>돌려받을 수 있는 세금이 있는지</h2><span class="tx-sum ${cls}">${esc(d.summary)}</span></div>
    <p class="tx-note">${esc(d.notice)}</p>
    <ul class="tx-list">${d.items.map(x=>`<li><span class="tx-lv ${esc(x.level)}">${esc(TAX_LEVEL[x.level]||"")}</span><div>
      <div class="tx-t">${esc(x.title)}</div><div class="tx-h">${esc(x.headline)}</div>${x.estimate?`<div class="tx-e">${esc(x.estimate)}</div>`:""}
      ${x.points.length?`<details><summary>자세히 보기</summary><ul>${x.points.map(p=>`<li>${esc(p)}</li>`).join("")}</ul><p class="tx-note">근거: ${esc(x.basis)}</p></details>`:""}
    </div></li>`).join("")}</ul>
    ${d.docs&&d.docs.length?`<details><summary>정확히 검토하려면 필요한 자료</summary><ul>${d.docs.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></details>`:""}${extra||""}`;
}

window.FormKit={esc,moneyText,formatPhone,validPhone,formatBizNo,validBizNo,initIndustry,initUnder5,initTraits,initTax,taxHTML};
})();
