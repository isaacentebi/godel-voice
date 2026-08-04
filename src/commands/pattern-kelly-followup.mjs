export const PAT_FEATURES = Object.freeze(["pattern", "occurrence_count", "forecast_horizon"]);
export const PRT_FEATURES = Object.freeze(["patterns", "ranking", "realized_outcomes"]);
export const KELLY_FEATURES = Object.freeze(["starting_balance", "win_probability", "bet_percent"]);

function clean(v) { return String(v ?? "").toLowerCase().replace(/\bpattrens?\b/g,"patterns").replace(/\brealised\b/g,"realized").replace(/\bkelly cry tear ion\b/g,"kelly criterion").replace(/[^a-z0-9.$%/_:+ -]+/g," ").replace(/\s+/g," ").trim(); }
function corrected(v) { return clean(v).split(/\b(?:wait no|no sorry|actually|scratch that|i mean|rather|correction)\b/).at(-1).trim(); }
function base(kind, command, blockers=[]) { return { kind, command, actions:[], executable_actions:[], blockers, ready_for_live_executor:false, educational_not_advice:true }; }
function validSecurity(v) { return v && typeof v === "object" && /^[A-Z][A-Z0-9.-]{0,14}$/.test(String(v.ticker??"")) && String(v.venue??"").trim() && String(v.asset_class??"").trim(); }
function security(v) { return { ticker:String(v.ticker), venue:String(v.venue), asset_class:String(v.asset_class) }; }
function exactOption(options, spoken) { if (!Array.isArray(options)) return null; const m=options.filter(v=>clean(v)===clean(spoken)); return m.length===1?m[0]:null; }
function validPattern(v) { return v && typeof v==="object" && String(v.id??"").trim() && String(v.label??"").trim() && v.live===true; }
function pattern(v) { return { id:String(v.id), label:String(v.label) }; }

export function normalizePATFacts(v) {
  if (!v || v.observed!==true || v.source!=="Godel PAT panel" || !validPattern(v.pattern) || !Number.isInteger(v.occurrences) || v.occurrences<0 || !String(v.forecast_horizon??"").trim()) throw new Error("PAT results require exact observed panel statistics");
  for (const k of ["mean_forward_return","median_forward_return","positive_rate"]) if (typeof v[k]!=="number" || !Number.isFinite(v[k])) throw new Error(`PAT ${k} must be finite`);
  if (v.positive_rate<0 || v.positive_rate>1) throw new Error("PAT positive rate must be 0..1");
  return { pattern:pattern(v.pattern), occurrences:v.occurrences, forecast_horizon:String(v.forecast_horizon), mean_forward_return:v.mean_forward_return, median_forward_return:v.median_forward_return, positive_rate:v.positive_rate, source:v.source };
}

export function compilePATVoice(context={}, utterance) {
  const text=corrected(utterance); if(!text||text.split(" ").length>120)return null;
  if (/\b(?:buy|sell|trade|order|position size)\b/.test(text)) return base("blocked","PAT",["PAT is statistical research and cannot create a trade"]);
  const wantsRun=/\b(?:run|search|find|use|set|show)\b/.test(text), wantsRead=/\b(?:read|tell me|what (?:are|is)|summarize)\b/.test(text);
  if(!wantsRun&&!wantsRead)return null;
  if(!validSecurity(context.security))return {...base("clarify","PAT",["PAT requires one exact resolved security"]),grounded_narration:null};
  const blockers=[], actions=[];
  if(wantsRun){
    if(!validPattern(context.resolved_pattern)) blockers.push("PAT pattern grammar must resolve to one exact current live pattern identity");
    else actions.push({feature:"pattern",operation:"select",value:pattern(context.resolved_pattern),scope:"panel"});
    const count=text.match(/\b(?:top|last|use) (\d{1,4}) (?:similar )?occurrences?\b/);
    if(count){ const exact=exactOption(context.live_options?.occurrence_count,Number(count[1])); if(exact==null)blockers.push("PAT occurrence count must match an exact live control value"); else actions.push({feature:"occurrence_count",operation:"select",value:exact,scope:"panel"}); }
    const horizon=text.match(/\bforecast (?:over|for|horizon )?([a-z0-9 -]+?)(?=\s+(?:and|then)|$)/);
    if(horizon){ const exact=exactOption(context.live_options?.forecast_horizon,horizon[1]); if(exact==null)blockers.push("PAT forecast horizon must match one exact live control value"); else actions.push({feature:"forecast_horizon",operation:"select",value:exact,scope:"panel"}); }
  }
  let groundedNarration=null;
  if(wantsRead)try{groundedNarration=normalizePATFacts(context.grounded_results);}catch(e){blockers.push(`${e.message}; no pattern result will be invented`);}
  return {kind:blockers.length?"clarify":"candidate",command:"PAT",security:security(context.security),actions,executable_actions:[],blockers,grounded_narration:groundedNarration,ready_for_grounded_narration:Boolean(groundedNarration)&&!blockers.length,configure_step_draft:blockers.length||!actions.length?null:{command:"PAT",actions},ready_for_live_executor:false,educational_not_advice:true};
}

