export function createEmailSender({ provider='console', apiKey='', from='', fetchImpl=fetch, logger=console } = {}) {
  if (provider === 'console') {
    return async message => {
      logger.log(JSON.stringify({event:'email_preview',to:message.to,subject:message.subject,idempotencyKey:message.idempotencyKey}));
      return {id:`console:${message.idempotencyKey}`,provider:'console'};
    };
  }
  if (provider === 'resend') {
    if (!apiKey) throw new Error('RESEND_API_KEY is required');
    if (!from) throw new Error('EMAIL_FROM is required');
    return async message => {
      const response=await fetchImpl('https://api.resend.com/emails',{
        method:'POST',
        headers:{
          authorization:`Bearer ${apiKey}`,
          'content-type':'application/json',
          'idempotency-key':String(message.idempotencyKey).slice(0,256)
        },
        body:JSON.stringify({from,to:[message.to],subject:message.subject,html:message.html,text:message.text})
      });
      const raw=await response.text();
      let data={};
      try { data=raw?JSON.parse(raw):{}; } catch { data={raw:raw.slice(0,500)}; }
      if (!response.ok) throw new Error(`email provider failed: ${response.status} ${JSON.stringify(data).slice(0,500)}`);
      return {id:data.id || null,provider:'resend'};
    };
  }
  throw new Error(`unsupported email provider: ${provider}`);
}
