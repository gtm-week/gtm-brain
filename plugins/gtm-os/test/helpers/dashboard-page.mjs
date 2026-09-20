// Minimal DOM harness: runs the shipped client, not a browser or native Codex UI.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const template=readFileSync(new URL('../../scripts/gtm-os-render/home.template.html',import.meta.url),'utf8');
export function page(D,{saved=new Map(),live=false,fetcher=async()=>({ok:true,json:async()=>D}),html=template,route=null}={}){
 const nodes=new Map(),listeners={},intervals=[],streams=[];let reloads=0,scroll=0;
 const node=selector=>{
  if(!nodes.has(selector)){const classes=new Set();nodes.set(selector,{id:selector.startsWith('#')&&!selector.includes(' ')?selector.slice(1):'',value:'',textContent:'',innerHTML:'',hidden:true,dataset:{},attributes:new Map(),setAttribute(k,v){this.attributes.set(k,String(v))},getAttribute(k){return this.attributes.get(k)??null},removeAttribute(k){this.attributes.delete(k)},blur(){document.activeElement={tagName:'BODY',id:''}},classList:{toggle(k,v){if(v??!classes.has(k))classes.add(k);else classes.delete(k)},contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},querySelectorAll:()=>[],focus(){document.activeElement=this}})}
  return nodes.get(selector);
 };
 const document={getElementById:id=>id==='data'?{textContent:JSON.stringify(D)}:node('#'+id),querySelector:node,querySelectorAll:()=>[],addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn),activeElement:{tagName:'BODY',id:''},hidden:false};
 const location={protocol:live?'http:':'file:',hash:route||'',reload:()=>reloads++},entries=[location.hash];let routeIndex=0;
 const history={pushState(_state,_title,hash){entries.splice(++routeIndex);entries.push(hash);location.hash=hash},replaceState(_state,_title,hash){entries[routeIndex]=hash;location.hash=hash},back(){if(routeIndex>0){location.hash=entries[--routeIndex];for(const fn of listeners.popstate||[])fn()}},forward(){if(routeIndex<entries.length-1){location.hash=entries[++routeIndex];for(const fn of listeners.popstate||[])fn()}}};
 const ui=createContext({document,location,...(route!==null?{history,URLSearchParams,addEventListener:document.addEventListener}:{}),sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},setInterval:fn=>intervals.push(fn),setTimeout:()=>{},clearTimeout(){},requestAnimationFrame:fn=>fn(),scrollY:420,scrollTo:(_x,y)=>scroll=y,Intl,URL,fetch:fetcher,EventSource:class{constructor(url){this.url=url;this.events={};streams.push(this)}addEventListener(k,fn){this.events[k]=fn}}});
 const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
 runInContext(source,ui);
 return {ui,node,nodes,saved,intervals,streams,listeners,location,history,get reloads(){return reloads},get scroll(){return scroll},run:code=>runInContext(code,ui)};
}
