import { escapeHtml } from '../services/vendor-export.js';
export function launchConfig(env=process.env){
  if(env.PUBLIC_LAUNCH_ENABLED!=='true')return {enabled:false};
  const base=new URL(env.PUBLIC_BASE_URL),privacy=new URL(env.APPROVED_PRIVACY_URL),terms=new URL(env.APPROVED_TERMS_URL);
  if([base,privacy,terms].some(u=>u.protocol!=='https:'||u.username||u.password)||env.LEGAL_LINKS_APPROVED!=='true')throw new Error('Public launch requires HTTPS canonical and human-approved legal URLs');
  return {enabled:true,base:base.origin,privacy:privacy.href,terms:terms.href};
}
export function launchHtml(html,path,config){
  if(!config.enabled||!['/index.html','/pricing.html'].includes(path))return html;
  const canonical=config.base+(path==='/index.html'?'/':path);
  return html.replace('content="noindex,nofollow"','content="index,follow"').replace('</head>',`<link rel="canonical" href="${escapeHtml(canonical)}"></head>`).replace('</body>',`<footer><a href="${escapeHtml(config.privacy)}">Privacy</a> · <a href="${escapeHtml(config.terms)}">Terms</a></footer></body>`);
}