export function normalizePRTFacts(v){
  if(!v||v.observed!==true||v.source!=="Godel PRT panel"||!Array.isArray(v.rows)||v.rows.length>500)throw new Error("PRT results require exact observed ranked rows");
  const rows=v.rows.map((r,i)=>{if(!r||!validPattern(r.pattern)||!Number.isInteger(r.rank)||r.rank!==i+1||typeof r.realized_outcome!=="number"||!Number.isFinite(r.realized_outcome))throw new Error("PRT ranked outcome row is malformed");return{rank:r.rank,pattern:pattern(r.pattern),realized_outcome:r.realized_outcome};});
  return{source:v.source,as_of:String(v.as_of??""),rows};
}
export function compilePRTVoice(context={},utterance){
  const text=corrected(utterance);if(!text||text.split(" ").length>140)return null;
  if(/\b(?:buy|sell|trade|order|execute)\b/.test(text))return base("blocked","PRT",["PRT rankings cannot execute trades"]);
  const run=/\b(?:run|batch|rank|compare)\b/.test(text),read=/\b(?:read|tell me|what|summarize)\b/.test(text);if(!run&&!read)return null;
  const blockers=[],actions=[];
  if(run){
    const patterns=context.resolved_patterns;
    if(!Array.isArray(patterns)||!patterns.length||patterns.length>50||!patterns.every(validPattern)||new Set(patterns.map(x=>x.id)).size!==patterns.length)blockers.push("PRT batch requires a non-empty unique list of exact current live pattern identities");
    else actions.push({feature:"patterns",operation:"set",value:patterns.map(pattern),scope:"panel"});
    const rm=text.match(/\brank(?:ing)? (?:by )?([a-z0-9 %/_-]+?)(?=\s+(?:and|then)|$)/);
    if(rm){const exact=exactOption(context.live_options?.ranking,rm[1]);if(exact==null)blockers.push("PRT ranking must match one exact live option");else actions.push({feature:"ranking",operation:"select",value:exact,scope:"panel"});}
    const show=/\b(?:show|include) realized outcomes?\b/.test(text),hide=/\b(?:hide|exclude) realized outcomes?\b/.test(text);
    const outcomeConflict=/\b(?:show|include)\s+(?:and|but)\s+(?:hide|exclude) realized outcomes?\b/.test(text);
    if(outcomeConflict||(show&&hide))blockers.push("PRT realized outcomes cannot be both shown and hidden");else if(show||hide)actions.push({feature:"realized_outcomes",operation:"select",value:show?"show":"hide",scope:"panel"});
  }
  let groundedNarration=null;if(read)try{groundedNarration=normalizePRTFacts(context.grounded_results);}catch(e){blockers.push(`${e.message}; no ranking or outcome will be invented`);}
  return{kind:blockers.length?"clarify":"candidate",command:"PRT",actions,executable_actions:[],blockers,grounded_narration:groundedNarration,ready_for_grounded_narration:Boolean(groundedNarration)&&!blockers.length,configure_step_draft:blockers.length||!actions.length?null:{command:"PRT",actions},ready_for_live_executor:false,educational_not_advice:true};
}

