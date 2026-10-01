async function serveFile(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (!file || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    return res.end('Not found');
  }
  try {
    const data = await readFile(path.join(root, file));
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Download not available in this local preview yet.');
  }
}

// --- Bulk Account Creator API --------------------------------------------------
async function handleBulkAccounts(req, res) {
  if (req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf-8'));
      const {platform, records, options} = body;
      
      if (!platform || !records) {
        return json(res, 400, {error: 'Missing platform or records.'});
      }
      
      const job = await bulkAccounts.createBulkAccountsJob(platform, records, options || {});
      return json(res, 201, job);
    } catch (e) {
      return json(res, 400, {error: e.message});
    }
  }
  
  if (req.method === 'GET') {
    const jobs = [];
    if (existsSync(bulkAccounts.BULK_JOBS_FILE)) {
      const content = await readFile(bulkAccounts.BULK_JOBS_FILE, 'utf-8');
      jobs.push(...content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)));
    }
    return json(res, 200, {jobs});
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleBulkAccountJob(req, res) {
  const jobId = new URL(req.url, 'http://localhost').pathname.split('/').pop();
  
  if (req.method === 'GET') {
    const job = await bulkAccounts.getBulkAccountsJob(jobId);
    if (!job) return json(res, 404, {error: 'Job not found.'});
    return json(res, 200, job);
  }
  
  if (req.method === 'POST') {
    if (req.url.includes('/execute')) {
      const job = await bulkAccounts.executeBulkAccountsJob(jobId);
      return json(res, 200, job);
    }
    
    if (req.url.includes('/retry')) {
      const job = await bulkAccounts.getBulkAccountsJob(jobId);
      if (!job) return json(res, 404, {error: 'Job not found.'});
      
      const failedRecords = job.records.filter(r => r.status === 'failed');
      if (failedRecords.length === 0) {
        return json(res, 200, job);
      }
      
      job.status = 'running';
      for (const record of failedRecords) {
        try {
          record.status = 'pending';
          job.completed++;
        } catch (e) {
          record.status = 'failed';
          record.errorMessage = e.message;
          job.failed++;
        }
      }
      job.status = job.failed === 0 ? 'completed' : 'completed-with-failures';
      job.updatedAt = new Date().toISOString();
      
      const jobsContent = await readFile(bulkAccounts.BULK_JOBS_FILE, 'utf-8');
      const jobs = jobsContent.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
      const existingIndex = jobs.findIndex(j => j.id === jobId);
      if (existingIndex >= 0) jobs[existingIndex] = job;
      else jobs.push(job);
      
      await appendFile(bulkAccounts.BULK_JOBS_FILE, 
        jobs.map(j => JSON.stringify(j)).join('\n') + '\n');
      
      return json(res, 200, job);
    }
    
    return json(res, 404, {error: 'Unknown action.'});
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleSMSBypass(req, res) {
  if (req.method === 'GET') {
    const status = await bulkAccounts.getSMSStatus();
    return json(res, 200, status);
  }
  
  if (req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8'));
    const bypass = await bulkAccounts.createSMSBypass(body.accountId, body.platform);
    return json(res, 201, bypass);
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleSMSBypassComplete(req, res) {
  if (req.method === 'POST') {
    const bypassId = new URL(req.url, 'http://localhost').pathname.split('/').pop();
    const body = JSON.parse((await readBody(req)).toString('utf-8'));
    const bypass = await bulkAccounts.completeSMSBypass(bypassId, body.code);
    return json(res, 200, bypass);
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleCaptcha(req, res) {
  if (req.method === 'GET') {
    const status = await bulkAccounts.getCaptchaStatus();
    return json(res, 200, status);
  }
  
  if (req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString('utf-8'));
    const task = await bulkAccounts.createCaptchaTask(
      body.platform, body.pageUrl, body.siteKey
    );
    return json(res, 201, task);
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleCaptchaSolve(req, res) {
  if (req.method === 'POST') {
    const taskId = new URL(req.url, 'http://localhost').pathname.split('/').pop();
    const body = JSON.parse((await readBody(req)).toString('utf-8'));
    const solved = await bulkAccounts.completeCaptchaTask(taskId, body.solution);
    return json(res, 200, solved);
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

async function handleBulkAccountsComplete(req, res) {
  if (req.method === 'POST') {
    const jobId = new URL(req.url, 'http://localhost').pathname.split('/').pop();
    const body = JSON.parse((await readBody(req)).toString('utf-8'));
    const job = await bulkAccounts.executeBulkAccountsJob(jobId);
    return json(res, 200, job);
  }
  
  res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
  res.end('Not found');
}

server.listen(4180, '127.0.0.1', () => {
  console.log('Website preview: http://127.0.0.1:4180');
});
