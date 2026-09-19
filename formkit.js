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
      return {industry_upte:g?g.upte:"",industry_name:it?it.n:"",industry_desc:it&&it.d?it.d:"",
        industry_code:(code.value||"").trim(),industry_text:this.text(),industry_hint:this.hint()};
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

window.FormKit={esc,moneyText,formatPhone,validPhone,initIndustry,initUnder5,initTraits};
})();