const WORD_NUMBERS={ten:10,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
function numberToken(s){const t=clean(s);if(/^\d+(?:\.\d+)?$/.test(t))return Number(t);const m=t.match(/^(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?: thousand)?$/);if(!m)return null;return WORD_NUMBERS[m[1]]*(t.includes("thousand")?1000:1);}
export function normalizeKELLYResult(v){if(!v||v.observed!==true||v.source!=="Godel KELLY panel")throw new Error("KELLY result requires exact observed simulation output");for(const k of["ending_balance","kelly_percent","max_drawdown_percent"])if(typeof v[k]!=="number"||!Number.isFinite(v[k]))throw new Error(`KELLY ${k} must be finite`);return{ending_balance:v.ending_balance,kelly_percent:v.kelly_percent,max_drawdown_percent:v.max_drawdown_percent,currency:String(v.currency??""),source:v.source};}
export function compileKELLYVoice(context={},utterance){
  const text=corrected(utterance);if(!text||text.split(" ").length>120)return null;
  if(/\b(?:place|execute|submit|buy|sell|trade|order|bet for me|wager for me)\b/.test(text))return base("blocked","KELLY",["KELLY is an educational simulation and cannot place a bet or trade"]);
  const blockers=[],value={};
  const bal=text.match(/\bstarting balance (?:of )?([a-z0-9. ]+?)(?: (usd|dollars?|eur|euros?|gbp|pounds?))?(?=\s+(?:and|win|bet)|$)/);
  if(bal){const n=numberToken(bal[1].trim()),currency=bal[2]??context.currency;if(!(n>0&&n<=1e15))blockers.push("KELLY starting balance must be a finite positive amount");else if(!currency)blockers.push("KELLY starting balance requires an explicit currency unit or authoritative current currency");else{value.starting_balance=n;value.currency=String(currency).toUpperCase().replace(/DOLLARS?/,"USD").replace(/EUROS?/,"EUR").replace(/POUNDS?/,"GBP");}}
  const win=text.match(/\b(?:win probability|win chance) (?:of )?([0-9]+(?:\.[0-9]+)?|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) percent\b/);if(win){const n=numberToken(win[1]);if(n<0||n>100)blockers.push("KELLY win probability must be 0..100 percent");else value.win_probability=n/100;}
  const bet=text.match(/\bbet (?:size |percent |percentage )?(?:of )?([0-9]+(?:\.[0-9]+)?|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) percent\b/);if(bet){const n=numberToken(bet[1]);if(!(n>=0&&n<=100))blockers.push("KELLY bet percent must be 0..100 percent");else value.bet_percent=n;}
  const requested=/\b(?:starting balance|win probability|win chance|bet percent|bet size|simulate|run)\b/.test(text)||/\bbet (?:[0-9]+|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety) percent\b/.test(text),read=/\b(?:read|tell me|what is|result)\b/.test(text);if(!requested&&!read)return null;
  for(const key of KELLY_FEATURES)if(context.current_config?.[key]!=null&&value[key]==null)value[key]=context.current_config[key];
  if(value.currency==null&&(context.current_config?.currency||context.currency))value.currency=String(context.current_config?.currency??context.currency);
  if(requested)for(const key of KELLY_FEATURES)if(value[key]==null)blockers.push(`KELLY requires explicit ${key.replaceAll("_"," ")} with units`);
  let groundedNarration=null;if(read)try{groundedNarration=normalizeKELLYResult(context.grounded_result);}catch(e){blockers.push(`${e.message}; no simulation result will be invented`);}
  const actions=Object.keys(value).length&&KELLY_FEATURES.every(k=>value[k]!=null)?[{feature:"simulation",operation:"configure",value,scope:"panel"}]:[];
  return{kind:blockers.length?"clarify":"candidate",command:"KELLY",actions,executable_actions:[],blockers,grounded_narration:groundedNarration,ready_for_grounded_narration:Boolean(groundedNarration)&&!blockers.length,configure_step_draft:blockers.length||!actions.length?null:{command:"KELLY",actions},ready_for_live_executor:false,educational_not_advice:true};
}
export function compilePatternKellyVoice(context={},utterance){const c=String(context?.command??context??"").toUpperCase();if(c==="PAT")return compilePATVoice(typeof context==="object"?context:{},utterance);if(c==="PRT")return compilePRTVoice(typeof context==="object"?context:{},utterance);if(c==="KELLY")return compileKELLYVoice(typeof context==="object"?context:{},utterance);return null;}
