export function buildPreviewHTML(componentCode, componentType = '') {
  const stripped = componentCode
    .replace(/^import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+['"][^'"]+['"]\s*;?\n?/gm, '')
    .replace(/^export\s+default\s+function\s+(\w+)/m, 'function $1')
    .replace(/^export\s+default\s+(\w+)\s*;?\s*$/m, '')
    .trim()

  const fullCode = `
const {useState,useEffect,useRef,useCallback,useMemo}=React;

/* ── Remotion mock ── */
let __f=0;
const useCurrentFrame=()=>__f;
const useVideoConfig=()=>({fps:30,durationInFrames:150,width:1920,height:1080,id:'preview'});
const interpolate=(v,[a,b],[c,d],o={})=>{
  let t=(v-a)/(b-a);
  if(o.extrapolateLeft==='clamp')t=Math.max(0,t);
  if(o.extrapolateRight==='clamp')t=Math.min(1,t);
  t=Math.max(0,Math.min(1,t));
  return c+t*(d-c);
};
const spring=({frame:f=0,fps:r=30,from:a=0,to:b=1,config:cfg={}}={})=>{
  const p=Math.min(1,f/Math.max(1,(cfg.damping||10)*2));
  return a+(b-a)*(1-Math.pow(1-p,3));
};
const AbsoluteFill=({children,style})=>React.createElement('div',{style:{position:'absolute',top:0,left:0,right:0,bottom:0,...(style||{})}},children);
const Sequence=({children})=>children||null;
const Audio=()=>null;
const Video=({src,style})=>React.createElement('video',{src,style,muted:true,autoPlay:true,loop:true});
const Img=({src,style,alt=''})=>React.createElement('img',{src,style,alt});
const staticFile=p=>p;
const random=seed=>((seed*9301+49297)%233280)/233280;
/* ─────────────────── */

${stripped}

function PreviewApp(){
  const [frame,setFrame]=useState(0);
  __f=frame;
  useEffect(()=>{
    const id=setInterval(()=>setFrame(f=>(f+1)%150),33);
    return ()=>clearInterval(id);
  },[]);
  try{return React.createElement(SceneComponent);}
  catch(e){return React.createElement('div',{style:{color:'#444',fontSize:'10px',padding:'12px',fontFamily:'monospace'}},'Preview unavailable');}
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(PreviewApp));
`.trim()

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#root{width:100%;height:100%;background:#0a0a0a;overflow:hidden}
.fallback{display:flex;align-items:center;justify-content:center;height:100%;color:#333;font:10px monospace;text-align:center;padding:8px}
</style>
</head>
<body>
<div id="root"><div class="fallback">${componentType || 'Component'}</div></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
(function(){
  var src=${JSON.stringify(fullCode)};
  try{
    var out=Babel.transform(src,{presets:['react']}).code;
    eval(out);
  }catch(e){
    document.getElementById('root').innerHTML='<div class="fallback">${componentType || 'Component'}<br><span style="color:#2a2a2a;font-size:9px">'+e.message.slice(0,60)+'</span></div>';
  }
})();
</script>
</body>
</html>`
}
