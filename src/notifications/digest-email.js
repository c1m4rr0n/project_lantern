function esc(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function list(items, render, empty='None today') {
  if (!items?.length) return `<p style="color:#667085">${esc(empty)}</p>`;
  return `<ul>${items.map(render).join('')}</ul>`;
}

export function renderDigestEmail(digest) {
  const productName=digest.productName || 'ExcluSignal';
  const company=digest.company || 'your organization';
  const vendor=digest.vendorWatch||{};
  const riskCount=(vendor.excludedCount||0)+(vendor.possibleMatchCount||0);
  const subject=riskCount
    ? `${productName} daily brief — ${riskCount} vendor risk signal${riskCount===1?'':'s'}`
    : `${productName} daily brief — ${digest.strongCount} strong match${digest.strongCount===1?'':'es'}`;
  const top=list(digest.topMatches, item=>`<li><strong>${esc(item.title)}</strong> — ${esc(item.score)}/100${item.deadline?` · due ${esc(item.deadline)}`:''}<br><span style="color:#475467">${esc((item.reasons||[]).join(' · '))}</span></li>`,'No strong matches today.');
  const deadlines=list(digest.upcomingDeadlines, item=>`<li><strong>${esc(item.title)}</strong> — ${esc(item.daysRemaining)} day${item.daysRemaining===1?'':'s'} remaining</li>`,'No deadlines within 14 days.');
  const changes=list(digest.changedPursuits,item=>{
    const req=item.requirementDelta?.summary;
    const reqText=req ? `${req.added} added · ${req.modified} modified · ${req.removed} removed${req.blockers?` · ${req.blockers} BLOCKER${req.blockers===1?'':'S'}`:''}` : '';
    const metadata=(item.changes||[]).slice(0,3).map(c=>c.field).join(' · ');
    const score=item.impact ? `Score ${item.impact.scoreBefore} → ${item.impact.scoreAfter}` : '';
    const detail=[reqText,metadata,score].filter(Boolean).join(' · ');
    return `<li><strong>${esc(item.title)}</strong>${req?.blockers?` <strong style="color:#b42318">BLOCKER</strong>`:''}<br><span style="color:#475467">${esc(detail || 'Change detected')}</span></li>`;
  },'No unread changes on tracked pursuits.');
  const vendorAlerts=list(vendor.alerts,item=>`<li><strong>${esc(item.legalName||'Unnamed vendor')}</strong> — <strong style="color:${item.status==='excluded'?'#b42318':'#b54708'}">${esc((item.status==='excluded'?'Active exclusion':item.status==='possible-match'?'Possible match — review required':item.status==='clear'?'No match':'Not screened'))}</strong><br><span style="color:#475467">${esc(item.reason||'Screening status changed')}</span></li>`,'No unread vendor screening alerts.');
  const vendorHtml=vendor.total?`<h2>Vendor Exclusion Watch</h2><p style="color:#667085">${esc(vendor.total)} watched · ${esc(vendor.excludedCount||0)} excluded · ${esc(vendor.possibleMatchCount||0)} possible match · ${esc(vendor.alertCount||0)} unread alert${vendor.alertCount===1?'':'s'}</p>${vendorAlerts}`:'';
  const html=`<!doctype html><html><body style="font-family:Arial,sans-serif;color:#101828;line-height:1.5"><div style="max-width:680px;margin:auto;padding:24px"><p style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#667085">${esc(productName.toUpperCase())} · DAILY BRIEF</p><h1 style="font-size:28px;margin-bottom:4px">${esc(company)}</h1><p style="color:#667085;margin-top:0">${esc(digest.scanned)} opportunities scanned · ${esc(digest.strongCount)} strong · ${esc(digest.reviewCount)} review · ${esc(digest.pursueCount)} pursuing${vendor.total?` · ${esc(vendor.total)} vendors watched`:''}</p>${vendorHtml}<h2>Tracked pursuit changes</h2>${changes}<h2>Best matches</h2>${top}<h2>Deadlines</h2>${deadlines}<p style="font-size:12px;color:#98a2b3;margin-top:28px">${esc(productName)} uses public data for screening and monitoring. Verify solicitation requirements and exclusion identity in the official source before acting. This is not a legal determination.</p></div></body></html>`;
  const text=[
    `${productName.toUpperCase()} — DAILY BRIEF`,
    company,
    `${digest.scanned} scanned · ${digest.strongCount} strong · ${digest.reviewCount} review · ${digest.pursueCount} pursuing${vendor.total?` · ${vendor.total} vendors watched`:''}`,
    ...(vendor.total?['','VENDOR EXCLUSION WATCH',`${vendor.excludedCount||0} excluded · ${vendor.possibleMatchCount||0} possible match · ${vendor.alertCount||0} unread alert(s)`,...(vendor.alerts?.length?vendor.alerts.map(x=>`- ${x.legalName||'Unnamed vendor'} — ${(x.status==='excluded'?'Active exclusion':x.status==='possible-match'?'Possible match — review required':x.status==='clear'?'No match':'Not screened')} — ${x.reason||'screening status changed'}`):['- No unread vendor screening alerts.'])]:[]),
    '',
    'TRACKED PURSUIT CHANGES',
    ...(digest.changedPursuits?.length?digest.changedPursuits.map(x=>{
      const req=x.requirementDelta?.summary;
      const parts=[];
      if(req) parts.push(`${req.added} requirement(s) added, ${req.modified} modified, ${req.removed} removed${req.blockers?`, ${req.blockers} BLOCKER(S)`:''}`);
      if((x.changes||[]).length) parts.push((x.changes||[]).map(c=>c.field).join(', '));
      if(x.impact) parts.push(`score ${x.impact.scoreBefore} -> ${x.impact.scoreAfter}`);
      return `- ${x.title} — ${parts.join(' · ') || 'change detected'}`;
    }):['- No unread changes on tracked pursuits.']),
    '',
    'BEST MATCHES',
    ...(digest.topMatches?.length?digest.topMatches.map(x=>`- ${x.title} — ${x.score}/100${x.deadline?` — due ${x.deadline}`:''}`):['- No strong matches today.']),
    '',
    'DEADLINES',
    ...(digest.upcomingDeadlines?.length?digest.upcomingDeadlines.map(x=>`- ${x.title} — ${x.daysRemaining} day(s) remaining`):['- No deadlines within 14 days.']),
    '',
    `Verify solicitation requirements and exclusion identity in the official source before acting. ${productName} is a screening and monitoring tool, not a legal determination.`
  ].join('\n');
  return {subject,html,text};
}
