/** Run from your PERSONAL Google account; alerts go to your dedicated support inbox. */
function sendBearDashSignupAlerts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('BEARDASH_ALERT_KEY');
    if (!key) throw new Error('Set BEARDASH_ALERT_KEY in Project Settings > Script properties.');
    const pending = bearDashRpc_('beardash_pending_alerts', {alert_key:key});
    if (!Array.isArray(pending)) throw new Error('Unexpected signup response.');
    if (!pending.length) return;
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Email quota exhausted. The next trigger will retry.');
    const lines = pending.map(item => String(item.email).replace(/[\r\n]/g,' '));
    MailApp.sendEmail({
      to:'BearDash.support@gmail.com',
      subject:'[BearDash Support] '+pending.length+' new member'+(pending.length===1?'':'s')+' awaiting approval',
      body:'Confirmed accounts awaiting BearDash approval:\n\n'+lines.join('\n')+
        '\n\nOpen BearDash: https://blaframboise.github.io/BearDash/\n\nUntil the Member Approvals screen is built, approve these accounts through Supabase SQL Editor using the existing member approval query. This email does not grant access.'
    });
    // Acknowledge only after Google accepts the email. An interrupted acknowledgement
    // can cause a duplicate alert on retry, rather than losing an alert.
    bearDashRpc_('beardash_ack_alerts',{alert_key:key,alert_ids:pending.map(item=>item.id)});
  } finally { lock.releaseLock(); }
}
function bearDashRpc_(name, payload) {
  const response = UrlFetchApp.fetch('https://bvokijnmogjmftkggbxn.supabase.co/rest/v1/rpc/'+name,{
    method:'post',contentType:'application/json',
    headers:{apikey:'sb_publishable_h1qDQ4i4AQ2KhY3r7tMROA_3ttUMRqW'},
    payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  if(response.getResponseCode()<200 || response.getResponseCode()>=300) {
    // Do not log request payloads or raw error responses containing personal data.
    throw new Error('Signup notification service returned HTTP '+response.getResponseCode()+'. Check SQL setup and the private notification key.');
  }
  const body=response.getContentText();return body ? JSON.parse(body) : null;
}
function sendBearDashTestEmail() {
  MailApp.sendEmail({to:'BearDash.support@gmail.com',subject:'[BearDash Support] Notification test',
    body:'Your BearDash signup alert email route is working. This is a test, not a real membership request.'});
}
